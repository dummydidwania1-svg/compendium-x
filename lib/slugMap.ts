/**
 * Static slug → Firestore docId map, generated from data/cases.json.
 * Resolving a slug to a docId no longer requires a Firestore query —
 * it's an instant O(1) map lookup that works offline and before auth.
 *
 * Update this file (or re-run the generator) whenever a new case is added:
 *   node -e "
 *     const d = require('./data/cases.json');
 *     const slugify = t => String(t).toLowerCase().trim()
 *       .replace(/['']/g,'').replace(/&/g,'and')
 *       .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
 *     const m = {};
 *     d.forEach(c => { m[c.slug || slugify(c.title)] = c.docId; });
 *     console.log(JSON.stringify(m, null, 2));
 *   "
 */
export const SLUG_TO_DOC_ID: Record<string, string> = {
  "banking-on-you": "case-1",
  "oil-be-there-for-you": "case-2",
  "hotel-california": "case-3",
  "chip-o-tale": "case-4",
  "max-problems-at-mini-so": "case-5",
  "take-me-to-the-candy-shop": "case-6",
  "mall-of-fame": "case-7",
  "greys-anatomy": "case-8",
  "make-up-for-lost-profits": "case-9",
  "habibi-come-to-dubai": "case-10",
  "i-knew-you-were-trouble-when-i-walked-in": "case-11",
  "as-you-sow-so-shall-you-reap": "case-12",
  "charlie-and-the-candy-factory": "case-13",
  "look-ma-i-can-fly": "case-14",
  "terrible-times": "case-15",
  "empty-kart": "case-16",
  "pulp-fiction": "case-17",
  "dont-steel-from-us": "case-18",
  "my-milkshake-brings-all-the-boys-to-the-yard": "case-19",
  "the-king-of-bad-times": "case-20",
  "beauty-lies-on-the-inside": "case-21",
  "iim-a-irtel": "case-22",
  "mr-worldwide": "case-23",
  "the-sun-wont-set-on-us": "case-24",
  "hotline-bling": "case-25",
  "wat-uh-product": "case-26",
  "ferry-tales": "case-27",
  "when-life-gives-you-lemons": "case-28",
  "when-chai-met-toast": "case-29",
  "netflix-and-chill": "case-30",
  "the-hunger-games": "case-31",
  "udta-punjab": "case-32",
  "risk-it-for-the-biscuit": "case-33",
  "make-india-great-again": "case-38",
  "mo-money-mo-problems": "case-39",
  "gold-digger": "case-40",
  "rating-neil-nitin-and-mukesh": "case-41",
  "left-me-high-and-dry": "case-42",
  "zero-dark-thirty": "case-43",
  "ups-and-downs": "case-44",
  "young-poets-society": "case-45",
  "an-apple-a-day-keeps-the-doctor-away": "case-46",
  "bad-teacher": "case-47",
  "finding-bambi": "case-48",
  "houston-we-have-a-problem": "case-49",
  "crash-course": "case-50",
  "take-me-to-mosque": "case-51",
  "cash-me-if-you-can": "case-52",
  "the-godfather": "case-53",
  "wheres-perry": "case-54",
  "dallas-buyers-club": "case-55",
  "money-heist": "case-57",
  "hala-madrid": "case-58",
  "subway-surfers": "case-59",
  "dont-do-coke": "case-60",
  "its-lights-out-and-away-we-go": "case-61",
  "lights-will-guide-you-home": "case-62",
  "my-name-is-khan": "case-63",
  "space-from-my-x": "case-64",
  "once-upon-a-timesheet": "case-65",
  "final-destination": "case-66",
  "no-of-fence": "case-67",
  "mile-high-club": "case-68",
  "schindlers-fit": "case-69",
  "power-to-the-people": "case-70",
  "parts-and-recreation": "case-71",
  "dry-hard": "case-72",
  "net-worth": "case-73",
  "pound-for-pound": "case-74",
  "up-in-the-air": "case-75",
  "wired-differently": "case-76",
  "dont-sweat-it": "case-77",
}
