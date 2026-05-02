#!/usr/bin/env bash
set -euo pipefail

GRADES=(grade3 grade5 grade7 grade9)
STANDARD_SUBJECTS=(math science english history geography)

for subject in "${STANDARD_SUBJECTS[@]}"; do
  for grade in "${GRADES[@]}"; do
    echo ""
    echo "════════════════════════════════════════════"
    echo "  Subject: ${subject}  |  Grade: ${grade}"
    echo "════════════════════════════════════════════"
    node replenish-questions.js --subject "$subject" --grade "$grade" --count 20
    sleep 10
  done
done

for grade in "${GRADES[@]}"; do
  echo ""
  echo "════════════════════════════════════════════"
  echo "  Subject: reading-comprehension  |  Grade: ${grade}"
  echo "════════════════════════════════════════════"
  node replenish-questions.js --subject reading-comprehension --grade "$grade" --count 5
  sleep 10
done

echo ""
echo "All done!"
