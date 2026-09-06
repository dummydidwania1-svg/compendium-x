/**
 * seed-master-archive-data.mjs
 *
 * Seeds ~35 fully synthetic, hand-written case sessions + evaluations owned by
 * the data-privacy master/testing account (skshm.d26@gmail.com) so the AI
 * suite (Coach, Analyser, Tracker) can be tested end-to-end against rich,
 * human-feeling transcripts instead of sparse real data.
 *
 * Every session/evaluation pair is written under the master account's OWN
 * uid as candidateId, so no Firestore rule bypass is needed — the existing
 * "candidateId == request.auth.uid" rule already covers it.
 *
 * Data is entirely fictional: made-up candidate performance, made-up
 * interviewer notes, made-up transcripts. Case metadata (title/industry/
 * difficulty/case_type) is pulled from the real `cases` collection so the
 * dashboard's case-type/industry breakdowns render sensibly.
 *
 * SAFE BY DEFAULT: dry-run only prints counts. Pass --apply to write.
 *
 *   node functions/seed-master-archive-data.mjs           # dry run
 *   node functions/seed-master-archive-data.mjs --apply   # perform the seed
 *   node functions/seed-master-archive-data.mjs --apply --clear  # delete previously seeded docs first
 */

import { initializeApp, cert } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const credentialPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
  ? path.resolve(process.env.FIREBASE_SERVICE_ACCOUNT_PATH)
  : path.join(projectRoot, 'serviceAccountKey.json')

if (!existsSync(credentialPath)) {
  console.error(`Service account file not found at ${credentialPath}`)
  process.exit(1)
}

const APPLY = process.argv.includes('--apply')
const CLEAR = process.argv.includes('--clear')
const MASTER_EMAIL = 'skshm.d26@gmail.com'
const SEED_TAG = 'synthetic-master-archive-v1'

const sa = JSON.parse(readFileSync(credentialPath, 'utf8'))
initializeApp({ credential: cert(sa), projectId: process.env.FIREBASE_PROJECT_ID || 'compendium-x' })
const db = getFirestore()
const auth = getAuth()

// ---------------------------------------------------------------------------
// Transcript builder helpers
// ---------------------------------------------------------------------------

// Builds mergedTranscriptTurns (offsetMs, role, text) from a compact script:
// each entry is [role, text, gapSeconds-after-previous-turn].
function buildTurns(script) {
  let offsetMs = 0
  const turns = []
  for (const [role, text, gapSec] of script) {
    turns.push({ offsetMs, role, text })
    offsetMs += Math.round((gapSec ?? 8) * 1000)
  }
  return turns
}

function turnsToTranscript(turns) {
  return turns.map((t) => `${t.role === 'candidate' ? 'Candidate' : 'Interviewer'}: ${t.text}`).join('\n')
}

// ---------------------------------------------------------------------------
// 35 hand-written sessions. Each references a real case doc id/title/industry
// /difficulty/case_type so joins render correctly on the dashboard. Scores are
// internally consistent with the transcript + notes for that session — no
// fixed pattern across sessions (mirrors real variance in performance).
// ---------------------------------------------------------------------------

const SESSIONS = [
  {
    caseId: 'case-1', caseTitle: 'Banking on You', industry: 'BFSI', difficulty: 'Easy', caseType: 'Profitability',
    daysAgo: 61, sessionMode: 'Remote',
    scores: { structure: 4, understanding: 4, delivery: 3.5, creativity: 3 },
    notes: "Clean profit tree, split revenue/cost early and correctly. You anchored on branch-level data fast, which saved time. Push harder on quantifying before you recommend — you jumped to \"cross-sell more\" before sizing how much of the 20% decline that actually closes.",
    script: [
      ['interviewer', "Your client is a commercial bank that's seen a 20% decline in revenue over the last two years. Why, and what should they do?", 6],
      ['candidate', "Got it. Before I structure this — is the decline isolated to this bank, or is it industry-wide?", 9],
      ['interviewer', "Good question. A couple of competitors have dipped slightly, but nowhere near 20%.", 7],
      ['candidate', "Understood, so this is more company-specific than macro. Is the decline concentrated in a particular branch, region, or product line — loans, deposits, fee income?", 11],
      ['interviewer', "It's concentrated in their retail lending book, specifically home loans.", 6],
      ['candidate', "Okay, that narrows it a lot. I'll break revenue down as volume of loans disbursed times average loan size times interest rate spread. Can you tell me which of these has moved?", 12],
      ['interviewer', "Volume has fallen by about 35% year on year. Rate spread is roughly stable.", 6],
      ['candidate', "So it's a volume problem in home loans specifically. That could be demand-side — fewer people applying — or supply-side — the bank rejecting more applications, or losing out to competitors at the point of application. Do we know the approval rate trend?", 14],
      ['interviewer', "Approval rate is unchanged. Applications themselves have dropped.", 7],
      ['candidate', "So fewer people are even applying to this bank for home loans. That could be pricing — are we less competitive on rate — or distribution, like fewer branches or a weaker digital channel, or brand trust after some incident.", 15],
      ['interviewer', "Their interest rate is actually half a point higher than the two largest competitors.", 6],
      ['candidate', "That's likely a big piece of it — half a point on a home loan is material over a 20 year tenure. I'd recommend a targeted rate review on the home loan book specifically, maybe a promotional rate for a defined window to rebuild volume, alongside working out why their cost of funds is higher so the rate cut doesn't just crater the spread.", 10],
      ['interviewer', "Reasonable. How would you size the impact of a rate cut before recommending it?", 8],
      ['candidate', "I'd want elasticity data — how much does a 0.25% cut typically move application volume for this segment — cross that with current average loan size and spread to see if the higher volume more than offsets the thinner margin.", 9],
      ['interviewer', "Good, let's leave it there.", 4],
    ],
  },
  {
    caseId: 'case-10', caseTitle: 'Make-Up for Lost Profits', industry: 'Cosmetics', difficulty: 'Medium', caseType: 'Profitability',
    daysAgo: 58, sessionMode: 'Remote',
    scores: { structure: 2.5, understanding: 3, delivery: 3, creativity: 2 },
    notes: "You got to the right revenue/cost split but the tree had overlapping branches — \"marketing spend\" and \"customer acquisition cost\" showed up in two places. Slow down on structuring before you start asking numeric questions; you asked for data before you'd finished the framework, which cost you time later re-asking the same thing.",
    script: [
      ['interviewer', "A cosmetics brand's profits have fallen 15% despite stable revenue. What's going on?", 5],
      ['candidate', "Okay so profit is down but revenue is flat, so it must be costs. What are the major cost heads?", 8],
      ['interviewer', "Before we get to costs, is there anything else you'd want to check first?", 6],
      ['candidate', "Right, sorry — let me structure this properly. Profit equals revenue minus costs. Since revenue is flat, the issue is on the cost side: COGS, marketing, distribution, or overheads. Which of these has moved?", 12],
      ['interviewer', "COGS as a percentage of revenue has gone up from 30% to 40%.", 6],
      ['candidate', "That's a big jump. Is that input costs — like raw materials — or is it more about discounting that's being booked against COGS?", 10],
      ['interviewer', "Input costs. A key raw material's price doubled.", 5],
      ['candidate', "Got it. So we should look at either substituting the raw material, hedging the price, renegotiating with suppliers, or passing some of the cost to consumers via a price increase. Do we know how price-sensitive this product's customers are?", 13],
      ['interviewer', "It's a premium brand, moderately price inelastic.", 6],
      ['candidate', "Then I'd lean toward a modest price increase paired with supplier renegotiation, rather than eating the margin fully or downgrading the formulation, which risks brand damage.", 8],
      ['interviewer', "What if the raw material is a rare imported ingredient central to the brand story?", 7],
      ['candidate', "Then substitution is risky — it might be marketed as, say, containing a specific botanical extract, so swapping it changes the value prop. I'd prioritize long-term supply contracts or forward buying over substitution in that case.", 9],
      ['interviewer', "Okay, let's stop there.", 4],
    ],
  },
  {
    caseId: 'case-19', caseTitle: 'Empty Kart', industry: 'E-Commerce', difficulty: 'Medium', caseType: 'Growth',
    daysAgo: 55, sessionMode: 'Remote',
    scores: { structure: 4.5, understanding: 4, delivery: 4, creativity: 4.5 },
    notes: "Genuinely strong session — the funnel breakdown (traffic, conversion, AOV, repeat rate) was crisp and you immediately asked which stage had moved instead of boiling the ocean. The recommendation to A/B test cart abandonment emails before a full redesign was a nice cost-conscious touch. Keep doing that.",
    script: [
      ['interviewer', "An e-commerce grocery app has seen orders drop 25% quarter over quarter. Walk me through how you'd think about this.", 5],
      ['candidate', "I'd break this into the funnel: traffic to the app, conversion rate from visit to cart, cart to completed order, and then order frequency per user. Do we know which stage has deteriorated most?", 11],
      ['interviewer', "Traffic is flat. Conversion from cart to order has fallen sharply.", 6],
      ['candidate', "So people are adding items but not checking out — that points to friction at checkout, or a change in something like delivery time, fees, or payment options. Has anything changed recently in the checkout flow or delivery promise?", 13],
      ['interviewer', "Delivery time increased from 15 minutes to 45 minutes after a logistics restructuring.", 6],
      ['candidate', "That's a big shift for a quick-commerce customer base — the value prop is largely speed, so a 3x delivery time increase would plausibly cause exactly this cart abandonment pattern. Do we know if this is uniform across all zones or concentrated in specific ones?", 14],
      ['interviewer', "Concentrated in zones where they consolidated dark stores to cut costs.", 7],
      ['candidate', "So it's a deliberate cost trade-off that's backfired on conversion. Rather than reversing the consolidation entirely, I'd first quantify: what's the cost saved per dark store closed versus the revenue lost from the conversion drop in that zone. If the revenue hit outweighs the saving, reopen the highest-order-density stores first.", 12],
      ['interviewer', "Good. Any lower-cost lever before reopening stores?", 8],
      ['candidate', "Yes — I'd test whether showing the honest delivery estimate earlier, before checkout, reduces abandonment versus showing it at the end, since some of this might be a surprise-and-bail pattern rather than a true unwillingness to wait 45 minutes. Cheap to test via an A/B before committing capex to reopening stores.", 10],
      ['interviewer', "Nice. That's a good place to stop.", 4],
    ],
  },
  {
    caseId: 'case-28', caseTitle: 'Hotline Bling', industry: 'Telecom', difficulty: 'Medium', caseType: 'Market Entry',
    daysAgo: 52, sessionMode: 'Remote',
    scores: { structure: 2, understanding: 2.5, delivery: 2, creativity: 2 },
    notes: "Rough one. Market entry framework was there in name but you didn't actually use it — jumped straight to \"is the market big\" without checking capability fit or competitive response. When I pushed on entry mode (organic vs acquisition vs JV) you hadn't considered it until I asked directly. Worth drilling the standard market entry checklist until it's automatic.",
    script: [
      ['interviewer', "A telecom company is considering entering a new international market. How would you approach this?", 5],
      ['candidate', "I'd look at whether the market is big and growing.", 8],
      ['interviewer', "Okay, and beyond market size, what else matters for a decision like this?", 9],
      ['candidate', "Um, competition in that market I guess.", 10],
      ['interviewer', "Sure. What about whether the company itself is suited to enter?", 8],
      ['candidate', "Right, like do they have the money for it.", 9],
      ['interviewer', "Let's structure this a bit more. Market attractiveness, company capability, and entry approach are usually the three buckets. Can you build those out?", 12],
      ['candidate', "Okay so market attractiveness is size, growth, competition. Company capability is financial resources and maybe brand recognition there already. And entry approach is like... building it themselves or buying a local player?", 14],
      ['interviewer', "Better. Given they have no brand presence in this country, which entry mode would you lean toward?", 9],
      ['candidate', "Probably build it themselves since it's cheaper.", 8],
      ['interviewer', "Is it actually cheaper, factoring in the time to build spectrum licenses, tower infrastructure, and a subscriber base from zero versus acquiring an existing player?", 11],
      ['candidate', "Oh — no, actually acquiring would probably be faster even if it costs more upfront, especially for something as regulated as telecom.", 9],
      ['interviewer', "Right. Let's wrap here.", 4],
    ],
  },
  {
    caseId: 'case-51', caseTitle: 'Make India Great Again', industry: 'Industry Agnostic', difficulty: 'Easy', caseType: 'Unconventional',
    daysAgo: 49, sessionMode: 'Remote',
    scores: { structure: 3, understanding: 3, delivery: 3, creativity: 2.5 },
    notes: "Some branches overlapped in your framework — tighten up the MECE-ness next time. Push a bit further on \"so what\" once you have a number. The final recommendation felt rushed — leave time to synthesize.",
    script: [
      ['interviewer', "If you were advising the Indian government on one policy to boost GDP growth over the next five years, what would it be and how would you evaluate it?", 6],
      ['candidate', "I'd think about this across a few levers — infrastructure investment, ease of doing business reforms, skilling and education, and export competitiveness.", 12],
      ['interviewer', "Which lever would you prioritize and why?", 8],
      ['candidate', "I'd lean toward infrastructure, since logistics costs in India are famously high relative to GDP compared to other manufacturing hubs.", 11],
      ['interviewer', "How would you evaluate whether that's actually the highest-leverage option versus, say, skilling?", 10],
      ['candidate', "I'd want to compare the GDP uplift per rupee invested in each — infrastructure has long payback but broad multiplier effects, skilling is slower to show up but compounds. Honestly both matter, it's hard to pick just one.", 13],
      ['interviewer', "If you had to defend picking infrastructure specifically to a skeptical minister, what's your strongest argument?", 9],
      ['candidate', "That it unlocks other sectors immediately — manufacturing and exports can't scale without ports, roads and power reliability, so it's more of a precondition than a standalone lever.", 8],
      ['interviewer', "Okay, let's stop there.", 4],
    ],
  },
  {
    caseId: 'case-2', caseTitle: 'Dry Hard', industry: 'Consumer Durables', difficulty: 'Easy', caseType: 'Profitability',
    daysAgo: 47, sessionMode: 'Remote',
    scores: { structure: 4, understanding: 3.5, delivery: 4.5, creativity: 3 },
    notes: "Really composed delivery — clear signposting throughout, you told me what you were about to do before doing it every time, which made the case easy to follow. Structure and understanding were both solid too, just not quite as sharp as the delivery. A genuinely pleasant case to grade.",
    script: [
      ['interviewer', "A washing machine manufacturer's profits are down 10% this year. What's your approach?", 5],
      ['candidate', "Sure — let me lay out how I'll approach this before diving in. I'll first clarify the business, then break down profit into revenue and cost, isolate where the change happened, and then build toward a recommendation. Sound good?", 10],
      ['interviewer', "Sounds good.", 4],
      ['candidate', "First, clarifying — is this domestic or does the company sell internationally?", 9],
      ['interviewer', "Domestic only.", 4],
      ['candidate', "Understood. Now for the profit tree: revenue is units sold times average price, and costs are COGS, marketing, distribution and overhead. Do we know whether the drop is revenue-side or cost-side?", 12],
      ['interviewer', "Revenue is actually up slightly. It's cost-side.", 6],
      ['candidate', "Good, that narrows it. Of COGS, marketing, distribution and overhead, which has increased?", 9],
      ['interviewer', "Distribution costs have gone up significantly — they switched logistics partners this year.", 6],
      ['candidate', "Got it. So I'd want to know: is the new partner more expensive per unit, or has something changed in the delivery footprint, like reaching more remote areas now?", 11],
      ['interviewer', "Both, actually — more expensive per shipment and now covering more far-flung areas.", 6],
      ['candidate', "Okay, then my recommendation would be to renegotiate the logistics contract with volume commitments, and separately, to zone-price or tier the delivery footprint so remote-area shipments carry a partial delivery surcharge rather than being cross-subsidized silently. Before finalizing, I'd want to size how much of the cost increase is genuinely unavoidable given the wider coverage versus just a worse per-unit rate.", 10],
      ['interviewer', "Great, that's a wrap.", 4],
    ],
  },
  {
    caseId: 'case-39', caseTitle: 'Netflix & Chill', industry: 'OTT', difficulty: 'Medium', caseType: 'Growth',
    daysAgo: 44, sessionMode: 'Remote',
    scores: { structure: 3.5, understanding: 4, delivery: 3, creativity: 4 },
    notes: "Strong quantitative instincts — the churn math was fast and accurate. Delivery dragged a bit in the middle third, lots of \"umm, so, like\" while you thought out loud instead of pausing silently. Creativity on the bundling idea was genuinely good, not the generic \"partner with telecom\" answer everyone gives.",
    script: [
      ['interviewer', "A streaming service wants to grow subscriber revenue in a market where they're already the leader. Where would you look?", 5],
      ['candidate', "Okay so revenue is subscribers times price, roughly, plus maybe ad revenue if there's a tier for that. Since they're already the leader, umm, growing subscriber count further might be hard, so — let me think — maybe price or reducing churn matters more here.", 14],
      ['interviewer', "Churn is currently at 6% monthly, which is above the market average of 4%.", 6],
      ['candidate', "That's a meaningful gap — over a year that's the difference between retaining, let's see, roughly 53% versus 61% of the base compounding monthly, so, um, that's a real revenue leak. Do we know why churn is higher than competitors?", 15],
      ['interviewer', "Exit surveys show price sensitivity and content fatigue — people feel they've watched everything.", 7],
      ['candidate', "So it's partly a pricing issue and partly a perceived-value issue. For content fatigue, umm, one option is better content discovery so people find things they haven't seen, and for the price sensitivity, maybe a cheaper ad-supported tier to catch people who'd otherwise churn out entirely.", 13],
      ['interviewer', "Both good but somewhat standard. Anything less obvious?", 8],
      ['candidate', "One idea — bundle with something that has naturally high engagement but low overlap with streaming fatigue, like a gaming subscription or an audiobook service, so the \"I've seen everything\" feeling doesn't apply to the whole bundle even if it applies to the video library specifically.", 12],
      ['interviewer', "That's a genuinely interesting angle. Good, let's stop there.", 5],
    ],
  },
  {
    caseId: 'case-24', caseTitle: 'The King of Bad Times', industry: 'Aviation', difficulty: 'Hard', caseType: 'Unconventional',
    daysAgo: 41, sessionMode: 'Remote',
    scores: { structure: 1.5, understanding: 2, delivery: 2, creativity: 1.5 },
    notes: "This one didn't go well and it's worth being honest about it. You froze on the open for almost a minute, then started three different frameworks without finishing any of them. When I tried to redirect you back to a single structure you kept adding new branches instead of committing. Practice just picking one framework and staying in it even if it's imperfect — a mediocre complete structure beats three abandoned ones.",
    script: [
      ['interviewer', "An airline has gone bankrupt twice in the last decade. As an advisor brought in before a third attempt, what would you look at?", 5],
      ['candidate', "Okay, um, let me think about this for a second.", 40],
      ['candidate', "So, airlines... I guess I'd look at costs first, fuel costs are usually huge for airlines.", 12],
      ['interviewer', "Sure, go on.", 5],
      ['candidate', "And then also revenue, like ticket pricing. Actually wait, maybe I should think about why it failed twice before, that's probably more important.", 13],
      ['interviewer', "Go ahead.", 4],
      ['candidate', "So if it failed twice, maybe it's a management problem, not really an operations problem. Or maybe it's like, debt structure, too much debt from the first bankruptcy carried into the second attempt.", 14],
      ['interviewer', "Can you pick one lens and build it out fully, rather than listing options?", 10],
      ['candidate', "Sure — um, debt structure. So if there's too much debt, then interest payments eat into whatever profit the operations generate, so even a healthy operating business looks bankrupt on paper. I'd want to see the debt-to-equity and whether restructuring the balance sheet first would even give a viable operating business a chance to show through.", 12],
      ['interviewer', "Okay, that's a reasonable place to end for today.", 5],
    ],
  },
  {
    caseId: 'case-16', caseTitle: 'Charlie and the Candy Factory', industry: 'FMCG', difficulty: 'Hard', caseType: 'Guesstimate',
    daysAgo: 38, sessionMode: 'Remote',
    scores: { structure: 4, understanding: 4.5, delivery: 3.5, creativity: 3.5 },
    notes: "Very sound guesstimate methodology — top-down population segmentation, sensible assumptions stated out loud before using them, and you sanity-checked your final number against a rough per-capita benchmark at the end, which most candidates skip. Minor deduction on delivery for going a bit fast through the arithmetic, easy to lose the interviewer there.",
    script: [
      ['interviewer', "Estimate the annual market size for chocolate bars in urban India.", 5],
      ['candidate', "I'll build this top-down from population. Urban India is roughly 450 million people. I'll segment by age since chocolate consumption skews younger — say 60% are in an age band that regularly buys chocolate, so about 270 million.", 14],
      ['interviewer', "Reasonable so far.", 4],
      ['candidate', "Of those, I'll assume not everyone buys regularly — maybe 50% are regular chocolate consumers, so 135 million people. If each consumes on average one bar a week, that's 52 bars a year, so roughly 7 billion bars annually.", 15],
      ['interviewer', "And in revenue terms?", 6],
      ['candidate', "At an average price of, say, 20 rupees a bar, that's 140 billion rupees, roughly 1.4 billion dollars at current exchange rates.", 13],
      ['interviewer', "Does that number feel right to you?", 7],
      ['candidate', "Let me sanity check — that's about 300 rupees per regular consumer per year, which feels low if anything, so if I'm off, I'm probably off on the low side rather than having wildly overestimated. I'd want real category data to calibrate the 50% regular-consumer assumption, since that's the most uncertain input.", 12],
      ['interviewer', "Good instinct to flag that. Let's stop here.", 5],
    ],
  },
  {
    caseId: 'case-45', caseTitle: 'Deloitted to Meet You', industry: 'Services', difficulty: 'Medium', caseType: 'Growth',
    daysAgo: 35, sessionMode: 'Remote',
    scores: { structure: 3, understanding: 2.5, delivery: 3, creativity: 2 },
    notes: "Average session. Structure was fine at a high level but you didn't probe hard enough when I gave you a number that should have prompted a follow-up — I said margins had compressed and you moved straight past it to your next branch instead of digging into why. That's the kind of thing that separates a 3 from a 4.",
    script: [
      ['interviewer', "A mid-sized consulting firm wants to grow revenue by 20% next year. How would you think about it?", 5],
      ['candidate', "I'd look at growing existing clients versus winning new ones, and maybe expanding into new service lines.", 10],
      ['interviewer', "Reasonable. For context, their margins have compressed by 5 points over the last two years even as revenue grew.", 7],
      ['candidate', "Okay, noted. For existing clients, I'd look at cross-selling additional services. For new clients, expanding the sales team or entering adjacent industries. For service lines, maybe adding a digital or analytics practice if they don't have one.", 13],
      ['interviewer', "Any of those feel more promising given what I just told you about margins?", 9],
      ['candidate', "I think cross-selling to existing clients is probably the fastest since the relationship already exists.", 9],
      ['interviewer', "Sure, but does margin compression change which growth path you'd pick?", 10],
      ['candidate', "Oh — I suppose if margins are already thin, adding headcount for a new sales team is riskier than growing revenue from existing accounts where the delivery cost is more predictable.", 10],
      ['interviewer', "Right, that's the connection I was hoping you'd make earlier. Let's stop here.", 6],
    ],
  },
  {
    caseId: 'case-63', caseTitle: 'Crash Course', industry: 'Industry Agnostic', difficulty: 'Hard', caseType: 'Unconventional',
    daysAgo: 32, sessionMode: 'Remote',
    scores: { structure: 4.5, understanding: 4, delivery: 4, creativity: 5 },
    notes: "Excellent session, one of the better unconventional cases I've seen from you. The reframe you offered — treating it as a trust problem rather than a pure logistics problem — genuinely changed the direction of the case in a good way. Confident delivery throughout.",
    script: [
      ['interviewer', "A city's ride-hailing app has seen driver supply crash by 40% in three months despite rider demand staying flat. What's happening and what would you do?", 6],
      ['candidate', "Before I structure the analysis, can I ask — has the per-trip payout to drivers changed recently?", 10],
      ['interviewer', "No change in payout structure.", 5],
      ['candidate', "Okay, then this might not be a pure economics problem. I'd want to check: has there been a safety incident, a change in how drivers are rated or deactivated, or a competitor aggressively recruiting drivers?", 12],
      ['interviewer', "There was a high-profile safety incident involving a driver two months ago that got national media coverage.", 6],
      ['candidate', "That reframes this significantly — this isn't a supply-economics problem, it's a trust and reputation problem. Drivers may be leaving not because the money is bad, but because association with the platform has become socially or personally costly, or because the platform tightened background checks or deactivation policy reactively, which could be sweeping up good drivers too.", 13],
      ['interviewer', "That's an interesting distinction. How would you validate that theory?", 9],
      ['candidate', "I'd look at driver exit surveys or interviews from the past two months specifically, and check whether the drop is sudden right after the incident or more gradual — a sudden cliff right after the news cycle would support the reputation theory strongly.", 11],
      ['interviewer', "Say it is a sudden cliff right after. What would you recommend?", 8],
      ['candidate', "I'd separate the response into two tracks: a visible, credible safety and vetting overhaul to rebuild rider and driver trust publicly, and a driver-facing campaign — direct outreach, maybe a temporary incentive — to specifically re-engage drivers who left in that window, since they're a warmer audience than cold recruiting.", 10],
      ['interviewer', "Really good session. Let's stop there.", 5],
    ],
  },
  {
    caseId: 'case-33', caseTitle: 'Mr. Worldwide', industry: 'Hospitality', difficulty: 'Medium', caseType: 'Market Entry',
    daysAgo: 29, sessionMode: 'Remote',
    scores: { structure: 3, understanding: 3, delivery: 2.5, creativity: 3 },
    notes: "Decent structural instincts but delivery needs work — you spoke very quietly for the first half and I had to ask you to repeat yourself twice. Content-wise this was a fair, middle-of-the-road case, nothing that stood out badly or well.",
    script: [
      ['interviewer', "A boutique hotel chain wants to expand internationally for the first time. How would you evaluate where to go?", 5],
      ['candidate', "I'd look at market attractiveness and fit.", 9],
      ['interviewer', "Sorry, can you say that again? You're a bit quiet.", 6],
      ['candidate', "Sorry — I'd look at market attractiveness, like tourism volume and growth, and then fit with their brand, like whether it's a luxury or budget market.", 12],
      ['interviewer', "Okay, go on.", 5],
      ['candidate', "For market attractiveness I'd consider tourist arrivals, average spend per tourist, and existing hotel supply and pricing. For fit, whether the destination matches their boutique-luxury positioning.", 11],
      ['interviewer', "Between two candidate cities, one with high tourist volume but a saturated luxury hotel market, and one with lower volume but almost no boutique luxury supply, which would you pick?", 12],
      ['candidate', "I'd lean toward the lower-volume one with less supply, since being one of the only options in that positioning probably matters more than raw volume in a saturated market where they'd be fighting established players.", 11],
      ['interviewer', "Reasonable. That's enough for today.", 5],
    ],
  },
  {
    caseId: 'case-84', caseTitle: 'Final Destination', industry: 'Industry Agnostic', difficulty: 'Hard', caseType: 'Guesstimate',
    daysAgo: 26, sessionMode: 'Remote',
    scores: { structure: 2, understanding: 2, delivery: 2.5, creativity: 1.5 },
    notes: "The math had a real error partway through — you multiplied instead of dividing when converting from annual to daily and didn't catch it even when the resulting number should have looked obviously too large. Slow down and sanity-check magnitude as you go, not just at the very end.",
    script: [
      ['interviewer', "How many people die of natural causes in India every day?", 5],
      ['candidate', "Okay, India's population is about 1.4 billion. Average life expectancy is around 70 years. So roughly, if the population were stable, about 1.4 billion divided by 70 people would... age out each year, so that's 20 million deaths a year from all causes.", 15],
      ['interviewer', "Reasonable so far, continue.", 5],
      ['candidate', "Now for daily, I'd multiply that by 365, so 20 million times 365 is about 7.3 billion per day.", 12],
      ['interviewer', "Does that number feel right to you? You'd be saying more people die per day than exist in the entire country.", 10],
      ['candidate', "Oh — that's clearly wrong, I should have divided by 365, not multiplied. So 20 million divided by 365 is about 55,000 deaths a day from all causes.", 12],
      ['interviewer', "Better. Now, natural causes specifically?", 6],
      ['candidate', "I'd assume maybe 90% of deaths are from natural causes like age and illness, versus accidents or violence, so about 50,000 a day.", 10],
      ['interviewer', "Okay, let's stop there.", 4],
    ],
  },
  {
    caseId: 'case-67', caseTitle: 'The Godfather', industry: 'Industry Agnostic', difficulty: 'Hard', caseType: 'Unconventional',
    daysAgo: 23, sessionMode: 'Remote',
    scores: { structure: 4, understanding: 3.5, delivery: 4, creativity: 4 },
    notes: "Good composure on a deliberately ambiguous prompt — you asked exactly the right clarifying question up front instead of guessing at scope, which saved the whole case from going sideways. Solid all-round performance, no major gaps.",
    script: [
      ['interviewer', "A family-owned business is planning succession to the next generation, but there are three children and no clear plan. Advise the founder.", 6],
      ['candidate', "Before anything else — are all three children currently involved in the business, or only some of them?", 9],
      ['interviewer', "Only one works in the business day-to-day. The other two have careers elsewhere.", 6],
      ['candidate', "That changes the framing a lot — this isn't purely a leadership-selection problem, it's also an ownership-versus-management question, since the two who aren't involved presumably still have an ownership or inheritance stake to consider.", 12],
      ['interviewer', "Good distinction. How would you structure advice for the founder?", 8],
      ['candidate', "I'd separate control of the business — who runs it day to day — from economic ownership — who benefits financially. The child already working there is the natural operational successor, assuming they're competent, but the founder could structure equity so all three children have a fair economic stake without the other two having operational say.", 13],
      ['interviewer', "What if the two outside children feel that's unfair, since sweat equity isn't compensated?", 9],
      ['candidate', "I'd suggest the operating child receive a salary and perhaps a performance-based bonus or slightly larger equity share reflecting the work and risk of running the business, while the base ownership stake — reflecting what the founder built before any of them were involved — is split evenly. That tries to separate \"reward for building this\" from \"reward for running it going forward.\"", 11],
      ['interviewer', "Nicely reasoned. Let's stop there.", 5],
    ],
  },
  {
    caseId: 'case-6', caseTitle: 'Max Problems at Mini-so', industry: 'Retail', difficulty: 'Medium', caseType: 'Profitability',
    daysAgo: 20, sessionMode: 'Remote',
    scores: { structure: 3.5, understanding: 3, delivery: 3.5, creativity: 3 },
    notes: "Solid, unremarkable session — nothing wrong with the structure or approach, but nothing that pushed beyond the obvious either. This is a comfortably \"good\" case rather than a standout one; try to find one moment per case where you go a layer deeper than the first obvious answer.",
    script: [
      ['interviewer', "A dollar-store-style retail chain's same-store sales have declined for three consecutive quarters. What's your approach?", 5],
      ['candidate', "I'd split same-store sales into footfall and average transaction value, then figure out which has moved.", 10],
      ['interviewer', "Footfall is down about 15%, transaction value is flat.", 6],
      ['candidate', "So fewer people are visiting the stores at all. That could be competition — a new chain nearby — changing demographics in the catchment area, or something operational like reduced store hours or stockouts driving people away.", 11],
      ['interviewer', "A large e-commerce player recently launched fast delivery in these areas.", 6],
      ['candidate', "That's a plausible driver — if e-commerce now delivers quickly, some of the convenience advantage of a physical dollar store nearby erodes. I'd want to know if the footfall decline correlates geographically with where fast delivery has rolled out versus areas where it hasn't yet.", 11],
      ['interviewer', "It does correlate closely.", 5],
      ['candidate', "Then I'd recommend leaning into what e-commerce can't easily replicate — impulse buys, immediate need items, maybe even faster in-store fulfillment or a click-and-collect option to combine both channels rather than just competing head-on with delivery speed.", 10],
      ['interviewer', "Fair. Let's stop here.", 4],
    ],
  },
  {
    caseId: 'case-56', caseTitle: 'Zero Dark Thirty', industry: 'Industry Agnostic', difficulty: 'Medium', caseType: 'Unconventional',
    daysAgo: 18, sessionMode: 'Remote',
    scores: { structure: 1, understanding: 1.5, delivery: 2, creativity: 1 },
    notes: "This was a difficult one to grade honestly — you seemed to misunderstand the core question and spent most of the case answering something adjacent to what was asked, even after I tried to redirect twice. I'd recommend re-listening to the recording and specifically noting where the misunderstanding started, since catching it earlier would have salvaged the case.",
    script: [
      ['interviewer', "A city wants to reduce its rate of nighttime crime without significantly increasing the police budget. What would you advise?", 6],
      ['candidate', "I think the main driver of crime is usually unemployment, so I'd focus on job creation programs.", 10],
      ['interviewer', "That's a longer-term structural lever. Given the budget constraint on policing specifically, what would you look at operationally?", 9],
      ['candidate', "Maybe minimum wage increases so people don't need to resort to crime.", 9],
      ['interviewer', "Let's stay closer to the nighttime policing constraint — are there lower-cost operational changes to how existing resources are deployed?", 11],
      ['candidate', "I suppose better social programs, like after-school programs for kids.", 9],
      ['interviewer', "Those are reasonable long-run ideas, but I'm looking for something you could action within the existing police budget and nighttime timeframe specifically. Any thoughts there?", 12],
      ['candidate', "Maybe more community outreach from the police.", 8],
      ['interviewer', "Okay, let's stop here for today.", 5],
    ],
  },
  {
    caseId: 'case-77', caseTitle: 'Subway Surfers', industry: 'Industry Agnostic', difficulty: 'Easy', caseType: 'Guesstimate',
    daysAgo: 16, sessionMode: 'Remote',
    scores: { structure: 4, understanding: 4, delivery: 3.5, creativity: 3 },
    notes: "Clean and methodical, no complaints about the approach itself. Just a touch slow on mental math for an easy-difficulty case — took a while to get from the intermediate numbers to the final estimate, worth practicing rounding earlier to move faster.",
    script: [
      ['interviewer', "Estimate the number of people who use the Delhi Metro on a weekday.", 5],
      ['candidate', "I'll build this from Delhi's population, roughly 20 million in the broader NCR region using the metro network.", 10],
      ['interviewer', "Reasonable starting point.", 4],
      ['candidate', "Of those, I'd assume maybe 25% are regular commuters who could plausibly use the metro — students and office workers primarily.", 11],
      ['interviewer', "Go on.", 4],
      ['candidate', "That's 5 million potential riders. Of those, maybe 40% actually choose the metro over other options like cars, buses, or two-wheelers, given traffic and cost tradeoffs.", 13],
      ['interviewer', "So what's your estimate?", 6],
      ['candidate', "That gives about 2 million people, and if each person makes a round trip, that's roughly 4 million rides a day.", 11],
      ['interviewer', "Does that match anything you might know about actual ridership?", 8],
      ['candidate', "I believe actual Delhi Metro ridership is in a similar ballpark, a few million rides daily, so this feels directionally reasonable.", 8],
      ['interviewer', "Good, that's a wrap.", 4],
    ],
  },
  {
    caseId: 'case-43', caseTitle: 'Risk It for the Biscuit', industry: 'FMCG', difficulty: 'Hard', caseType: 'Pricing',
    daysAgo: 14, sessionMode: 'Remote',
    scores: { structure: 3.5, understanding: 4.5, delivery: 3, creativity: 3.5 },
    notes: "Your quantitative handling of the elasticity trade-off was the best part of this session — genuinely sharp instinct for when a price increase pays for itself versus when it doesn't. Structure at the outset was a little meandering before you settled into the pricing framework properly.",
    script: [
      ['interviewer', "A biscuit manufacturer is considering a 10% price increase to offset rising input costs. Should they do it?", 5],
      ['candidate', "So the question is really whether the volume lost from the price increase is outweighed by the higher margin per unit. Let me think about how to frame this... I guess first, what's the current margin and how much have costs actually risen?", 14],
      ['interviewer', "Current gross margin is 30%. Input costs have risen enough to erode that to 22% if price stays flat.", 6],
      ['candidate', "Okay, so without action, margin drops 8 points. With a 10% price increase, assuming costs stay where they are, let's see — if I raise price by 10%, and volume falls by some percentage due to elasticity, I need volume to not fall by more than roughly 10% for revenue to stay flat, but actually for margin dollars I need to think about it slightly differently.", 15],
      ['interviewer', "Walk me through that math.", 6],
      ['candidate', "If price goes up 10% and costs per unit are unchanged, margin per unit increases roughly in proportion to the price increase on the margin base. Even if volume falls by, say, 15%, the higher margin per remaining unit could still leave total margin dollars higher than doing nothing, depending on the exact elasticity. I'd want the actual price elasticity for this category to run the real numbers rather than assume.", 14],
      ['interviewer', "Assume elasticity means a 10% price rise costs you 8% of volume. Is the price increase worth it?", 9],
      ['candidate', "With only an 8% volume loss against a 10% price increase, on a per-unit margin basis this should net positive for total margin dollars — the price increase more than compensates for the volume given how inelastic that is. I'd recommend proceeding, but phased or with a value-pack alternative at the old price point to soften the blow for the most price-sensitive segment.", 11],
      ['interviewer', "Good handling of the math. Let's stop there.", 5],
    ],
  },
  {
    caseId: 'case-8', caseTitle: 'Take Me to the Candy Shop', industry: 'FMCG', difficulty: 'Medium', caseType: 'Pricing',
    daysAgo: 12, sessionMode: 'Remote',
    scores: { structure: 3, understanding: 2.5, delivery: 3, creativity: 2.5 },
    notes: "Middling session. You got to a workable structure but didn't push on the numbers I gave you — when I said the discount program was costing more than expected, that should have triggered a \"how much more, and against what benefit\" follow-up, and it didn't come until I prompted it directly.",
    script: [
      ['interviewer', "A candy brand runs frequent discount promotions and margins have been shrinking. Should they cut back on discounting?", 5],
      ['candidate', "I'd think about why they discount in the first place — maybe to drive volume, or match competitor promotions, or clear inventory.", 10],
      ['interviewer', "It's mainly meant to drive volume and defend market share. The discount program has been running for two years and is costing more than expected.", 7],
      ['candidate', "Okay, that makes sense as a rationale. I'd want to check whether the volume gained from discounting actually offsets the margin given up.", 9],
      ['interviewer', "Can you say more about how you'd check that?", 7],
      ['candidate', "I'd compare the incremental units sold during promotional periods against the margin lost per unit from discounting, and see if the total profit is higher with or without the promotion.", 9],
      ['interviewer', "And when I said it's \"costing more than expected\" — does that prompt any specific question?", 9],
      ['candidate', "Oh — I should ask by how much it's over expectation and against what baseline was expected, since \"more than expected\" could mean a small miss or a large one, which would change the urgency of the recommendation quite a bit.", 10],
      ['interviewer', "Right, that's the kind of thing to catch in the moment. Let's stop here.", 6],
    ],
  },
  {
    caseId: 'case-90', caseTitle: 'Home Alone', industry: 'Artificial Intelligence', difficulty: 'Hard', caseType: 'Market Entry',
    daysAgo: 10, sessionMode: 'Remote',
    scores: { structure: 4.5, understanding: 4.5, delivery: 4, creativity: 4 },
    notes: "One of the stronger sessions in your recent history. You handled a genuinely unfamiliar, fast-moving industry (AI hardware) without freezing, building a sensible framework on the fly rather than trying to force-fit a generic template. Confident, well-paced delivery throughout.",
    script: [
      ['interviewer', "A smart-home AI assistant company wants to enter the elder-care monitoring market. How would you evaluate this?", 6],
      ['candidate', "This is a fairly different customer and use case from their core smart-home product, so I'd want to check market attractiveness, technical/capability fit, and something specific to this space — trust and regulatory sensitivity, since elder-care monitoring touches health data and safety in a way general smart-home doesn't.", 13],
      ['interviewer', "Good addition. Walk through market attractiveness first.", 7],
      ['candidate', "I'd look at the aging population trend, willingness to pay — from families rather than the elderly user themselves typically — and existing competition, whether that's dedicated medical-alert companies or general smart-home players already moving into this space.", 12],
      ['interviewer', "There's a dominant incumbent with a well-known medical alert pendant product, decades old.", 6],
      ['candidate', "Then differentiation matters a lot — an AI assistant company's edge is probably proactive detection, like noticing a fall or an unusual absence of activity, versus the incumbent's reactive model where the user has to actively press a button. That's a meaningfully different value proposition, not just a cheaper me-too.", 11],
      ['interviewer', "How would you validate families would trust an AI system for something this sensitive?", 9],
      ['candidate', "I'd want to pilot with a defined cohort and measure both detection accuracy and, just as important, false-alarm rate — too many false alarms would erode trust fast even if the technology is technically capable. I'd also think about partnering with a healthcare or eldercare brand for credibility rather than launching purely under the smart-home brand name, since trust here is as much about the messenger as the technology.", 12],
      ['interviewer', "Really thoughtful. Let's stop there.", 5],
    ],
  },
  {
    caseId: 'case-partial-1-timeout', caseTitle: 'Testing the Waters', industry: 'Hospitality', difficulty: 'Medium', caseType: 'Growth',
    caseIdReal: 'case-31',
    daysAgo: 9, sessionMode: 'Remote', unrated: true, completedBy: 'timeout_fallback',
    script: [
      ['interviewer', "A boutique hotel chain wants to grow revenue in the off-season. What would you look at?", 5],
      ['candidate', "I'd think about pricing flexibility during the off-season, maybe dynamic pricing.", 9],
      ['interviewer', "Go on.", 4],
      ['candidate', "And also whether there's a different customer segment that travels off-season, like retirees or remote workers who could work from a hotel for a longer stay.", 10],
      ['interviewer', "Interesting, tell me more about the remote worker angle.", 7],
      ['candidate', "Maybe a discounted long-stay package targeted at remote workers specifically for off-season months, since hotels", 6],
    ],
  },
  {
    caseId: 'case-partial-2-timeout', caseTitle: 'Fields of Gold', industry: 'Mining', difficulty: 'Easy', caseType: 'Profitability',
    caseIdReal: 'case-26',
    daysAgo: 8, sessionMode: 'Remote', unrated: true, completedBy: 'timeout_fallback',
    script: [
      ['interviewer', "A gold mining company's profits have declined despite stable gold prices. What would you check?", 5],
      ['candidate', "I'd split this into revenue and costs. If gold prices are stable, revenue should mainly depend on volume extracted.", 10],
      ['interviewer', "Volume is actually up slightly.", 5],
      ['candidate', "So it's cost side then. I'd look at extraction costs, labor, energy, and maybe regulatory or environmental compliance costs, which have", 7],
    ],
  },
  {
    caseId: 'case-58', caseTitle: 'Ups and Downs', industry: 'Industry Agnostic', difficulty: 'Medium', caseType: 'Unconventional',
    daysAgo: 7, sessionMode: 'Remote',
    scores: { structure: 3, understanding: 3.5, delivery: 3, creativity: 3.5 },
    notes: "Balanced session across the board — nothing dragged the case down, nothing was a standout either. The recommendation at the end was a touch generic (\"invest in training\") when the transcript itself hinted at a more specific fix around scheduling, which you noticed but didn't fully build into the final recommendation.",
    script: [
      ['interviewer', "An elevator maintenance company has seen a spike in customer complaints even though their technicians are highly rated individually. What's happening?", 6],
      ['candidate', "If individual technicians are well-rated, this might not be a skill or training problem, so I'd look at things like scheduling, response time, or how complaints are actually being logged and measured.", 11],
      ['interviewer', "Response times have gotten notably longer over the past six months.", 6],
      ['candidate', "That would explain complaints even with good technicians — the issue isn't quality of service once someone arrives, it's how long people wait. I'd want to know if this is a capacity problem, more service calls than technicians can handle, or a routing/scheduling inefficiency.", 12],
      ['interviewer', "Call volume is up 20%, headcount hasn't changed.", 5],
      ['candidate', "So it's a straightforward capacity mismatch. Either hire more technicians, which is the direct fix but costly, or improve scheduling efficiency to get more calls done per technician per day, or triage calls so urgent ones get faster response even if less urgent ones wait a bit longer.", 12],
      ['interviewer', "Which would you prioritize first?", 6],
      ['candidate', "I'd start with the training and scheduling investment since it's cheaper and faster than hiring, then reassess headcount once we know how much of the gap that closes.", 9],
      ['interviewer', "Okay, that's fine. Let's stop there.", 5],
    ],
  },
  {
    caseId: 'case-partial-3', caseTitle: 'Wat-uh Product', industry: 'Chemicals', difficulty: 'Hard', caseType: 'Pricing',
    caseIdReal: 'case-35',
    daysAgo: 6, sessionMode: 'Remote', unrated: true, completedBy: undefined, missingIdentity: true,
    script: [
      ['interviewer', "A specialty chemicals producer wants to reprice its flagship product line. Where would you start?", 5],
      ['candidate', "I'd want to understand who the customers are — is this B2B with long-term contracts, or more spot-market?", 9],
      ['interviewer', "Mostly long-term B2B contracts.", 5],
    ],
  },
  {
    caseId: 'case-partial-4', caseTitle: 'Paint the Town Red', industry: 'Chemicals', difficulty: 'Medium', caseType: 'Growth',
    caseIdReal: 'case-46',
    daysAgo: 6, sessionMode: 'Remote', unrated: true, completedBy: undefined, missingIdentity: true,
    script: [
      ['interviewer', "A paint manufacturer wants to grow in the residential segment. How would you approach this?", 5],
      ['candidate', "I'd split growth into existing customers buying more, new customers, and maybe new channels like online.", 9],
    ],
  },
  {
    caseId: 'case-partial-5', caseTitle: 'Raise the Bar', industry: 'Fitness', difficulty: 'Medium', caseType: 'Growth',
    caseIdReal: 'case-47',
    daysAgo: 5, sessionMode: 'Remote', unrated: true, completedBy: undefined, missingIdentity: true,
    script: [
      ['interviewer', "A gym chain wants to grow membership without opening new locations. What would you look at?", 5],
      ['candidate', "Maybe retention of existing members first, since acquiring new members is usually more expensive than keeping current ones.", 9],
      ['interviewer', "Fair. What would you check about retention specifically?", 7],
    ],
  },
  {
    caseId: 'case-partial-6', caseTitle: 'Chasing Cars', industry: 'Automotive', difficulty: 'Medium', caseType: 'Market Entry',
    caseIdReal: 'case-48',
    daysAgo: 5, sessionMode: 'Remote', unrated: true, completedBy: undefined, missingIdentity: true,
    script: [
      ['interviewer', "An automotive parts supplier wants to enter the EV components market. How would you evaluate this?", 6],
    ],
  },
  {
    caseId: 'case-partial-7', caseTitle: 'Fly Me to the Moon', industry: 'Tourism', difficulty: 'Hard', caseType: 'Unconventional',
    caseIdReal: 'case-49',
    daysAgo: 4, sessionMode: 'Remote', unrated: true, completedBy: 'timeout_fallback',
    script: [
      ['interviewer', "A space tourism startup wants to price its first commercial flights. What factors matter most?", 6],
      ['candidate', "I'd think about willingness to pay from the target customer segment, which for something like this is probably ultra-high-net-worth individuals rather than mass market.", 10],
      ['interviewer', "Correct so far.", 4],
      ['candidate', "And also cost of the flight itself, to know the floor price they can't go below without losing money, and then whether there's a prestige or first-mover premium they could charge above pure cost economics.", 11],
      ['interviewer', "Good direction. Let's dig into the cost floor —", 6],
    ],
  },
  {
    caseId: 'case-59', caseTitle: 'Young Poets Society', industry: 'Industry Agnostic', difficulty: 'Medium', caseType: 'Unconventional',
    daysAgo: 68, sessionMode: 'Same Device',
    scores: { structure: 3.5, understanding: 3, delivery: 4, creativity: 3.5 },
    notes: "Nice energy throughout, kept the conversation flowing naturally even on an unconventional prompt where candidates often go quiet. Understanding lagged slightly behind the other dimensions — a couple of your assumptions weren't quite validated with the interviewer before you built further on them.",
    script: [
      ['interviewer', "A struggling regional theatre wants to become financially self-sustaining within three years. Advise them.", 6],
      ['candidate', "I'd look at both sides — growing earned revenue like ticket sales and sponsorships, and reducing costs like venue overhead or production costs.", 10],
      ['interviewer', "What would you want to know about their current revenue mix?", 7],
      ['candidate', "How much comes from ticket sales versus donations or grants versus corporate sponsorship, since the right growth lever differs a lot depending on which is already dominant.", 10],
      ['interviewer', "Ticket sales are the majority currently.", 5],
      ['candidate', "Then I'd focus on filling more seats and possibly dynamic or tiered pricing, plus building a membership or subscription model for regular patrons, which tends to smooth revenue and build a more loyal base than one-off ticket buyers.", 11],
      ['interviewer', "How would you validate demand exists for a membership model here specifically?", 8],
      ['candidate', "I'd assume based on similar theatres elsewhere that this works well, so I'd move forward with designing the tiers.", 9],
      ['interviewer', "Should you validate that assumption locally before committing, given every regional market is different?", 9],
      ['candidate', "Good point — yes, I should test that with a survey of existing patrons or a small pilot before building out a full membership program based on what worked elsewhere.", 8],
      ['interviewer', "Fair, let's stop there.", 4],
    ],
  },
  {
    caseId: 'case-14', caseTitle: 'As You Sow, So Shall You Reap', industry: 'Automotive', difficulty: 'Hard', caseType: 'Profitability',
    daysAgo: 66, sessionMode: 'Same Device',
    scores: { structure: 2.5, understanding: 3, delivery: 2.5, creativity: 2 },
    notes: "Below your usual bar on structure — the profit tree had a cost bucket (\"operations\") that was too vague to be useful, and I had to ask you to break it down further myself rather than you doing it proactively. Understanding of the underlying business was fine once we got past the structure issue.",
    script: [
      ['interviewer', "An auto parts manufacturer's margins have thinned even as revenue grew 15%. What's going on?", 5],
      ['candidate', "I'd split profit into revenue and costs. Revenue growing but margin shrinking means costs grew even faster. Cost buckets would be raw materials, labor, and operations.", 11],
      ['interviewer', "Can you break down \"operations\" further? That's pretty broad.", 8],
      ['candidate', "Sure — operations would include things like factory overhead, utilities, and maintenance.", 9],
      ['interviewer', "Raw material costs are actually the ones that spiked — steel prices rose sharply.", 6],
      ['candidate', "Okay, so steel input costs rose faster than revenue growth. I'd look at whether they can pass this through to customers via price increases, hedge steel purchases forward, or substitute materials where feasible without compromising part quality or safety certifications.", 11],
      ['interviewer', "Given these are likely safety-certified auto parts, how does that constrain your options?", 8],
      ['candidate', "Material substitution becomes much harder since any change might require recertification, which is slow and costly. That pushes me more toward hedging and price pass-through as the faster levers, with substitution only as a longer-term option.", 9],
      ['interviewer', "Okay, let's stop here.", 4],
    ],
  },
  {
    caseId: 'case-38', caseTitle: 'When Chai Met Toast', industry: 'Food & Beverage', difficulty: 'Easy', caseType: 'Market Entry',
    daysAgo: 63, sessionMode: 'Same Device',
    scores: { structure: 4, understanding: 3.5, delivery: 4, creativity: 3 },
    notes: "Confident and clear, easy case handled cleanly. Nothing exceptional but nothing to flag either — a good, competent baseline session.",
    script: [
      ['interviewer', "A café chain known for chai wants to launch a breakfast menu. How would you evaluate this?", 5],
      ['candidate', "I'd check whether there's customer demand — do people already ask for food, or come in during breakfast hours currently — and whether it fits operationally, like kitchen space and staffing for hot food versus just beverages.", 11],
      ['interviewer', "Morning footfall is actually their weakest time slot currently.", 5],
      ['candidate', "That's a useful data point — a breakfast menu could be specifically aimed at building that weak time slot rather than just adding a menu item broadly. I'd want to know why morning footfall is weak — is it competition from other breakfast options nearby, or just that chai alone isn't a strong enough draw to get people in early?", 12],
      ['interviewer', "There's limited nearby competition for breakfast specifically.", 5],
      ['candidate', "Then the opportunity seems real — low competition and an existing footfall gap to fill. I'd recommend piloting a simple, kitchen-light breakfast menu, like items that pair naturally with chai, before investing in full hot-kitchen buildout, to validate demand cheaply first.", 10],
      ['interviewer', "Good, that's a wrap.", 4],
    ],
  },
  {
    caseId: 'case-61', caseTitle: 'Bad Teacher', industry: 'Industry Agnostic', difficulty: 'Medium', caseType: 'Unconventional',
    daysAgo: 60, sessionMode: 'Same Device',
    scores: { structure: 2, understanding: 2.5, delivery: 3, creativity: 2 },
    notes: "Delivery was actually your strongest dimension this time — calm, clear voice even when the content was shaky. Structurally this one meandered; you never quite settled on a framework and instead answered each of my questions somewhat independently of each other.",
    script: [
      ['interviewer', "A school district wants to improve teacher retention, which has dropped sharply. What would you look at?", 5],
      ['candidate', "Maybe pay is too low compared to other districts.", 8],
      ['interviewer', "Compensation is actually competitive with neighboring districts.", 5],
      ['candidate', "Okay, then maybe it's workload, like class sizes being too large.", 8],
      ['interviewer', "Class sizes are average for the state.", 5],
      ['candidate', "Hmm, maybe it's about how supported teachers feel, like administrative support or resources in the classroom.", 9],
      ['interviewer', "Can you tie these together into an actual framework rather than guessing one at a time?", 9],
      ['candidate', "Sure — I'd say retention drivers are compensation, workload, and support and culture. Since pay and workload are both ruled out, it likely points to support and culture, so things like administrative burden, respect from leadership, or classroom resources.", 10],
      ['interviewer', "Better late than never. Let's stop here.", 5],
    ],
  },
  {
    caseId: 'case-partial-8', caseTitle: 'Panel Discussion', industry: 'Energy', difficulty: 'Medium', caseType: 'Unconventional',
    caseIdReal: 'case-57',
    daysAgo: 57, sessionMode: 'Same Device', unrated: true, completedBy: 'timeout_fallback',
    script: [
      ['interviewer', "An energy utility is under public pressure to accelerate its renewable transition faster than its current plan. How would you advise the board?", 6],
      ['candidate', "I'd first want to understand the current plan's timeline and what specifically is driving the public pressure — is it activist investors, regulation, or general public opinion?", 10],
      ['interviewer', "Mainly regulatory pressure, with a new carbon pricing scheme coming in two years.", 6],
      ['candidate', "That changes the urgency meaningfully since it's not just reputational, there's a real financial deadline. I'd want to model the cost of the current transition pace under the new carbon pricing versus an accelerated pace, to see if acceleration", 9],
    ],
  },
  {
    caseId: 'case-partial-9', caseTitle: 'The Sun Won’t Set On Us', industry: 'Energy', difficulty: 'Medium', caseType: 'Growth',
    caseIdReal: 'case-30',
    daysAgo: 3, sessionMode: 'Remote', unrated: true, completedBy: undefined, missingIdentity: true,
    script: [
      ['interviewer', "A solar panel installer wants to grow beyond residential into commercial installations. What would you consider?", 6],
      ['candidate', "I'd think about whether their current capabilities transfer — commercial installs are usually larger scale and different regulatory requirements than residential.", 10],
    ],
  },
  {
    caseId: 'case-partial-10', caseTitle: 'Pound for Pound', industry: 'Pharmaceuticals', difficulty: 'Medium', caseType: 'Pricing',
    caseIdReal: 'case-32',
    daysAgo: 2, sessionMode: 'Remote', unrated: true, completedBy: undefined, missingIdentity: true,
    script: [
      ['interviewer', "A generic drug manufacturer wants to reprice a portfolio of off-patent medications. Where would you start?", 6],
      ['candidate', "I'd segment the portfolio by competitive intensity — some generics have many manufacturers competing, others have very few, and the right pricing strategy differs a lot between those two cases.", 11],
      ['interviewer', "Good starting segmentation. Continue.", 5],
    ],
  },
  {
    caseId: 'case-partial-11', caseTitle: 'Jab We Met', industry: 'Pharmaceuticals', difficulty: 'Medium', caseType: 'Market Entry',
    caseIdReal: 'case-29',
    daysAgo: 1, sessionMode: 'Remote', unrated: true, completedBy: undefined, missingIdentity: true,
    script: [
      ['interviewer', "A vaccine manufacturer wants to enter a new emerging market. What would your evaluation framework look like?", 6],
    ],
  },
  {
    caseId: 'case-partial-12', caseTitle: 'IIM - A(irtel)', industry: 'Education', difficulty: 'Easy', caseType: 'Growth',
    caseIdReal: 'case-27',
    daysAgo: 1, sessionMode: 'Remote', unrated: true, completedBy: 'timeout_fallback',
    script: [
      ['interviewer', "An ed-tech platform wants to grow its paid subscriber base among college students specifically. What would you look at?", 6],
      ['candidate', "I'd check current conversion rate from free to paid among college students versus other segments, since the growth lever differs if this segment already converts well versus poorly.", 10],
      ['interviewer', "College students actually convert at half the rate of working professionals.", 6],
      ['candidate', "That's useful — I'd want to know if that's a price sensitivity issue, given students have less disposable income, or a value-perception issue, where the content doesn't feel tailored to what they need versus working professionals.", 11],
      ['interviewer', "Good direction, let's dig into that further —", 5],
    ],
  },
  {
    caseId: 'case-partial-13', caseTitle: 'Mile High Club', industry: 'Industry Agnostic', difficulty: 'Hard', caseType: 'Unconventional',
    caseIdReal: 'case-87',
    daysAgo: 1, sessionMode: 'Remote', unrated: true, completedBy: undefined, missingIdentity: true,
    script: [
      ['interviewer', "A private jet charter company wants to democratize its service to a slightly broader, still-affluent customer base without diluting its luxury brand. How would you think about this?", 8],
      ['candidate', "I'd want to define what \"slightly broader\" means quantitatively — how much lower down the wealth spectrum are we talking, since that determines whether existing brand equity even holds at that tier.", 11],
    ],
  },
  {
    caseId: 'case-72', caseTitle: 'Net Worth', industry: 'Industry Agnostic', difficulty: 'Hard', caseType: 'Guesstimate',
    daysAgo: 69, sessionMode: 'Remote',
    scores: { structure: 4, understanding: 4, delivery: 3.5, creativity: 4 },
    notes: "Really enjoyable case to grade — clean top-down guesstimate structure with well-justified assumptions, and you flagged your own weakest assumption unprompted at the end, which is exactly the self-awareness I like to see. Keep this habit up.",
    script: [
      ['interviewer', "Estimate the combined net worth of all billionaires in India.", 5],
      ['candidate', "I'll start by estimating the number of billionaires in India — I believe it's in the low hundreds, so let me use 150 as a working number, open to being corrected.", 11],
      ['interviewer', "That's roughly in the right range, continue with that.", 6],
      ['candidate', "For net worth distribution, this is likely to follow something like a power law — a handful of people at the very top with outsized wealth, and a long tail. I'd estimate the top 10 average around 15 billion dollars each, and the remaining 140 average maybe 2 billion each.", 13],
      ['interviewer', "Walk me through the total.", 6],
      ['candidate', "Top 10 at 15 billion each is 150 billion. Remaining 140 at 2 billion each is 280 billion. Total is roughly 430 billion dollars.", 12],
      ['interviewer', "Does that feel right relative to India's overall GDP?", 7],
      ['candidate', "India's GDP is roughly 3.5 trillion dollars, so this would be about 12% of GDP concentrated in billionaire wealth alone, which feels high but not implausible given known wealth concentration patterns — though this is the assumption I'm least confident in, particularly the power-law skew I used, so I'd want real data to calibrate that specifically before trusting the 430 billion figure.", 12],
      ['interviewer', "Good self-awareness. Let's stop there.", 5],
    ],
  },
]

// ---------------------------------------------------------------------------

function buildDocsForSession(seed, masterUid, masterEmail, casesById) {
  const lobbyId = `synthetic-${seed.caseId}-${seed.daysAgo}`
  const createdAtDate = new Date(Date.now() - seed.daysAgo * 24 * 60 * 60 * 1000)
  createdAtDate.setHours(14, 30, 0, 0)
  const createdAt = Timestamp.fromDate(createdAtDate)
  const turns = buildTurns(seed.script)
  const transcript = turnsToTranscript(turns)
  const durationMs = turns.length > 0 ? turns[turns.length - 1].offsetMs + 8000 : 0
  const completedAt = Timestamp.fromDate(new Date(createdAtDate.getTime() + durationMs))
  const realCaseId = seed.caseIdReal || seed.caseId
  // Authoritative metadata from the real `cases` collection — the hand-authored
  // seed list above sometimes drifts from the actual case_type/industry/difficulty
  // on file, so this is the source of truth rather than the literal in the seed.
  const realCase = casesById[realCaseId]
  const caseTitle = realCase?.title ?? seed.caseTitle
  const caseType = realCase?.case_type ?? seed.caseType
  const difficulty = realCase?.difficulty ?? seed.difficulty
  const industry = realCase?.industry ?? seed.industry

  const sessionDoc = {
    lobbyId,
    candidateId: masterUid,
    candidateEmail: masterEmail,
    sessionMode: seed.sessionMode,
    createdAt,
    completedAt,
    updatedAt: completedAt,
    caseId: realCaseId,
    caseName: caseTitle,
    interviewerEmail: 'synthetic.interviewer@example.com',
    interviewerId: 'synthetic-interviewer',
    status: 'completed',
    mergedTranscriptStatus: 'completed',
    mergedTranscriptCompletedAt: completedAt,
    mergedTranscriptTurns: turns,
    mergedTranscript: transcript,
    mergedAudioStatus: 'none',
    mergedAudioReason: 'no_audio',
    candidateTranscriptStatus: 'completed',
    interviewerTranscriptStatus: 'completed',
    _seed: SEED_TAG,
  }

  const evaluationDoc = {
    lobbyId,
    caseId: realCaseId,
    caseTitle,
    caseType,
    difficulty,
    industry,
    candidateId: seed.missingIdentity ? undefined : masterUid,
    candidateEmail: seed.missingIdentity ? undefined : masterEmail,
    interviewerId: 'synthetic-interviewer',
    interviewerEmail: 'synthetic.interviewer@example.com',
    isUnrated: Boolean(seed.unrated),
    completedBy: seed.completedBy,
    structureScore: seed.unrated ? null : seed.scores.structure,
    understandingScore: seed.unrated ? null : seed.scores.understanding,
    deliveryScore: seed.unrated ? null : seed.scores.delivery,
    creativityScore: seed.unrated ? null : seed.scores.creativity,
    notes: seed.unrated
      ? 'No interviewer feedback. The session ended before the interviewer submitted a rating.'
      : seed.notes,
    workspaceImageUrls: [],
    createdAt,
    updatedAt: completedAt,
    _seed: SEED_TAG,
  }
  // Firestore rejects `undefined` field values — strip them rather than writing null,
  // matching the real 'missing field entirely' shape seen on the actual unrated_* stub docs.
  for (const key of Object.keys(evaluationDoc)) {
    if (evaluationDoc[key] === undefined) delete evaluationDoc[key]
  }

  const evaluationId = seed.missingIdentity ? `unrated_${lobbyId}` : `synthetic_${lobbyId}`

  return { lobbyId, sessionDoc, evaluationId, evaluationDoc }
}

async function clearPreviousSeed() {
  console.log('Clearing previously seeded docs...')
  for (const col of ['sessions', 'evaluations']) {
    const snap = await db.collection(col).where('_seed', '==', SEED_TAG).get()
    console.log(`  ${col}: found ${snap.size} previously seeded docs`)
    if (!APPLY || snap.empty) continue
    const batch = db.batch()
    for (const d of snap.docs) batch.delete(d.ref)
    await batch.commit()
    console.log(`  ${col}: deleted ${snap.size}`)
  }
}

async function run() {
  console.log(`Mode: ${APPLY ? 'APPLY (writing)' : 'DRY RUN (no writes)'}`)

  const masterUser = await auth.getUserByEmail(MASTER_EMAIL).catch(() => null)
  if (!masterUser) {
    console.error(`Master account ${MASTER_EMAIL} not found in Firebase Auth.`)
    process.exit(1)
  }
  console.log(`Master account: ${masterUser.uid} (${masterUser.email})`)
  console.log(`Sessions to seed: ${SESSIONS.length}`)

  const casesSnap = await db.collection('cases').get()
  const casesById = {}
  for (const d of casesSnap.docs) casesById[d.id] = d.data()
  console.log(`Loaded ${casesSnap.size} real case docs for metadata cross-check.`)

  const unknownCaseIds = SESSIONS
    .map((s) => s.caseIdReal || s.caseId)
    .filter((id) => !casesById[id])
  if (unknownCaseIds.length > 0) {
    console.error(`These caseIds don't exist in the real cases collection: ${unknownCaseIds.join(', ')}`)
    process.exit(1)
  }

  if (CLEAR) await clearPreviousSeed()

  const rated = SESSIONS.filter((s) => !s.unrated).length
  const unrated = SESSIONS.length - rated
  console.log(`  rated: ${rated}, unrated/in-progress: ${unrated}`)

  if (!APPLY) {
    for (const seed of SESSIONS.slice(0, 3)) {
      const { lobbyId, evaluationId, evaluationDoc } = buildDocsForSession(seed, masterUser.uid, masterUser.email, casesById)
      console.log(`  [dry-run sample] ${lobbyId} -> evaluations/${evaluationId} (${evaluationDoc.caseType}, ${evaluationDoc.industry}, ${evaluationDoc.difficulty})`)
    }
    console.log('Re-run with --apply to write all docs.')
    return
  }

  const batch = db.batch()
  for (const seed of SESSIONS) {
    const { lobbyId, sessionDoc, evaluationId, evaluationDoc } = buildDocsForSession(seed, masterUser.uid, masterUser.email, casesById)
    batch.set(db.collection('sessions').doc(lobbyId), sessionDoc)
    batch.set(db.collection('evaluations').doc(evaluationId), evaluationDoc)
  }
  await batch.commit()
  console.log(`Wrote ${SESSIONS.length} sessions + ${SESSIONS.length} evaluations.`)
}

run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
