# Round 2, Judge 1: the PayPal developer-advocate and engineering seat

_2026-11-01. I score as PayPal's DevRel and engineering judges would (Jo Franchetti, Eddie Jaoude, Marco Podien, Karthik Ravi, Himraj Singh, Nathaniel Olson): harshly and independently. My lens:_
- _Does it use PayPal deeply, correctly and in a way that holds up in production?_
- _Are the unhappy paths shown?_
- _Would the repo survive a DevRel judge opening it?_
- _Does the 3-minute video make a non-technical viewer feel the pain?_

_Scores are judgment, not measurement._

## 0. What I verified today (things scores depend on)

| Claim | Status | Source |
|---|---|---|
| Authorize, then capture. Hold valid 29 days, 3-day honor period, reauthorize from day 4 (new ID, new 3-day honor period), US reauth up to 115% / +$75 | **Verified** | developer.paypal.com/docs/checkout/standard/customize/authorization ; Payments v2 schema (reauthorize description) |
| Payments v2 has `/authorizations/{id}/capture`, `/void`, `/reauthorize`. Capture cannot exceed the original authorization (422 "You can only capture up to the original authorization amount") | **Verified** | developer.paypal.com/docs/api/payments/v2 ; schema.yaml |
| Partial capture with `final_capture=true` releases the remainder | **Partly verified**: the `final_capture` field exists in the capture examples, but I could not read its full description, and sandbox behaviour is unconfirmed. Spike it on Day 1 | schema.yaml |
| A reauthorize demo is possible within the 10-day window | **Verified by arithmetic**: authorize on Nov 2, reauthorize on Nov 6 or later | — |
| **PayPal already documents an "in-person pickup" pattern** (authorize at reservation, capture at the meetup) | **Verified, but it is limited release.** It is for approved US Commerce Platform partners only, sellers need PPCP onboarding, and the page states that **Seller Protection does not apply** | developer.paypal.com/limited-release/commerce-platform/v2/payment/enable-in-person-pickup |
| Disputes sandbox is fuller than the critic thought | **Verified.** `/require-evidence` moves a case to WAITING_FOR_SELLER_RESPONSE. `/adjudicate` needs UNDER_REVIEW. The buyer side can call `accept-offer` / `deny-offer` (may return 202). Wait a few minutes after creation. Merchant offers need funds. Escalation day is driven by the transaction amount ($5.00 to $5.99 means day 5) | developer.paypal.com/platforms/disputes/test-go-live |
| Invoice agents already exist **in this hackathon** | **Verified**: "PayPilot" (glama.ai listing) is a solo PayPal AI Hackathon entry: an NL tool-calling agent that creates invoices, sends reminders and checks who hasn't paid | glama.ai/mcp/servers/fernandogarzaaa/paypilot |
| Devpost look-alikes for a meetup hold with AI inspection, or a no-show hold with an AI front desk | **None found** in two searches. Commercial AI receptionists that take deposits exist (Stork lists 9 of 41) | web search |

Two consequences:
1. **Generic invoicing agents are already in the field.** Treasurer/Duesday, Stall and Studio lose innovation points unless the audience-specific AI is the hero, not the invoicing.
2. **Handshake now has a PayPal-native precedent (good for alignment) and an exposed production hole (bad).** The pattern is partner-gated, and PayPal itself says Seller Protection doesn't cover it.

## 1. Merged candidate list

| ID | Candidate | Merged from |
|---|---|---|
| C1 | **Casefile Resolve** (+ Before the Case as a front door) | Critic's pick; A#2 |
| C2 | **Signed Off** (Casefile for commission artists and intangibles) | A#1 |
| C3 | **Handshake** (meetup hold + AI inspection + scam check) | C#1 ≈ B#2 SafeHandoff ≈ A#5 Safe Deal; C Seatcheck as a mode |
| C4 | **HoldMySpot** (AI front desk + no-show authorization holds) | B#1 |
| C5 | **Duesday** (AI treasurer for clubs/PTAs) | B#3 ≈ A#3 Treasurer |
| C6 | **Kitty** (group-collection agent) | C#3 ≈ B#5 ChipIn |
| C7 | **Studio** (attendance-aware tutor billing) | B#4 |
| C8 | **Stall** (multilingual voice money manager for home/pop-up vendors) | C#5 |
| C9 | **Proof of Work** (photo-verified contractor milestones) | C#4 |
| C10 | **Thank-You Desk** (micro-nonprofit receipts + lapse rescue) | A#4 |
| C11 | **Haggle** (listing sales agent + deposit) | C#2 |
| C12 | **Shopfront** (Store Sync-style MCP storefront) | Critic runner-up |
| C13 | **Unhold** (new-seller hold lifter) | Critic; A "Hold Lifter" |
| C14 | **Agent-purchase mandate receipts** | Critic |

Not scored, because they are already dead: the **aging-parent guardian** (the brief's original direction). It cannot intercept a parent's own PayPal payments through any API, which is the "API wall" A refers to. Without interception, it is a read-only monitor competing with EverSafe and Carefull.

Criteria:
- **T** Technological Implementation
- **D** Design
- **I** Potential Impact
- **N** Innovation
- **P** Presentation
- **F** Feasibility (solo, 10 days, sandbox)
- **U** User-requirement fit: real complained-about pain, broad non-developer audience, pitchable, PayPal central, AI meaningful

The five official criteria are equally weighted. Ties are broken on T.

---

## 2. Scores with a one-sentence reason for every score

### C1. Casefile Resolve (+ Before the Case)
- **T 9:** Disputes v1 (evidence, offer, message, accept), shipment tracking, refunds, CUSTOMER.DISPUTE.* webhooks, Agent Toolkit plus custom dispute tools, and vision: the deepest, most correct PayPal surface of any candidate.
- **D 7:** A case inbox, timeline and one-tap decision is a coherent product, but it is a back-office dashboard with no consumer moment unless Before the Case's buyer chat is added.
- **I 8:** Small sellers verifiably lose sale value plus $15–$20 fees, and the 3-case demo (prove, offer, refund) shows the outcomes credibly, including a fair one for the buyer.
- **N 6:** Chargeflow and Justt own the category, and October toolkit PRs #108–#118 already touch dispute tools, so other entrants are in this exact space and the "upstream PR" angle is gone.
- **P 7:** The packing-photo vs damage-photo comparison is a good visual, but three dispute cases in 3 minutes is dense and reads as admin work to non-technical viewers.
- **F 6:** The sandbox lifecycle is now verified end to end (require-evidence, adjudicate, buyer accept-offer), but timing delays, funds requirements and many state transitions make it the most fragile demo to record solo.
- **U 6:** The pain is real and loudly complained about, but the audience is "people who sell online," which is narrower than everyone and harder to pitch to non-technical judges than a haircut or a Marketplace meetup.
- **Total 49.** P(top-3 or a $5k category) ≈ **11%**. It is the strongest "Best Use of PayPal + AI" contender on depth and wins tie-breaks, but innovation and breadth hold it back from grand prizes.

### C2. Signed Off (Casefile for creators)
- **T 8:** Invoicing partial payments, Disputes evidence, refunds and webhooks are a deep stack, but it reuses Casefile's engine with a narrower API footprint.
- **D 7:** Milestone invoice → logged sign-off → evidence packet is a complete loop, with the bonus that work starts *before* the dispute.
- **I 6:** The pain is vivid, but PayPal Seller Protection largely excludes intangibles, so "You kept $120" from a sandbox SELLER_FAVOR adjudication overclaims, and a PayPal judge will know it.
- **N 7:** Treating client approval ("omg yes!!") as delivery evidence is a genuinely fresh use of an LLM classifier on a payments problem.
- **P 7:** Artists are sympathetic and the timeline is emotional, but the payoff depends on the same overclaimed adjudication.
- **F 6:** It inherits the dispute-sandbox fragility, plus file-access logging, watermark previews and an invoice flow.
- **U 7:** It is a loudly complained-about pain for a non-developer creator audience, but commission artists are a niche.
- **Total 48.** P ≈ **8%** alone. It is better as Casefile's second persona than as a standalone product.

### C3. Handshake (= SafeHandoff = Safe Deal)
- **T 7:** Authorize, partial capture, void, reauthorize and webhooks are a rare, correct use of Payments v2, but it touches only one API family, and the merchant-of-record problem (who is the payee?) sits unsolved at the centre.
- **D 7:** Two linked phone views (buyer and seller) with live auth status are a clean product, but the seller-onboarding step is hand-waved.
- **I 7:** Marketplace scam losses are enormous and documented by the FTC, but PayPal's own in-person-pickup docs show this pattern needs partner onboarding and gets no Seller Protection, which hurts the credibility of "anyone can use this tomorrow."
- **N 8:** No PayPal meetup hold with AI curb inspection exists on Devpost (the look-alikes are all blockchain escrow), and the curb inspection is a memorable new interaction.
- **P 9:** Two phones in a parking lot, a defect found, "$310 instead of $340?", two taps and a capture webhook: the most cinematic 20 seconds of any candidate.
- **F 6:** Two-device staging, vision on a live phone camera, partial capture plus `final_capture` (sandbox-unverified) and per-seller payee setup are all risks for one person.
- **U 9:** Everyone has bought or sold something used, the scam pain is everywhere, it pitches in one sentence, PayPal holding the money is the whole product, and the AI inspection is necessary.
- **Total 53.** P ≈ **13%**. It is the strongest Best Demo Delivery and Most Creative contender, but an engineering judge's first question ("how does a personal-account seller get paid?") can sink Tech and Impact.
- **Fatal-flaw watch:** If the sandbox payee and partner story isn't answered on screen or in the README, expect T to drop to 6 and I to 6.

### C4. HoldMySpot
- **T 8:** Authorize at booking, void on an excused cancel, partial capture on a no-show, a reauthorize that can really be shown (seeded on Day 1, reauthorized on Day 5+), CREATED/VOIDED/CAPTURE webhooks and policy enforced outside the LLM: deliberate and unusual PayPal use, and the merchant is unambiguous (the salon is the business account).
- **D 8:** A Bryntum scheduler main screen, a client chat simulator, a policy page in plain English and a money timeline per booking make a complete small-business product.
- **I 7:** No-shows are a universally understood, documented revenue leak for one-person businesses, but deposit features already exist in Square, Fresha and Vagaro, so the claimed impact is the conversation and the decision, not the hold.
- **N 7:** I found no Devpost look-alike, and an agent holding void/capture authority is novel in this field, though commercial AI receptionists with deposits exist.
- **P 8:** "My son's sick" → hold voided live → slot moved on the scheduler → silent no-show → 30% captured is a clean, human, two-beat story anyone gets.
- **F 8:** The sandbox path (authorize, void, capture, reauthorize) is simple and documented, the chat can be simulated, and Bryntum Scheduler has a trial build.
- **U 8:** The pain is real and complained about, everyone who has booked a haircut understands it, PayPal holds are the mechanism, and the AI handles the conversation; it falls short of a 9 only because a policy form could handle much of the decision without an LLM.
- **Total 54.** P ≈ **14%**. It wins the tie-break against Handshake on T and is the safest strong build, a good fit for Agentic Commerce plus the Bryntum sponsor lane.

### C5. Duesday (= Treasurer)
- **T 8:** It uses the toolkit's newest invoicing tools (recurring series, conditional rules, record_payment, reminders, QR), plus custom Payouts, Transaction Search and webhooks, which is exactly what the toolkit team just shipped.
- **D 7:** A members-by-months AG Grid pivot, cash-sheet capture and a board report are coherent, but it looks like many dashboards.
- **I 6:** It reaches a broad set of volunteers, but the pain is chronic annoyance, not loss, and PayPal Pool Money, MoneyMinder and Cheddar Up already exist.
- **N 5:** Invoice-and-chase agents are already in this hackathon (PayPilot), and only the handwritten-cash-sheet vision step is fresh.
- **P 6:** A crumpled cash sheet flipping six invoices to paid is nice, but low-stakes, and dues aren't emotional.
- **F 8:** Invoicing sandbox is mature and toolkit-native; the only hard part is the vision OCR eval.
- **U 8:** PTA and club treasurers are a broad non-developer audience who do complain, PayPal is the rails and AI matching is needed, but the pain is mild.
- **Total 48.** P ≈ **8%**, mostly from the AG Grid $5k lane if the pivot plus AG Studio is central.

### C6. Kitty (= ChipIn)
- **T 6:** Invoices or orders, refunds, Payouts and webhooks are standard, and the "agent buys the gift" step only works against a merchant you control in sandbox.
- **D 7:** A chat-native tally bar and private nudges are a charming, complete loop.
- **I 5:** The pain is low-stakes social awkwardness, and PayPal re-shipped pooling as **Pool Money (Nov 2024)**, so the "PayPal killed Pools" premise is out of date.
- **N 4:** Bill-split and collect bots are among the most common hackathon ideas, and "split a group bill" is literally in PayPal's seed list.
- **P 7:** A group chat filling up is relatable and fun on video.
- **F 8:** Telegram bot, invoices and webhooks are straightforward.
- **U 7:** It is broad and pitchable, but the pain is weak, the AI is nice-to-have, and a PayPal PM will say "we have Pool Money."
- **Total 44.** P ≈ **3%**.
- **Fatal flaw:** It competes with a shipped PayPal feature.

### C7. Studio
- **T 7:** Recurring invoice series, `update_invoice` with explained credit lines and conditional rules are good toolkit use.
- **D 6:** A policy-driven bill with a calendar is fine, but a thin product.
- **I 5:** The audience is narrow and the evidence is anecdotal with no numbers.
- **N 4:** My Music Staff and TutorBird own this, and invoice agents are crowded.
- **P 6:** "Sick, skip Tuesday" → adjusted invoice is clear but small.
- **F 7:** Straightforward, plus Bryntum.
- **U 6:** It is non-developer but narrow, and the pain is weak.
- **Total 41.** P ≈ **2%**. It is a subset of HoldMySpot.

### C8. Stall
- **T 7:** Invoicing with partial deposit, QR, reminders, record_payment, Catalog and Reporting through the toolkit is broad but entirely wrapper-level, with no rare primitive.
- **D 7:** A voice-first mobile flow with a daily spoken summary is distinctive and complete.
- **I 6:** Informal vendors are a huge, sympathetic group, but the pain evidence is mostly vendor blogs, and these vendors mostly use cash, Venmo, Zelle or Square today.
- **N 6:** Multilingual voice-to-invoice is uncommon, but under it sits the crowded "AI invoice chaser."
- **P 8:** A Spanish voice note becoming a Spanish PayPal invoice in two seconds, then a stall QR scan, is warm and visual.
- **F 7:** STT and invoices are easy, but the Spanish invoice locale is unverified and live voice demos can misfire.
- **U 8:** The audience is broad, non-developer and sympathetic, PayPal is central and voice AI is necessary, but the complaint evidence is thin.
- **Total 49.** P ≈ **7%**. It is a Best Demo Delivery or Most Impactful dark horse.

### C9. Proof of Work
- **T 6:** Invoice per milestone and optional authorization; the 29-day limit forces plain invoicing, which removes the "hold" story.
- **D 6:** Milestones with photo checks are coherent but generic.
- **I 7:** Deposit-and-vanish contractor scams are real and costly.
- **N 4:** GigSmartPay on Devpost already does AI-vision milestone release, down to the duplicate-photo check.
- **P 6:** A renovation is hard to film convincingly solo.
- **F 5:** The construction vision eval and the staging are heavy.
- **U 7:** It is broad (homeowners), but AI judging construction quality is a liability.
- **Total 41.** P ≈ **2%**.

### C10. Thank-You Desk
- **T 5:** Mostly read-only (Transaction Search) plus subscription-failure webhooks.
- **D 6:** Receipts and statements are useful but dull.
- **I 5:** Real for micro-nonprofits, but Zeffy, Givebutter and Donorbox solve it for free.
- **N 3:** Donation tooling is crowded, and "donations" is in PayPal's seed list.
- **P 5:** The lapse-rescue message is sweet, but the payoff is small.
- **F 8:** Simple.
- **U 5:** The audience is non-developer but narrow, and the AI is mostly copywriting.
- **Total 37.** P ≈ **1%**.

### C11. Haggle
- **T 6:** A small authorization deposit plus invoice QR; most of the work is LLM negotiation, not PayPal.
- **D 6:** It needs its own listing page because Marketplace has no API, which breaks the product promise.
- **I 6:** "Is this available?" spam and ghosting are a real, complained-about annoyance, but low-loss.
- **N 4:** Agent-vs-agent haggling is well-trodden (CartAI, The Haggle, Anthropic's Project Deal).
- **P 8:** A converging price ticker between two agents is very watchable.
- **F 7:** Feasible, since the LLM loop is easy.
- **U 7:** Broad and pitchable, but PayPal is secondary.
- **Total 44.** P ≈ **3%**. It is best as Handshake's pre-meetup add-on.

### C12. Shopfront
- **T 8:** MCP storefront plus Orders and Catalog is deep agentic-commerce plumbing.
- **D 7:** It demos smoothly.
- **I 4:** No small seller is complaining about AI-agent discoverability yet.
- **N 5:** It duplicates PayPal's own gated Store Sync / Agent Ready and sits in the most crowded lane.
- **P 8:** "Ask ChatGPT, buy from my shop" is magical on video.
- **F 7:** Feasible.
- **U 3:** It fails the real-pain test.
- **Total 42.** P ≈ **4%**.

### C13. Unhold
- **T 4:** Mostly tracking sync, which barely needs AI.
- **D 6:** Simple.
- **I 6:** New-seller holds are a real complaint.
- **N 3:** It is plain plumbing.
- **P 4:** Nothing to see.
- **F 7:** Easy.
- **U 5:** The AI is not meaningful.
- **Total 35.** P ≈ **1%**.

### C14. Agent-purchase mandate receipts
- **T 8:** Bounded agent purchases with verifiable mandates are technically interesting.
- **D 5:** It is infrastructure, not a product.
- **I 4:** The audience is developers; consumers don't complain about this.
- **N 8:** Novel in this field.
- **P 6:** Hard for non-technical viewers to follow.
- **F 5:** The protocol design work is heavy.
- **U 2:** It fails the broad, non-developer and real-pain requirements outright.
- **Total 38.** P ≈ **3%**.

---

## 3. Summary table

| Rank | Candidate | T | D | I | N | P | F | U | **Total /70** | Official-5 /50 | P(win line) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **HoldMySpot** | 8 | 8 | 7 | 7 | 8 | 8 | 8 | **54** | 38 | ~14% |
| 2 | **Handshake** | 7 | 7 | 7 | 8 | 9 | 6 | 9 | **53** | 38 | ~13% |
| 3 | **Casefile Resolve** | 9 | 7 | 8 | 6 | 7 | 6 | 6 | **49** | 37 | ~11% |
| 4 | **Stall** | 7 | 7 | 6 | 6 | 8 | 7 | 8 | **49** | 34 | ~7% |
| 5 | **Duesday** | 8 | 7 | 6 | 5 | 6 | 8 | 8 | **48** | 32 | ~8% |
| 6 | Signed Off | 8 | 7 | 6 | 7 | 7 | 6 | 7 | 48 | 35 | ~8% (as a Casefile persona) |
| 7 | Kitty | 6 | 7 | 5 | 4 | 7 | 8 | 7 | 44 | 29 | ~3% |
| 8 | Haggle | 6 | 6 | 6 | 4 | 8 | 7 | 7 | 44 | 30 | ~3% |
| 9 | Shopfront | 8 | 7 | 4 | 5 | 8 | 7 | 3 | 42 | 32 | ~4% |
| 10 | Studio | 7 | 6 | 5 | 4 | 6 | 7 | 6 | 41 | 28 | ~2% |
| 11 | Proof of Work | 6 | 6 | 7 | 4 | 6 | 5 | 7 | 41 | 29 | ~2% |
| 12 | Mandate receipts | 8 | 5 | 4 | 8 | 6 | 5 | 2 | 38 | 31 | ~3% |
| 13 | Thank-You Desk | 5 | 6 | 5 | 3 | 5 | 8 | 5 | 37 | 24 | ~1% |
| 14 | Unhold | 4 | 6 | 6 | 3 | 4 | 7 | 5 | 35 | 23 | ~1% |

How the ties were broken:
- **HoldMySpot over Handshake:** they tie on the official five (38). HoldMySpot wins on the rules' tie-break (T 8 vs 7) and on feasibility.
- **Casefile over Stall:** Casefile wins on T.
- **Duesday over Signed Off on the 70-point total:** Signed Off scores higher on the official five, but Duesday wins on user fit and feasibility.

The win line counts top-3 overall, any of the five $5k category prizes, or AG Grid 1st ($5k). These probabilities assume a polished execution in a field of about 26k registrants and probably 500–1,500 real submissions.

---

## 4. Top 5: the single change that raises each score most

1. **HoldMySpot (54).** Close the loop so the freed slot never goes empty.
   - When a cancellation or no-show frees a slot, the agent offers it to the waitlist in natural language, the waitlisted client accepts, and a **new authorization** is placed, all in the same 20 seconds.
   - The video's payoff then becomes "no-show → $0 lost" instead of "fee captured". That lifts Impact and Innovation, and kills the "a form could do this" objection (AI necessity).
   - Also publish an eval: about 30 real salon cancellation policies compiled into rules, plus about 50 labelled client messages, each with an accuracy score.
   - Risks to watch: a client backlash framing ("salon holds my money"), so make the transparency copy part of the UI. Partial capture with `final_capture` is unverified in sandbox, so spike it on Day 1.
2. **Handshake (53).** Answer the merchant-of-record question on screen.
   - In sandbox, onboard the seller through **Partner Referrals** (or at minimum a separate sandbox business account set as `payee` per order).
   - Cite PayPal's own in-person-pickup pattern in the README ("we built PayPal's documented pickup flow for everyday sellers, plus AI inspection").
   - This turns the engineering judges' first objection into a sign of alignment, and could move T to 8 and I to 8.
   - **Fatal flaw if ignored.**
   - Also cut the "battery health from a photo" claim to things vision can actually check reliably.
3. **Casefile Resolve (49).** Add Before the Case as the buyer-facing front door.
   - The buyer chats from the receipt, and half the cases resolve before a dispute exists.
   - This makes it two-sided (buyers are everyone), raises U and Innovation, and gives the video a human first scene instead of a case queue.
   - Keep only two dispute cases in the video.
4. **Stall (49).** Film it with one real home or market vendor using it, in their own language.
   - Verify `detail.locale` for Spanish invoices on Day 1.
   - Real-user footage is the only way to fix the thin pain evidence, and it raises Impact and Presentation at once.
5. **Duesday (48).** Make the handwritten cash-sheet vision step, plus `record_payment_for_invoice`, the hero.
   - Measure it on about 30 sheets.
   - Make the AG Grid members-by-months pivot with AG Studio "ask your ledger" central, to own the AG Grid $5k lane.
   - Don't pitch it as an invoicing agent; PayPilot already is one.

## 5. Fatal flaws and red lines

- **Kitty:** PayPal Pool Money (Nov 2024) already exists, so the premise is out of date.
- **Shopfront and mandate receipts:** they fail the user's real-pain and broad-audience requirements.
- **Proof of Work:** GigSmartPay on Devpost already does the core of it.
- **Signed Off, standalone:** "You kept $120" contradicts PayPal's intangible-goods protection limits, and PayPal judges will notice. Only ship it as a persona with honest wording ("strongest possible evidence filed").
- **Handshake:** a fatal flaw only if the payee/onboarding story is left implicit (see §4).
- **Any choice:** if no unhappy path appears on screen (duplicate webhook, denied capture, expired honor period, a 202 accept-offer), DevRel will mark the entry down. The ByteMonk failure-modes repo shows what they value.

## 6. My call

**HoldMySpot is the most likely winner from the PayPal-engineering seat.** It has:
- the cleanest verified sandbox path;
- an unambiguous merchant;
- a deliberate, rarely used PayPal primitive held by an agent under hard limits (a direct Agentic Commerce fit);
- the uncrowded Bryntum lane;
- a pain any non-technical viewer feels.

**Handshake has the higher ceiling** (video and breadth) **and the higher floor risk.** Its core engine is the same (authorize → AI decision → void / partial capture), so keep that engine portable. If the Day-1 spike shows that partial capture plus a per-seller payee works cleanly in sandbox, Handshake becomes a legitimate co-favourite.

**Casefile stays the "Best Use of PayPal + AI" specialist,** but it no longer leads overall.

Sources:
- https://developer.paypal.com/docs/checkout/standard/customize/authorization/
- https://developer.paypal.com/api/payments/v2/schema.yaml
- https://developer.paypal.com/limited-release/commerce-platform/v2/payment/enable-in-person-pickup/
- https://developer.paypal.com/platforms/disputes/test-go-live
- https://glama.ai/mcp/servers/fernandogarzaaa/paypilot/tree
- https://www.stork.ai/blog/ai-receptionist-deposits-no-shows-2026
- https://devpost.com/software/gigsmartpay
