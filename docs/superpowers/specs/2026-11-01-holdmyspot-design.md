# HoldMySpot: design

_Written 2026-11-01 for the PayPal "Build What's Next with PayPal and AI" hackathon (Devpost). Deadline Nov 13, 2026 01:30 IST; submit by Nov 12; rough early submission Nov 5 for the eligibility review._

Background and evidence: `ideation/round3_holdmyspot.md` (refined concept, PayPal facts with sources, the video script) and `ideation/FINAL_RANKING.md` (scores and attacks). This document is the build-ready description. Where it differs from round 3, this document wins.

---

## 1. Intent

**One line:** HoldMySpot is an AI front desk for solo appointment pros who book by text or Instagram DM. It turns their plain-English cancellation policy into rules, places a PayPal hold 3 days before each visit, reads "can't make it" messages, and tries to refill the slot from the waitlist before anyone is charged.

**Tagline:** *Fair, without the fight.*

**Why it exists:**
- Card-on-file no-show fees fail exactly when needed; Square's own forum has years of "card declined after the no-show" threads.
- Owners don't enforce their own policies out of guilt (the viral stylist with 27 cancellations, ~$4,000, "never charged once").
- When fees *are* enforced, they're applied rigidly (a client charged after their child's fever).
- HoldMySpot gives the owner judgment, guaranteed funds, and a refill-first rule, so most cancellations end with nobody losing.

**Why it wins (what the judges must see):**
1. Uncommon, correct PayPal use: vault, merchant-initiated authorize, void, partial capture, reauthorize, idempotent webhooks.
2. AI that is necessary (prose policies, messy excuses, free-text waitlists), with **no access to money**.
3. A measured eval, and failure paths shown on screen.
4. A 3-minute video with three clear money outcomes, ending on "Late cancel. $0 lost. $0 charged."

**Success:** a top-3 or category prize (target: Best Use of Agentic Commerce, or Best Use of PayPal + AI), plus the Bryntum sponsor prize.

---

## 2. Goals, non-goals, anti-goals

**Goals**
- A hosted, working sandbox demo that a judge can click through without help.
- Every money movement is real PayPal sandbox traffic with visible IDs.
- The three hero flows (excused, refilled, no-show) and two failure paths work end to end, repeatably, from a seed script.
- A README a PayPal engineer respects: architecture, "where we refused to use AI", "what broke", production gating, run-in-5-minutes.

**Non-goals (stated in the README as "next")**
- Real SMS, WhatsApp or Instagram DM. A phone-frame **message simulator** stands in.
- Cards and Venmo. **PayPal wallet only.**
- Charging the service price at checkout (the client pays at the visit any way they like; we only hold the fee).
- Client accounts, multi-location, analytics, voice, dispute evidence submission, upstream toolkit PR.
- Pro-rated fees for partial refills (cut from round 3).

**Anti-goals (failure even if it "works")**
- **The LLM can move money.** It never calls PayPal and never produces an amount.
- **A wrongful charge on an emergency.** Emergency, medical or bereavement branches never capture without an owner tap.
- **Pitching deposits.** Square, Fresha and Booksy do deposits; we pitch judgment, early decline detection, and refill-then-waive.
- **Fake demo money.** No mocked PayPal responses in the hero flows (the decline failure uses PayPal's own negative-testing header, labelled as such).
- **Scope that doesn't finish.** A polished smaller build beats a rough complete one.

---

## 3. Users and surfaces

| Surface | User | What it is |
|---|---|---|
| **Owner console** (desktop) | Solo pro (demo persona: **Priya**, home-studio nail tech) | Bryntum Scheduler main screen with money states, approval cards, policy editor, money timeline, eval page |
| **Booking page** (mobile) | Client | The link in the owner's Instagram bio: pick a service and time, read the plain-English policy, approve PayPal |
| **Message simulator** (mobile frame) | Client and waitlisters | A fake text thread per person; the owner console and simulator update live |

The scheduler is the **owner's** view. The client never installs anything: the entry point is the bio link (answer to the judge question "why would a no-software nail tech adopt a scheduler?").

---

## 4. Core flows

### 4.1 Setup: policy compiler
1. The owner pastes their policy in prose.
2. The AI compiles it into typed `rules.json` and lists **ambiguities** as questions ("Does a sick child count as an emergency?").
3. The owner answers each question; the answer is merged into the rules.
4. The owner approves. Rules are versioned and hashed. The plain-English summary shown to clients is generated from the **approved rules**, and its hash is stored on every booking.

Split view: prose on the left with highlighted source spans, compiled rules on the right.

### 4.2 Booking and the hold
| Visit is | PayPal flow |
|---|---|
| ≤ 72h away | Buyer-present: Orders v2 `intent: AUTHORIZE` with `store_in_vault: ON_SUCCESS` → authorize. Hold live now; wallet vaulted. |
| > 72h away (default) | At booking: vault only (Vault v3 setup token → payment token), nothing held. At T−72h: server creates + authorizes an order with `vault_id` and `stored_credential {MERCHANT, SUBSEQUENT, UNSCHEDULED_POSTPAID}`. |
| Fallback if MIT fails in sandbox | Authorize at booking (buyer-present), reauthorize once on day 4+; > 29 days out gets a buyer-present approval link at T−72h. |

Hold amount = the policy fee (e.g. $20), not the service price. Consent copy at vaulting names the amount and timing.

### 4.3 Client messages
1. The message reader returns `{intent, reason, proposed_time, confidence, evidence_span}`.
2. Low confidence → one clarifying question; nothing touches money.
3. The agent calls `request_settlement(booking_id, proposed_branch, evidence_span)`. The **policy engine** decides.
4. Owner mode: **"Ask me first"** (default in the demo) turns every capture into an approval card with a one-line reason; **"Autopilot"** acts directly except on protected branches.

### 4.4 Settlement outcomes
| Case | Money |
|---|---|
| Attended | Void |
| Cancelled outside the fee window | Void |
| Excused by policy (e.g. first dependent-illness in 6 months) | Void; agent offers new slots; drag/accept reschedules |
| Late cancel or no-show | `PENDING_REFILL` → refill attempt (4.5) |
| Refilled | Void the canceller's hold, "your spot was filled, $0" |
| Not refilled by cutoff | Capture the fee (approval card in "Ask me first") |
| Owner relents after capture | Refund (Agent Toolkit `create_refund`) |

### 4.5 Waitlist refill
1. Waitlist entries are free text; the AI parses them into constraints.
2. Code filters by service, duration and time window; the AI ranks ties and writes the offer.
3. Offer goes to the top 3 in parallel; first YES claims.
4. The claimer gets a new hold (MIT if vaulted, else a one-tap approval link with a 10-minute timer).
5. **The slot is filled only when the claimer's authorization webhook arrives.** Claims are idempotent per slot.
6. If the claimer's hold is declined, move to the next candidate.

---

## 5. Architecture

```
 Client booking page ─┐                         ┌─ PayPal sandbox
 Message simulator ───┼─► API server ─► Policy ─┤   Orders v2, Payments v2,
 Owner console ───────┘      │          engine  │   Vault v3, Webhooks,
                             │       (decides    │   Agent Toolkit (refund,
                             ▼        & calls)   └─  list_transactions)
                          AI layer (labels only)
```

**The rule that matters:** AI tools have no money parameters. The engine is the only caller of PayPal write endpoints.

- **AI tools:** `compile_policy`, `classify_message`, `parse_waitlist_entry`, `rank_and_draft_offer`, `draft_reply`, `request_settlement`.
- **Engine invariants:** amount ≤ authorized amount; amount ≤ policy max; no capture below confidence τ; no capture on emergency/medical/bereavement without owner; every PayPal write carries a `PayPal-Request-Id`.
- **Money tools** (engine only, Agent-Toolkit-shaped): `authorize_with_vault`, `capture_authorization`, `void_authorization`, `reauthorize_authorization`. Toolkit used directly for `create_refund` and `list_transactions`.
- **Booking state machine** (deterministic): `BOOKED → VAULTED → HELD → {ATTENDED, CANCELLED_EARLY, EXCUSED, PENDING_REFILL → {REFILLED, CHARGED}}`, plus `HOLD_FAILED`. Money states shown on the scheduler: none / vaulted / held / pending-refill / voided / captured / failed.
- **Webhooks:** authorization created/voided, capture completed/denied/refunded, vault token created. Deduplicated by event ID; duplicates are logged as "duplicate, ignored".
- **Demo clock:** the server has a controllable clock. The owner console's **time-travel control** jumps to "T−72h" or "T+10m" and fires due jobs. Real scheduled jobs use the same code path.
- **Audit log:** every AI output, engine decision, PayPal call and webhook, viewable per booking as a money timeline.

---

## 6. Stack (my calls; overridable)

| Piece | Choice | Why |
|---|---|---|
| Language | TypeScript everywhere | One language; PayPal Agent Toolkit has a TS package |
| Frontend | React + Vite | Bryntum Scheduler has an official React wrapper |
| Scheduler | **Bryntum Scheduler** (fallback FullCalendar if the licence blocks a public repo/hosted demo) | Sponsor lane; the Bryntum CEO judges |
| Backend | Node + Fastify | Small, fast, good for webhooks + SSE |
| Live updates | Server-Sent Events | Console and simulator update without polling |
| Database | Postgres (Render managed) via a light query layer; SQLite locally | Free on Render; durable demo state |
| AI | Claude (`claude-sonnet-5-5`) via the Anthropic SDK, structured output through tool schemas | Strong at structured extraction; named in the Devpost "Tools" section |
| Hosting | Render (one web service + Postgres), `render.yaml` | Required hosted demo; Render sponsor lane |
| Licence | MIT | Devpost requires an open-source licence |

---

## 7. Evaluation (trimmed from round 3)

| Set | Size | Metric |
|---|---|---|
| Policy compiler | **15** real public cancellation policies (URLs logged), hand-labelled gold rules; 10 scenario cards each (150 decisions) | **Decision agreement** (% identical money outcomes, compiled vs gold), before and after owner answers; ambiguity recall on seeded ambiguous clauses |
| Message reader | **80** labelled messages (30 dev / 50 held-out, frozen before tuning), incl. **10 injection attempts** | Macro-F1 on intent and reason; cost-weighted errors (wrongful charge = 3× wrongful waiver); abstain rate; **injection money effects = 0** |
| Waitlist matcher | **20** entry–slot pairs | Precision@1 |

Limitation stated: one labeller (the author). Results go in the README and appear for ~6 seconds in the video. Eval runs from one command.

---

## 8. Failure paths

**On screen in the video (two):**
1. **T−72h hold declined** (PayPal negative-testing `INSTRUMENT_DECLINED`, labelled). Event turns red: "Hold failed: 3 days to fix." Client gets a re-approval link; on approval it turns blue. Caption: "Square finds out after the no-show. We find out 3 days early."
2. **Refill candidate's hold declined** → automatically offered to the next candidate.

**In the README and the money timeline:** duplicate webhook ignored; low-confidence message → clarifying question; prompt injection blocked with zero money effect; capture after the honor period → reauthorize first, honest error if refused.

---

## 9. The video (3:00 max)

Follow the beat sheet in `ideation/round3_holdmyspot.md` §6: cold open (empty chair, buzzing phone) → the 27-cancellations stat as on-screen text with source → policy compile → booking + PayPal approval → time-travel to T−72h with failure 1 → hero 1 excused + void + reschedule → hero 2 refill with failure 2 → "Late cancel. $0 lost. $0 charged." → hero 3 no-show capture via approval card → injection blocked + eval table → architecture frame. No copyrighted footage or music.

---

## 10. Schedule

| Day | Date | Work |
|---|---|---|
| D1 | Nov 2 | **Spikes** (below). Seed 3 authorizations for a real reauthorize on Nov 6+. Decide architecture by evening. Skeleton deployed on Render. |
| D2 | Nov 3 | Data model, state machine, demo clock, webhooks + dedupe, audit log |
| D3 | Nov 4 | Booking page, vault, buyer-present authorize, T−72h MIT job |
| D4 | Nov 5 | Policy compiler + engine; **rough early submission** (repo, licence, placeholder video) |
| D5 | Nov 6 | Message reader, approval cards, simulator; real reauthorize on camera |
| D6 | Nov 7 | Waitlist refill |
| D7 | Nov 8 | Bryntum console polish, money states, arrows, time travel |
| D8 | Nov 9 | Evals + failure paths |
| D9 | Nov 10 | README, deploy hardening, record footage |
| D10 | Nov 11 | Edit video, final submission |
| Buffer | Nov 12 | Fixes only |

**Day-1 spikes (each with its fallback):**
- MIT authorize with a vaulted wallet → fallback: authorize at booking + reauthorize once.
- Partial capture with `final_capture: true` releases the remainder? → fallback: hold = fee so captures are always full; or void after partial capture.
- `INSTRUMENT_DECLINED` mock works on authorize? → fallback: stage the decline on capture.
- Bryntum licence allows public repo + hosted demo? → fallback: FullCalendar (lose the sponsor lane only).
- Agent Toolkit `create_refund` + `list_transactions` against sandbox.

**Cut order if behind:** (1) waitlist-matcher eval, (2) reschedule by drag, (3) Autopilot mode, (4) Vault v3 setup-token path (use authorize-at-booking only), (5) Bryntum → FullCalendar. Never cut: the three hero flows, the engine/AI boundary, failure path 1, the video.

---

## 11. Constraints

- PayPal sandbox only. Production gating (wallet vault eligibility review, FraudNet risk data) is documented in the README, not built.
- Public GitHub repo with all source and a visible licence; Bryntum library not committed if its licence forbids it.
- Hosted demo on Render; README run instructions as backup.
- YouTube video under 3 minutes, public, shows it running.
- No AI co-author attribution in commits. Devpost "Tools" section names the model and how it's used.
- Solo builder, about 10 working days.

## 12. Decisions settled after the builder review (my calls; flag any you disagree with)

**12.1 Hosted demo is per-visitor, not shared.**
- Each visitor to the hosted demo gets their own **demo workspace**, cloned from the seed: its own bookings, waitlist, audit log and clock. A "Reset demo" button re-clones it.
- Every table carries `workspace_id`.
- Every PayPal order carries the workspace and booking in `custom_id`, so incoming webhooks route to the right workspace.
- The README publishes the **sandbox** personal-account logins (fake money), so judges can click "Approve with PayPal" themselves.
- The seed also includes pre-vaulted clients, so the hero flows run even if a judge skips the PayPal login.

**12.2 Failure path 1 still happens at T−72h, even under the fallback.**
- **Primary path:** the T−72h merchant-initiated authorize is declined.
- **Fallback path** (MIT doesn't work in sandbox): the hold is authorized at booking. At T−72h the engine **reauthorizes** it to start a fresh honor period; reauthorizing is allowed from day 4, so this works for any booking made 4 or more days ahead. The staged decline happens on that reauthorize.
- Either way the story ("we find out 3 days early") and the caption stay. Bookings made under 4 days ahead are already inside the honor period.

**12.3 The owner marks attendance, and silence never charges anyone.**
- At start +10 minutes, the console asks the owner: "Did Sam show up?" The answers are **Arrived** (void the hold) or **No-show** (start the refill/charge flow).
- If the owner doesn't answer, the hold simply stays in place. Reminders repeat. At end of day the booking moves to "Needs review". **There is never an automatic charge or an automatic void.**
- **Every capture needs one owner tap, in every mode.** Autopilot only automates the non-charging outcomes: voids, excused cancellations, refill offers and replies.
- The pitch still holds: the owner taps once and never has the awkward conversation.

## 13. Left to the builder
- File/folder layout, ORM or query library, component structure, styling system.
- Exact prompts and tool schemas, as long as outputs match §4 and invariants hold.
- Seed data (Priya, 3 services, ~12 bookings in a week, 3 waitlisters, 4 sandbox personal accounts).
- How the time-travel control looks.
