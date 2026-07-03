---
name: Case CompendiumX
description: AI-first case interview platform — editorial rigor meets live intelligence
colors:
  espresso: "#3B2F2F"
  sienna: "#5C4033"
  ivory-press: "#fff8f0"
  warm-ash: "#f4ede3"
  scholar-green: "#3D5A35"
  deep-manuscript: "#2c2218"
  antique-gold: "#D8B978"
  error-sienna: "#b4543e"
typography:
  display:
    fontFamily: "Newsreader, Georgia, serif"
    fontSize: "clamp(2.6rem, 6vw, 4.4rem)"
    fontWeight: 400
    lineHeight: 1.04
    letterSpacing: "-0.015em"
  headline:
    fontFamily: "Newsreader, Georgia, serif"
    fontSize: "clamp(2.2rem, 5.2vw, 3.6rem)"
    fontWeight: 400
    lineHeight: 1.06
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Newsreader, Georgia, serif"
    fontSize: "1.15rem"
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: "-0.005em"
  body:
    fontFamily: "Work Sans, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Work Sans, system-ui, sans-serif"
    fontSize: "10px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.12em"
rounded:
  none: "0"
  sm: "6px"
  md: "10px"
  lg: "16px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
  2xl: "64px"
  3xl: "96px"
components:
  button-primary:
    backgroundColor: "{colors.scholar-green}"
    textColor: "{colors.ivory-press}"
    rounded: "{rounded.none}"
    padding: "13px 26px"
  button-primary-hover:
    backgroundColor: "#2f4829"
    textColor: "{colors.ivory-press}"
    rounded: "{rounded.none}"
    padding: "13px 26px"
  card-glass:
    backgroundColor: "#fff8f0cc"
    textColor: "{colors.espresso}"
    rounded: "{rounded.lg}"
    padding: "{spacing.xl}"
  input-base:
    backgroundColor: "{colors.ivory-press}"
    textColor: "{colors.espresso}"
    rounded: "{rounded.sm}"
    padding: "8px 12px"
  nav-link:
    backgroundColor: "transparent"
    textColor: "#57534e"
    rounded: "{rounded.none}"
    padding: "4px 0"
  nav-link-active:
    backgroundColor: "transparent"
    textColor: "{colors.scholar-green}"
    rounded: "{rounded.none}"
    padding: "4px 0"
---

# Design System: Case CompendiumX

## 1. Overview

**Creative North Star: "The Casebook That Thinks"**

Case CompendiumX carries the visual authority of a well-produced print casebook — the serif editorial weight, the warm-cream ground, the measured hierarchy — and then the interface opens its eyes. AI transcription runs in the background; feedback surfaces at session end; score trends accumulate over weeks. The design must be serious enough that a candidate trusts it mid-case, and transparent enough that the AI layer feels inevitable rather than intrusive.

The palette is not a stylistic choice — it is institutional inheritance. Ivory Press (#fff8f0) and Warm Ash (#f4ede3) are the page; Espresso (#3B2F2F) is the ink; Scholar Green (#3D5A35) is the margin note that earns your attention. Newsreader carries the editorial voice; Work Sans does the operational work. Every surface decision reinforces the same thing: this is where serious preparation happens.

This system explicitly rejects the brash SaaS dashboard aesthetic — no data-heavy corporate grids, no achievement-badge gamification, no sterile minimalism stripped of warmth. It also refuses the quiz-tool trivialization of the interview: every screen should feel like preparation, not entertainment.

**Key Characteristics:**
- Editorial type hierarchy: Newsreader for voice, Work Sans for function — never mixed within the same role
- Warm cream ground with forest green as the single committed accent (Restrained strategy)
- Sharp rectangular CTAs (radius: 0) — confidence through refusal to decorate
- Glass-surface cards: backdrop-filter blur on Ivory Press, not opaque panels
- Motion is purposeful: spring entrances and state-change transitions only — no orchestrated page choreography
- Deep Manuscript (#2c2218) for major display headings; Espresso (#3B2F2F) for body text — two distinct near-blacks, each with a specific role

---

## 2. Colors: The Manuscript Palette

A warm-neutral foundation with a single committed accent. The palette comes from the materials of serious study: the page, the ink, the margin annotation in green.

### Primary
- **Scholar Green** (`#3D5A35`): The accent. Used exclusively on primary actions (CTA buttons, active nav states, focus indicators, key data callouts). Its rarity is the point — when Scholar Green appears, it means "act here" or "this is selected." Never used decoratively, never as a background for large surfaces.

### Neutral
- **Deep Manuscript** (`#2c2218`): Reserved for major display headings and the most prominent editorial text. Darker than body text — the near-black of aged ink, not digital black.
- **Espresso** (`#3B2F2F`): The canonical body text color and the primary dark token (`--primary-dark`). All running text, labels, and data reads in Espresso.
- **Sienna** (`#5C4033`): Muted text, placeholder text, and secondary labels (`--primary-warm`). At reduced opacity (`rgba(92, 64, 51, 0.5–0.66)`), used for the softest text tier.
- **Ivory Press** (`#fff8f0`): The base page ground (`--bg-base`). Every authenticated surface starts here. Also the text-on-dark color (CTA labels, icon-on-green).
- **Warm Ash** (`#f4ede3`): The second surface layer (`--bg-subtle`). Used for panels, sidebar backgrounds, and tinted input fields that need to recede from Ivory Press.
- **Antique Gold** (`#D8B978`): Decorative-only shimmer. Appears solely on the constellation spine in `/our-story`. Prohibited elsewhere — it reads as achievement-badge gold if overused.
- **Error Sienna** (`#b4543e`): Error and destructive-action states. Warm, not alarm-red — consistent with the palette's avoidance of cold or clinical color.

### Named Rules
**The One Voice Rule.** Scholar Green appears on ≤10% of any given screen. Its presence means "action" or "selected." A screen saturated with Scholar Green is a screen that has lost its editorial authority.

**The Two Ink Rule.** Deep Manuscript is for display type. Espresso is for body text. They are not interchangeable — swapping them on a screen breaks the hierarchy that orients the reader at a glance.

**The Gold Reserve Rule.** Antique Gold is never introduced in new surfaces. It belongs to the `/our-story` constellation and nowhere else. A new component that "needs an accent" should use Scholar Green at reduced opacity, not Gold.

---

## 3. Typography: The Editorial Pairing

**Display Font:** Newsreader (Newsreader, Georgia, serif)
**Body Font:** Work Sans (Work Sans, system-ui, -apple-system, sans-serif)
**Icon System:** Material Symbols Outlined (variable font, wght 300, FILL 0)

**Character:** A contrast-axis pairing — Newsreader brings editorial gravitas and optical warmth; Work Sans brings geometric precision and operational legibility. They never appear in the same functional role. Newsreader voices the casebook; Work Sans runs the interface.

### Hierarchy

- **Display** (Newsreader, weight 400, `clamp(2.6rem, 6vw, 4.4rem)`, line-height 1.04, tracking -0.015em): Hero headlines on marketing surfaces and session-start moments. Deep Manuscript color. Never on dashboard data.
- **Headline** (Newsreader, weight 400, `clamp(2.2rem, 5.2vw, 3.6rem)`, line-height 1.06, tracking -0.01em): Section titles on editorial surfaces (`/our-story`, case detail headers). Deep Manuscript or Espresso.
- **Title** (Newsreader, weight 500, `1.15rem`, line-height 1.25, tracking -0.005em): Card headings in glass surfaces, dossier names, score card labels where editorial weight matters. Espresso.
- **Body** (Work Sans, weight 400, `14px`, line-height 1.6): All running text, dashboard prose, coach insights, transcript content. Espresso. Max line length 65–75ch for prose; data tables may run wider.
- **Label** (Work Sans, weight 600, `10px`, line-height 1, tracking 0.12em, ALL CAPS): Section eyebrows (used sparingly — one per screen maximum), table column headers, tag annotations. Scholar Green for active labels, Sienna at 50% opacity for passive ones.

### Named Rules
**The Role Purity Rule.** Newsreader appears in display/headline/title roles and score numbers. Work Sans appears in body/label/data roles and all interactive controls (buttons, inputs, nav). Mixing fonts within the same functional role — a button in Newsreader, a label in serif — is prohibited.

**The Fixed Scale Rule.** Product UI surfaces use fixed rem sizes, not `clamp()`. Dashboard cards, table labels, nav text: fixed. Fluid display type is reserved for editorial surfaces (`/`, `/our-story`, case intro screens) where the heading is the visual anchor.

---

## 4. Elevation

This system is flat-by-default with glass surfaces as the primary elevation signal. Hard drop shadows are avoided except for deep modal contexts. Depth is conveyed through backdrop-filter blur, tonal separation (Ivory Press vs. Warm Ash), and border opacity.

### Shadow Vocabulary
- **Ambient-Low** (`0 4px 12px rgba(59, 47, 47, 0.04)`): The glass-card resting shadow. Nearly invisible — it separates card from ground without asserting itself. Used on `.glass-card`.
- **Panel-Raised** (`0 12px 32px rgba(59, 47, 47, 0.08), 0 4px 12px rgba(59, 47, 47, 0.04)`): Dropdown menus and floating panels at rest. Two-layer: a soft diffuse layer plus the tight base.
- **Hover-Lift** (`0 8px 22px rgba(60, 45, 30, 0.12)`): Applied to interactive portrait nodes and cards on hover. Signals interactivity through elevation, not color change alone.
- **Modal-Deep** (`0 40px 100px rgba(0, 0, 0, 0.22)`): Dossier dialogs and full-screen overlays only. Reserved for the topmost layer of the z-index stack.
- **Focus-Glow** (`0 0 0 4px rgba(61, 90, 53, 0.12)`): Focus-visible ring for interactive nodes. Scholar Green at 12% opacity — visible without alarm.

### Named Rules
**The Flat-By-Default Rule.** Surfaces are flat at rest. Shadows appear only in response to state (hover lift, dropdown opening, modal entrance) or layer context (panel above content). A shadow on a static, non-interactive surface is decoration and is prohibited.

**The Glass-Not-Card Rule.** When a surface needs to float above the page ground, prefer backdrop-filter blur over opaque `background: Warm Ash`. Glass reads as air; opaque panels read as walls. Exception: modals and dossiers, where opacity is intentional to interrupt the flow.

---

## 5. Components

### Buttons
Restrained and editorial — sharp rectangular forms (radius: 0) with uppercase tracking. The shape is the signal; no rounded softness.

- **Shape:** Sharp rectangle (`border-radius: 0`). No rounding.
- **Primary** (`button-primary`): Scholar Green fill (#3D5A35), Ivory Press text (#fff8f0). Padding 13px 26px. Work Sans, 12px, weight 600, tracking 0.14em, uppercase. Arrow icon (Material Symbol, 17px) with `gap: 8px → 12px` on hover.
- **Primary Hover:** Background darkens to #2f4829. `translateY(-2px)` lift. Gap widens to signal momentum.
- **Ghost / Text CTA:** Transparent background, Scholar Green text, same typography as primary. Used for secondary actions where the primary CTA already holds Scholar Green on screen.
- **Disabled:** Opacity 0.4 on the whole button. No color shift — the form remains; the button recedes.

### Cards / Glass Surfaces
The `.glass-card` is the canonical container: frosted Ivory Press at 80% opacity, backdrop-filter blur(16px), 1px Scholar Green border at 10% opacity, Ambient-Low shadow, 1rem radius.

- **Corner Style:** Gently curved (16px / `rounded-lg`). The only surface in the system with significant rounding.
- **Background:** `rgba(255, 248, 240, 0.8)` with `backdrop-filter: blur(16px)`.
- **Border:** `1px solid rgba(61, 90, 53, 0.10)` — Scholar Green-tinted, nearly invisible at rest.
- **Shadow:** Ambient-Low only (`0 4px 12px rgba(59,47,47,0.04)`).
- **Internal Padding:** `xl` (40px) for editorial cards; `md` (16px) for compact data panels.
- **Nested cards are prohibited.** A glass card inside a glass card collapses the visual hierarchy.

### Inputs / Fields
- **Style:** `background: Ivory Press`, `border: 1px solid rgba(61,90,53,0.15)`, `border-radius: 6px (sm)`. Work Sans, 14px.
- **Focus:** Border shifts to `rgba(61,90,53,0.4)` — Scholar Green at higher opacity. No glow ring on text inputs (reserved for interactive nodes). Focus outline omitted when border shift is clear; `focus-visible` outline required for keyboard users when border shift alone is insufficient.
- **Error:** Border shifts to Error Sienna (#b4543e). Error text in `#92400e` (deep amber-sienna) beneath the field.
- **Disabled:** `opacity: 0.5`. Background unchanged.
- **Range sliders:** Custom styled — Espresso thumb (#3B2F2F), Sienna track at 20% opacity. 16px thumb, 4px track height.

### Navigation
- **Style:** Work Sans, 14px, weight 400. Default text: `#57534e` (stone-warm neutral — close to Sienna). Active text: Scholar Green (#3D5A35), weight 500, 2px Scholar Green underbar at -4px offset.
- **Dropdown trigger:** Hover-only dropdown with chevron rotation (0° → 180°, 0.28s ease). Invisible hover bridge prevents gap between trigger and menu (via `::after` pseudo-element). Dropdown panel: Ivory Press background, Panel-Raised shadow, 10px radius, 6px padding inside.
- **Dropdown items:** 12px × 16px internal padding, 6px radius on item hover (`background: rgba(61,90,53,0.07)`). Label in `#57534e` → Scholar Green on hover. Description line in Newsreader italic, 12px, Sienna at 55% opacity.
- **Mobile:** Nav collapses; mobile treatment per-page (not a global off-canvas — each major surface implements its own mobile-nav logic).

### Score Display
Score numbers are the most editorial moment in the product UI: a Newsreader serif number renders performance. Never Work Sans for a score.

- **Score numeral:** Newsreader, weight 500–600, size 2–3rem depending on card size. Espresso or Scholar Green depending on context (Scholar Green for "good" states is acceptable here — one of the few places accent color on a large element is earned).
- **Score label/sub-label:** Work Sans, 10px, weight 600, uppercase, Sienna at 50% opacity.

### Signature Component: The Glass-Card Dossier
Used in `/our-story` for portrait spotlight modals. A rectangular modal (0 border-radius on the dossier container itself), Warm Ash (#f7f1e8) background, 1px Scholar Green border at 12% opacity. The dossier top edge carries a 3px gradient line from Scholar Green to deep Sienna — the one decorative gradient in the system, earned by its "edition stamp" metaphor. Modal-Deep shadow. `cst-rise` entrance animation (spring, 0.42s).

---

## 6. Do's and Don'ts

### Do:
- **Do** use Sharp rectangular buttons (`border-radius: 0`) for all primary CTAs. The editorial restraint is the signal.
- **Do** keep Scholar Green (#3D5A35) to primary actions, active nav, and focus states only. If more than one element per screen competes in Scholar Green, one of them is wrong.
- **Do** use Newsreader for display, headline, title, and score-numeral roles exclusively. Never for body copy, labels, buttons, or table data.
- **Do** use `rgba(61, 90, 53, 0.10)` — Scholar Green tint at 10% — for card borders. A pure warm-neutral border at the same opacity would look like a tired gray box.
- **Do** include `@media (prefers-reduced-motion: reduce)` on every keyframe animation. The system has rich motion; reduced-motion users must never encounter gated content or missing transitions.
- **Do** use Material Symbols Outlined at `wght 300, FILL 0` for all icons. Heavier weights read as decoration; filled variants read as state (filled = active/selected).
- **Do** document intentional palette variations per surface (the `/case` detail page uses warm brown shades for structural hierarchy — this is deliberate, not inconsistency).

### Don't:
- **Don't** use brash SaaS dashboard aesthetics — heavy data grids, neon accents, achievement badges, confetti. Case CompendiumX is a preparation tool, not a gamified quiz app.
- **Don't** use generic mock-interview or quiz-tool UI patterns (progress bars as primary feedback, badge counts, streak indicators). These trivialize the interview.
- **Don't** use overly gamified touches — streaks, confetti on completion, star ratings in gaming style. The product earns warmth through quality, not reward loops.
- **Don't** let Scholar Green appear as a background on large surfaces or as a decorative fill. It is an accent used at ≤10% of screen area.
- **Don't** use Antique Gold (#D8B978) outside the `/our-story` constellation. Introduced elsewhere, it reads as achievement-badge gold and contradicts the editorial register.
- **Don't** round primary buttons. `border-radius: 0` is intentional. Rounded CTAs read as SaaS-generic; sharp CTAs read as editorial authority.
- **Don't** nest glass cards. A `.glass-card` inside a `.glass-card` eliminates visual hierarchy and makes the layout feel like a PowerPoint slide.
- **Don't** use modal dialogs as a first response to user actions. Exhaust inline and progressive alternatives before reaching for `<dialog>`.
- **Don't** use Newsreader in buttons, labels, table cells, or form controls. The serif voice belongs to editorial moments, not operational UI.
- **Don't** use `border-left` or `border-right` greater than 1px as a colored accent stripe on cards or callouts. If a section needs emphasis, use a background tint or leading icon instead.
- **Don't** add gradient text (`background-clip: text` with a gradient). The one decorative gradient in this system — the dossier top-edge line — is structural (a 3px bar, not text). All other text is solid color.
- **Don't** use minimalist-to-the-point-of-sterile design. Warmth is required. A screen with correct spacing but no warmth (no Newsreader serif, no Ivory Press ground, no Scholar Green accent) is a failure of identity, not a success of restraint.
