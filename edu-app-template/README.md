# edu-app-template

A reusable educational quiz app. Customise once in `config.js`, add questions to `questions.js`, deploy to GitHub Pages.

## Quick start — under 10 minutes

### 1. Copy the template

```bash
# Option A — copy inside the monorepo
cp -r edu-app-template science-adventure

# Option B — new repo
gh repo create science-adventure --public
cp -r edu-app-template science-adventure && cd science-adventure
git init && git add . && git commit -m "init from edu-app-template"
git push -u origin main
```

### 2. Edit `config.js`

Open `config.js` and change these values:

```js
const APP_CONFIG = {
  subject: "science",              // used as Firestore filter — lowercase, no spaces
  appTitle: "Science Explorer!",
  appSubtitle: "Discover the world! 🔬",
  headerIcon: "🔬",
  headerGradient: "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)",
  primaryColor: "#00b09b",
  gradeRange: ["grade1", "grade2", "grade3"],   // must match keys in questions.js
};
```

Colour inspiration:
| Subject | Gradient | Primary |
|---------|----------|---------|
| Science | `135deg, #43e97b, #38f9d7` | `#00b09b` |
| History | `135deg, #f7971e, #ffd200` | `#e67e22` |
| English | `135deg, #4facfe, #00f2fe` | `#0984e3` |
| Geography | `135deg, #84fab0, #8fd3f4` | `#27ae60` |

### 3. Edit `questions.js`

Replace the placeholder questions with your own, following this pattern:

```js
const QUESTION_BANK = {
  grade1: {
    categories: ["animals", "plants"],
    categoryInfo: {
      animals: {
        icon: "🐾",
        title: "Animals",
        desc: "The animal kingdom",
        color: "linear-gradient(135deg,#a8edea 0%,#fed6e3 100%)"
      },
    },
    questions: {
      animals: {
        easy: [
          { q: "How many legs does a dog have?", a: "4", explanation: "Dogs are four-legged mammals." },
          // add at least 10 easy questions ...
        ],
        medium: [ /* at least 10 */ ],
        hard:   [ /* at least 8  */ ],
      },
    },
  },
  // add more grades ...
};

const GRADE_INFO = {
  grade1: { label: "Grade 1", emoji: "🌱", description: "Animals, Plants" },
};
```

Rules:
- `a` (answer) must always be a **string**, even for numbers: `a: "4"` not `a: 4`.
- Each difficulty level needs at least 10 questions (practice sets draw 10, quizzes draw 25 from all difficulty levels pooled together).
- `QUESTION_BANK` and `GRADE_INFO` names must not change.

### 4. Deploy

**GitHub Pages (recommended):**
1. Push to `main`
2. Repo Settings → Pages → Source: `main`, folder: `/ (root)`
3. Visit `https://<your-username>.github.io/<repo-name>/`

**Local preview:**
```bash
python -m http.server 8080
# open http://localhost:8080
```

---

## Firebase / GCP setup (optional — enables Teacher Dashboard)

Without Firebase the app saves progress in `localStorage` per device. To enable cross-device sync and the Teacher Dashboard:

1. Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com)
2. Add a **Web app**, copy the config JSON
3. Enable **Firestore Database** in the console
4. Open your deployed app, click "I'm a Teacher", then enter the Firebase config JSON in the modal
5. The config is persisted in localStorage — you only need to enter it once per browser

### Firestore security rules (paste in Firestore → Rules)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /students/{id}    { allow read, write: if true; }
    match /submissions/{id} { allow read, write: if true; }
    match /completedSets/{id} { allow read, write: if true; }
    match /questions/{id}   { allow read: if true; allow write: if false; }
  }
}
```

---

## AI question replenishment (optional)

Use `replenish-questions.js` at the repo root to auto-generate and insert questions into Firestore:

```bash
node replenish-questions.js --subject science --grade grade3 --count 20
```

See [`ARCHITECTURE.md`](../ARCHITECTURE.md) for the full pipeline.
