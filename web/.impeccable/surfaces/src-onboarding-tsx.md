---
version: 1
slug: "src-onboarding-tsx"
primary_target: "src/Onboarding.tsx"
related_targets: []
---

# Surface brief: Welcome (landing / create studio) at `/`

Mode: Persuade. Visitor: a solo studio owner (judge-legible). Action: create a studio (or sign in with Google). Proof: the hold lifecycle as the owner's own rules, shown as a ledger. No invented customers, stats or pricing; example amounts are labelled as an example studio.

## Direction contract

THESIS: The page is one ledger sheet. It owns "you set the rules, money moves only on your tap" and refuses the category-default vivid fintech hero with icon cards. It also refuses a hardcoded fee: the hold is the owner's setting.
OWN-WORLD: Cool paper (#f2f4f6 ground, #fbfcfd sheet), navy ink (#14213d), hairline ruled rows, muted green for released money, muted brick for captured money. Hanken Grotesk for headings and body, a tabular mono for figures only (data). No gradients, no glows, no offset shadows. Quiet, exact, trustworthy.
STORY: A visitor sees the promise, sees a hold they can size themselves (picker rewrites the ledger live), understands nothing is charged until they tap, and opens a studio from a ruled entry panel beside the headline.
FIRST VIEWPORT: Slim top bar with mark, name, account chip. Left: headline at display scale and the lede. Right, top-aligned with the headline: the entry panel (Google sign-in, Studio name, First name, Create studio). Below spanning full width: the ledger with a hold picker header and three ruled rows (the three steps), figures right-aligned. Primary action visible without scrolling at 1440x900.
FORM: Grounded direction "The Ledger", chosen by the user after a safer re-roll. seed: 545106540a0fbb24.
SIGNATURE: Hold picker (segmented, keyboard accessible) re-renders the example rows' amounts with a short number settle; rules draw in once on load.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
