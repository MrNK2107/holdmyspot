# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Solo appointment professionals (e.g. a one-chair nail studio owner like "Priya") who book by text and Instagram DM and lose money to no-shows and late cancels, but hate enforcing fees on regulars. Secondary audience: hackathon judges/reviewers who must grasp the PayPal mechanism quickly. Landing page is pro-first, judge-legible.

## Product Purpose
HoldMySpot is an AI front desk that places a PayPal authorization (hold, not a charge) on every booking, reads "can't make it" texts the way a person would, refills cancelled slots from a waitlist, and only moves money when the owner taps. Success: an owner understands it and creates a studio in under a minute.

## Positioning
Fair, without the fight. "Hold the fee, not the grudge." The AI only labels and proposes; a deterministic engine enforces the owner's approved rules; no capture without the owner's tap; silence never charges.

## Operating Context
Runs on the real PayPal sandbox (Orders v2 AUTHORIZE, Vault v3, merchant-initiated authorization 72h out, void/capture/refund). Studios saved in Postgres; optional Google sign-in; no password.

## Capabilities and Constraints
Landing at `/` has: sign-in with Google (when configured), a "Create your studio" form (studio name, first name), and an honest status note about sandbox/AI/storage config. Behavior and the meaning of copy must be preserved. Do not invent customers, testimonials, stats, or pricing.

## Brand Commitments
Name HoldMySpot (diamond mark). Headline "Hold the fee, not the grudge." Tagline "Fair, without the fight."

## Evidence on Hand
PITCH.md, docs/DEVPOST_SUBMISSION.md; product facts from the pitch ($20 hold, ~1 in 25 no-show, ~1 in 9 late cancel are the pitch's own scenario numbers). No real customer testimonials exist; do not fabricate.

## Product Principles
1. Money moves only when the owner taps.
2. Fair to the regular, fair to the owner.
3. Show the mechanism, not a claim.

## Accessibility & Inclusion
Mobile-first booking audiences; keep contrast and focus states solid.
