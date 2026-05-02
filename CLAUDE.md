# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the app

No build step required. Open `index.html` directly in a browser, or serve it locally:

```powershell
# Quick local server (Python)
python -m http.server 8080
# Then visit http://localhost:8080
```

Deployment is to GitHub Pages — push to `main` and the live site updates automatically.

## Architecture

This is a two-file static web app with no framework or bundler:

- **`index.html`** — everything: HTML structure, all CSS (inline `<style>`), and all JavaScript (a single `<script type="module">` block at the bottom)
- **`questions.js`** — loaded via a plain `<script src>` tag before the module; exports two globals: `QUESTION_BANK` (all questions by grade/category/difficulty) and `GRADE_INFO` (grade metadata). These names must not be changed.

### State management

All app state lives in module-level `let` variables inside the `<script type="module">`. Because HTML `onclick` attributes can't reach module-scope functions directly, every handler is explicitly attached to `window` (e.g. `window.checkAnswer = checkAnswer`).

### Data persistence

Firebase Firestore is the primary store, with `localStorage` as a transparent fallback when Firebase is unavailable. The app detects which mode it's in via `useFirebase` / `db` flags set during `init()`.

Firestore collections:
| Collection | Key | Contents |
|---|---|---|
| `students` | auto-id | `{ name, createdAt }` |
| `submissions` | auto-id | quiz/practice results per student |
| `completedSets` | studentId | map of `grade-category-difficulty-setN → true` |

`localStorage` keys: `mathapp-student-name`, `mathapp-student-id`, `mathapp-student-grade`, `completedSets-{studentId}`.

### Firebase config

The Firebase config is XOR+base64 obfuscated in `ENCRYPTED_CONFIG`. The decryption passphrase is `MathAdventure2024SecretKey!` and is used at runtime in `decryptConfig()`. A manual override modal is available at runtime if the built-in config fails.

### Navigation

Views are plain `<div>` elements toggled with `display` or CSS classes (`.active`). The flow is: user setup → grade selector → mode (Student/Teacher) → categories → difficulty → practice sets → question/quiz view.

## Editing questions

Rules for `questions.js`:
- `a` (answer) must always be a **string**, even for numbers.
- Structure: `QUESTION_BANK[gradeN].questions[category][easy|medium|hard]` — each entry is `{ q, a, explanation }`.
- Do not rename `QUESTION_BANK` or `GRADE_INFO`.
- Each difficulty level should have at least 10 questions (practice sets draw 10, quizzes draw 25).

## Firestore `questions` collection

A `questions` collection in Firestore is the primary question source; `questions.js` is the fallback. When Firebase is connected and the collection has ≥ 5 matching documents for `(subject, grade, category, difficulty)`, those are used instead of the local bank. See `ARCHITECTURE.md` for the full document schema.

## Server-side tooling (Node.js)

`package.json` + `replenish-questions.js` are the only Node.js files. They are not part of the browser app.

```powershell
# Install dependencies (only needed once, before running the script)
npm install

# Generate 20 questions for grade 3 and insert into Firestore
node replenish-questions.js --subject math --grade grade3 --count 20

# Validate only — do not write to Firestore
node replenish-questions.js --subject math --grade grade3 --dry-run
```

Required env vars: `ANTHROPIC_API_KEY` plus Firebase credentials. Copy `.env.example` to `.env` and fill in values. In production these are GitHub Actions secrets (see `.github/workflows/replenish-questions.yml`).

## edu-app-template

`edu-app-template/` is a standalone, subject-agnostic copy of the app. Edit `edu-app-template/config.js` and `edu-app-template/questions.js` to create a new subject app. Full instructions in `edu-app-template/README.md`.

## Further reading

`ARCHITECTURE.md` — complete system diagram, Firestore schemas, security model, and guide for creating new subject apps.
