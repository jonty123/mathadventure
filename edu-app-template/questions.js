// ============================================================
//  edu-app-template — questions.js
//
//  Local fallback question bank.  Questions served from the
//  Firestore `questions` collection take priority; this file
//  is used when Firestore is unavailable or has no matching
//  questions for the selected grade/category/difficulty.
//
//  HOW TO EDIT:
//  • Each grade has a list of categories and a questions block.
//  • Every category has three levels: easy / medium / hard.
//  • Each question: { q: "...", a: "...", explanation: "..." }
//  • a (answer) must always be a STRING, even for numbers.
//  • Do NOT rename QUESTION_BANK or GRADE_INFO.
// ============================================================

const QUESTION_BANK = {

  grade1: {
    categories: ["topic1", "topic2"],
    categoryInfo: {
      topic1: {
        icon: "⭐",
        title: "Topic One",
        desc: "Describe topic one here",
        color: "linear-gradient(135deg,#a8edea 0%,#fed6e3 100%)"
      },
      topic2: {
        icon: "🔷",
        title: "Topic Two",
        desc: "Describe topic two here",
        color: "linear-gradient(135deg,#d4fc79 0%,#96e6a1 100%)"
      },
    },
    questions: {
      topic1: {
        easy: [
          { q: "Sample easy question 1?",   a: "answer1", explanation: "Explanation 1." },
          { q: "Sample easy question 2?",   a: "answer2", explanation: "Explanation 2." },
          { q: "Sample easy question 3?",   a: "answer3", explanation: "Explanation 3." },
          { q: "Sample easy question 4?",   a: "answer4", explanation: "Explanation 4." },
          { q: "Sample easy question 5?",   a: "answer5", explanation: "Explanation 5." },
          { q: "Sample easy question 6?",   a: "answer6", explanation: "Explanation 6." },
          { q: "Sample easy question 7?",   a: "answer7", explanation: "Explanation 7." },
          { q: "Sample easy question 8?",   a: "answer8", explanation: "Explanation 8." },
          { q: "Sample easy question 9?",   a: "answer9", explanation: "Explanation 9." },
          { q: "Sample easy question 10?",  a: "answer10", explanation: "Explanation 10." },
        ],
        medium: [
          { q: "Sample medium question 1?", a: "answer1", explanation: "Explanation 1." },
          { q: "Sample medium question 2?", a: "answer2", explanation: "Explanation 2." },
          { q: "Sample medium question 3?", a: "answer3", explanation: "Explanation 3." },
          { q: "Sample medium question 4?", a: "answer4", explanation: "Explanation 4." },
          { q: "Sample medium question 5?", a: "answer5", explanation: "Explanation 5." },
          { q: "Sample medium question 6?", a: "answer6", explanation: "Explanation 6." },
          { q: "Sample medium question 7?", a: "answer7", explanation: "Explanation 7." },
          { q: "Sample medium question 8?", a: "answer8", explanation: "Explanation 8." },
          { q: "Sample medium question 9?", a: "answer9", explanation: "Explanation 9." },
          { q: "Sample medium question 10?",a: "answer10", explanation: "Explanation 10." },
        ],
        hard: [
          { q: "Sample hard question 1?",   a: "answer1", explanation: "Explanation 1." },
          { q: "Sample hard question 2?",   a: "answer2", explanation: "Explanation 2." },
          { q: "Sample hard question 3?",   a: "answer3", explanation: "Explanation 3." },
          { q: "Sample hard question 4?",   a: "answer4", explanation: "Explanation 4." },
          { q: "Sample hard question 5?",   a: "answer5", explanation: "Explanation 5." },
          { q: "Sample hard question 6?",   a: "answer6", explanation: "Explanation 6." },
          { q: "Sample hard question 7?",   a: "answer7", explanation: "Explanation 7." },
          { q: "Sample hard question 8?",   a: "answer8", explanation: "Explanation 8." },
        ],
      },
      topic2: {
        easy: [
          { q: "Sample easy question 1?",   a: "answer1", explanation: "Explanation 1." },
          { q: "Sample easy question 2?",   a: "answer2", explanation: "Explanation 2." },
          { q: "Sample easy question 3?",   a: "answer3", explanation: "Explanation 3." },
          { q: "Sample easy question 4?",   a: "answer4", explanation: "Explanation 4." },
          { q: "Sample easy question 5?",   a: "answer5", explanation: "Explanation 5." },
          { q: "Sample easy question 6?",   a: "answer6", explanation: "Explanation 6." },
          { q: "Sample easy question 7?",   a: "answer7", explanation: "Explanation 7." },
          { q: "Sample easy question 8?",   a: "answer8", explanation: "Explanation 8." },
          { q: "Sample easy question 9?",   a: "answer9", explanation: "Explanation 9." },
          { q: "Sample easy question 10?",  a: "answer10", explanation: "Explanation 10." },
        ],
        medium: [
          { q: "Sample medium question 1?", a: "answer1", explanation: "Explanation 1." },
          { q: "Sample medium question 2?", a: "answer2", explanation: "Explanation 2." },
          { q: "Sample medium question 3?", a: "answer3", explanation: "Explanation 3." },
          { q: "Sample medium question 4?", a: "answer4", explanation: "Explanation 4." },
          { q: "Sample medium question 5?", a: "answer5", explanation: "Explanation 5." },
          { q: "Sample medium question 6?", a: "answer6", explanation: "Explanation 6." },
          { q: "Sample medium question 7?", a: "answer7", explanation: "Explanation 7." },
          { q: "Sample medium question 8?", a: "answer8", explanation: "Explanation 8." },
          { q: "Sample medium question 9?", a: "answer9", explanation: "Explanation 9." },
          { q: "Sample medium question 10?",a: "answer10", explanation: "Explanation 10." },
        ],
        hard: [
          { q: "Sample hard question 1?",   a: "answer1", explanation: "Explanation 1." },
          { q: "Sample hard question 2?",   a: "answer2", explanation: "Explanation 2." },
          { q: "Sample hard question 3?",   a: "answer3", explanation: "Explanation 3." },
          { q: "Sample hard question 4?",   a: "answer4", explanation: "Explanation 4." },
          { q: "Sample hard question 5?",   a: "answer5", explanation: "Explanation 5." },
          { q: "Sample hard question 6?",   a: "answer6", explanation: "Explanation 6." },
          { q: "Sample hard question 7?",   a: "answer7", explanation: "Explanation 7." },
          { q: "Sample hard question 8?",   a: "answer8", explanation: "Explanation 8." },
        ],
      },
    },
  },

};

// ============================================================
//  GRADE METADATA  —  controls grade selector display
//  Must include every key listed in APP_CONFIG.gradeRange
// ============================================================
const GRADE_INFO = {
  grade1: { label: "Grade 1", emoji: "🌱", description: "Topic One, Topic Two" },
};
