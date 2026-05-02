#!/usr/bin/env node
/**
 * replenish-questions.js
 *
 * Generates curriculum-aligned questions (and reading-comprehension passages)
 * via the Anthropic API and inserts validated content into Firestore.
 *
 * Usage:
 *   node replenish-questions.js --subject math         --grade grade3 --count 20
 *   node replenish-questions.js --subject science      --grade grade5 --count 20
 *   node replenish-questions.js --subject reading-comprehension --grade grade4 --count 5
 *   node replenish-questions.js --subject math         --grade grade3 --dry-run
 *
 * Supported subjects: math | science | english | history | geography | reading-comprehension
 *
 * For reading-comprehension --count means number of PASSAGES (each contains 5 questions).
 * For all other subjects    --count means number of QUESTIONS.
 *
 * Required environment variables:
 *   ANTHROPIC_API_KEY
 *   GOOGLE_APPLICATION_CREDENTIALS  (path to service account JSON)
 *   OR: FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY
 *
 * Firestore collections written:
 *   questions  — all subjects including reading-comprehension questions
 *   passages   — reading-comprehension source texts (new collection)
 */

import Anthropic from '@anthropic-ai/sdk';
import { parseArgs } from 'node:util';

// ── Argument parsing ─────────────────────────────────────────────────────────
const VALID_SUBJECTS = [
  'math', 'science', 'english', 'history', 'geography', 'reading-comprehension',
];

const { values: args } = parseArgs({
  options: {
    subject:   { type: 'string',  default: 'math'  },
    grade:     { type: 'string'                    },
    count:     { type: 'string',  default: '20'    },
    'dry-run': { type: 'boolean', default: false   },
  },
  allowPositionals: false,
});

if (!args.grade) {
  console.error('Error: --grade is required (e.g. --grade grade3)');
  console.error('Valid grades: gradeK, grade1 … grade12');
  process.exit(1);
}
if (!VALID_SUBJECTS.includes(args.subject)) {
  console.error(`Error: --subject must be one of: ${VALID_SUBJECTS.join(', ')}`);
  process.exit(1);
}

const subject = args.subject;
const grade   = args.grade;
const isRC    = subject === 'reading-comprehension';
const count   = Math.max(1, Math.min(isRC ? 20 : 100, parseInt(args.count, 10) || (isRC ? 5 : 20)));
const dryRun  = args['dry-run'];

// ── Math grade metadata (unchanged — math fallback) ──────────────────────────
const GRADE_META = {
  gradeK:  { label: 'Kindergarten', age: '5–6',   topics: 'counting to 20, basic shapes, comparing sizes, sorting' },
  grade1:  { label: 'Grade 1',      age: '6–7',   topics: 'counting to 100, addition and subtraction within 20, basic shapes, telling time to the hour' },
  grade2:  { label: 'Grade 2',      age: '7–8',   topics: '2-digit addition and subtraction, intro to multiplication, money, measurement, telling time to 15 minutes' },
  grade3:  { label: 'Grade 3',      age: '8–9',   topics: 'multiplication and division facts, fractions (halves, thirds, quarters), area and perimeter, telling time to the minute' },
  grade4:  { label: 'Grade 4',      age: '9–10',  topics: 'multi-digit multiplication, long division, fractions and equivalence, decimals to tenths, measurement conversions' },
  grade5:  { label: 'Grade 5',      age: '10–11', topics: 'operations with fractions, percentages, ratios, intro to negative numbers, volume, algebra patterns' },
  grade6:  { label: 'Grade 6',      age: '11–12', topics: 'ratios and proportions, integers, order of operations, basic algebra, data analysis, probability' },
  grade7:  { label: 'Grade 7',      age: '12–13', topics: 'proportional relationships, inequalities, geometry (angles, triangles, circles), probability, statistics' },
  grade8:  { label: 'Grade 8',      age: '13–14', topics: 'linear equations and systems, functions, Pythagorean theorem, transformations, statistics' },
  grade9:  { label: 'Grade 9',      age: '14–15', topics: 'algebra I — polynomials, quadratics, systems of equations, coordinate geometry' },
  grade10: { label: 'Grade 10',     age: '15–16', topics: 'geometry — proofs, circles, trigonometry, algebra II fundamentals' },
  grade11: { label: 'Grade 11',     age: '16–17', topics: 'pre-calculus, logarithms, sequences, statistics and probability' },
  grade12: { label: 'Grade 12',     age: '17–18', topics: 'calculus introduction, limits, derivatives, statistics, discrete math' },
};

// ── Subject-specific grade metadata ─────────────────────────────────────────
const SUBJECT_GRADE_META = {

  science: {
    gradeK:  { label: 'Kindergarten', age: '5–6',   topics: 'living vs non-living things, basic animal types, the five senses, weather and seasons' },
    grade1:  { label: 'Grade 1',      age: '6–7',   topics: 'plants and animals, the sun, moon and stars, weather patterns, basic needs of living things' },
    grade2:  { label: 'Grade 2',      age: '7–8',   topics: 'habitats, plant and animal life cycles, states of matter (solid/liquid/gas), earth materials (rocks, soil, water)' },
    grade3:  { label: 'Grade 3',      age: '8–9',   topics: 'ecosystems and food chains, properties of matter, weather and climate, fossils, adaptations' },
    grade4:  { label: 'Grade 4',      age: '9–10',  topics: 'ecosystems and adaptations, rocks and minerals, electricity and magnetism, simple machines, energy' },
    grade5:  { label: 'Grade 5',      age: '10–11', topics: 'human body systems, photosynthesis, mixtures and solutions, earth layers and plate tectonics, space' },
    grade6:  { label: 'Grade 6',      age: '11–12', topics: 'cells and organisms, genetics introduction, chemistry basics (atoms/molecules), earth layers, environmental science' },
    grade7:  { label: 'Grade 7',      age: '12–13', topics: 'cell biology, DNA and heredity, chemistry (elements and compounds), forces and motion, ecosystems' },
    grade8:  { label: 'Grade 8',      age: '13–14', topics: 'physical science (motion, energy, waves), plate tectonics, space science, chemical reactions' },
    grade9:  { label: 'Grade 9',      age: '14–15', topics: 'biology — cell biology, genetics, evolution, ecology; introduction to chemistry (periodic table, bonding)' },
    grade10: { label: 'Grade 10',     age: '15–16', topics: 'biology — ecology and evolution; chemistry — stoichiometry, reactions; introduction to physics' },
    grade11: { label: 'Grade 11',     age: '16–17', topics: 'advanced biology (genetics, biochemistry), chemistry (organic, thermodynamics), physics (mechanics)' },
    grade12: { label: 'Grade 12',     age: '17–18', topics: 'AP biology or AP chemistry or AP physics; environmental science; scientific research methods' },
  },

  english: {
    gradeK:  { label: 'Kindergarten', age: '5–6',   topics: 'letter recognition, phonics (letter sounds), sight words, rhyming, simple sentence structure' },
    grade1:  { label: 'Grade 1',      age: '6–7',   topics: 'phonics and decoding, sight words, simple reading comprehension, nouns and verbs, basic punctuation' },
    grade2:  { label: 'Grade 2',      age: '7–8',   topics: 'reading fluency, story comprehension, grammar (nouns/verbs/adjectives), complete sentences, simple writing' },
    grade3:  { label: 'Grade 3',      age: '8–9',   topics: 'reading comprehension strategies, grammar (adjectives/adverbs/pronouns), paragraph writing, punctuation, prefixes/suffixes' },
    grade4:  { label: 'Grade 4',      age: '9–10',  topics: 'literary elements (character/setting/plot/theme), grammar (conjunctions/prepositions), multi-paragraph writing, figurative language intro' },
    grade5:  { label: 'Grade 5',      age: '10–11', topics: 'figurative language (simile/metaphor/idiom), grammar (complex sentences/clauses), opinion and narrative essays, text structure' },
    grade6:  { label: 'Grade 6',      age: '11–12', topics: 'literary devices, grammar (phrases and clauses), argumentative writing, vocabulary in context, point of view' },
    grade7:  { label: 'Grade 7',      age: '12–13', topics: 'literary analysis (theme/symbolism), grammar (complex/compound sentences), research writing, rhetorical devices' },
    grade8:  { label: 'Grade 8',      age: '13–14', topics: 'advanced literary analysis, grammar mastery (sentence variety), argumentative essays, textual evidence, author\'s craft' },
    grade9:  { label: 'Grade 9',      age: '14–15', topics: 'literary genres (short story, poetry, drama), rhetoric, grammar review, analytical essays, vocabulary and etymology' },
    grade10: { label: 'Grade 10',     age: '15–16', topics: 'world literature, advanced grammar, research papers, literary criticism, tone and style analysis' },
    grade11: { label: 'Grade 11',     age: '16–17', topics: 'American literature, advanced composition, AP Language and Composition, synthesis essays, rhetorical analysis' },
    grade12: { label: 'Grade 12',     age: '17–18', topics: 'British and world literature, AP Literature analysis, college essay writing, literary theory, close reading' },
  },

  history: {
    gradeK:  { label: 'Kindergarten', age: '5–6',   topics: 'community helpers, family history, national holidays (Thanksgiving, Fourth of July), basic rules and community' },
    grade1:  { label: 'Grade 1',      age: '6–7',   topics: 'community and local history, national symbols (flag, Statue of Liberty), famous Americans (Washington, Lincoln), timelines' },
    grade2:  { label: 'Grade 2',      age: '7–8',   topics: 'world communities, map skills, historical figures (MLK, Harriet Tubman), changes over time, basic government' },
    grade3:  { label: 'Grade 3',      age: '8–9',   topics: 'US history basics, Native Americans, European explorers (Columbus, Magellan), colonial America, Mayflower' },
    grade4:  { label: 'Grade 4',      age: '9–10',  topics: 'American Revolution (causes, key figures, battles), Declaration of Independence, Constitution, early republic' },
    grade5:  { label: 'Grade 5',      age: '10–11', topics: 'US history from Revolution through Civil War, westward expansion, manifest destiny, causes and outcomes of the Civil War' },
    grade6:  { label: 'Grade 6',      age: '11–12', topics: 'ancient civilizations — Mesopotamia, Egypt, Greece, Rome; rise and fall of empires, contributions to modern society' },
    grade7:  { label: 'Grade 7',      age: '12–13', topics: 'medieval history, Byzantine Empire, Islamic Caliphates, Renaissance, Reformation, Age of Exploration' },
    grade8:  { label: 'Grade 8',      age: '13–14', topics: 'American history: Reconstruction, Gilded Age, imperialism, Progressive Era, World War I' },
    grade9:  { label: 'Grade 9',      age: '14–15', topics: 'world history from ancient to medieval — civilizations, religions, trade routes, cultural diffusion' },
    grade10: { label: 'Grade 10',     age: '15–16', topics: 'modern world history: Industrial Revolution, World War I, Russian Revolution, Great Depression, World War II, Cold War beginnings' },
    grade11: { label: 'Grade 11',     age: '16–17', topics: 'US history 20th century: Cold War, Civil Rights Movement, Vietnam War, Great Society, Watergate, Reagan era' },
    grade12: { label: 'Grade 12',     age: '17–18', topics: 'US Government and Politics: branches of government, Constitution, civil liberties, foreign policy, elections and voting' },
  },

  geography: {
    gradeK:  { label: 'Kindergarten', age: '5–6',   topics: 'locations (home, school, neighborhood), basic directions (left/right/up/down), simple maps, community places' },
    grade1:  { label: 'Grade 1',      age: '6–7',   topics: 'maps and globes, 7 continents and 5 oceans, cardinal directions (N/S/E/W), world landmarks, community maps' },
    grade2:  { label: 'Grade 2',      age: '7–8',   topics: 'map skills (keys, scale, compass rose), world regions, physical vs political maps, continents and countries' },
    grade3:  { label: 'Grade 3',      age: '8–9',   topics: 'US geography (regions, major states and capitals), map skills, physical features (mountains, rivers, plains)' },
    grade4:  { label: 'Grade 4',      age: '9–10',  topics: 'US regions (Northeast/South/Midwest/West), physical features, climate zones, state capitals, natural resources' },
    grade5:  { label: 'Grade 5',      age: '10–11', topics: 'North and South American geography, physical features, climate and biomes, human geography, population distribution' },
    grade6:  { label: 'Grade 6',      age: '11–12', topics: 'world geography, major physical features (deserts, mountain ranges, rivers), climate types, biomes, world regions' },
    grade7:  { label: 'Grade 7',      age: '12–13', topics: 'cultural geography of world regions (Africa, Asia, Europe, Americas), economic geography, population, migration' },
    grade8:  { label: 'Grade 8',      age: '13–14', topics: 'physical geography (plate tectonics, erosion, landforms), weather patterns, human impact on environment' },
    grade9:  { label: 'Grade 9',      age: '14–15', topics: 'world regional geography, political boundaries, economic development, cultural regions, globalization' },
    grade10: { label: 'Grade 10',     age: '15–16', topics: 'advanced world geography, environmental issues, climate change geography, geopolitics, resource distribution' },
    grade11: { label: 'Grade 11',     age: '16–17', topics: 'AP Human Geography: population, cultural patterns, political geography, economic development, urban geography' },
    grade12: { label: 'Grade 12',     age: '17–18', topics: 'advanced human geography, economic geography, environmental sustainability, urbanization, global trade patterns' },
  },

  'reading-comprehension': {
    gradeK:  { label: 'Kindergarten', age: '5–6',   topics: 'very simple stories (2-3 sentences)', word_count_target: 40  },
    grade1:  { label: 'Grade 1',      age: '6–7',   topics: 'short simple passages', word_count_target: 80  },
    grade2:  { label: 'Grade 2',      age: '7–8',   topics: 'short passages with a clear narrative', word_count_target: 120 },
    grade3:  { label: 'Grade 3',      age: '8–9',   topics: 'informational and narrative passages', word_count_target: 180 },
    grade4:  { label: 'Grade 4',      age: '9–10',  topics: 'informational and literary passages', word_count_target: 240 },
    grade5:  { label: 'Grade 5',      age: '10–11', topics: 'informational, literary, and persuasive passages', word_count_target: 300 },
    grade6:  { label: 'Grade 6',      age: '11–12', topics: 'varied informational and literary passages', word_count_target: 360 },
    grade7:  { label: 'Grade 7',      age: '12–13', topics: 'complex informational and literary passages', word_count_target: 420 },
    grade8:  { label: 'Grade 8',      age: '13–14', topics: 'complex literary and argumentative passages', word_count_target: 480 },
    grade9:  { label: 'Grade 9',      age: '14–15', topics: 'literary and analytical passages', word_count_target: 520 },
    grade10: { label: 'Grade 10',     age: '15–16', topics: 'advanced literary and non-fiction passages', word_count_target: 580 },
    grade11: { label: 'Grade 11',     age: '16–17', topics: 'AP-level literary and argumentative passages', word_count_target: 640 },
    grade12: { label: 'Grade 12',     age: '17–18', topics: 'college-level literary and analytical passages', word_count_target: 700 },
  },
};

// ── Unsafe content filter ─────────────────────────────────────────────────────
const UNSAFE_RE = /\b(kill|murder|death|suicide|sex|naked|drug|alcohol|weapon|gun|bomb|explode|violence|racist|slur|hate|abuse)\b/i;

// ── Firebase Admin ────────────────────────────────────────────────────────────
async function buildFirestore() {
  const { initializeApp, cert, getApps } = await import('firebase-admin/app');
  await import('firebase-admin/firestore');

  if (!getApps().length) {
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      const { applicationDefault } = await import('firebase-admin/app');
      initializeApp({ credential: applicationDefault() });
    } else {
      const projectId   = process.env.FIREBASE_PROJECT_ID;
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
      const privateKey  = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
      if (!projectId || !clientEmail || !privateKey) {
        throw new Error(
          'Missing Firebase credentials. Set GOOGLE_APPLICATION_CREDENTIALS ' +
          'or FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY.'
        );
      }
      initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
    }
  }

  const { getFirestore, Timestamp } = await import('firebase-admin/firestore');
  return { db: getFirestore(), Timestamp };
}

// ── Question generation (non-RC subjects) ────────────────────────────────────
async function generateQuestions(client, count) {
  const meta = subject === 'math'
    ? (GRADE_META[grade] ?? { label: grade, age: 'school-age', topics: 'mathematics' })
    : (SUBJECT_GRADE_META[subject]?.[grade] ?? { label: grade, age: 'school-age', topics: subject });

  const prompt = `You are an experienced educational content writer creating questions for a children's quiz app.

Generate exactly ${count} ${subject} questions for ${meta.label} students (ages ${meta.age}).

Curriculum topics for this grade: ${meta.topics}

Hard requirements for EVERY question:
1. Factually correct with exactly one unambiguous correct answer.
2. Age-appropriate — vocabulary and context suitable for ages ${meta.age}.
3. Free of any violent, adult, sexual, or otherwise inappropriate content.
4. Curriculum-aligned to standard ${meta.label} expectations.
5. correct_answer is always a STRING (e.g. "8", not 8).
6. explanation is 1–2 child-friendly sentences explaining why the answer is correct.

Difficulty distribution (approximate): 40 % easy, 40 % medium, 20 % hard.

Return a JSON array ONLY — no markdown fences, no other text.
Each element must match this exact schema:
{
  "question_text":      "What is 6 × 7?",
  "correct_answer":     "42",
  "explanation":        "6 × 7 = 42. You can count 7 groups of 6.",
  "difficulty":         "easy",
  "category":           "multiplication",
  "answer_options":     [],
  "is_safe":            true,
  "curriculum_aligned": true
}`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8000,
    messages: [{ role: 'user', content: prompt }],
  });

  const text  = response.content[0].text.trim();
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('Response did not contain a JSON array:\n' + text.slice(0, 200));
  return JSON.parse(match[0]);
}

// ── Reading-comprehension generation ────────────────────────────────────────
async function generateReadingComprehension(client) {
  const meta = SUBJECT_GRADE_META['reading-comprehension']?.[grade]
    ?? { label: grade, age: 'school-age', topics: 'age-appropriate passages', word_count_target: 200 };

  const prompt = `You are an experienced educational content writer creating reading comprehension materials for a children's quiz app.

Generate exactly 1 reading comprehension passage for ${meta.label} students (ages ${meta.age}).

The passage must be:
- An original, engaging text of approximately ${meta.word_count_target} words (2–4 paragraphs)
- Age-appropriate for ${meta.age} year olds
- On a safe, interesting topic (nature, science, history, community, animals, etc.)
- Free of any violent, adult, sexual, or otherwise inappropriate content

The passage must be followed by exactly 5 questions that test:
  main-idea, vocabulary, inference, detail, and sequence (one of each category)

Return a single JSON object ONLY — no markdown fences, no other text:
{
  "passage": {
    "title":      "The Amazon Rainforest",
    "text":       "...the full passage text here...",
    "word_count": 180
  },
  "questions": [
    {
      "question_text":      "What is the main idea of this passage?",
      "correct_answer":     "The Amazon is the world's largest rainforest.",
      "explanation":        "The passage focuses on the Amazon's size and importance.",
      "difficulty":         "easy",
      "category":           "main-idea",
      "answer_options":     [],
      "is_safe":            true,
      "curriculum_aligned": true
    },
    {
      "question_text":      "What does the word 'diverse' mean in the passage?",
      "correct_answer":     "having many different types",
      "explanation":        "Diverse means a wide variety. The passage describes many species.",
      "difficulty":         "medium",
      "category":           "vocabulary",
      "answer_options":     [],
      "is_safe":            true,
      "curriculum_aligned": true
    },
    {
      "question_text":      "...",
      "correct_answer":     "...",
      "explanation":        "...",
      "difficulty":         "medium",
      "category":           "inference",
      "answer_options":     [],
      "is_safe":            true,
      "curriculum_aligned": true
    },
    {
      "question_text":      "...",
      "correct_answer":     "...",
      "explanation":        "...",
      "difficulty":         "easy",
      "category":           "detail",
      "answer_options":     [],
      "is_safe":            true,
      "curriculum_aligned": true
    },
    {
      "question_text":      "...",
      "correct_answer":     "...",
      "explanation":        "...",
      "difficulty":         "hard",
      "category":           "sequence",
      "answer_options":     [],
      "is_safe":            true,
      "curriculum_aligned": true
    }
  ]
}`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    messages: [{ role: 'user', content: prompt }],
  });

  const text  = response.content[0].text.trim();
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('RC response did not contain a JSON object:\n' + text.slice(0, 300));
  return JSON.parse(match[0]);
}

// ── Validation ────────────────────────────────────────────────────────────────
function validateQuestion(q) {
  const errors = [];

  if (!q.question_text || String(q.question_text).trim().length < 5)
    errors.push('question_text is empty or too short');

  if (q.correct_answer === undefined || q.correct_answer === null || String(q.correct_answer).trim() === '')
    errors.push('correct_answer is missing or empty');

  if (!['easy', 'medium', 'hard'].includes(q.difficulty))
    errors.push(`invalid difficulty "${q.difficulty}"`);

  if (!q.category || String(q.category).trim() === '')
    errors.push('category is missing');

  if (q.is_safe === false)
    errors.push('question flagged unsafe by generator');

  if (q.curriculum_aligned === false)
    errors.push('question flagged as not curriculum-aligned by generator');

  if (UNSAFE_RE.test(String(q.question_text)))
    errors.push('question_text contains a blocked keyword');

  if (UNSAFE_RE.test(String(q.correct_answer)))
    errors.push('correct_answer contains a blocked keyword');

  return errors;
}

function validatePassage(p) {
  const errors = [];

  if (!p.title || String(p.title).trim() === '')
    errors.push('passage.title is missing');

  if (!p.text || String(p.text).trim().length < 100)
    errors.push('passage.text must be at least 100 characters');

  if (!p.word_count || Number(p.word_count) <= 0)
    errors.push('passage.word_count must be a positive number');

  if (UNSAFE_RE.test(String(p.title ?? '')))
    errors.push('passage.title contains a blocked keyword');

  if (UNSAFE_RE.test(String(p.text ?? '')))
    errors.push('passage.text contains a blocked keyword');

  return errors;
}

// ── Firestore inserts ─────────────────────────────────────────────────────────
async function insertQuestion(db, Timestamp, q, extraFields = {}) {
  const doc = {
    subject,
    grade,
    difficulty:     q.difficulty,
    category:       String(q.category).trim().toLowerCase().replace(/\s+/g, '-'),
    question_text:  String(q.question_text).trim(),
    answer_options: Array.isArray(q.answer_options) ? q.answer_options : [],
    correct_answer: String(q.correct_answer).trim(),
    explanation:    String(q.explanation ?? '').trim(),
    created_at:     Timestamp.now(),
    source:         'ai-generated',
    ...extraFields,
  };
  const ref = await db.collection('questions').add(doc);
  return ref.id;
}

async function insertPassageWithQuestions(db, Timestamp, passageObj) {
  const { passage, questions } = passageObj;
  const batch = db.batch();

  const passageRef = db.collection('passages').doc();
  batch.set(passageRef, {
    title:      String(passage.title).trim(),
    text:       String(passage.text).trim(),
    word_count: Number(passage.word_count),
    grade,
    subject:    'reading-comprehension',
    created_at: Timestamp.now(),
    source:     'ai-generated',
  });

  const questionIds = [];
  for (const q of questions) {
    const qRef = db.collection('questions').doc();
    questionIds.push(qRef.id);
    batch.set(qRef, {
      subject:        'reading-comprehension',
      grade,
      difficulty:     q.difficulty,
      category:       String(q.category).trim().toLowerCase().replace(/\s+/g, '-'),
      question_text:  String(q.question_text).trim(),
      answer_options: Array.isArray(q.answer_options) ? q.answer_options : [],
      correct_answer: String(q.correct_answer).trim(),
      explanation:    String(q.explanation ?? '').trim(),
      created_at:     Timestamp.now(),
      source:         'ai-generated',
      passage_id:     passageRef.id,
    });
  }

  await batch.commit();
  return { passageId: passageRef.id, questionIds };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const countLabel = isRC ? `${count} passage(s)` : `${count} question(s)`;
  console.log('\nMathAdventure — Question Bank Replenishment');
  console.log('═══════════════════════════════════════════');
  console.log(`Subject  : ${subject}`);
  console.log(`Grade    : ${grade}`);
  console.log(`Count    : ${countLabel}`);
  console.log(`Dry-run  : ${dryRun}`);
  console.log();

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY environment variable is not set.');
    process.exit(1);
  }

  let db = null, Timestamp = null;
  if (!dryRun) {
    console.log('Connecting to Firestore...');
    ({ db, Timestamp } = await buildFirestore());
    console.log('Connected.\n');
  }

  const client = new Anthropic();

  // ── Reading Comprehension path ──
  if (isRC) {
    console.log(`Generating ${count} passage(s) with 5 questions each via Claude API...\n`);

    let passedPassages = 0, failedPassages = 0, passagesInserted = 0, questionsInserted = 0;
    const failures = [];

    for (let i = 0; i < count; i++) {
      console.log(`  Passage ${i + 1} / ${count}...`);
      let ps;
      try {
        ps = await generateReadingComprehension(client);
      } catch (err) {
        console.error(`  ✗ generation failed: ${err.message}`);
        failedPassages++;
        continue;
      }

      const passageErrors   = validatePassage(ps.passage ?? {});
      const questionErrors  = (ps.questions ?? []).flatMap(q => validateQuestion(q));

      if (passageErrors.length > 0 || questionErrors.length > 0) {
        failedPassages++;
        failures.push({
          title: String(ps.passage?.title ?? '').slice(0, 50),
          errors: [...passageErrors, ...questionErrors],
        });
        console.log(`  ✗ validation failed — "${String(ps.passage?.title ?? '').slice(0, 50)}"`);
      } else {
        passedPassages++;
        if (!dryRun) {
          try {
            const { passageId, questionIds } = await insertPassageWithQuestions(db, Timestamp, ps);
            passagesInserted++;
            questionsInserted += questionIds.length;
            console.log(`  ✓ passage ${passageId} + ${questionIds.length} questions — "${String(ps.passage.title).slice(0, 50)}"`);
          } catch (err) {
            console.error(`  ✗ batch insert failed: ${err.message}`);
            failedPassages++;
            passedPassages--;
          }
        } else {
          console.log(`  ✓ valid — "${String(ps.passage.title).slice(0, 50)}"`);
        }
      }
    }

    console.log('\n── Summary ──────────────────────────');
    console.log(`Generated  : ${count} passage(s)`);
    console.log(`Passed     : ${passedPassages}`);
    console.log(`Failed     : ${failedPassages}`);
    console.log(`Passages inserted  : ${dryRun ? 'skipped (dry-run)' : passagesInserted}`);
    console.log(`Questions inserted : ${dryRun ? 'skipped (dry-run)' : questionsInserted}`);
    if (failures.length > 0) {
      console.log('\nValidation failures:');
      for (const { title, errors } of failures) {
        console.log(`  "${title}…"`);
        for (const e of errors) console.log(`    → ${e}`);
      }
    }
    return;
  }

  // ── Standard question path ──
  console.log(`Generating ${count} questions via Claude API...`);
  let generated;
  try {
    generated = await generateQuestions(client, count);
  } catch (err) {
    console.error('Generation failed:', err.message);
    process.exit(1);
  }
  console.log(`Received  : ${generated.length} question(s)\n`);

  let passed = 0, failed = 0, inserted = 0;
  const failures = [];

  for (const q of generated) {
    const errors = validateQuestion(q);
    if (errors.length > 0) {
      failed++;
      failures.push({ preview: String(q.question_text ?? '').slice(0, 60), errors });
    } else {
      passed++;
      if (!dryRun) {
        try {
          const id = await insertQuestion(db, Timestamp, q);
          inserted++;
          console.log(`  ✓ inserted ${id} — "${String(q.question_text).slice(0, 50)}"`);
        } catch (err) {
          console.error(`  ✗ insert failed: ${err.message}`);
          failed++;
          passed--;
        }
      }
    }
  }

  console.log('\n── Summary ──────────────────────────');
  console.log(`Generated  : ${generated.length}`);
  console.log(`Passed     : ${passed}`);
  console.log(`Failed     : ${failed}`);
  console.log(`Inserted   : ${dryRun ? 'skipped (dry-run)' : inserted}`);

  if (failures.length > 0) {
    console.log('\nValidation failures:');
    for (const { preview, errors } of failures) {
      console.log(`  "${preview}…"`);
      for (const e of errors) console.log(`    → ${e}`);
    }
  }

  if (!dryRun && inserted === 0 && passed > 0) {
    console.error('\nWarning: all validated questions failed to insert — check Firestore permissions.');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('\nFatal error:', err.message);
  process.exit(1);
});
