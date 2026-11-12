---
name: HoldMySpot Welcome (The Ledger)
description: A full landing page on cool ruled paper, navy ink, one dark navy proof band, muted green and brick for money states.
colors:
  paper-ground: "#eef1f4"
  sheet: "#fbfcfd"
  field-white: "#ffffff"
  navy-ink: "#14213d"
  navy-ink-pressed: "#0d1730"
  navy-band: "#0e1a33"
  slate-ink: "#3d4963"
  placeholder-slate: "#6a7589"
  band-text-muted: "#c9d2e0"
  ledger-green: "#1f6150"
  green-wash: "#e6f2ed"
  green-soft: "#cfe6dd"
  ledger-brick: "#8a3b2e"
  message-wash: "#e4e9f0"
  hairline: "rgba(20, 33, 61, 0.16)"
  hairline-strong: "rgba(20, 33, 61, 0.85)"
  hairline-on-navy: "rgba(238, 241, 244, 0.35)"
typography:
  display:
    fontFamily: "'Hanken Grotesk', system-ui, sans-serif"
    fontSize: "clamp(2.75rem, 5.6vw, 5.25rem)"
    fontWeight: 800
    lineHeight: 0.98
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "'Hanken Grotesk', system-ui, sans-serif"
    fontSize: "clamp(2rem, 3.6vw, 3.25rem)"
    fontWeight: 800
    lineHeight: 1.04
    letterSpacing: "-0.03em"
  subhead:
    fontFamily: "'Hanken Grotesk', system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  title:
    fontFamily: "'Hanken Grotesk', system-ui, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.015em"
  entry-title:
    fontFamily: "'Hanken Grotesk', system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    letterSpacing: "-0.01em"
  lead:
    fontFamily: "'Hanken Grotesk', system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.55
  body:
    fontFamily: "'Hanken Grotesk', system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "'Hanken Grotesk', system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    letterSpacing: "0.08em"
  figure:
    fontFamily: "'JetBrains Mono', ui-monospace, monospace"
    fontSize: "clamp(1.75rem, 2.6vw, 2.25rem)"
    fontWeight: 600
    lineHeight: 1.2
    fontFeature: "tabular-nums"
  figure-small:
    fontFamily: "'JetBrains Mono', ui-monospace, monospace"
    fontSize: "1rem"
    fontWeight: 600
    fontFeature: "tabular-nums"
rounded:
  sheet: "0"
  control: "0.25rem"
  bubble: "0.75rem"
  avatar: "50%"
spacing:
  xs: "0.25rem"
  sm: "0.625rem"
  md: "1rem"
  lg: "1.25rem"
  xl: "2rem"
  page-gutter: "clamp(1.25rem, 5vw, 5rem)"
  section-pad: "clamp(3.5rem, 10vh, 6.5rem)"
components:
  top-bar:
    backgroundColor: "rgba(238, 241, 244, 0.92)"
    textColor: "{colors.navy-ink}"
    padding: "0.875rem clamp(1.25rem, 5vw, 5rem)"
  entry-sheet:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.navy-ink}"
    rounded: "{rounded.sheet}"
    padding: "clamp(1.125rem, 2vw, 1.5rem)"
  button-primary:
    backgroundColor: "{colors.navy-ink}"
    textColor: "{colors.field-white}"
    rounded: "{rounded.control}"
    padding: "0.8125rem 1.25rem"
  button-primary-hover:
    backgroundColor: "{colors.navy-ink-pressed}"
  button-top:
    backgroundColor: "{colors.navy-ink}"
    textColor: "{colors.field-white}"
    rounded: "{rounded.control}"
    padding: "0.5rem 1rem"
  button-cta:
    backgroundColor: "{colors.navy-ink}"
    textColor: "{colors.field-white}"
    rounded: "{rounded.control}"
    padding: "0.9375rem 1.75rem"
  input:
    backgroundColor: "{colors.field-white}"
    textColor: "{colors.navy-ink}"
    rounded: "{rounded.control}"
    padding: "0.75rem 0.875rem"
  demo-card:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.navy-ink}"
    rounded: "{rounded.sheet}"
  demo-message:
    backgroundColor: "{colors.message-wash}"
    textColor: "{colors.navy-ink}"
    rounded: "{rounded.bubble}"
    padding: "0.5rem 0.75rem"
  proof-band:
    backgroundColor: "{colors.navy-band}"
    textColor: "{colors.paper-ground}"
    padding: "clamp(3.5rem, 10vh, 6.5rem) clamp(1.25rem, 5vw, 5rem)"
  trust-strip:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.navy-ink}"
    padding: "1.5rem clamp(1.25rem, 5vw, 5rem)"
  status-pill-green:
    backgroundColor: "{colors.green-wash}"
    textColor: "{colors.ledger-green}"
    padding: "0.3125rem 0.625rem"
  hold-picker-option:
    backgroundColor: "transparent"
    textColor: "{colors.navy-ink}"
    typography: "{typography.figure-small}"
    padding: "0.625rem 1.125rem"
  hold-picker-option-on:
    backgroundColor: "{colors.navy-ink}"
    textColor: "{colors.field-white}"
---

# Design System: HoldMySpot Welcome (The Ledger)

**Scope.** This system is recorded from the Welcome/landing surface only (`Welcome` in `src/Onboarding.tsx`, styled by `src/welcome.css`, everything under the `.lg` root). The rest of the app (`src/styles.css`, including the setup stepper that also lives in Onboarding.tsx) still carries the older warm-cream/purple look and was deliberately left unchanged. Do not apply these tokens to those screens unasked, and do not pull the older look into the Welcome surface. Inside `.lg`, the shared `--ink`, `--ink-2`, `--line`, `--accent`, `--panel` tokens are re-pointed to the ledger palette so shared form controls inherit it. Tokens live as `--lg-*` custom properties on `.lg`.

## Overview

**Creative North Star: "The Ledger"**

The page is accounting paper that has grown from one ruled sheet into a full landing page. Navy ink sits on cool paper; structure comes from hairline rules rather than boxes; figures are set in a tabular mono like a column of amounts. Money states carry the only chroma: muted green for released money, muted brick for captured money. The mood is quiet, exact, trustworthy.

The page runs top to bottom as: sticky translucent top bar with section nav and a Create studio button; hero (headline, lede, compact one-row entry form, and the looping example booking card over a faint ruled-line ground); trust strip of factual PayPal-rail items; three-column steps with live figures; one full-bleed dark navy proof band; "your rules" ledger with the hold picker; a centered closing call to action; footer with the honesty note. Every section is opened by a rule (strong 2px navy rule, hairline, or a band edge) and sections alternate paper, sheet and navy grounds rather than using cards.

Depth is almost absent: only the entry sheet and the example booking card lift. Motion is small and purposeful: the example booking replays, figures settle when the hold changes, and the nav and picker respond on hover.

**Key Characteristics:**
- Cool paper ground, near-white sheet, single navy ink; one dark navy band is the only inverted section.
- Hairline rules do the structural work; a heavier navy rule opens each major block.
- Figures only in JetBrains Mono, tabular; everything else Hanken Grotesk.
- Color is reserved for money state (green released, brick captured).
- Square sheet corners; 4px radius on controls; round only where the object is round (avatar) or a chat message (bubble).
- Large, tight display type (800 weight, negative tracking) against a calm 1.0625 to 1.125rem reading size.

## Colors

A cool-neutral palette with one ink, one deeper navy for the proof band, and two muted money signals.

### Primary
- **Navy Ink** (`navy-ink`): text, every button, selected picker option, focus outlines, caret, selection, the 3px top rule on the entry sheet, the avatar disc. Hover deepens buttons to `navy-ink-pressed`.
- **Navy Band** (`navy-band`): the full-bleed proof band background only, with `paper-ground` text, white headings, `band-text-muted` for paragraphs and `hairline-on-navy` for the top rules over its three columns. Focus outlines flip to white inside it.

### Secondary
- **Ledger Green** (`ledger-green`): released money (step-two figure, the example booking's release/refill amounts and total, the net total) and the green status pill.
- **Green Wash** (`green-wash`): fill behind the green status pill only. **Green Soft** (`green-soft`, `--lg-green-soft`) is declared on `.lg` but not yet used by any rule in the build; reserve it for a green tint if one is needed and do not spread it.
- **Ledger Brick** (`ledger-brick`): captured money only (step-three figure).

### Neutral
- **Paper Ground** (`paper-ground`): page background (also set on html/body so overscroll matches) and footer.
- **Sheet** (`sheet`): entry sheet, example card, trust strip, picker and closing CTA surface.
- **Field White** (`field-white`): input backgrounds and text on navy.
- **Slate Ink** (`slate-ink`): secondary text, lede, labels, nav links, step numerals.
- **Placeholder Slate** (`placeholder-slate`): input placeholder only.
- **Message Wash** (`message-wash`): fill of the client message bubble in the example card only.
- **Hairline / Hairline Strong** (`hairline`, `hairline-strong`): 16% navy for row, column and section rules; 85% navy for the 2px opener over steps and the rules ledger, the picker border, and 3px double total rules.

### Named Rules
**The Money-Only Chroma Rule.** Green and brick appear only on figures and status that represent money moving (released, captured, authorized or refilled in the example). They never decorate, never mark buttons, links or nav.

**The One Ink Rule.** Every interactive and emphatic element is navy ink. A second accent hue for actions is not part of this world.

**The One Dark Band Rule.** One section may invert to navy-band, set in typography and top rules only: no cards, icons or figures inside it. The rest of the page stays on paper and sheet.

## Typography

**Display / Body Font:** Hanken Grotesk (system-ui, sans-serif fallback), weights 400, 600, 700, 800 loaded from Google Fonts in `index.html`.
**Figure Font:** JetBrains Mono (ui-monospace fallback), weight 600 only.

**Character:** A friendly-grotesk voice for words and a ledger-clerk mono for numbers; heavy tight headlines make the page confident while the figures read as data.

### Hierarchy
- **Display** (800, clamp 2.75rem to 5.25rem at 5.6vw, 0.98, -0.035em): the hero headline only; balanced wrap.
- **Headline** (800, clamp 2rem to 3.25rem at 3.6vw, 1.04, -0.03em): every section heading (steps, proof band, your rules, closing CTA).
- **Subhead** (700, 1.5rem, 1.15, -0.02em): step headings.
- **Title** (700, 1.375rem, -0.015em): the three proof-band column headings.
- **Entry title** (700, 1.125rem, -0.01em): entry sheet heading; also rule names (dt) and the net-total label at 1.125rem.
- **Lead / Body** (400): hero lede clamp(1.0625rem to 1.3125rem), max 34rem; section intro and CTA text 1.125rem, 1.55; step, band and rule text 1.0625rem, 1.55 to 1.6, measures 26rem to 28rem. Example-card text 0.9375rem; nav links 0.9375rem; footer honesty note 0.875rem; figcaption 0.8125rem.
- **Label** (600 to 700, 0.75rem, 0.06em to 0.08em, uppercase): field labels, ledger column heads, picker caption, figure captions, example-card speaker names and status pill. These label real fields, columns and states; they are not section kickers. The trust strip caption (0.8125rem, 700, 0.08em, uppercase) is a sentence introducing its list.
- **Figure** (JetBrains Mono 600, tabular-nums): step figures clamp(1.75rem to 2.25rem at 2.6vw); net total clamp(1.5rem to 2rem at 2.4vw); example total 1.25rem; example rows, step numerals and picker values 1rem.

### Named Rules
**The Figures-Only Mono Rule.** Mono is for numbers (amounts, step numerals, picker values). Words stay in the grotesk.

**The Heavy Heading, Calm Body Rule.** Headings are 800 with negative tracking and tight line height; reading text stays 400 at 1.0625 to 1.125rem. Nothing sits between them except the 700 subheads.

## Layout

A centered column, max width 88rem, gutters clamp(1.25rem, 5vw, 5rem). Sections pad clamp(3.5rem, 10vh, 6.5rem) vertically. The sticky top bar holds diamond mark, name, section nav (How it works, Why you can trust it, Your rules), account chip and the Create studio button. The hero is a two-track grid (1.1fr headline plus entry, 0.9fr example card), vertically centered, gap clamp(2rem, 5vw, 5rem), over a ruled-line ground (2.8rem pitch, 7% navy, masked to fade out by 85% of the height). The entry form is one row: studio name, first name, action (1fr, 0.7fr, auto). Steps and proof columns are three equal columns; steps are divided by 1px vertical hairlines under a 2px opener, proof columns by gaps with a top rule each. The rules ledger is a two-column grid (1fr, 1.4fr) of name and description rows. The closing CTA is centered; the footer is a wrapped flex row with brand left and honesty note right.

Spacing rhythm is rem-based: 0.25, 0.625, 1, 1.25 and 2rem as working steps, row padding 1.125 to 1.25rem. Responsive: at 70rem the section nav hides; at 62rem the hero, steps and proof columns stack to one column (steps split by top hairlines); at 40rem the entry form stacks with full-width buttons, example rows collapse to text plus figure with the speaker on its own line, the ledger column heads hide, rule rows stack, and the picker goes full width with its caption on its own line.

## Elevation & Depth

Flat by default; depth is carried by rules, ground tone and the dark band. Two elements lift: the entry sheet (`box-shadow: inset 0 3px 0 navy, 0 1px 0 rgba(20,33,61,0.06), 0 1.25rem 2.5rem -1.5rem rgba(20,33,61,0.28)`) and the example booking card (`0 1px 0 rgba(20,33,61,0.06), 0 2rem 3.5rem -1.75rem rgba(20,33,61,0.35)`), which also has a second faint sheet offset behind it at 70% opacity like a stacked page. The top bar is translucent paper (92%) with a 10px backdrop blur, the page's only blur.

### Named Rules
**The Two Lifted Sheets Rule.** Only the entry sheet and the example card lift. Steps, rules, picker, trust strip and band stay on the page plane.

## Shapes

Square where the paper is (sheets, cards, pills, rules: radius 0); 4px (0.25rem) on interactive controls (inputs, all buttons, the hold picker container). Exceptions are objects that are round in the world: the avatar disc (50%) and the client message bubble (0.75rem with a 0.1875rem tail corner). Rules are 1px, 2px (openers over steps and your rules), or a 3px double (example total, net total).

## Components

### Top Bar
Sticky, translucent paper with a bottom hairline and blur. Name in 800 at 1.125rem. Nav links 600 at 0.9375rem in slate ink; hover turns navy with a 1px navy underline (0.15s). Create studio is a compact navy button (0.5rem 1rem). Nav hides below 70rem.

### Buttons
- **Shape:** 4px corners, weight 600.
- **Primary:** navy ink fill, white text. Sizes: top bar 0.9375rem; entry 0.8125rem 1.25rem; closing CTA 1.0625rem with 0.9375rem 1.75rem. Hover deepens to `navy-ink-pressed`; disabled uses progress cursor at 75% opacity.
- **Focus:** 2px navy outline, 3px offset on all focusable elements (white inside the dark band and on the selected picker option).

### Inputs / Fields
- **Style:** white fill, 1px navy border at 45% opacity, 4px radius, padding 0.75rem 0.875rem, navy caret; uppercase 0.75rem slate label above.
- **Focus:** the global 2px navy outline.

### Entry Sheet
Sheet fill, 1px hairline border, 3px inset navy top rule, square corners, max 40rem, padding clamp(1.125rem, 2vw, 1.5rem). Holds sign-in or studio list, then the single-row form with the create action.

### Example Booking Card (signature)
Labelled as an example in its figcaption ("Example booking. Amounts follow the hold you pick below."). Header: navy avatar disc, name and detail, and a status pill (square, 1px navy border, label type; green variant on green wash). Body: a ruled log of rows (speaker label, text, mono figure) revealed one at a time: hold authorized, a sick-child message in a message-wash bubble, the proposal, release, waitlist refill. Footer: a 3px double rule with a bold total in green mono. Rows fade and rise 0.5rem over 0.5s; the sequence advances every 1.9s, holds 4.2s at the end, then loops. Under reduced motion all rows are shown static. The log keeps a 21rem minimum height on wide screens so the card does not jump.

### Trust Strip
A sheet-colored band with hairline bottom: one uppercase caption sentence then four plain 700-weight factual items (Orders v2 authorizations, Vault v3 saved wallets, Void, capture and refund, Agent Toolkit read-only) in a wrapped row. No logos or badges.

### Steps
A three-column ordered list under a 2px strong rule: mono numeral in slate, 1.5rem subhead, body, and a figure block (hairline top, uppercase caption, mono figure). Released figure green, captured brick, neutral figure navy. Figures settle when the hold changes.

### Proof Band
Full-bleed navy-band section with a white headline (max 40rem) and three typographic columns, each a 1px light top rule, a 1.375rem white title and muted paragraph (max 26rem). Typography only.

### Hold Picker
A segmented group, 1px strong-rule border, 4px radius, clipped. A caption cell on the left, then mono value options divided by hairlines. Selected is solid navy with white text; hover is a 7% navy wash; 0.18s transitions on the ledger ease; inset focus outline. It drives every example figure on the page.

### Rules Ledger
Under a 2px strong rule: picker row, uppercase column heads, then a definition list of rule rows (700 name, slate description) separated by hairlines, closed by a net-total row under a 3px double strong rule with a green mono figure.

### Closing CTA and Footer
Centered sheet-colored block: headline, 1.125rem text, one large navy button. Footer on paper with a top hairline: brand (800) with slate tagline and the honesty note at 0.875rem.

### Motion
- **Settle:** figures and status pills fade up 0.4em with a 3px blur clearing, 0.45s on `cubic-bezier(0.16, 1, 0.3, 1)`.
- **Log reveal:** example rows fade and rise, 0.5s on the same ease; picker 0.18s; nav links 0.15s; smooth in-page scrolling.
- Under `prefers-reduced-motion: reduce`: settle animations off, example rows static and fully shown, smooth scroll off.

## Do's and Don'ts

### Do:
- **Do** let hairline rules (16% navy) separate content; use the strong navy rule (2px) to open a new block.
- **Do** set every amount in JetBrains Mono 600 with tabular numerals.
- **Do** reserve ledger green and brick for released and captured money respectively.
- **Do** keep sheet corners square and control corners at 4px.
- **Do** label illustrative content as an example and keep trust-strip items factual.
- **Do** honor reduced motion by showing the example static and disabling settle.
- **Do** keep the dark band to typography and top rules.

### Don't:
- **Don't** introduce color gradients, glows, hard offset shadows or a second action hue on this surface. (The faint repeating ruled lines in the hero are paper, not a gradient treatment.)
- **Don't** use green or brick for decoration, buttons or generic success and error states.
- **Don't** set prose in the mono face.
- **Don't** add a second dark section or put cards inside the proof band.
- **Don't** apply this palette to screens governed by `src/styles.css` without an explicit redesign of them.
