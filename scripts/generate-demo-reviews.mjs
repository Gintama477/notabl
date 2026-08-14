// Generates the demo review dataset for the demo dental practice
// ("Brightview Family Dental"). Output is clearly labeled is_demo_data: true
// throughout the app. Deterministic (seeded PRNG) so re-running reproduces
// the same dataset — useful when we tweak counts.
//
// Design: counts per theme per week are hand-specified below so the dataset
// demonstrates real trend patterns for the dashboard/report to surface:
//  - "appointment delays" (scheduling/waiting_time) clearly increasing over 8 weeks
//  - "phone responsiveness" (communication) newly emerging in the last 2 weeks
//  - other themes roughly steady, so they read as established, not noise
//
// Run: node scripts/generate-demo-reviews.mjs

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- seeded PRNG (mulberry32) for reproducibility ---
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260813);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

const PRACTICE_NAME = "Brightview Family Dental";

const FIRST_NAMES = [
  "Jennifer", "Michael", "Sarah", "David", "Ashley", "Chris", "Amanda", "James",
  "Melissa", "Robert", "Laura", "Kevin", "Nicole", "Brian", "Emily", "Jason",
  "Rachel", "Daniel", "Stephanie", "Mark", "Lisa", "Tom", "Karen", "Steve",
  "Angela", "Paul", "Megan", "Brandon", "Christina", "Eric", "Diane", "Greg",
  "Monica", "Justin", "Heather", "Ryan", "Julie", "Andrew", "Kelly", "Scott",
];
const LAST_INITIALS = ["A.", "B.", "C.", "D.", "H.", "K.", "L.", "M.", "P.", "R.", "S.", "T.", "W."];

function randomAuthor() {
  return `${pick(FIRST_NAMES)} ${pick(LAST_INITIALS)}`;
}

// Phrase banks. Each entry is a sentence; reviews combine 1-2 sentences.
const BANKS = {
  staff_friendliness: {
    sentiment: "positive",
    sentences: [
      "The hygienist was so friendly and made me feel comfortable the whole visit.",
      "Every staff member greeted us with a smile the moment we walked in.",
      "The team here is incredibly warm and welcoming, even with my nervous kids.",
      "The front desk staff always remembers my name and asks about my family.",
      "Our hygienist was fantastic and so patient with my son.",
      "Everyone from the receptionist to the dentist was genuinely kind.",
      "I love how friendly and personable the whole staff is here.",
    ],
  },
  cleanliness: {
    sentiment: "positive",
    sentences: [
      "The office was spotless from the waiting room to the exam chairs.",
      "I appreciated how clean and modern the facility looked.",
      "Everything felt sanitized and well maintained.",
      "The clinic is always immaculate, you can tell they take hygiene seriously.",
      "Loved how bright and clean the whole office is.",
    ],
  },
  treatment_experience: {
    sentiment: "positive",
    sentences: [
      "The dentist explained every step of my procedure and it was painless.",
      "My filling was quick and I barely felt a thing.",
      "The dentist walked me through my treatment plan clearly before starting.",
      "Best cleaning I've had in years, very thorough and gentle.",
      "They made a root canal way less scary than I expected.",
      "My daughter's first cavity filling went smoothly thanks to how gentle they were.",
    ],
  },
  professionalism: {
    sentiment: "positive",
    sentences: [
      "The dentist is extremely professional and knowledgeable.",
      "I trust this practice completely with my family's care.",
      "They clearly know what they're doing and it shows in every visit.",
      "Very professional office from start to finish.",
    ],
  },
  billing: {
    sentiment: "negative",
    sentences: [
      "The billing statement was confusing and didn't match what I was quoted.",
      "I was surprised by extra charges that weren't explained upfront.",
      "Had to call twice to get clarity on our insurance billing.",
      "Billing took weeks to sort out after my appointment.",
      "Wish they were more upfront about costs before starting treatment.",
    ],
  },
  parking_accessibility: {
    sentiment: "negative",
    sentences: [
      "Parking near the office is very limited, had trouble finding a spot.",
      "The lot was full and I had to park two blocks away.",
      "Wish there was easier parking access, especially for the elderly.",
    ],
  },
  scheduling: {
    sentiment: "negative",
    sentences: [
      "I waited over 45 minutes past my scheduled appointment time.",
      "My appointment was delayed again, this is the third time in a row.",
      "We had to wait almost an hour in the lobby before being seen.",
      "The scheduling seems to be falling behind lately, long waits every visit.",
      "Appointments never seem to start on time anymore.",
      "Waited so long in the chair before anyone came in to see me.",
      "Front desk overbooked and we sat for 50 minutes past our slot.",
    ],
  },
  communication: {
    sentiment: "negative",
    sentences: [
      "I called three times and no one picked up the phone.",
      "It's nearly impossible to reach the office by phone to reschedule.",
      "Left two voicemails and never got a callback about my appointment.",
      "Phone lines seem to always be busy or go to voicemail.",
      "Tried calling all week and could never get through to a person.",
    ],
  },
};

// Per-week counts (week 1 = oldest, week 8 = most recent/this week).
const WEEK_COUNTS = {
  staff_friendliness:  [3, 3, 2, 3, 2, 3, 3, 4],
  cleanliness:         [2, 1, 2, 1, 2, 1, 2, 2],
  treatment_experience:[2, 1, 2, 2, 1, 2, 1, 2],
  professionalism:     [1, 1, 1, 1, 1, 1, 1, 2],
  billing:             [1, 1, 1, 0, 1, 1, 1, 1],
  parking_accessibility:[0, 1, 0, 1, 0, 0, 1, 0],
  scheduling:          [1, 1, 2, 2, 3, 4, 5, 6],
  communication:       [0, 0, 0, 0, 0, 1, 3, 4],
};

function ratingFor(theme) {
  const bank = BANKS[theme];
  if (bank.sentiment === "positive") return rand() < 0.85 ? 5 : 4;
  // negative
  if (theme === "scheduling") return pick([1, 2, 2, 2, 3]);
  if (theme === "communication") return pick([1, 1, 2, 2]);
  if (theme === "billing") return pick([2, 2, 3]);
  if (theme === "parking_accessibility") return pick([3, 3, 4]);
  return 2;
}

function buildReviewText(primaryTheme) {
  const bank = BANKS[primaryTheme];
  let text = pick(bank.sentences);
  // 30% chance to add a second sentence from a compatible bank (same sentiment)
  if (rand() < 0.3) {
    const sameSentimentThemes = Object.keys(BANKS).filter(
      (t) => BANKS[t].sentiment === bank.sentiment && t !== primaryTheme
    );
    const secondTheme = pick(sameSentimentThemes);
    text += " " + pick(BANKS[secondTheme].sentences);
  }
  return text;
}

// "Today" for the generator = current date the app was built on.
const TODAY = new Date("2026-08-13T12:00:00Z");

function dateForWeek(weekIndex /* 1-8, 8 = most recent */) {
  // week 8 spans days 0-6 ago, week 1 spans days 49-55 ago
  const weeksAgo = 8 - weekIndex; // 0 for week8, 7 for week1
  const dayOffsetBase = weeksAgo * 7;
  const dayJitter = Math.floor(rand() * 7);
  const daysAgo = dayOffsetBase + dayJitter;
  const d = new Date(TODAY);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  // random hour during business hours
  d.setUTCHours(13 + Math.floor(rand() * 8), Math.floor(rand() * 60), 0, 0);
  return d.toISOString();
}

const reviews = [];
let idCounter = 1;

for (const [theme, counts] of Object.entries(WEEK_COUNTS)) {
  counts.forEach((count, i) => {
    const weekIndex = i + 1;
    for (let n = 0; n < count; n++) {
      reviews.push({
        id: `demo-review-${idCounter++}`,
        authorName: randomAuthor(),
        rating: ratingFor(theme),
        reviewText: buildReviewText(theme),
        reviewDate: dateForWeek(weekIndex),
        primaryThemeHint: theme, // for QA only — not treated as ground truth by the AI pipeline
        isDemoData: true,
      });
    }
  });
}

// Sort oldest -> newest, like a real export would read
reviews.sort((a, b) => new Date(a.reviewDate) - new Date(b.reviewDate));

const output = {
  business: {
    name: PRACTICE_NAME,
    industry: "dental",
    city: "Austin",
    state: "TX",
    website: "https://www.brightviewfamilydental.example",
  },
  generatedAt: new Date().toISOString(),
  note: "DEMO DATA — synthetic reviews generated for the ReviewPulse Phase 1 prototype. Not real patient or business data.",
  reviewCount: reviews.length,
  reviews,
};

const outPath = path.join(__dirname, "..", "data", "demo-reviews", "dental-demo-reviews.json");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
console.log(`Wrote ${reviews.length} demo reviews to ${outPath}`);
