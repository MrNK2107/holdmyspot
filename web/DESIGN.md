---
name: HoldMySpot Welcome (The Ledger)
description: A full landing page on cool ruled paper, navy ink, one restrained blue action accent, navy proof and closing bands, muted green and brick for money states.
colors:
  paper-ground: "#eef1f4"
  sheet: "#fbfcfd"
  stage-wash: "#e3e8ef"
  field-white: "#ffffff"
  navy-ink: "#14213d"
  navy-ink-pressed: "#0d1730"
  navy-band: "#0e1a33"
  ledger-accent: "#2b4aa8"
  ledger-accent-hover: "#223a86"
  slate-ink: "#3d4963"
  placeholder-slate: "#6a7589"
  band-text-muted: "#c9d2e0"
  band-code-text: "#d8e0ee"
  white-hover: "#e4eaf4"
  ledger-green: "#1f6150"
  green-wash: "#e6f2ed"
  ledger-brick: "#8a3b2e"
  message-wash: "#e4e9f0"
  hairline: "rgba(20, 33, 61, 0.16)"
  hairline-strong: "rgba(20, 33, 61, 0.85)"
  hairline-on-navy: "rgba(238, 241, 244, 0.35)"
  hairline-on-navy-soft: "rgba(238, 241, 244, 0.2)"
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
  feature-title:
    fontFamily: "'Hanken Grotesk', system-ui, sans-serif"
    fontSize: "clamp(1.5rem, 2.4vw, 2.125rem)"
    fontWeight: 700
    lineHeight: 1.12
    letterSpacing: "-0.025em"
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
  body-small:
    fontFamily: "'Hanken Grotesk', system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.45
  caption:
    fontFamily: "'Hanken Grotesk', system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "'Hanken Grotesk', system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    letterSpacing: "0.08em"
  figure:
    fontFamily: "'JetBrains Mono', ui-monospace, monospace"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.2
    fontFeature: "tabular-nums"
  figure-small:
    fontFamily: "'JetBrains Mono', ui-monospace, monospace"
    fontSize: "1rem"
    fontWeight: 600
    fontFeature: "tabular-nums"
  code:
    fontFamily: "'JetBrains Mono', ui-monospace, monospace"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.6
rounded:
  sheet: "0"
  control: "0.25rem"
  bubble: "0.75rem"
  bubble-tail: "0.1875rem"
  device: "2.25rem"
  device-screen: "1.75rem"
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
    backgroundColor: "{colors.ledger-accent}"
    textColor: "{colors.field-white}"
    rounded: "{rounded.control}"
    padding: "0.8125rem 1.25rem"
  button-primary-hover:
    backgroundColor: "{colors.ledger-accent-hover}"
  button-top:
    backgroundColor: "{colors.ledger-accent}"
    textColor: "{colors.field-white}"
    rounded: "{rounded.control}"
    padding: "0.5rem 1rem"
  button-cta-on-navy:
    backgroundColor: "{colors.field-white}"
    textColor: "{colors.navy-ink}"
    rounded: "{rounded.control}"
    padding: "0.9375rem 1.75rem"
  button-cta-on-navy-hover:
    backgroundColor: "{colors.white-hover}"
  input:
    backgroundColor: "{colors.field-white}"
    textColor: "{colors.navy-ink}"
    rounded: "{rounded.control}"
    padding: "0.75rem 0.875rem"
  demo-card:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.navy-ink}"
    rounded: "{rounded.sheet}"
  demo-avatar:
    backgroundColor: "{colors.ledger-accent}"
    textColor: "{colors.field-white}"
    rounded: "{rounded.avatar}"
    size: "2.5rem"
  demo-message:
    backgroundColor: "rgba(20, 33, 61, 0.08)"
    textColor: "{colors.navy-ink}"
    rounded: "{rounded.bubble}"
    padding: "0.5rem 0.75rem"
  feature-stage:
    backgroundColor: "{colors.stage-wash}"
    textColor: "{colors.navy-ink}"
    padding: "1.5rem"
  phone-shell:
    backgroundColor: "{colors.navy-ink}"
    rounded: "{rounded.device}"
    padding: "0.6rem"
  phone-screen:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.navy-ink}"
    rounded: "{rounded.device-screen}"
    padding: "1.25rem 1rem"
  proposal-card:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.navy-ink}"
    rounded: "{rounded.sheet}"
    padding: "1.5rem"
  trace-request:
    backgroundColor: "{colors.navy-band}"
    textColor: "{colors.band-code-text}"
    typography: "{typography.code}"
    padding: "1rem 1.25rem"
  proof-band:
    backgroundColor: "{colors.navy-band}"
    textColor: "{colors.paper-ground}"
    padding: "clamp(3.5rem, 10vh, 6.5rem) clamp(1.25rem, 5vw, 5rem)"
  closing-band:
    backgroundColor: "{colors.navy-band}"
    textColor: "{colors.field-white}"
    padding: "clamp(3.5rem, 10vh, 6rem) clamp(1.25rem, 5vw, 5rem)"
  trust-strip:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.navy-ink}"
    padding: "1.5rem clamp(1.25rem, 5vw, 5rem)"
  status-pill:
    backgroundColor: "transparent"
    textColor: "{colors.ledger-accent}"
    padding: "0.3125rem 0.625rem"
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
    backgroundColor: "{colors.ledger-accent}"
    textColor: "{colors.field-white}"
---

# Design System: HoldMySpot Welcome (The Ledger)

**Scope.** The Ledger is now the look of the whole app. It was designed on the Welcome/landing surface (`Welcome` in `src/Onboarding.tsx`, styled by `src/welcome.css`, everything under the `.lg` root) and the in-app screens (`src/styles.css`: studio console, booking page, client page, setup, data grid) were re-themed to it: the shared tokens now hold the ledger palette (paper `#eef1f4`, sheet `#fbfcfd`, navy ink `#14213d`, slate `#3d4963`, hairline `#cfd6e0`, accent `#2b4aa8`), the money-state colours use the ledger roles (held = accent, released = green `#1f6150`, charged = brick `#8a3b2e`), controls and panels have 0.25rem corners, and type is Hanken Grotesk with JetBrains Mono for figures. The PayPal-yellow approve button is PayPal's own affordance and stays. Warm amber is kept only for pending/warning states. The `--lg-*` tokens below are the landing page's own copy of the same values. Tokens live as `--lg-*` custom properties on `.lg`. Inside `.lg`, the shared `--ink`, `--ink-2`, `--line`, `--accent`, `--panel` tokens are re-pointed to the ledger palette so shared form controls inherit it; the shared `--accent` stays navy ink, while the Welcome accent is the separate `--lg-accent`. The stylesheet ends with an append-only "final pass" block that overrides earlier rules; where the two disagree, the final pass is the shipped value and is what this file records.

## Overview

**Creative North Star: "The Ledger"**

The page is accounting paper that has grown from one ruled sheet into a full landing page. Navy ink sits on cool paper; structure comes from hairline rules rather than boxes; figures are set in a tabular mono like a column of amounts. One restrained blue accent marks the things you act on or step through. Money states carry the only other chroma: muted green for released money, muted brick for captured money. The mood is quiet, exact, trustworthy.

The page runs top to bottom as: sticky translucent top bar with section nav and a Create studio button; hero (headline, lede, compact one-row entry form, and the looping example booking card over a faint ruled-line ground); trust strip of factual PayPal-rail items; three alternating feature rows, each a text column beside a large product picture on a ruled stage (phone booking screen, proposal card, ledger trace with request snippet); one full-bleed dark navy proof band with a ruled never/only ledger; a "your rules" ledger with the hold picker; a navy closing band with a white button; footer with the honesty note. Every section is opened by a rule (strong 2px navy rule, hairline, or a band edge) and sections alternate paper, sheet and navy grounds rather than using cards.

Depth is almost absent: the entry sheet, the example booking card and the product pictures lift slightly. Motion is small and purposeful: only the writing in the example booking replays, figures settle when the hold changes, later sections fade up once on scroll, and the nav and picker respond on hover.

**Key Characteristics:**
- Cool paper ground, near-white sheet, navy ink; one blue accent on actions; navy-band is the only inverted ground (used twice, proof band and closing band).
- Hairline rules do the structural work; a heavier navy rule opens each major block.
- Figures only in JetBrains Mono, tabular; everything else Hanken Grotesk.
- Chroma is reserved: blue for actions and sequence, green for released money, brick for captured money.
- Square sheet corners; 4px radius on controls; round only where the object is round (avatar, phone shell) or a chat message (bubble).
- Large, tight display type (800 weight, negative tracking) against a calm 1.0625 to 1.125rem reading size.

## Colors

A cool-neutral palette with one ink, one blue accent, one deeper navy for the two bands, and two muted money signals.

### Primary
- **Navy Ink** (`navy-ink`): text, focus outlines, caret, selection, the phone shell, outlines of secondary controls in the pictures, and the label of the white closing button. Page text is always navy ink or slate ink.
- **Ledger Accent** (`ledger-accent`, `--lg-accent`) and **Ledger Accent Hover** (`ledger-accent-hover`, `--lg-accent-hover`): the single brand accent. Used on primary actions (top bar Create studio, entry Create, the proposal card's approve action, the phone's booking button), the selected hold-picker option and selected phone time slot, step numerals, the status pill (text and border), the hero avatar disc, the 3px inset top rule on the entry sheet, and the nav link hover underline. Hover on buttons deepens to `ledger-accent-hover`.
- **Navy Band** (`navy-band`): the proof band and the closing band backgrounds, and the request-snippet block inside the ledger trace. Text is `paper-ground` or white, paragraphs `band-text-muted`, code `band-code-text`; rules are `hairline-on-navy` (35%) for openers and `hairline-on-navy-soft` (20%) for row and column dividers. Focus outlines flip to white inside both bands.

### Secondary
- **Ledger Green** (`ledger-green`): released money only (step-two figure, the example booking's release/refill amounts and total, the net total) and the green status pill variant (green text and border on `green-wash`).
- **Green Wash** (`green-wash`): fill behind the green status pill only. `--lg-green-soft` (#cfe6dd) is still declared on `.lg` but is unused by any rule in the build; it is not part of the system and should be removed or left alone, not spread.
- **Ledger Brick** (`ledger-brick`): captured money only (step-three figure, the captured amount in the ledger trace).

### Neutral
- **Paper Ground** (`paper-ground`): page background (also set on html/body so overscroll matches) and footer.
- **Sheet** (`sheet`): entry sheet, example card, phone screen, proposal card, ledger trace, trust strip, picker.
- **Stage Wash** (`stage-wash`): ground of the ruled stage behind each feature picture, with a 7% navy ruled line every 1.8rem.
- **Field White** (`field-white`): input backgrounds, text on accent and navy, and the closing-band button fill (hover `white-hover`).
- **Slate Ink** (`slate-ink`): secondary text, lede, labels, nav links, captions.
- **Placeholder Slate** (`placeholder-slate`): input placeholder only.
- **Message Wash** (`message-wash`): fill of the client message bubble in the proposal card. In the hero example card the bubble is a 8% navy tint (`rgba(20, 33, 61, 0.08)`) so it reads on the blank ruled rows.
- **Hairline / Hairline Strong** (`hairline`, `hairline-strong`): 16% navy for row, column and section rules; 85% navy for the 2px opener over feature rows and the rules ledger, the picker border, and 3px double total rules.

### Named Rules
**The Money-Only Chroma Rule.** Green and brick appear only on figures and status that represent money moving (released, captured, authorized or refilled in the example). They never decorate, never mark buttons, links or nav.

**The One Accent Rule.** There is exactly one action hue, `ledger-accent` (#2b4aa8), used sparingly: on the primary action of a block, the active state of a control, sequence numerals, the status pill, and a few signature marks (avatar, entry sheet top rule). Everything else emphatic stays navy ink. A second accent, or the accent used as a large fill or as text color on body copy, is not part of this world. On navy bands the primary action inverts to a white button instead of using the accent.

**The Two Navy Bands Rule.** Navy-band grounds are for the proof band and the closing band only, set in typography, hairline rules and one white button: no cards, icons or figures inside them. The rest of the page stays on paper and sheet.

## Typography

**Display / Body Font:** Hanken Grotesk (system-ui, sans-serif fallback), weights 400, 600, 700, 800 loaded from Google Fonts in `index.html`.
**Figure Font:** JetBrains Mono (ui-monospace fallback), weight 600 for figures, 400 for the request snippet.

**Character:** A friendly-grotesk voice for words and a ledger-clerk mono for numbers; heavy tight headlines make the page confident while the figures read as data.

### Hierarchy
- **Display** (800, clamp 2.75rem to 5.25rem at 5.6vw, 0.98, -0.035em): the hero headline only; balanced wrap.
- **Headline** (800, clamp 2rem to 3.25rem at 3.6vw, 1.04, -0.03em): every section heading (feature rows intro, proof band, your rules, closing CTA).
- **Feature title** (700, clamp 1.5rem to 2.125rem at 2.4vw, 1.12, -0.025em): the three feature-row headings.
- **Title** (700, 1.375rem, -0.015em): the three proof-band column headings.
- **Entry title** (700, 1.125rem, -0.01em): entry sheet heading, phone business name, rule names (dt) and the net-total label.
- **Lead / Body** (400): hero lede clamp(1.0625rem to 1.3125rem at 1.5vw), max 34rem; section intro, feature text (max 28rem) and CTA text 1.125rem, 1.55; band, never-ledger and rule text 1.0625rem, 1.55 to 1.6, measures 26rem to 28rem.
- **Body small** (0.9375rem): example-card text, nav links, proposal rows, trace row names, never-ledger values, entry alt link at 0.875rem, phone service row at 0.875rem, footer honesty note 0.875rem, example detail line 0.875rem.
- **Caption** (0.8125rem): figcaptions, phone sub line and policy, proposal note, trust-strip caption (700, uppercase, 0.08em), phone action text, trace code strings.
- **Label** (600 to 700, 0.75rem, 0.06em to 0.08em, uppercase): field labels, ledger column heads, trace column heads, proposal row heads, picker caption, figure captions, example-card speaker names and status pill. These label real fields, columns and states; they are not section kickers. Phone slot times are 0.75rem mono.
- **Figure** (JetBrains Mono 600, tabular-nums): feature ledger-line figures 1.25rem; net total clamp(1.5rem to 2rem at 2.4vw); example total 1.25rem; example rows, step numerals, picker values, trace amounts and never-ledger values 1rem (never-ledger values 0.9375rem uppercase with 0.04em tracking).
- **Code** (JetBrains Mono 400, 0.75rem, 1.6): the request snippet at the foot of the ledger trace.

### Named Rules
**The Figures-Only Mono Rule.** Mono is for numbers, step numerals, picker values, slot times, the never/only verdict words and the request snippet. Prose stays in the grotesk.

**The Heavy Heading, Calm Body Rule.** Headings are 700 to 800 with negative tracking and tight line height; reading text stays 400 at 1.0625 to 1.125rem. Nothing sits between them except the 700 subheads.

## Layout

A centered column, max width 88rem, gutters clamp(1.25rem, 5vw, 5rem). Sections pad clamp(3.5rem, 10vh, 6.5rem) vertically. The sticky top bar holds diamond mark, name, section nav (How it works, Why you can trust it, Your rules), account chip and the Create studio button. The hero is a two-track grid (1.1fr headline plus entry, 0.9fr example card), vertically centered, gap clamp(2rem, 5vw, 5rem), over a ruled-line ground (2.8rem pitch, 7% navy, masked to fade out by 85% of the height). The entry form is one row: studio name, first name, action (1fr, 0.7fr, auto).

Feature rows sit under a 2px strong rule, each row divided by a hairline, padded clamp(2rem, 6vh, 3.5rem). Below 62rem each row is one column; from 62rem it is a two-track grid, text 0.7fr and picture 1.3fr (reversed 1.3fr and 0.7fr on the alternating row, text placed second), gap clamp(1.5rem, 5vw, 5rem), vertically centered. The picture sits on a ruled stage with 1.5rem padding; on wide screens the phone and proposal scale up with `zoom: 1.3` and the trace with `zoom: 1.15` so the pictures fill the stage. Under each feature text is a ruled ledger line: a label left and a mono figure right, between two hairlines.

The proof band is a two-column head (1fr heading, 1fr never/only ledger, bottom-aligned, gap clamp(2rem, 5vw, 5rem)) above three typographic columns divided by 1px 20% light vertical hairlines under 35% top rules, each column padded clamp(1rem, 2.4vw, 2.25rem) sideways (first column flush left). The rules ledger is a two-column grid (1fr, 1.4fr) of name and description rows. The closing band is centered; the footer is a wrapped flex row with brand left and honesty note right.

Spacing rhythm is rem-based: 0.25, 0.625, 1, 1.25 and 2rem as working steps, row padding 1.125 to 1.25rem. Responsive: at 70rem the section nav hides; at 62rem the hero, feature rows, proof head and proof columns stack to one column (proof columns lose their vertical hairlines and gain a 1.5rem gap above each); at 40rem the entry form stacks with full-width buttons, example rows collapse to text plus figure with the speaker on its own line, the ledger and trace column heads hide, trace rows and proposal rows collapse, rule rows stack, and the picker goes full width with its caption on its own line.

## Elevation & Depth

Flat by default; depth is carried by rules, ground tone and the dark bands. Lifted elements and their exact shadows:
- **Entry sheet** (`box-shadow: inset 0 3px 0 #2b4aa8, 0 1px 0 rgba(20,33,61,0.06), 0 1.25rem 2.5rem -1.5rem rgba(20,33,61,0.28)`): the inset top rule is the accent.
- **Example booking card** (`0 1px 0 rgba(20,33,61,0.06), 0 2rem 3.5rem -1.75rem rgba(20,33,61,0.35)`). It has no second sheet behind it; blank ruled rows hold its space.
- **Proposal card** (`inset 0 3px 0 #14213d, 0 1.5rem 2.5rem -1.5rem rgba(20,33,61,0.4)`), **ledger trace** (`0 1.5rem 2.5rem -1.5rem rgba(20,33,61,0.4)`) and **phone shell** (`0 2rem 3rem -1.75rem rgba(20,33,61,0.5)`): the product pictures, lifted off their stage.

All shadows are soft, low-offset and negative-spread, never hard. The top bar is translucent paper (92%) with a 10px backdrop blur, the page's only blur.

### Named Rules
**The Lifted Sheets Rule.** Only the entry sheet, the example card and the three feature pictures lift. Feature text, ledger lines, rules, picker, trust strip and both bands stay on the page plane.

## Shapes

Square where the paper is (sheets, cards, pills, rules: radius 0); 4px (0.25rem) on interactive controls (inputs, all buttons, the hold picker container, the picture buttons inside the phone and proposal). Exceptions are objects that are round in the world: the avatar disc (50%), the phone shell (2.25rem outer, 1.75rem screen) and the client message bubble (0.75rem with a 0.1875rem tail corner). Rules are 1px, 2px (openers over feature rows and your rules), or a 3px double (example total, net total, the "Only" row of the never ledger at 60% light on navy).

## Components

### Top Bar
Sticky, translucent paper with a bottom hairline and blur. Name in 800 at 1.125rem. Nav links 600 at 0.9375rem in slate ink; hover turns navy with a 1px accent underline (0.15s). Create studio is a compact accent button (0.5rem 1rem). Nav hides below 70rem.

### Buttons
- **Shape:** 4px corners, weight 600.
- **Primary:** accent fill (`ledger-accent`), white text, matching border. Sizes: top bar 0.9375rem; entry 0.8125rem 1.25rem padding. Hover deepens to `ledger-accent-hover`; disabled uses progress cursor at 75% opacity.
- **On navy (closing band):** white fill, navy ink text, 1.0625rem, padding 0.9375rem 1.75rem; hover `white-hover`; white focus outline.
- **Focus:** 2px navy outline, 3px offset on all focusable elements (white inside the dark bands and on the selected picker option).

### Inputs / Fields
- **Style:** white fill, 1px navy border at 45% opacity, 4px radius, padding 0.75rem 0.875rem, navy caret; uppercase 0.75rem slate label above.
- **Focus:** the global 2px navy outline.

### Entry Sheet
Sheet fill, 1px hairline border, 3px inset accent top rule, square corners, max 40rem, padding clamp(1.125rem, 2vw, 1.5rem). Holds sign-in or studio list, then the single-row form with the accent create action.

### Example Booking Card (signature)
Labelled as an example in its figcaption ("Example booking. Amounts follow the hold you pick below."). Header: accent avatar disc, name and detail, and a status pill (square, 1px accent border and accent text, label type; green variant on green wash). Body: a ruled log whose five rows are present and ruled from the start (3.75rem minimum height each, no minimum height on the log), so the card never jumps and has no ghost sheet; only the writing in each row (speaker label, text, mono figure) fades and rises 0.5rem over 0.5s, one row at a time: hold authorized, a sick-child message in a tinted bubble, the proposal, release, waitlist refill. Footer: a 3px double rule with a bold total in green mono. The sequence advances every 1.9s, holds 4.2s at the end, then loops. Under reduced motion all writing is shown static.

### Trust Strip
A sheet-colored band with hairline bottom: one uppercase caption sentence then four plain 700-weight factual items (Orders v2 authorizations, Vault v3 saved wallets, Void, capture and refund, Agent Toolkit read-only) in a wrapped row. No logos or badges.

### Feature Rows
Three ordered rows under a 2px strong rule, alternating picture side. Text column: accent mono step numeral, feature title, 1.125rem body (max 28rem), and an inline ruled ledger line (uppercase label left, 1.25rem mono figure right, between hairlines; released green, captured brick, neutral navy; figures settle when the hold changes). Picture column: a ruled stage-wash stage holding one product picture with a 0.8125rem figcaption:
- **Phone booking screen:** navy shell (2.25rem radius, 0.6rem bezel), sheet screen with business name, a navy-outlined service row, mono time slots (selected slot accent), a policy line and an accent booking button.
- **Proposal card:** sheet with a 3px navy inset top rule, uppercase head, a tinted client-message bubble, a ruled definition list (5.5rem label column), and two 4px action buttons (approve in accent, decline outlined in navy).
- **Ledger trace:** sheet with uppercase column heads and ruled rows (event, mono code, mono amount; captured amount in brick), closed by a navy-band request snippet in 0.75rem mono.

### Proof Band
Full-bleed navy-band section. Head: a white headline on the left and a ruled never/only ledger on the right under a 35% light top rule: five rows, each a muted statement (1.0625rem) with a white uppercase mono verdict at the right (0.9375rem, 0.04em). Four rows end in "Never" ("The AI authorizes, captures, voids or refunds", "A charge above the hold or your fee", "A charge without your tap", "A charge because a client stayed silent"); the last row, "Money moves", ends in "Only on your tap", set in white 700 above a 3px double light rule. Below, three typographic columns (1px 35% top rule, 1.375rem white title, muted paragraph max 26rem) separated by 1px 20% light vertical hairlines. Typography and rules only.

### Hold Picker
A segmented group, 1px strong-rule border, 4px radius, clipped. A caption cell on the left, then mono value options divided by hairlines. Selected is solid accent with white text; hover is a 7% navy wash; 0.18s transitions on the ledger ease; inset focus outline. It drives every example figure on the page.

### Rules Ledger
Under a 2px strong rule: picker row, uppercase column heads, then a definition list of rule rows (700 name, slate description) separated by hairlines, closed by a net-total row under a 3px double strong rule with a green mono figure.

### Closing Band and Footer
Navy-band section echoing the proof band: centered white headline, muted 1.125rem text (max 34rem), one large white button. Footer on paper with a top hairline: brand (800) with slate tagline and the honesty note at 0.875rem.

### Motion
- **Settle:** figures and status pills fade up 0.4em with a 3px blur clearing, 0.45s on `cubic-bezier(0.16, 1, 0.3, 1)`.
- **Log reveal:** only the writing inside example rows fades and rises, 0.5s on the same ease; picker 0.18s; nav links 0.15s; smooth in-page scrolling.
- **Scroll reveal:** content is visible by default; once the observer is ready (`rv-on` on the root), sections not yet seen start at opacity 0 and 1.5rem down and fade up once over 0.8s on the same ease, then stay.
- Under `prefers-reduced-motion: reduce`: settle off, example writing static and fully shown, scroll reveal transition off, smooth scroll off.

## Do's and Don'ts

### Do:
- **Do** let hairline rules (16% navy) separate content; use the strong navy rule (2px) to open a new block.
- **Do** set every amount in JetBrains Mono 600 with tabular numerals.
- **Do** use `ledger-accent` (#2b4aa8) as the single action color: primary buttons, the active picker or slot state, step numerals, the status pill.
- **Do** reserve ledger green and brick for released and captured money respectively.
- **Do** keep sheet corners square and control corners at 4px.
- **Do** label illustrative content as an example and keep trust-strip and never/only items factual.
- **Do** honor reduced motion by showing the example static and disabling settle and scroll reveal.
- **Do** keep both navy bands to typography, hairline rules and one white button.

### Don't:
- **Don't** introduce color gradients, glows, hard offset shadows or a second action hue on this surface. (The faint repeating ruled lines on the hero and the picture stages are paper, not a gradient treatment.)
- **Don't** use green or brick for decoration, buttons or generic success and error states.
- **Don't** use the accent as a large fill, a band ground or body-text color.
- **Don't** set prose in the mono face.
- **Don't** add a third navy band or put cards inside the bands.
- **Don't** apply this palette to screens governed by `src/styles.css` without an explicit redesign of them.

## Not canonized

Pre-existing drift left as built, not recorded as rules: `--lg-green-soft` is declared and unused; superseded base rules earlier in welcome.css (navy button fills, the 21rem log minimum height, the `.lg-fig` grid block, the original three-column proof gap) remain beneath the final-pass overrides and are dead or partly dead; `.lg-cta button` and `.lg-cta button.primary` are duplicated overrides; the shared `--accent` token inside `.lg` still points to navy ink rather than `--lg-accent`.
