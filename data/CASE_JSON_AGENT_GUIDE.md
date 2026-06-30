# Case JSON generation guide — for the case-generating agent

## Why you're getting this document

Two generated cases (`case-41`, `case-42`) shipped with schema bugs that
broke the live app — one caused a hard crash ("Application error: client
exception has occurred"), the others were silent content bugs (wrong
headers, dead data). None of this was caught by validation: the Firestore
schema for cases is intentionally loose (`z.object({...}).loose()` in
`lib/firebase/schema.ts`), and the import script (`scripts/import-cases.mjs`)
only requires `title`, `industry`, `difficulty`, `prompt`, `framework` —
everything else is written to Firestore as-is, so a wrong field name or
wrong value type ships straight to a runtime bug with no warning.

This document is the fix: real, verified-correct JSON pulled directly from
`data/cases.json`, chosen to cover every structural feature currently used
in the dataset (including every `visualisations[].type`), plus the exact
rules that were violated and why each one matters. Match these shapes when
generating new cases — don't invent new field names or new visualisation
types without checking `components/case/CasePreviewMaster.tsx` first, since
an unrecognized shape there fails silently (renders nothing) rather than
erroring loudly.

---

## Part 1 — Hard rules (violating these breaks the app)

### Rule 1: `abbreviations` is an array of strings, never objects

```json
"abbreviations": ["IMDb: Internet Movie Database", "IIFA: International Indian Film Academy"]
```

**Never** do this:
```json
"abbreviations": [{ "short": "IMDb", "full": "Internet Movie Database" }]
```

This is the bug that crashed `case-41`. The renderer does
`{(abbreviations ?? []).map((item, i) => ... <span>{item}</span> ...)}` —
`item` is rendered directly as a React child. An object there throws
"Objects are not valid as a React child," which is the exact crash that
occurred. Format is always `"SHORT: Full Form"` as one string per entry.

### Rule 2: `frameworkTree.notes` titles are exactly these three, in this order

```json
"notes": [
  { "title": "Questions", "items": ["...", "..."] },
  { "title": "Keep In Mind", "items": ["...", "..."] },
  { "title": "Brownie Points", "items": ["...", "..."] }
]
```

Never `"Clarifying Questions"` or any other variant of the first title.
Never add a 4th entry (see Rule 3).

### Rule 3: never put a `"Recommendations"` block inside `frameworkTree.notes`

The Recommendations section on the case page is **not** sourced from
`frameworkTree.notes` — it's parsed automatically from the closing summary
block of the `framework` transcript string (every case's `framework` field
ends with a structured recap; see the `"Chip-o-Tale Framework &
Recommendations"` closing block in the case-4 example below). A
`"Recommendations"` entry inside `frameworkTree.notes` is dead data: it
never feeds the real Recommendations UI, it just renders as an unintended
4th note card. If a case needs a structured recommendations comparison
(e.g. short-term vs long-term), use the top-level `recommendationsTable`
field instead — see Part 2.

### Rule 4: `additionalFrameworkTrees[]` entries use `"label"`, never `"title"`

```json
"additionalFrameworkTrees": [
  { "label": "What Should We Do", "nodes": { ... }, "defaultExpanded": [...], "defaultFocusedId": "...", "notes": [] }
]
```

The renderer does:
```ts
<AdditionalFrameworkPanel tree={addTree} label={addTree.label ?? `Framework ${idx + 2}`} />
```
Using `"title"` means `addTree.label` is `undefined`, so the panel header
silently falls back to a generic `"Framework 2"` / `"Framework 3"` instead
of a real heading. No crash, but it's a visible content bug.

---

## Part 2 — Reference cases (real JSON from `data/cases.json`)

Each example below is the actual document for that `docId`, with only the
long `framework` transcript string truncated (kept the opening line so you
can see the speaker-prefixed transcript format; full text lives in
`data/cases.json`). Everything else — every field, every key — is real and
currently live and correct.

### `case-58` — tables with merged cells, formula, abbreviations (richest single example)

Demonstrates: `visualisations[].type === "table"` with `mergeRowPairs` +
`mergeFinalRowCols` (rowspan/colspan merging for a 2-row-per-category table),
a plain table, a `formula` visualisation, correct `abbreviations`, and a
clean standard 3-block `notes`. Also note `frameworkTree.nodes: {}` is
valid — see the callout below.

```json
{
  "id": 58,
  "docId": "case-58",
  "title": "Hala Madrid!",
  "industry": "Industry Agnostic",
  "difficulty": "Easy",
  "case_type": "Guesstimate",
  "company": "Kearney",
  "round": "Buddy",
  "prompt": "You spoke about your passion for football. Which is your favourite football club?",
  "abbreviations": [
    "BPL: Below Poverty Line",
    "LMC: Lower Middle Class",
    "UMC: Upper Middle Class",
    "UC: Upper Class"
  ],
  "frameworkTree": {
    "nodes": {},
    "defaultExpanded": [],
    "defaultFocusedId": "",
    "notes": [
      { "title": "Questions", "items": ["Are we counting only official jerseys or replicas too?", "What time duration are we considering?"] },
      { "title": "Keep In Mind", "items": ["Round off numbers wherever required to avoid calculation mistakes", "Only the Upper Class can afford the ~ Rs 6,000 official jersey"] },
      { "title": "Brownie Points", "items": ["Dividing football followers across 8 popularly supported clubs", "Drawing insight from personal experience (1 in 5 owns a jersey)"] }
    ]
  },
  "visualisations": [
    {
      "id": "urban-income-segmentation",
      "type": "table",
      "inlineOnly": true,
      "title": "Urban Population by Income",
      "header": "Urban Population by Income",
      "noTitle": true,
      "columns": ["Category", "Income", "Population percentage", "Population"],
      "columnWidths": ["28%", "32%", "20%", "20%"],
      "summaryRows": [3],
      "rows": [
        ["Below Poverty Line", "< Rs 10,000/month", "30%", "120 million"],
        ["Lower Middle Class", "Rs 10,000 - Rs 20,000/month", "30%", "120 million"],
        ["Upper Middle Class", "Rs 20,000 - Rs 80,000/month", "30%", "120 million"],
        ["Upper Class", "> Rs 80,000/month", "10%", "40 million"]
      ]
    },
    {
      "id": "football-following-by-age",
      "type": "table",
      "inlineOnly": true,
      "title": "Football Following by Age and Gender",
      "header": "Football Following by Age and Gender",
      "noTitle": true,
      "columns": ["Age Group", "Population percentage", "Population", "Category", "% following football", "Number of people"],
      "columnWidths": ["15%", "18%", "15%", "20%", "16%", "16%"],
      "summaryRows": [6],
      "mergeRowPairs": 3,
      "mergeFinalRowCols": 5,
      "rows": [
        ["< 18", "40%", "16 million", "Male (8 million)", "25%", "2,000,000"],
        ["", "", "", "Female (8 million)", "5%", "400,000"],
        ["18 - 40", "30%", "12 million", "Male (6 million)", "10%", "600,000"],
        ["", "", "", "Female (6 million)", "2%", "120,000"],
        ["40+", "30%", "12 million", "Male (6 million)", "0%", "0"],
        ["", "", "", "Female (6 million)", "0%", "0"],
        ["Total", "", "", "", "", "3 million (approx.)"]
      ]
    },
    {
      "id": "jerseys-funnel",
      "type": "table",
      "title": "Real Madrid Jerseys Sold in India per Year",
      "header": "Real Madrid Jerseys Sold in India per Year",
      "noTitle": true,
      "columns": ["Ref", "Step", "Calculation", "Value"],
      "columnWidths": ["7%", "38%", "33%", "22%"],
      "summaryRows": [3, 4, 6],
      "rows": [
        ["A", "India Population", "Starting point", "1.4 billion"],
        ["B", "Urban Population", "30% of A (rural eliminated)", "~ 400 million"],
        ["C", "Upper Class", "10% of B (only affluent buyers)", "40 million"],
        ["D", "Affluent Football Fans", "Age and gender filter on C", "3 million"],
        ["E", "Real Madrid Fans", "D / 8 popular clubs", "375,000"],
        ["F", "Official Jersey Owners", "E / 5 (1 in 5 owns one)", "75,000"],
        ["G", "Jerseys Sold per Year", "F / 5 (5-year life)", "15,000"]
      ]
    },
    {
      "title": "Jerseys Sold per Year",
      "type": "formula",
      "lhs": "Jerseys Sold per Year",
      "rhs": "(Real Madrid Fans x Jersey Ownership Rate) / Jersey Life"
    }
  ],
  "framework": "Candidate: Yes sir. I'm a die-hard supporter of Real Madrid.\nInterviewer: That's great. How many Real Madrid jerseys do ... [transcript truncated — full text in data/cases.json]"
}
```

**Notes on the `table` visualisation fields used above:**
- `inlineOnly: true` — table renders inline in the tree-drilldown panel, not as a standalone block. Omit (or `false`) for a separate table block (see `jerseys-funnel` above, which has no `inlineOnly`).
- `header` + `noTitle: true` — `header` is the label shown above the table; `noTitle: true` suppresses a redundant duplicate of `title`. This pair is used together in basically every table in the dataset — copy this pattern.
- `summaryRows: [3]` — zero-indexed row numbers that get bold/total styling (e.g. a "Total" row).
- `mergeRowPairs: 3` — merges every pair of rows (rowspan) for the first N columns, used when 2 rows share a category (e.g. Male/Female under one age group). `3` here means columns 0–2 are merged across each row pair.
- `mergeFinalRowCols: 5` — for the final row (the totals row), merge columns 0 through this index into one spanning cell.
- `insight?: string` — optional, a one-line callout shown under a table (see case-27's `market-sizing` table below for an example).

**Important — empty `frameworkTree` is valid for pure guesstimate cases:**
`"nodes": {}, "defaultExpanded": [], "defaultFocusedId": ""` is a real,
supported pattern, not a bug. The renderer computes
`hasTree = ROOT_ID !== ''` and skips the tree diagram entirely when there's
no root, showing only the notes + visualisations. Use this when a case is
driven entirely by tables/formulas (typical for Guesstimate case types) and
doesn't need a structure-tree diagram. Don't leave `nodes` empty by
accident, though — if the case does have a logical framework breakdown, it
should be populated like every other example in this document.

---

### `case-4` — minimal correct `recommendationsTable`

Demonstrates the simplest correct shape for `recommendationsTable`, and
shows the full `framework` transcript format including its closing summary
block (this is where "real" recommendations text belongs — not in
`frameworkTree.notes`).

```json
{
  "id": 4,
  "docId": "case-4",
  "title": "Chip-o-Tale",
  "industry": "FMCG",
  "difficulty": "Medium",
  "case_type": "Profitability",
  "company": "Bain & Company",
  "round": "Partner",
  "prompt": "Hey. Let's start with a case. Your client is Fringles, a famous Soya chip manufacturer in India. Fringles has been reporting declining profits for the last one year. They have approached you to diagnose the problem immediately.",
  "frameworkTree": {
    "nodes": {
      "profits": { "id": "profits", "label": "Profits", "tone": "root", "children": ["revenue", "costs"] },
      "revenue": { "id": "revenue", "label": "Revenue", "tone": "branch", "children": ["volume-sold", "average-price"] },
      "costs": { "id": "costs", "label": "Costs", "tone": "support", "children": [] },
      "volume-sold": { "id": "volume-sold", "label": "Volume Sold", "tone": "branch", "children": ["production", "distribution", "demand"] },
      "average-price": { "id": "average-price", "label": "Average Price", "tone": "support", "children": [] },
      "production": { "id": "production", "label": "Production", "tone": "support", "children": [] },
      "distribution": { "id": "distribution", "label": "Distribution", "tone": "support", "children": [] },
      "demand": { "id": "demand", "label": "Demand", "tone": "branch", "children": ["need", "awareness", "affordability", "accessibility", "experience"] },
      "need": { "id": "need", "label": "Need", "tone": "branch", "children": ["core-product", "complements", "substitutes"] },
      "awareness": { "id": "awareness", "label": "Awareness", "tone": "support", "children": [] },
      "affordability": { "id": "affordability", "label": "Affordability", "tone": "support", "children": [] },
      "accessibility": { "id": "accessibility", "label": "Accessibility", "tone": "support", "children": [] },
      "experience": { "id": "experience", "label": "Experience", "tone": "support", "children": [] },
      "core-product": { "id": "core-product", "label": "Core Product", "tone": "branch", "children": ["intrinsic", "extrinsic"] },
      "complements": { "id": "complements", "label": "Complements", "tone": "support", "children": [] },
      "substitutes": { "id": "substitutes", "label": "Substitutes", "tone": "support", "children": [] },
      "intrinsic": { "id": "intrinsic", "label": "Intrinsic", "tone": "branch", "children": ["health", "packaging"] },
      "extrinsic": { "id": "extrinsic", "label": "Extrinsic", "tone": "support", "children": ["status-and-perception"] },
      "health": { "id": "health", "label": "Health", "tone": "leaf", "children": [] },
      "packaging": { "id": "packaging", "label": "Packaging", "tone": "support", "children": [] },
      "status-and-perception": { "id": "status-and-perception", "label": "Status & Perception", "tone": "support", "children": [] }
    },
    "defaultExpanded": ["profits", "revenue", "volume-sold", "demand", "need", "core-product", "intrinsic"],
    "defaultFocusedId": "health",
    "notes": [
      { "title": "Questions", "items": ["Segmenting problem geographically", "Product types the client offers", "Competitor benchmarking in the same period"] },
      { "title": "Keep In Mind", "items": ["Segment geographically before diving deeper", "State hypotheses clearly but stay flexible. Your hypothesis could be wrong"] },
      { "title": "Brownie Points", "items": ["Dividing recommendations into long and short term", "Identifying multiple types of needs customers may have"] }
    ]
  },
  "framework": "Candidate: Interesting. I'd like to understand the problem a little better. ... [transcript truncated] ... Chip-o-Tale Framework & Recommendations\nDECLINING PROFITS OF FRINGLES\nClarifying Questions: Segmenting problem geographically Product types the client offers Competitor benchmarking in the same period\nBrownie Points: Dividing recommendations into long and short term to tackle different problems Identifying multiple types of needs customers may have\nKeep In Mind: Interviewers often throw curveballs based on your line of thinking. Try to hypothesize but be willing to accept that some hypotheses might not be right.",
  "recommendationsTable": {
    "framework": "Short-Term / Long-Term",
    "columns": ["Short-term", "Long-term"],
    "rows": [
      {
        "dimension": "",
        "shortTerm": "Advertise the healthy aspect of our chips\nLaunch a campaign targeting people from different parts of Western India through relatable advertising",
        "longTerm": "Launch a variant of our soya chip that is baked to regain market share\nLaunch multiple flavours of baked chips across India since the health-conscious wave is bound to spread to other parts of the country too"
      }
    ]
  }
}
```

Note the closing block of `framework` literally says `"Clarifying
Questions:"` and `"Keep In Mind:"` as prose inside the transcript text —
that's fine and intentional, it's just narrative copy describing the case
to the reader. The **structural** `frameworkTree.notes[].title` field above
it still correctly says `"Questions"`, not `"Clarifying Questions"`. Don't
confuse the two — the rule in Part 1 is about the JSON field, not the prose
inside the transcript string.

---

### `case-12` — multiple `additionalFrameworkTrees` + populated `recommendationsTable`

Demonstrates 2 correctly-labeled secondary trees, and a `recommendationsTable`
variant with `dimensionHeader` and real (non-empty) `dimension` values per
row — used when recommendations are organized in a 2x2 matrix (e.g.
feasibility × impact) rather than a simple two-column split. Also
demonstrates the optional `defaultFocusedIds` (plural) array, used when more
than one node should be highlighted by default.

```json
{
  "id": 12,
  "docId": "case-12",
  "title": "As You Sow, So Shall You Reap",
  "industry": "Automotive",
  "difficulty": "Hard",
  "case_type": "Profitability",
  "company": "Kearney",
  "round": "Buddy",
  "prompt": "Hey. Your client is an Automobile manufacturer that has been facing a decline in profits over the last 2 years. They want you to analyse why this is happening and then give solutions.",
  "frameworkTree": {
    "nodes": { "...": "full tree omitted here for length — see data/cases.json, docId case-12, for the complete 25-node tree" },
    "defaultExpanded": ["declining-profits", "revenue", "asset-revenue", "sale-of-tractors", "no-of-tractors", "demand", "experience"],
    "defaultFocusedId": "in-store",
    "defaultFocusedIds": ["in-store", "after-sales-stage"],
    "notes": [
      { "title": "Questions", "items": ["Where does the client lie on the value chain?", "Do they manufacture only tractors?", "Is the tractor a commoditized product?", "Segmentation of problem based on geography", "Have the competitors faced a decline?"] },
      { "title": "Keep In Mind", "items": ["Don't stop at the problem, probe why", "Always benchmark client pricing against competitors", "Commoditised products compete on soft experience factors"] },
      { "title": "Brownie Points", "items": ["Importance of EMIs in rural markets", "Giving recommendations in a 2x2 matrix"] }
    ]
  },
  "additionalFrameworkTrees": [
    {
      "label": "In-Store Experience",
      "nodes": { "...": "see data/cases.json for full nodes" },
      "defaultExpanded": ["in-store-experience", "internal-factors", "staff-related", "attitude"],
      "defaultFocusedId": "perks",
      "notes": []
    },
    {
      "label": "After-Sales Services",
      "nodes": { "...": "see data/cases.json for full nodes" },
      "defaultExpanded": ["after-sales-services", "pricing"],
      "defaultFocusedId": "pricing",
      "notes": []
    }
  ],
  "recommendationsTable": {
    "framework": "Feasibility-Impact Matrix",
    "columns": ["Low Impact", "High Impact"],
    "dimensionHeader": "Particulars",
    "rows": [
      {
        "dimension": "Low Feasibility",
        "shortTerm": "Improving quality of service for higher price",
        "longTerm": "Monthly checks of performance"
      },
      {
        "dimension": "High Feasibility",
        "shortTerm": "Reduction of price for same quality",
        "longTerm": "Improved perks and re-training of staff\nMarketing of changed after-sales service prices"
      }
    ]
  },
  "framework": "Candidate: Okay, so our client is an automobile manufacturer. ... [transcript truncated — full text in data/cases.json]"
}
```

Note: `additionalFrameworkTrees[].notes` is present but empty (`[]`) in both
entries here — secondary trees don't need their own Questions/Keep In
Mind/Brownie Points cards (those belong on the primary `frameworkTree`
only), but the field itself should still be included as an empty array for
type consistency with `FrameworkTree`.

---

### `case-20` — the only `decision`-type visualisation in the dataset

Demonstrates `visualisations[].type === "decision"`: a decision-tree diagram
with rectangular/diamond/terminal node shapes and a "chosen path"
highlight. If you ever generate a case needing this pattern, this is the
only existing reference — match its shape exactly.

```json
{
  "id": 20,
  "docId": "case-20",
  "title": "The King of Bad Times",
  "industry": "Airlines",
  "difficulty": "Hard",
  "case_type": "Profitability",
  "company": "McKinsey & Co.",
  "round": "Buddy",
  "prompt": "The CEO of a low-cost airline operator has approached you. He is worried about the company's declining profits and would like you to diagnose the problem and give suitable recommendations.",
  "frameworkTree": {
    "nodes": { "...": "full 40+ node tree — see data/cases.json, docId case-20" },
    "defaultExpanded": ["declining-profits", "costs", "variable-costs", "fuel", "flights", "km-per-flight", "circling", "atc-clearance"],
    "defaultFocusedId": "fee-based-priority-policy",
    "notes": [
      { "title": "Questions", "items": ["Both domestic and international?", "Is the decline specific to certain locations?", "Other service offerings?", "Does it have only economy class?"] },
      { "title": "Keep In Mind", "items": ["Ask early if issue is company-specific or industry-wide", "Map flight path to isolate cost drivers"] },
      { "title": "Brownie Points", "items": ["Environmental impact of company's actions while giving recommendations."] }
    ]
  },
  "visualisations": [
    {
      "type": "decision",
      "title": "",
      "rootId": "A",
      "nodes": [
        { "id": "A", "label": "Pay AAI Priority Fee?", "kind": "rect", "chosen": true, "children": [{ "nodeId": "B" }] },
        { "id": "B", "label": "Fee < Fuel Cost\nof Circling?", "kind": "diamond", "chosen": true, "children": [{ "edgeLabel": "Yes", "nodeId": "C" }, { "edgeLabel": "No", "nodeId": "D" }] },
        { "id": "C", "label": "Pay the Fee", "kind": "terminal", "chosen": true, "children": [{ "nodeId": "G" }] },
        { "id": "D", "label": "Churn Risk\nFrom Delays?", "kind": "diamond", "chosen": false, "children": [{ "edgeLabel": "High", "nodeId": "E" }, { "edgeLabel": "Low", "nodeId": "F" }] },
        { "id": "E", "label": "Pay the Fee", "kind": "terminal", "chosen": false },
        { "id": "F", "label": "Defer Payment", "kind": "terminal", "chosen": false },
        { "id": "G", "label": "Environmental benefit", "kind": "terminal", "chosen": true }
      ]
    }
  ],
  "framework": "Candidate: That's interesting. Can I assume the airline to be similar to Spice Jet? ... [transcript truncated — full text in data/cases.json]"
}
```

Field notes:
- `kind`: one of `"rect"` (a decision/action box), `"diamond"` (a yes/no question), `"terminal"` (an end outcome).
- `chosen: true/false` — marks which path through the tree is the "recommended" path, used for highlighting.
- `children[]` — each entry is `{ nodeId }` for a single unconditional next step, or `{ edgeLabel, nodeId }` when branching (e.g. Yes/No, High/Low) — `edgeLabel` is the text shown on the connecting line.
- `rootId` must match one node's `id`.

---

### `case-21` — the only `calcpair`-type visualisation in the dataset

Demonstrates `visualisations[].type === "calcpair"`: two side-by-side
step-by-step calculations. If you ever generate a case needing this
pattern, this is the only existing reference.

```json
{
  "id": 21,
  "docId": "case-21",
  "title": "Beauty Lies On The Inside",
  "industry": "Retail",
  "difficulty": "Hard",
  "case_type": "Profitability",
  "company": "McKinsey & Co.",
  "round": "Partner",
  "prompt": "Hey, let's begin with a quick case. Your client is Donatella Versace, owner of a famous retail apparel store in India. Due to Covid-19, profits of the store have decreased. To increase profits, she has decided to open a makeup outlet inside the store. She has approached you to decide whether this is a wise decision.",
  "frameworkTree": {
    "nodes": {
      "wise-decision": { "id": "wise-decision", "label": "Open Makeup Outlet?", "tone": "root", "children": ["additional-costs", "additional-revenues"] },
      "additional-costs": { "id": "additional-costs", "label": "Additional Costs", "tone": "branch", "children": ["one-time-fixed-cost", "daily-opportunity-cost", "variable-cost-per-unit"] },
      "additional-revenues": { "id": "additional-revenues", "label": "Additional Revenues", "tone": "branch", "children": ["direct-revenue", "indirect-revenue"] },
      "one-time-fixed-cost": { "id": "one-time-fixed-cost", "label": "One-Time Fixed Cost", "tone": "leaf", "children": [] },
      "daily-opportunity-cost": { "id": "daily-opportunity-cost", "label": "Daily Opportunity Cost", "tone": "leaf", "children": [] },
      "variable-cost-per-unit": { "id": "variable-cost-per-unit", "label": "Variable Cost per Unit", "tone": "leaf", "children": [] },
      "direct-revenue": { "id": "direct-revenue", "label": "Direct Revenue", "tone": "leaf", "children": [] },
      "indirect-revenue": { "id": "indirect-revenue", "label": "Indirect Revenue", "tone": "leaf", "children": [] }
    },
    "defaultExpanded": ["wise-decision", "additional-costs", "additional-revenues"],
    "defaultFocusedId": "daily-opportunity-cost",
    "notes": [
      { "title": "Questions", "items": ["Where is the store located?", "How much space is the makeup outlet going to take?", "Why only makeup as an alternative?", "In-house manufacturing or 3rd-party distribution?"] },
      { "title": "Keep In Mind", "items": ["Apply profit function basics to unorthodox cases"] },
      { "title": "Brownie Points", "items": ["Mentioning opportunity cost as one of the recurring fixed costs"] }
    ]
  },
  "visualisations": [
    {
      "type": "calcpair",
      "left": {
        "title": "A.  Break-Even Point (One-Time Expenditure)",
        "steps": [
          { "eq": true, "label": "Fixed Investment", "value": "₹40,000" },
          { "eq": true, "label": "Selling Price per Product", "value": "₹1,000" },
          { "eq": true, "label": "Variable Cost per Product", "value": "₹400 + ₹100 = ₹500" },
          { "text": "" },
          { "text": "Break-Even Point of Sales", "bold": true },
          { "text": "" },
          { "text": "Fixed Cost", "indent": true, "underline": true },
          { "text": "Selling Price − Variable Cost", "indent": true },
          { "text": "" },
          { "text": "₹40,000", "indent": true, "underline": true },
          { "text": "₹1,000 − ₹500", "indent": true },
          { "text": "" },
          { "text": "₹40,000", "indent": true, "underline": true },
          { "text": "₹500", "indent": true },
          { "text": "" },
          { "text": "= 80 Items", "bold": true, "indent": true }
        ]
      },
      "right": {
        "title": "B.  Daily Opportunity Cost Recovery",
        "steps": [
          { "eq": true, "label": "Selling Price per Product", "value": "₹1,000" },
          { "eq": true, "label": "Variable Cost per Product", "value": "₹400 + ₹100 = ₹500" },
          { "eq": true, "label": "Store Daily Profit", "value": "₹25,000" },
          { "eq": true, "label": "Makeup Outlet Space", "value": "20% × 10,000 sq. ft. = 2,000 sq. ft." },
          { "eq": true, "label": "Profit per Sq. Ft.", "value": "₹25,000 ÷ 10,000 = ₹2.5" },
          { "eq": true, "label": "Daily Opportunity Cost", "value": "2,000 × ₹2.5 = ₹5,000 / day" },
          { "text": "" },
          { "text": "Required Daily Sales", "bold": true },
          { "text": "" },
          { "text": "Opportunity Cost", "indent": true, "underline": true },
          { "text": "Selling Price − Variable Cost", "indent": true },
          { "text": "" },
          { "text": "₹5,000", "indent": true, "underline": true },
          { "text": "₹1,000 − ₹500", "indent": true },
          { "text": "" },
          { "text": "₹5,000", "indent": true, "underline": true },
          { "text": "₹500", "indent": true },
          { "text": "" },
          { "text": "= 10 Items / Day", "bold": true, "indent": true }
        ]
      }
    }
  ],
  "framework": "Candidate: Sure. I'd like to understand the problem better. ... [transcript truncated — full text in data/cases.json]"
}
```

Field notes:
- A `calcpair` step is either `{ eq: true, label, value }` (an input row, like a given number) or `{ text, bold?, indent?, underline? }` (a formatted text/working row). Use `{ "text": "" }` as a blank spacer row between sections — this is the standard pattern, used repeatedly above.

**Known dead field — do not copy:** `case-21` in the live data also has a
top-level `"tables"` array (a different, older representation of the same
break-even numbers shown in the `calcpair` visualisation above). It is
**not read by any renderer** — grepping the entire codebase for `tables`
usage on a case object returns nothing. It's leftover legacy data from
before this case was migrated to `calcpair`. **Do not generate a `tables`
field on new cases** — it does nothing and just bloats the document.

---

### `case-27` — 5 stacked `table` visualisations (multi-table reference)

Demonstrates a case driven entirely by a sequence of tables (typical for
Guesstimate-type cases), including the optional `insight` field on a table
visualisation (a one-line callout rendered under the table).

```json
{
  "id": 27,
  "docId": "case-27",
  "title": "Ferry Tales",
  "industry": "Tourism",
  "difficulty": "Hard",
  "case_type": "Market Entry",
  "company": "Kepler Cannon",
  "round": "Partner",
  "prompt": "Your client operates various ferries across India and is now deciding whether he should launch a cruise from Chennai to Port Blair and wants your opinion on the same.",
  "frameworkTree": {
    "nodes": {},
    "defaultExpanded": [],
    "defaultFocusedId": "",
    "notes": [
      { "title": "Questions", "items": ["What is the objective?", "Which other ferries do we operate?", "Competitors on this route?"] },
      { "title": "Keep In Mind", "items": ["Lay out all four steps top-down before calculating", "Convert travellers to families by dividing by four"] },
      { "title": "Brownie Points", "items": ["Keeping international trips in mind"] }
    ]
  },
  "visualisations": [
    {
      "type": "table",
      "title": "Urban Population by Income Level",
      "inlineOnly": true,
      "columns": ["Category", "Income", "Percentage", "Population", "% that Travel", "Number of Families (Total / 4)"],
      "columnWidths": ["20%", "21%", "10%", "10%", "14%", "25%"],
      "rows": [
        ["Below Poverty Line (BPL)", "< Rs 10,000/month", "30%", "120 million", "0%", "0"],
        ["Lower Middle Class (LMC)", "Rs 10,000 - Rs 20,000/month", "30%", "120 million", "30%", "9 million (36 million / 4)"],
        ["Upper Middle Class (UMC)", "Rs 20,000 - Rs 80,000/month", "30%", "120 million", "60%", "18 million (72 million / 4)"],
        ["Upper Class (UC)", "> Rs 80,000/month", "10%", "40 million", "80%", "8 million (32 million / 4)"]
      ]
    },
    {
      "type": "table",
      "title": "Mode of Travel",
      "inlineOnly": true,
      "columns": ["Mode", "Percentage", "Total"],
      "columnWidths": ["33%", "33%", "34%"],
      "rows": [
        ["Flights", "70%", "1.1 million (approx.)"],
        ["Ferry", "30%", "0.5 million (approx.)"]
      ]
    },
    {
      "id": "market-sizing",
      "type": "table",
      "title": "Market Sizing",
      "header": "Market Sizing",
      "noTitle": true,
      "columns": ["Particulars", "Calculation", "Value"],
      "columnWidths": ["34%", "33%", "33%"],
      "summaryRows": [7, 8, 12],
      "rows": [
        ["1. Total population (A)", "", "1.4 billion"],
        ["  1a. Rural (excluded)", "70% of A", "1 billion"],
        ["  1b. Urban", "30% of A", "400 million"],
        ["    1ba. BPL travelers", "120 Mn x 0% (given above)", "0"],
        ["    1bb. LMC travelers", "120 Mn x 30% (given above)", "36 million"],
        ["    1bc. UMC travelers", "120 Mn x 60% (given above)", "72 million"],
        ["    1bd. UC travelers", "40 Mn x 80% (given above)", "32 million"],
        ["2. Traveling individuals (C)", "0 + 36 + 72 + 32", "140 million"],
        ["3. Traveling families (D)", "C / 4 per family", "35 million"],
        ["4. Total annual trips (E)", "D x 1 trip/year", "35 million"],
        ["  4a. International trips (excluded)", "10% of E", "3.5 million"],
        ["  4b. Domestic trips", "90% of E", "32 million"],
        ["5. Port Blair families (F)", "32 million / 20 destinations", "1.6 million"]
      ],
      "insight": "Rural population is excluded; average family size assumed at 4. Port Blair is 1 of 20 domestic destinations."
    },
    {
      "id": "market-share",
      "type": "table",
      "title": "Market Share",
      "header": "Market Share",
      "noTitle": true,
      "columns": ["Particulars", "Calculation", "Value"],
      "columnWidths": ["34%", "33%", "33%"],
      "summaryRows": [2, 3],
      "rows": [
        ["1. Port Blair families (F)", "From market sizing", "1.6 million"],
        ["  1a. By flight (excluded)", "70% of F", "1.1 million"],
        ["  1b. ferry (G)", "30% of F", "0.5 million"],
        ["2. Our service share (H)", "40% of G (given)", "200,000 families"]
      ]
    },
    {
      "id": "revenue",
      "type": "table",
      "title": "Expected Revenue",
      "header": "Expected Revenue",
      "noTitle": true,
      "columns": ["Particulars", "Calculation", "Value"],
      "columnWidths": ["34%", "33%", "33%"],
      "summaryRows": [3, 4],
      "rows": [
        ["Families using our service (H)", "From market share", "200,000"],
        ["Family size", "", "4"],
        ["Ticket price per person", "given", "Rs. 8,000"],
        ["Revenue per family", "4 x Rs. 8,000", "Rs. 32,000"],
        ["Expected revenue", "200,000 x Rs. 32,000", "Rs. 6.4 billion"]
      ]
    }
  ],
  "framework": "Candidate: Sure. I want to begin by understanding our client better. ... [transcript truncated — full text in data/cases.json]"
}
```

---

## Part 3 — Other checks that should already pass (verified, not yet violated, but worth generating correctly from the start)

- **Tree graph integrity**: every id referenced in a node's `children[]`
  must exist as a key in `nodes`. There must be exactly **one** root (a node
  id that is not listed as a child anywhere) — unless `nodes` is
  intentionally empty (`{}`) for a tree-less guesstimate case (see Rule
  callout under `case-58` above).
- **`defaultFocusedId`** must reference a real node id that exists in
  `nodes` (or be `""` if `nodes` is empty).
- **`id` (number) and `docId` (string, format `case-<id>`)** must be unique
  across the entire `cases.json` array.
- **Required fields** (the import script throws if missing/empty):
  `title`, `industry`, `difficulty`, `prompt`, `framework` — all must be
  non-empty strings.
- **`recommendationsMatrix`** is a legacy field handled by the import
  script but not rendered anywhere and not used by any current case. Don't
  generate it — use `recommendationsTable` instead.

## Quick checklist before submitting a new case JSON

1. `abbreviations` (if present) — array of `"SHORT: Full"` strings, not objects.
2. `frameworkTree.notes` — exactly `Questions` / `Keep In Mind` / `Brownie Points`, nothing else.
3. No `Recommendations` entry inside any `notes` array (primary or additional trees).
4. `additionalFrameworkTrees[]` (if present) — each entry uses `"label"`, not `"title"`.
5. Every `visualisations[].type` is one of: `table`, `formula`, `decision`, `calcpair` — matching the field shapes shown above for that type.
6. Tree has exactly one root, or `nodes` is fully empty for a tree-less case — no dangling `children` references.
7. `id` and `docId` are unique against the rest of `cases.json`.
8. No stray top-level fields like `tables` that duplicate a `visualisations` entry.
