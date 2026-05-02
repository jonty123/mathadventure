#!/usr/bin/env node
/**
 * replenish-questions.js
 *
 * Generates curriculum-aligned questions via the Anthropic API and inserts
 * validated ones into the Firestore `questions` collection.
 *
 * Usage:
 *   node replenish-questions.js --subject math --grade grade3 --count 20
 *   node replenish-questions.js --subject math --grade grade3 --dry-run
 *
 * Required environment variables:
 *   ANTHROPIC_API_KEY
 *
 *   Firebase Admin credentials — one of:
 *     GOOGLE_APPLICATION_CREDENTIALS  (path to service account JSON file)
 *   OR all three of:
 *     FIREBASE_PROJECT_ID
 *     FIREBASE_CLIENT_EMAIL
 *     FIREBASE_PRIVATE_KEY  (the private key from the service account JSON,
 *                            with literal \n for newlines)
 *
 * Generated questions schema (Firestore `questions` collection):
 *   subject          string   e.g. "math"
 *   grade            string   e.g. "grade3"
 *   difficulty       string   "easy" | "medium" | "hard"
 *   category         string   e.g. "fractions"
 *   question_text    string
 *   answer_options   string[] empty array for free-text; MCQ options if present
 *   correct_answer   string
 *   explanation      string
 *   created_at       Timestamp
 *   source           string   "ai-generated"
 */

import Anthropic from '@anthropic-ai/sdk';
import { parseArgs } from 'node:util';

// ── Argument parsing ────────────────────────────────────────────────────────
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
  console.error('Valid values: gradeK, grade1 … grade12');
  process.exit(1);
}

const subject = args.subject;
const grade   = args.grade;
const count   = Math.max(1, Math.min(100, parseInt(args.count, 10) || 20));
const dryRun  = args['dry-run'];

// ── Grade metadata ──────────────────────────────────────────────────────────
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

// ── Unsafe content patterns ─────────────────────────────────────────────────
// Lightweight local scan — not a substitute for the AI safety flag, but adds
// a deterministic layer that cannot be bypassed by prompt injection.
const UNSAFE_RE = /\b(kill|murder|death|suicide|sex|naked|drug|alcohol|weapon|gun|bomb|explode|violence|racist|slur|hate|abuse)\b/i;

// ── Firebase Admin ──────────────────────────────────────────────────────────
async function buildFirestore() {
  const { initializeApp, cert, getApps } = await import('firebase-admin/app');
  const { getFirestore, Timestamp: _T }  = await import('firebase-admin/firestore');

  if (!getApps().length) {
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      const { applicationDefault } = await import('firebase-admin/app');
      initializeApp({ credential: applicationDefault() });
    } else {
      const projectId    = process.env.FIREBASE_PROJECT_ID;
      const clientEmail  = process.env.FIREBASE_CLIENT_EMAIL;
      const privateKey   = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

      if (!projectId || !clientEmail || !privateKey) {
        throw new Error(
          'Missing Firebase credentials. Set GOOGLE_APPLICATION_CREDENTIALS ' +
          'or FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY.'
        );
      }
      initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
    }
  }

  const db = getFirestore();
  const { Timestamp } = await import('firebase-admin/firestore');
  return { db, Timestamp };
}

// ── Question generation ─────────────────────────────────────────────────────
async function generateQuestions(client, count) {
  const meta = GRADE_META[grade] ?? { label: grade, age: 'school-age', topics: subject };

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
  "question_text":    "What is 6 × 7?",
  "correct_answer":   "42",
  "explanation":      "6 × 7 = 42. You can count 7 groups of 6.",
  "difficulty":       "easy",
  "category":         "multiplication",
  "answer_options":   [],
  "is_safe":          true,
  "curriculum_aligned": true
}`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8000,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].text.trim();
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('Response did not contain a JSON array:\n' + text.slice(0, 200));
  return JSON.parse(match[0]);
}

// ── Per-question validation ─────────────────────────────────────────────────
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

// ── Firestore insert ────────────────────────────────────────────────────────
async function insertQuestion(db, Timestamp, q) {
  const doc = {
    subject,
    grade,
    difficulty:      q.difficulty,
    category:        String(q.category).trim().toLowerCase().replace(/\s+/g, '-'),
    question_text:   String(q.question_text).trim(),
    answer_options:  Array.isArray(q.answer_options) ? q.answer_options : [],
    correct_answer:  String(q.correct_answer).trim(),
    explanation:     String(q.explanation ?? '').trim(),
    created_at:      Timestamp.now(),
    source:          'ai-generated',
  };
  const ref = await db.collection('questions').add(doc);
  return ref.id;
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\nMathAdventure — Question Bank Replenishment');
  console.log('═══════════════════════════════════════════');
  console.log(`Subject  : ${subject}`);
  console.log(`Grade    : ${grade}`);
  console.log(`Count    : ${count}`);
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
