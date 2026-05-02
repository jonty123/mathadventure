// ============================================================
//  edu-app-template — config.js
//
//  Edit this file to customise the app for your subject.
//  All other files read from APP_CONFIG — you should not
//  need to touch index.html for basic subject changes.
// ============================================================

const APP_CONFIG = {
  // ── Subject identity ──────────────────────────────────────
  // Used as the Firestore filter value and in Analytics labels.
  // Use lowercase, no spaces (e.g. "math", "science", "history").
  subject: "math",

  // ── Display text ─────────────────────────────────────────
  appTitle: "Math Adventure!",
  appSubtitle: "Let's learn and have fun! 🚀",
  headerIcon: "🎓",        // emoji shown before the title

  // ── Colours ───────────────────────────────────────────────
  // headerGradient : CSS gradient for the header bar
  // primaryColor   : accent colour used for buttons and borders
  headerGradient: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
  primaryColor: "#6c5ce7",

  // ── Grade display ─────────────────────────────────────────
  // Controls which grade cards appear in the grade selector.
  // Must match keys in GRADE_INFO in questions.js.
  gradeRange: ["grade1", "grade2", "grade3", "grade4", "grade5"],
};
