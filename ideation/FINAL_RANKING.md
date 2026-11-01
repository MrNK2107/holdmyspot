# Final Ranking: independent adversarial judge

_2026-11-01. Final round. I simulate the full panel: 3 PayPal developer advocates, a PayPal engineer, an engineering manager, a senior PM, and a skeptical VC. I discounted refiner self-scores and re-checked the claims that scores hinge on (sources in section 6). Scores are judgment calls, not measurements._

Criteria:
- **T** Technological Implementation
- **D** Design
- **I** Potential Impact
- **N** Innovation
- **P** Presentation
- **F** Feasibility (solo, 10 days, sandbox)
- **U** User-requirement fit: real pain, broad non-dev audience, pitchable, PayPal central, AI meaningful

The first five are official. The tie-break is T. P(win) = probability of top-3 overall **or** any $5k category prize (Most Creative / Most Impactful / Best Demo Delivery / Best Use of PayPal+AI / Agentic Commerce), counting AG Grid 1st as $5k. The base rate is about 1% (roughly 500–1,000 real submissions for about 8 slots of $5k or more). A secondary Devpost listing shows only about 2,300 participants against the brief's 26k registrants, so the field may be smaller than assumed.

---

## 0. What I verified today, and how it moves scores

| Claim | Finding | Effect |
|---|---|---|
| Handshake: PayPal's in-person-pickup pattern | **Confirmed**, but the page says *"You must be an approved partner to use this integration"* and *"available to US partners only"*. Casual and business accounts must be enabled, with `PPCP` onboarding. *"This feature does not support seller protection."* | Strong alignment ("PayPal designed this"), but production is gated. |
| Handshake: Partner Referrals in sandbox | Several PayPal Community threads, including recent "URGENT … Onboard Sellers not working in sandbox" posts, report 403 / `MISSING_SCOPES` until PayPal enables the app. A PayPal reply says partner onboarding is limited to approved partners. | **Tier 1 onboarding is more likely to fail than the refiner's "Medium".** Expect Tier 2, which pre-links the seller's own credentials. A DevRel judge will read Tier 2 as "single merchant with a stub", and T drops to 7. |
| HoldMySpot: wallet vault review | The current "save for later" page says to **enable PayPal vaulting in the Developer Dashboard**. It requires risk data (FraudNet/Magnes) for CITs and Expanded Checkout approval only for cards. The page doesn't cover merchant-initiated charges on a vaulted PayPal wallet explicitly. | The vault gating is **lighter than the refiner feared**, so the policy risk is low. The real unknown is technical: a sandbox MIT `AUTHORIZE` with `vault_id`. That is Day-1 check #1. |
| Settled: dispute sandbox | Round-2 verification stands: create, require-evidence, adjudicate, offers. Four gaps remain open (UNDER_REVIEW transition, accept-offer webhook, `send-message` in INQUIRY, dispute after a partial refund). The source transaction in the docs is Send/Request paid by card, not Orders v2. | F stays low. "One thread into PayPal's case" is unproven. |
| Devpost look-alikes | No match found for a PayPal authorize-hold meetup with AI inspection, or for a PayPal no-show hold with an AI front desk. Visible hackathon entries: **PayPilot** (invoice agent), **Doorway** (agent storefront; its "holds" are inventory reservations, not PayPal authorizations). Other AI-escrow entries are crypto (AgentGuard, ETHGlobal). | Handshake N stays at 8 and HoldMySpot N at 7. Invoice-agent ideas (Duesday, Stall) stay penalised. |
| Commercial AI receptionists with deposits | 9 of 41 tools listed by Stork take deposits, and vendors say refunds and disputes are escalated to staff. | HoldMySpot's "agent with void/capture authority" is still a gap. "AI receptionist + deposits" alone is not. |

---

## 1. Score tables (all six)

### 1. HoldMySpot (refined): AI front desk, T−72h PayPal hold, refill-then-waive
| | Score | Reason |
|---|---|---|
| T | **8** | Vault (save during purchase / setup token), merchant-initiated `AUTHORIZE` with `stored_credential`, partial/final capture, void, reauthorize, idempotent webhooks and toolkit `create_refund`/`list_transactions`, all behind a deterministic policy engine, are rare and correct Payments v2 use. It isn't a 9 because it's one API family plus vault, and the MIT path is unproven in sandbox. |
| D | **8** | The Bryntum scheduler as the main screen, with money-state chips, refill dependency arrows and a time-travel slider, plus a policy split-view and a client phone sim, is a complete product with a visual centre of gravity. |
| I | **7** | P1 is documented on Square's own forum for years: card on file declined after the no-show, "no-show protection is a joke". P2 (owners can't bring themselves to charge) is vivid. But incumbents cover the mechanics, and the payer is a small merchant. |
| N | **7** | Refill-then-waive, holds that surface declines 3 days early, and prose-policy compilation with ambiguity questions are each new as a combination. Deposits, waitlists and AI receptionists all exist individually. |
| P | **8** | Empty chair → "kiddo threw up" voided live → "Late cancel. $0 lost. $0 charged." is three clean money outcomes that any non-technical judge gets in 20 seconds. Less cinematic than an outdoor two-phone scene. |
| F | **7** | Single device, simulated chat, verified fallbacks for every risky primitive (authorize at booking + reauthorize once). But the MUST list (vault + MIT + compiler + reader + refill + Bryntum + 3 evals) is about 20% too big and must be trimmed on Day 1. |
| U | **7** | Everyone who has booked a haircut gets it, PayPal holds are the mechanism, and the AI is necessary for prose policies and messy excuses. The adopting user is a solo merchant, not "everyone", which caps breadth. |
| **Official** | **38/50** | |
| **Total** | **52/70** | |
| **P(win)** | **~13%** | Best fits: Agentic Commerce (an agent with bounded void/capture authority) or Best Use of PayPal+AI. Sponsor: **Bryntum** (3 × $1k, the CEO judges, a thin lane). |

### 2. Handshake (refined): meetup hold + AI curb inspection + fake-payment check
| | Score | Reason |
|---|---|---|
| T | **7** | The Tier 1 design (Partner Referrals → AUTHORIZE with `payee.merchant_id` + auth-assertion → partial capture/void/reauth) would be an 8–9. But sandbox Partner Referrals is commonly 403 until PayPal enables it, so the realistic build is Tier 2 (seller's own creds pre-linked), which an engineer sees as a single-merchant stub. |
| D | **7** | Two linked mobile pages with honest status are clean, but a two-sided state machine (check-in, timers, consent records on both phones) is hard to polish solo. |
| I | **7** | FTC-scale losses ($2.1B social-media scams in 2025, $794M Facebook) and the confirmed Marketplace local-pickup protection gap are real. But production needs approved-partner status, the pickup feature is US-only with **no Seller Protection**, it's wallet-only, and it has two-sided cold start. |
| N | **8** | No PayPal-authorization meetup hold with vision inspection was found on Devpost (all look-alikes are crypto escrow), and the "is this PayPal email real?" check verified via `get_order` is fresh. |
| P | **9** | Fake email busted, "Held $340: safe to drive," curb inspection → $310 capture + $30 void, wrong-unit walk-away. The most memorable 3 minutes in the pool after 100 demos. |
| F | **5** | Partner Referrals gating (likely), two-device outdoor filming, a 60-pair vision eval built from scratch, and unproven partial-capture-then-void are four independent risks for one person. |
| U | **9** | Everyone has bought or sold locally, the fear of losing money is real, PayPal holding the money *is* the product, and the AI does an inspection a layperson can't. |
| **Official** | **38/50** | |
| **Total** | **52/70** | |
| **P(win)** | **~12%** | Best fits: Best Demo Delivery or Most Creative. Sponsor: Render only. High variance: about 20% if Tier 1 works on Day 1, about 8% if it ships as Tier 2. |

### 3. Settled (refined, ex-Casefile Resolve): two-sided order-problem resolution agent
| | Score | Reason |
|---|---|---|
| T | **8** | Orders, tracking, partial refunds, five Disputes actions, signed webhooks, Transaction Search and toolkit + custom tools behind a policy engine is the deepest surface. But the sandbox source transaction (Send/Request by card, not Orders v2) and four lifecycle gaps are unverified. |
| D | **7** | The buyer chat with a visible Resolution Promise is a real consumer moment, but the seller console + ledger + case timeline still reads as helpdesk software. |
| I | **7** | Sift (slow response causes disputes) and YouGov (53% won't rebuy after slow refunds) support a real two-sided pain. The adopter is still a small seller, and deflection can't be shown in 10 days. |
| N | **6** | Fini, Gorgias, Chargeflow/Justt and Visa's 2026 pre-dispute tools cover the parts, and toolkit dispute PRs #109/#118 show other builders are here. The "buyer-visible floor" is a policy idea, not a new interaction. |
| P | **7** | Two waiting people is a good hook, but "INR inquiry → send-message → 202 Accepted" is admin-dense for non-technical judges, and a cracked mug is lower stakes than a $340 phone or a stood-up stylist. |
| F | **5** | An LLM, vision, policy engine, dispute lifecycle with multi-minute sandbox delays and one-dispute-per-transaction retakes, plus an eval with a second rater, is the most fragile recording in the pool. |
| U | **6** | A real complained-about pain, and PayPal is central, but you have to explain disputes before it lands, and a PM may still read it as "a seller's bot near Buyer Protection." |
| **Official** | **35/50** | |
| **Total** | **46/70** | |
| **P(win)** | **~9%** | Best fit: Best Use of PayPal+AI (depth). Sponsor: AG Grid. |

### 4. Stall (with round-2 fix: real vendor footage + first-person evidence)
| | Score | Reason |
|---|---|---|
| T | **6** | Toolkit invoicing (deposit, QR, reminders, `record_payment`), catalog and reporting is broad but wrapper-level, with no rare primitive. |
| D | **7** | A voice-first mobile flow with a spoken daily summary is distinctive and complete. |
| I | **6** | Informal vendors are a huge, sympathetic group, but the pain is disorganisation, not loss, and they already use cash, Venmo or Square. |
| N | **5** | Under the multilingual voice skin it is the "AI invoice agent" lane, which PayPilot already occupies in this hackathon. |
| P | **8** | A Spanish voice note becoming a Spanish PayPal invoice, then a QR scan at a stall, is warm and memorable, more so with a real vendor. |
| F | **7** | STT plus invoicing is easy. Invoice locale and live-voice misfires are the risks. |
| U | **7** | Broad, non-technical and pitchable with PayPal central, but the complaint evidence is thin. |
| **Official** | **32/50** | |
| **Total** | **46/70** | |
| **P(win)** | **~5%** | Best fit: Best Demo Delivery dark horse. |

### 5. Signed Off (with round-2 fix: one persona, honest "strongest evidence filed")
| | Score | Reason |
|---|---|---|
| T | **7** | Milestone invoices, Disputes provide-evidence, refunds and webhooks are coherent, but the payoff depends on the same unverified sandbox dispute transitions as Settled. |
| D | **7** | Job timeline → logged sign-off → evidence packet is a complete loop that starts *before* the dispute. |
| I | **6** | Artists' INR/chargeback fear is real, and Seller Protection does accept system-log evidence for intangibles, but the audience is a niche and the outcome is at PayPal's discretion. |
| N | **7** | Classifying "omg yes!!" as a logged delivery sign-off is a genuinely fresh LLM job on a payments problem. |
| P | **7** | Emotional, but the honest wording ("strongest evidence filed") removes the "You kept $120" payoff. |
| F | **5** | Dispute-sandbox fragility plus a file-delivery locker subsystem. |
| U | **6** | Non-dev and loudly complained about, but a creator niche, not a broad audience. |
| **Official** | **34/50** | |
| **Total** | **45/70** | |
| **P(win)** | **~6%** | Best fit: Most Impactful. |

### 6. Duesday (with round-2 fix: cash-sheet vision hero + AG Grid pivot)
| | Score | Reason |
|---|---|---|
| T | **7** | It uses the newest toolkit invoicing tools (series, rules, `record_payment`) plus Payouts and Transaction Search. Solid, but wrapper-level. |
| D | **7** | A members-by-months AG Grid pivot plus cash-sheet capture is coherent admin software. |
| I | **5** | Chronic annoyance, not money lost. PayPal Pool Money, MoneyMinder and Cheddar Up exist. |
| N | **5** | Invoice-and-chase agents are already in the field (PayPilot). Only handwritten-sheet OCR is fresh. |
| P | **6** | A crumpled cash sheet flipping invoices to paid is a nice beat with no stakes. |
| F | **8** | A mature sandbox and toolkit-native, with a handwriting eval as the only hard part. |
| U | **7** | A broad non-dev audience (PTA treasurers), but a mild pain. |
| **Official** | **30/50** | |
| **Total** | **45/70** | |
| **P(win)** | **~6%** | Mostly the AG Grid 1st lane. |

---

## 2. Attacks on the top contenders

### HoldMySpot
- **Policy and legality.**
  - Vaulting a PayPal wallet in production needs dashboard enablement plus FraudNet risk data for CITs. Cards need Expanded Checkout. That's normal merchant gating, not partner gating.
  - Capturing a cancellation fee from a pre-disclosed authorization is ordinary merchant behaviour, but service fees get no Seller Protection, so a client "unauthorized/didn't agree" dispute is the real exposure. The patch (stored policy-hash consent, `note_to_payer`, explicit consent copy) is adequate.
  - MIT on a vaulted *wallet* with `UNSCHEDULED_POSTPAID` is documented in the Orders schema samples, but sandbox behaviour is unverified. **Risk: Low–Medium.**
- **Has this been done?**
  - Square, Fresha, Booksy and Vagaro do deposits, card-on-file fees and waitlists.
  - AI receptionists take deposits in 9 of 41 tools.
  - No Devpost look-alike found.
  - The defensible deltas are judgment over free-text excuses, T−72h decline surfacing, and refill ⇒ void the canceller.
- **Q&A it must survive:**
  1. *"Square does this."* Answer ready: judgment, early decline, refill-then-waive, DM-bookers with no software.
  2. *"Why would a no-software nail tech adopt a scheduler?"* **Weak answer so far.** Lead with the booking link in the Instagram bio and keep the scheduler for the owner's view only.
  3. *"Does MIT on a vaulted wallet actually work?"* Must be shown with real IDs.
  4. *"An LLM charges a grieving client?"* Answer ready: the engine refuses emergency branches without the owner.
- **Memorability after 100 demos:** medium-high. "Late cancel. $0 lost. $0 charged." is a quotable line, and the Bryntum arrow is a distinctive visual. It's not as cinematic as the curb scene.

### Handshake
- **Policy and legality.**
  - The pickup integration is **approved-partner and US-only**, sandbox Partner Referrals is often 403 until enabled, and the feature has **no Seller Protection**.
  - Option C (Handshake as merchant + Payouts) is correctly rejected as money transmission.
  - Tier 2 is honest but weak, so the production story is "license to an existing marketplace partner." **Risk: High for T and I, low for legality**, since the design never touches funds.
- **Has this been done?**
  - PayPal itself documented the primitive (good alignment).
  - Look-alikes are crypto escrow.
  - Offerup/Facebook checkout with shipping exists, but not local-pickup authorization plus inspection.
- **Q&A:**
  1. *"How does a personal-account seller get paid?"* There's an answer, but if the demo is Tier 2 the answer is "in theory".
  2. *"Why would a seller send this instead of taking cash?"* The fake-email plus no-show filter answer is decent.
  3. *"AI said it matched and the phone died."* Advisory only, with a buyer-confirms tap.
  4. *"Buyers without PayPal?"* Locked out (wallet-only).
- **Memorability:** the highest in the pool. Two phones at a curb and a $30 hold released will be remembered.

### Settled
- **Policy and legality.** A seller-deployed agent inside PayPal's case thread is PM-sensitive. The "never discourage a case" invariant helps. Sandbox-only calls must be labelled. **Risk: Medium (optics) and High (sandbox gaps).**
- **Has this been done?** Fini (pre-dispute + evidence), Gorgias, Chargeflow/Justt, Visa 2026 tools, toolkit dispute PRs. The combination is fresh, but the parts are crowded.
- **Q&A:** *"Isn't this just Fini for PayPal?"* There's only a partial answer. *"Does the 202 ever resolve, which webhook fires?"* Unknown until the spike.
- **Memorability:** medium-low. A cracked mug and a dispute inbox blur into many helpdesk demos.

---

## 3. Ranked top 5

| Rank | Candidate | T | D | I | N | P | F | U | Official /50 | Total /70 | P(win) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **1** | **HoldMySpot** | 8 | 8 | 7 | 7 | 8 | 7 | 7 | **38** | **52** | **~13%** |
| 2 | Handshake | 7 | 7 | 7 | 8 | 9 | 5 | 9 | 38 | 52 | ~12% |
| 3 | Settled | 8 | 7 | 7 | 6 | 7 | 5 | 6 | 35 | 46 | ~9% |
| 4 | Stall | 6 | 7 | 6 | 5 | 8 | 7 | 7 | 32 | 46 | ~5% |
| 5 | Signed Off | 7 | 7 | 6 | 7 | 7 | 5 | 6 | 34 | 45 | ~6% |
| 6 | Duesday | 7 | 7 | 5 | 5 | 6 | 8 | 7 | 30 | 45 | ~6% |

On the 70-point total, Stall ranks above Signed Off on F and U. On the official 50, Signed Off scores higher (34 vs 32).

**Honesty about noise:** HoldMySpot and Handshake **tie exactly** on the official 50 and on the 70-point total, and differ by 1 point of P(win). **The gap is inside noise.** HoldMySpot wins on the rules' tie-break (T 8 vs 7) and on variance. Settled is clearly third (−3 official), and positions 4–6 are interchangeable.

---

## 4. Winner: HoldMySpot

**Why it beats Handshake (#2):**
1. **The official tie-break is T, and HoldMySpot's T is the one that survives Day 1.** Every primitive has a verified fallback (authorize at booking + reauthorize once). Handshake's T depends on Partner Referrals in sandbox, which community threads say is usually blocked until PayPal enables it. Tier 2 makes the engineer's first question ("who's the merchant?") land.
2. **There's no production-legitimacy hole.** The salon *is* the merchant, with no partner approval and no "not covered by Seller Protection" footnote on PayPal's own page.
3. **Feasibility 7 vs 5.** One person, one device, no outdoor two-phone shoot. A polished 7 beats a rough 9 in Devpost judging, because Design and Presentation are judged on what ships.
4. **Two prize lanes:** Agentic Commerce or Best Use of PayPal+AI, plus the Bryntum sponsor lane where the scheduler is the product. Handshake's sponsor lane is only Render credits.

**What Handshake does better, conceded:** user-requirement fit (9 vs 7), memorability, and Most Creative / Best Demo odds. If the user weights the "broad non-developer audience" requirement above winning odds, Handshake is the defensible pick. **Switch rule:** if on Day 1 a Platform sandbox app completes Partner Referrals for a *personal* seller **and** AUTHORIZE with `payee.merchant_id` works, Handshake's T becomes 8 and F becomes 6, and it overtakes. The engines share authorize → AI decision → void/partial capture, so keep that layer portable.

**Why it beats Settled (#3):** +3 official points from Innovation and Presentation, much lower sandbox risk (Settled's hero depends on dispute-lifecycle transitions that are still unverified), and no PM optics problem.

**Winner's one-line pitch:**
> *"HoldMySpot is the front desk solo pros can't afford: it reads 'so sorry, can't make it' texts, applies your own cancellation policy fairly, and uses a PayPal hold placed 3 days ahead so that a no-show either gets refilled from the waitlist or paid for, and nobody has to have the awkward conversation."*

Tagline: **"Fair, without the fight."**

**Required scope cuts (to protect F = 7):**
- Evals: 15 policies (not 30), 80 messages (not 150), 20 waitlist pairs.
- Keep exactly two on-screen failures: T−72h hold declined, and refill candidate declined.
- Drop the partial-refill pro-rating.
- Make the Instagram-bio booking link the client's entry point. The owner's Bryntum screen is the back office.

---

## 5. Three make-or-break Day-1 checks (Nov 2, decide by 6pm)

1. **Merchant-initiated hold on a vaulted wallet.**
   - Steps: Vault-enabled sandbox app → buyer-present vault (setup token or `store_in_vault: ON_SUCCESS`) → server-only Orders v2 `intent: AUTHORIZE` with `payment_source.paypal.vault_id` + `stored_credential {MERCHANT, SUBSEQUENT, UNSCHEDULED_POSTPAID}`.
   - Pass: an authorization ID is returned and `PAYMENT.AUTHORIZATION.CREATED` arrives.
   - Fail: switch to authorize-at-booking + reauthorize-once, and seed 3 authorizations today for the Nov 6+ reauthorize shot.
2. **Fee capture and release.**
   - Steps: partial capture with `final_capture: true` → `GET` the authorization (is the remainder released?). Then the alternative: partial capture with `final_capture: false` → void.
   - Also check: does `PayPal-Mock-Response INSTRUMENT_DECLINED` work on authorize? It's needed for the hero failure.
   - Fail: set the hold equal to the fee so a full capture is always used, and stage the decline with an unfunded sandbox account.
3. **Bryntum Scheduler licence for a public repo plus a hosted Render demo.**
   - Confirm the trial/hackathon terms and get a hello-world working with money-state event styling.
   - Fail: switch to FullCalendar. You lose the sponsor lane but keep the product, and the main grand-prize odds are unaffected.

(In parallel, a 30-minute side check: try Partner Referrals on a Platform sandbox app. If it works for a personal seller, re-open the Handshake decision per the switch rule above.)

---

## 6. Sources checked this round
- https://developer.paypal.com/limited-release/commerce-platform/v2/payment/enable-in-person-pickup/ (approved partner, US only, no Seller Protection, PPCP, casual + business)
- https://www.paypal-community.com/t5/Sandbox-Environment/Commerce-Platform-sandbox-gt-Partner-Referrals-v2-gt-ERROR-403/m-p/2087950 ; https://www.paypal-community.com/t5/Sandbox-Environment/URGENT-Marketplaces-and-Platforms-Onboard-Sellers-not-working-in/m-p/3028070 ; https://www.paypal-community.com/t5/REST-APIs/Partner-Referrals-API-call-AUTHORIZATION-ERROR/m-p/2753558 (sandbox Partner Referrals gating)
- https://developer.paypal.com/docs/checkout/save-payment-methods/purchase-later/ (vault enablement in dashboard; risk data for CIT; Expanded Checkout only for cards)
- https://glama.ai/mcp/servers/cloudy070/doorway-paypal-ai-hackathon-2026/tree (Doorway: agent storefront; inventory holds, not PayPal authorizations)
- https://kelaenderkoe.pages.dev/float-https-devpost.com/software/agentgaurd ; https://ethglobal.com/showcase/ai-trustless-escrow-eg79v (crypto escrow look-alikes)
- https://www.stork.ai/blog/ai-receptionist-deposits-no-shows-2026 (AI receptionists with deposits)
- https://devpost.com/prathmeshadsod/challenges (secondary listing: about 2,277 participants)
- Prior rounds' sources: round2_judge1.md, round2_judge2.md, round3_*.md
