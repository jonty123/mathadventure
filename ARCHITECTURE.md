# Architecture

System overview for MathAdventure and its reusable template. Read this before making significant changes.

---

## Repository layout

```
mathadventure/
├── index.html               # The live MathAdventure app (all HTML/CSS/JS)
├── questions.js             # Hard-coded question bank — local fallback
├── CLAUDE.md                # Claude Code guidance for this repo
├── ARCHITECTURE.md          # This file
│
├── package.json             # Node.js deps for server-side tooling only
├── replenish-questions.js   # Question bank replenishment agent (Node.js)
├── .env.example             # Environment variable template
│
├── .github/
│   └── workflows/
│       └── replenish-questions.yml   # Weekly + manual GitHub Actions cron
│
└── edu-app-template/        # Subject-agnostic reusable app
    ├── config.js            # Subject name, colours, title — edit this
    ├── questions.js         # Placeholder question bank — edit this
    ├── index.html           # Template app (reads APP_CONFIG from config.js)
    └── README.md            # 10-minute setup guide
```

---

## Frontend (index.html)

The app is a single static HTML file. No build step, no framework.

```
Browser
  │
  ├── <script src="questions.js">     ← loads QUESTION_BANK + GRADE_INFO globals
  └── <script type="module">          ← all app logic; runs in ES module scope
        │
        ├── Firebase JS SDK (CDN)     ← Firestore read/write
        └── State variables           ← currentGrade, currentCategory, etc.
```

Navigation is view-toggling: `<div>` elements switch between `display:none` and `.active` CSS class. No router.

Functions used by HTML `onclick` attributes are explicitly attached to `window` because the app logic runs inside a `<script type="module">` (which is scoped).

### Question loading flow

```
startPractice() / startQuiz()
        │
        ▼
getRandomQuestions(count)
        │
        ├── getQuestionsFromFirestore()
        │       └── query(db, 'questions',
        │               where('subject','==','math'),
        │               where('grade','==',currentGrade),
        │               where('category','==',currentCategory),
        │               where('difficulty','==',currentDifficulty))
        │           ├── ≥5 results → return shuffled slice  ✓
        │           └── <5 results / error → return null
        │
        └── null → fall back to QUESTION_BANK[grade][category][difficulty]
```

The Firestore bank takes priority when it has enough questions; the local hard-coded bank is always the safety net.

---

## GCP / Firebase (Firestore)

Firebase project: the same project used by the original MathAdventure app.

### Collections

| Collection | Key | Contents |
|---|---|---|
| `students` | auto-id | `{ name: string, createdAt: ISO string }` |
| `submissions` | auto-id | quiz/practice result per student (see below) |
| `completedSets` | studentId | map of `"gradeN-category-difficulty-setN" → true` |
| `questions` | auto-id | AI- or human-authored questions (see below) |

**submissions document:**
```
studentId, studentName, subject, grade, category, difficulty,
score, totalQuestions, isTest, setNumber?,
completedAt, sessionId, timeTaken,
questions?: [{ question, correctAnswer, userAnswer, isCorrect }]
```

**questions document (the new collection):**
```
subject          string   "math" | "science" | ...
grade            string   "grade1" … "grade12"
difficulty       string   "easy" | "medium" | "hard"
category         string   e.g. "fractions", "multiplication"
question_text    string
answer_options   string[] [] for free-text, filled for future MCQ
correct_answer   string   always a string, even for numeric answers
explanation      string
created_at       Timestamp
source           string   "ai-generated" | "human"
```

### Firestore security rules

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /students/{id}      { allow read, write: if true; }
    match /submissions/{id}   { allow read, write: if true; }
    match /completedSets/{id} { allow read, write: if true; }
    // Questions are read-only from the browser; writes only via Admin SDK
    match /questions/{id}     { allow read: if true; allow write: if false; }
  }
}
```

> **Before the `questions` collection will be used by the app, create it in the
> Firebase console (or run `replenish-questions.js` — it creates the collection
> on first insert) and apply the security rules above.**

### Firebase config in the browser app

The config is XOR+base64-obfuscated in `ENCRYPTED_CONFIG` inside `index.html`.
Decrypt passphrase: `MathAdventure2024SecretKey!` (share only with trusted users).
The `edu-app-template` takes a different approach: the user pastes the config JSON
into a runtime modal; it is persisted in `localStorage`.

---

## replenish-questions.js

```
CLI args
  --subject, --grade, --count, --dry-run
        │
        ▼
Anthropic claude-sonnet-4-6
  Prompt: generate {count} curriculum-aligned {subject} questions
          for {grade} students as a JSON array
        │
        ▼
validateQuestion() — per question:
  • question_text non-empty and ≥5 chars
  • correct_answer non-empty string
  • difficulty in {easy, medium, hard}
  • category non-empty
  • generator's is_safe flag is true
  • generator's curriculum_aligned flag is true
  • local keyword blocklist (UNSAFE_RE) clean
        │
        ▼
  pass → Firestore db.collection('questions').add(doc)
  fail → log error, skip
        │
        ▼
Summary: generated / passed / failed / inserted
```

Credentials are never hardcoded — loaded from env vars only (see `.env.example`).

### Rate limiting

The script is invoked at most once per run (no internal loop). The GitHub Actions
cron fires weekly. The Anthropic API has per-minute token limits; a single run of
100 questions is well within default quotas.

---

## edu-app-template

A copy-paste starting point for any quiz subject.

```
config.js  →  APP_CONFIG = { subject, appTitle, headerGradient, primaryColor, gradeRange }
                │
                ▼
index.html reads APP_CONFIG at runtime (no build step)
  • Sets page title, header text, colours
  • Filters Firestore questions by APP_CONFIG.subject
  • Shows only grades listed in APP_CONFIG.gradeRange

questions.js  →  QUESTION_BANK + GRADE_INFO
  (local fallback; same structure as mathadventure/questions.js)
```

To create a new subject app: copy the folder, edit `config.js` and `questions.js`, deploy to GitHub Pages. See `edu-app-template/README.md`.

---

## Creating a new subject app end-to-end

1. Copy `edu-app-template/` → new folder or repo.
2. Edit `config.js` — set subject name, colours, grade range.
3. Edit `questions.js` — add your local fallback questions.
4. Deploy to GitHub Pages (push to `main`, enable Pages in repo settings).
5. Optionally, point `replenish-questions.js` at the same Firebase project
   with `--subject <your-subject>` to populate the shared Firestore question bank.
   The same `questions` collection stores questions for all subjects; the `subject`
   field keeps them separate.

---

## Security properties

| Concern | Mitigation |
|---|---|
| Child data privacy | Student names stored voluntarily; no passwords, no tracking outside the app |
| API key exposure | Firebase config obfuscated (browser); all other credentials in env vars / GitHub Secrets |
| Unsafe AI questions | Two-layer check: generator self-flag + local keyword regex before any DB insert |
| Firestore write access | `questions` collection is read-only from the browser (Admin SDK only for writes) |
| CI/CD secrets | All keys in GitHub Actions secrets; `.env` in `.gitignore` |
