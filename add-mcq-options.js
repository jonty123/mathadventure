#!/usr/bin/env node
/**
 * add-mcq-options.js
 *
 * Finds Firestore questions with empty answer_options and populates them
 * using the Claude API to generate 4 distractor options.
 *
 * Usage:
 *   node add-mcq-options.js --subject science --grade grade3
 *   node add-mcq-options.js --subject science --grade grade3 --dry-run
 *   node add-mcq-options.js --dry-run   (process all non-math grades 1–5)
 *
 * Required environment variables: same as replenish-questions.js
 *   ANTHROPIC_API_KEY
 *   GOOGLE_APPLICATION_CREDENTIALS  (path to service account JSON)
 *   OR: FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY
 */

import Anthropic from '@anthropic-ai/sdk';
import { parseArgs } from 'node:util';

const SUPPORTED_GRADES   = ['grade1', 'grade2', 'grade3', 'grade4', 'grade5'];
const NON_MATH_SUBJECTS  = ['science', 'english', 'history', 'geography', 'reading-comprehension'];

const { values: args } = parseArgs({
  options: {
    subject:   { type: 'string'                    },
    grade:     { type: 'string'                    },
    'dry-run': { type: 'boolean', default: false   },
  },
  allowPositionals: false,
});

if (args.subject === 'math') {
  console.error('Error: --subject math is not supported. This script only processes non-math subjects.');
  process.exit(1);
}
if (args.subject && !NON_MATH_SUBJECTS.includes(args.subject)) {
  console.error(`Error: --subject must be one of: ${NON_MATH_SUBJECTS.join(', ')}`);
  process.exit(1);
}
if (args.grade && !SUPPORTED_GRADES.includes(args.grade)) {
  console.error(`Error: --grade must be one of: ${SUPPORTED_GRADES.join(', ')}`);
  process.exit(1);
}

const subject = args.subject ?? null;
const grade   = args.grade   ?? null;
const dryRun  = args['dry-run'];

// ── Firebase Admin (mirrors replenish-questions.js) ──────────────────────────
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

  const { getFirestore } = await import('firebase-admin/firestore');
  return { db: getFirestore() };
}

// ── Claude API — generate 4 distractors ──────────────────────────────────────
async function generateDistractors(client, questionText, correctAnswer) {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 500,
    messages: [{
      role: 'user',
      content:
        'Given this quiz question and correct answer, generate exactly 4 plausible but clearly wrong distractor options suitable for a child aged 6-11. ' +
        'Return a JSON array of exactly 4 strings, nothing else.\n' +
        `Question: ${questionText}\n` +
        `Correct answer: ${correctAnswer}`,
    }],
  });

  const text  = response.content[0].text.trim();
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('Response contained no JSON array: ' + text.slice(0, 120));

  const distractors = JSON.parse(match[0]);
  if (!Array.isArray(distractors) || distractors.length !== 4)
    throw new Error(`Expected 4 distractors, got ${Array.isArray(distractors) ? distractors.length : 'non-array'}`);

  return distractors;
}

// ── Build final 5-item options list ──────────────────────────────────────────
function buildAnswerOptions(distractors, correctAnswer) {
  const options = [...distractors];
  const pos = Math.floor(Math.random() * 5);
  options.splice(pos, 0, String(correctAnswer));
  return options;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\nLearning Adventure — Add MCQ Options');
  console.log('═════════════════════════════════════');
  console.log(`Subject  : ${subject ?? 'all non-math'}`);
  console.log(`Grade    : ${grade   ?? 'all (grade1–grade5)'}`);
  console.log(`Dry-run  : ${dryRun}`);
  console.log();

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY environment variable is not set.');
    process.exit(1);
  }

  console.log('Connecting to Firestore...');
  const { db } = await buildFirestore();
  console.log('Connected.\n');

  // Use equality filters where provided; JS-filter the rest to avoid index gaps
  let fsQuery = db.collection('questions');
  if (subject) fsQuery = fsQuery.where('subject', '==', subject);
  if (grade)   fsQuery = fsQuery.where('grade',   '==', grade);

  console.log('Fetching questions...');
  const snap = await fsQuery.get();

  const docs = snap.docs.filter(d => {
    const data = d.data();
    return data.subject !== 'math'
      && SUPPORTED_GRADES.includes(data.grade)
      && (!Array.isArray(data.answer_options) || data.answer_options.length === 0);
  });

  console.log(`Found ${docs.length} question(s) with empty answer_options.\n`);
  if (docs.length === 0) { console.log('Nothing to do.'); return; }

  const client = new Anthropic();
  let updated = 0, failed = 0;

  for (let i = 0; i < docs.length; i++) {
    const doc     = docs[i];
    const data    = doc.data();
    const preview = String(data.question_text ?? '').slice(0, 60);

    process.stdout.write(`${i + 1} / ${docs.length} — `);

    let distractors;
    try {
      distractors = await generateDistractors(client, data.question_text, data.correct_answer);
    } catch (err) {
      console.log(`FAILED (generation): ${err.message}`);
      failed++;
      if (i < docs.length - 1) await sleep(2000);
      continue;
    }

    const answerOptions = buildAnswerOptions(distractors, data.correct_answer);

    if (dryRun) {
      console.log(`dry-run: "${preview}"\n         options: ${JSON.stringify(answerOptions)}`);
    } else {
      try {
        await doc.ref.update({ answer_options: answerOptions });
        console.log(`updated: "${preview}"`);
        updated++;
      } catch (err) {
        console.log(`FAILED (write): ${err.message}`);
        failed++;
        if (i < docs.length - 1) await sleep(2000);
        continue;
      }
    }

    if (i < docs.length - 1) await sleep(2000);
  }

  console.log('\n── Summary ──────────────────────────');
  console.log(`Found   : ${docs.length}`);
  console.log(`Updated : ${dryRun ? 'skipped (dry-run)' : updated}`);
  console.log(`Failed  : ${failed}`);
}

main().catch(err => {
  console.error('\nFatal error:', err.message);
  process.exit(1);
});
