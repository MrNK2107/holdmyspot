# Round 3, Refiner: Casefile Resolve, made two-sided

_2026-11-01. Inputs: CRITIC_REPORT.md, PITCH.md, round1_A.md (Signed Off, Before the Case), round2_judge1.md, round2_judge2.md, HACKATHON_BRIEF.md. New web checks are marked **[verified today]**. Anything not checked is marked **[unverified]**. Scores are judgment calls, not measurements._

---

## 0. What changed and why (judge issue → fix)

| # | Judge issue | Fix in this round |
|---|---|---|
| 1 | Narrow audience ("small sellers"). PM-awkward "beat the buyer" framing | Rename and reframe as a **resolution agent that serves both sides**. Every order problem gets an outcome in minutes, not 20–50 days. The buyer is the first person on screen. Merge **Before the Case** as the main door. **Signed Off** moves to the roadmap only, with honest wording (see §10). The design rule is **"the AI can only say yes on its own"**: it can grant remedies within the seller's published limits, and only a human or PayPal can say no. |
| 2 | Innovation 6 (Chargeflow/Justt exist, toolkit PRs touch disputes) | Pre-dispute deflection also exists (Fini, Visa's 2026 pre-dispute tools; see §4), so "pre-dispute AI" alone is **not** new. What we found no product doing is combining a **buyer-visible remedy floor enforced in code**, **one thread that carries from receipt into PayPal's own case** (send-message / make-offer inside the inquiry, transcript and photos filed as evidence), a **packing-photo vs buyer-photo vision check**, and a **published eval that includes a buyer-harm metric**. "We found no product that…" is the honest claim, not "first ever". |
| 3 | Sandbox lifecycle | Re-read the docs today. Most of the flow is documented, and two gaps remain. Day-1 spike with fallbacks is in §9. |
| 4 | AI vs deterministic code, and how to measure it | Responsibility table in §5. Labelled set of 60 scenarios plus 40 photo pairs, with five metrics, including the **unfair-denial rate (buyer harm)**. |
| 5 | Failure path on screen, 20-second hook | The hook opens on two people, not a dashboard. Two failures are shown on screen: vision "can't tell" leads to no automatic decision, and PayPal's `202 Accepted` leads to "money not moved yet" (§7). |

---

## 1. Name and one-line pitch

**Name: Settled** (working name; check Devpost and GitHub for collisions on Day 1). "Casefile" sounds like a fight, and "Settled" is the outcome both people want.

**One line:** *"When a PayPal order goes wrong, Settled talks to the buyer, checks the proof, and settles it fairly in minutes, within limits the seller set and the buyer can see, before anyone has to open a case."*

**Tagline for the video close:** *"Problems happen. Weeks of waiting don't have to."*

---

## 2. Target users

| User | What they get | Why they care |
|---|---|---|
| **Buyer** (anyone who pays a small shop with PayPal: Etsy-style makers, Instagram/indie shops, eBay resellers, invoice sellers) | A "Problem with this order?" link on the receipt or packing slip, plus the same agent inside the PayPal case if they go straight there. They get an answer with proof in minutes, and a remedy (refund, partial, or reship) the moment the facts support it. The "Open a PayPal case" button is always visible. | Today they wait days for a reply, then 20 days to escalate, then up to about 30 days for a decision. |
| **Seller** (solo or small PayPal business account, no support staff, no Shopify helpdesk) | An agent that answers at 11pm, grants remedies within a **published policy**, wakes them only above their limit, and files a complete evidence pack if a case still happens. | They lose the sale plus a $15–$20 fee, plus hours, plus reputation. They can't afford Chargeflow's contingency model or a support team. |
| **PayPal** (the judges' employer) | Fewer escalations reaching PayPal agents, faster buyer outcomes, better-evidenced claims when cases do happen. All money moves on PayPal rails. | Buyer trust plus seller retention; endorsable on stage. |

**Persona pair for the video:** **Ana** (buyer, ordered a $68 ceramic mug set as a birthday gift) and **Maya** (the seller, a one-person ceramics shop, asleep when Ana writes).

---

## 3. Pain evidence (URLs)

**Buyers hate it too.**
- Sift Q4 2025 Digital Trust Index (n = 1,075 US adults, Oct 2025): 18% of disputes come from **delayed refunds** and 17% from **missing or late deliveries**. Of consumers who admit filing a false claim, 18% cite delayed delivery as the motive. In other words, slow merchant response *creates* disputes. https://sift.com/index-reports-disputes-q4-2025/ **[verified today]**
- YouGov for Advanced Supply Chain (n = 2,009 UK adults, May 2025): **53%** wouldn't buy again from a retailer that delays refunds, most expect a refund within 2–3 days, and **57% prefer live online chat** to resolve issues. https://cmotech.uk/story/half-of-uk-online-shoppers-shun-retailers-with-slow-refunds **[verified today]**
- LegalShield: 46% kept defective or unwanted items because the return process was too hard or costly. https://www.legalshield.com/newsroom/new-legalshield-study-americans-forgo-returns-on-broken-unwanted-products-citing-barriers-from-retailers (seen in search snippet; page not opened)
- Chargeflow consumer survey (about 700 people): 23% would file a chargeback **immediately** after a problem, so the window to talk first is small. https://www.globenewswire.com/news-release/2025/02/05/3021332/0/en/New-Chargeflow-Research-Shows-that-As-Many-as-80-Percent-of-Chargebacks-Are-Abusive.html (vendor research)
- A buyer in PayPal Community, "The seller isn't responding to my messages in the Resolution Center", waited days and escalated to avoid "writing messages to myself". https://www.paypal-community.com/t5/Refunds-and-cancellations/The-seller-isn-t-responding-to-my-messages-in-the-Resolution/td-p/630708 (search snippet)
- "How long must I wait for PayPal to resolve a dispute?" https://www.paypal-community.com/t5/Disputes-and-claims-Archive/How-long-must-I-wait-for-Paypal-to-resolve-a-dispute/m-p/342524 (search snippet)
- PayPal's own buyer page: the buyer has **20 days** to escalate a dispute to a claim, and then PayPal reviews it. https://www.paypal.com/vn/webapps/mpp/buyer-dispute-resolution (regional page; the US timeline is assumed to be similar **[unverified]**)

**Sellers** (carried over from round 1 and the critic):
- Buyer opened an INR case 140 days later and escalated it a minute after opening: https://www.paypal-community.com/t5/Selling-on-eBay/Please-help-me/m-p/1058417
- Buyer opened a case despite receiving the items: https://www.paypal-community.com/t5/Managing-Risk-and-Fraud/buyer-opened-a-case-even-though-she-received-items/td-p/1963806
- Fees: https://www.chargeflow.io/chargebacks-101/paypal-chargeback

**Pitch line from the evidence:** *a dispute is usually a conversation that didn't happen fast enough.* Both sides lose time, and the seller also loses money.

---

## 4. What's genuinely new (Innovation answer)

**Who's already here** (be upfront in the README):
- **Chargeflow, Justt, Findustry** ($2.25M seed): back-end evidence and recovery for merchants, on contingency. https://www.pulse.bot/fintech/news/payments-entrepreneur-strikes-again-7fb2da1a-c80d-47d1-93b6-868ef4ab6812/
- **Fini** (YC): pre-dispute deflection plus evidence, 25% success fee (vendor guides). https://www.usefini.com/guides/ai-agents-charge-disputes-intake-to-resolution
- **Visa** (Apr 2026): AI dispute tools including pre-dispute interception, aimed at card disputes. https://machineherald-io.pages.dev/article/2026-04/04-visa-launches-six-ai-tools-to-overhaul-credit-card-dispute-resolution-as-global-volumes-surpass-106-million
- **Agent Toolkit PRs** **[verified today]**: #109 and #118 (Oct 2026) fix `accept_dispute_claim` bugs, and #91 (closed) proposed an admission gate for money actions. Other builders are touching disputes, so "we added dispute tools" is not novel. https://github.com/paypal/agent-toolkit/pulls?q=is%3Apr+dispute

**What we found no product doing** (four together, PayPal-native):
1. **A remedy floor the buyer can see, enforced by code.** The seller publishes a Resolution Promise, for example "late more than 5 days past estimate: 10% back or a free reship. Arrived damaged with a photo: full refund or replacement." The agent **cannot offer less than the floor** (deterministic) and **cannot grant more than the seller's ceiling** without a tap. The buyer sees the promise before typing a word. That makes the seller's agent trustworthy to the other side, which back-office tools never try to do.
2. **One thread from receipt to PayPal case.** If the buyer skips the link and opens a PayPal inquiry, `CUSTOMER.DISPUTE.CREATED` wakes the same agent. It replies *inside PayPal* via `send-message`, makes the promised remedy via `make-offer`, and if the case escalates, files the transcript, tracking and photos via `provide-evidence`. Most tools live either before the dispute or after it.
3. **Packing-proof vision.** Maya snaps the parcel at packing (phone page, 2 seconds). When Ana sends a damage photo, vision compares them: same item? damage visible? damage consistent with transit? It only ever raises confidence to grant, or routes to a human. It never auto-denies.
4. **A published eval with a buyer-harm metric.** We report how often the agent *wrongly withheld* a fair remedy, not just how much money it saved the seller.

Honest Innovation ceiling: **7**. The combination is fresh. The parts aren't.

---

## 5. AI role vs deterministic code

**Principle: the AI proposes, code decides, and the AI can only say yes on its own.**

| Step | Who | Why |
|---|---|---|
| Find the order from the receipt link (signed token) or from the dispute's transaction ID | **Code** | Exact lookup, no judgment needed |
| Read the buyer's free-text message and classify the issue (not arrived / late / damaged / wrong item / changed mind / other), with urgency and emotion | **AI** | Natural language; "it's been 2 weeks, I'm opening a PayPal case" carries several signals |
| Get tracking status, delivery scan, order total, prior refunds | **Code** via Agent Toolkit read tools | Facts |
| Compare buyer photo vs packing photo: same item, visible damage, plausibility | **AI** (vision), with a confidence output and a **"can't tell"** option | Plain code can't do this |
| Map facts to the seller's Resolution Promise and pick a remedy within [floor, ceiling] | **AI** proposes a remedy and a one-line rationale. **Code** validates it against the policy | The AI handles ambiguity, the code holds the money limits |
| Money limits: floor, ceiling, per-buyer and per-month caps, one remedy per order, deadlines | **Code only** (policy engine, outside the LLM) | Prompt injection in a buyer message or photo can't raise a limit |
| Execute the refund / partial refund / offer | **Code** (executor calls the PayPal API only after the policy check passes) | Money moves must be deterministic and auditable |
| Write messages to the buyer and seller, and the evidence narrative | **AI** | Tone and clarity |
| Say no, deny or fight | **Human (seller tap) or PayPal**, never the AI alone | Liability and fairness |
| Webhook verification, idempotency, retries, the 202 "pending" state | **Code** | Correctness |

**What the LLM can call:** Agent Toolkit **read** tools (`get_order`, `get_dispute`, `list_disputes`, shipment tracking get, `list_transactions`) plus our read-only tools (`get_packing_photo`, `get_resolution_promise`). Write actions go through one custom tool, `propose_resolution(remedy, amount, rationale)`. Its executor runs the policy check and then calls `create_refund` (toolkit) or our custom dispute tools (`send_message`, `make_offer`, `provide_evidence`, `accept_claim`), written in toolkit style. Toolkit `accept_dispute_claim` currently has open bug PRs (#109, #118), so we pin the version and call our own wrapper. That's a nice "we read your repo" detail for DevRel.

### How we measure it (eval in the README and in the video)

**Scenario set: 60 labelled cases.**
- Built from 30 public seller and buyer forum stories, paraphrased, plus 30 synthetic variants.
- Spread: 15 INR, 10 late, 15 damaged, 10 wrong item, 5 changed mind, 5 adversarial (injection text in the message, "refund me in full or I'll chargeback").
- Each case has the facts (tracking, amount, photos ID) and a gold label, one of four: `PROVE` (show proof, no money), `PARTIAL`, `FULL_REFUND/REPLACE`, `HUMAN`.
- Two raters label independently (builder plus one friend). Agreement (Cohen's κ) is reported, and only agreed cases are scored.

**Photo set: 40 pairs**, shot by the builder: 10 items × {same, undamaged / same, damaged / different item / blurry}. No scraped images, so no copyright issue.

**Metrics** (fixed before running, reported honestly even if bad):
1. **Decision agreement** with the gold label (target ≥ 80%).
2. **Unfair-denial rate (buyer harm):** gold says remedy, agent proposed PROVE or nothing. Target ≤ 5%. This is the headline number for PayPal.
3. **Over-refund rate (seller harm):** gold says PROVE, agent refunded. Target ≤ 5%.
4. **Policy violations executed:** must be **0** by construction. Count how many AI proposals the policy engine *blocked*, which shows the guardrail working.
5. **Vision:** precision and recall on "different item" and "damage visible", plus the "can't tell" rate on blurry photos (should be close to 100%).

Plus **ablation:** an expert rule set (if/else on reason plus tracking, no LLM) vs the agent, on the same 60. This is the honest "where AI isn't needed" story. If rules win on INR, say so and route INR to rules.

---

## 6. Architecture (PayPal APIs per step)

```
Buyer (receipt link / QR on packing slip)        PayPal Resolution Center (buyer went straight there)
            │                                                   │ CUSTOMER.DISPUTE.CREATED / UPDATED / RESOLVED
            ▼                                                   ▼
  Buyer chat page ──► Agent (LLM + vision) ──propose──► Policy engine (deterministic) ──► Executor ──► PayPal APIs
            ▲              │ read tools                      floor / ceiling / caps          │ idempotency keys
            │              ▼                                                                  ▼
            └──── messages ◄── Agent Toolkit (get_order, tracking, get_dispute, list_transactions, create_refund)
                                                          + custom toolkit-style tools (send_message, make_offer,
                                                            provide_evidence, accept_claim)
Seller console: Resolution Promise editor, packing-photo capture, case timeline, AG Grid ledger + audit log + eval table
```

| Step | PayPal surface |
|---|---|
| 0. Sale | Orders v2 create/capture (JS SDK Buttons) on Maya's demo shop. The receipt and packing slip carry a signed "Problem with this order?" link |
| 1. Ship | Toolkit `create_shipment_tracking` (Orders/tracking), with the packing photo stored against the order |
| 2a. Buyer opens chat (pre-case) | Toolkit `get_order`, tracking get. A remedy executes via toolkit `create_refund` (Payments v2 captures/{id}/refund, partial amount) |
| 2b. Buyer opened a PayPal case instead | Webhook `CUSTOMER.DISPUTE.CREATED` → toolkit `get_dispute` → custom `send_message` (`POST /v1/customer/disputes/{id}/send-message`) → custom `make_offer` (`/make-offer`, `offer_type` REFUND / REFUND_WITH_REPLACEMENT) |
| 3. Buyer accepts | `accept-offer` on the buyer side (`200`, or `202` if money movement is delayed). Then `CUSTOMER.DISPUTE.UPDATED`/`RESOLVED` **[which one fires is unverified; spike]** |
| 4. Case escalates or the seller disputes it | Custom `provide_evidence` (`PROOF_OF_FULFILLMENT` with tracking_info for INR; `OTHER` with notes plus documents for SNAD: transcript PDF plus photo pair) |
| 5. Sandbox decision (demo only) | `require-evidence` / `adjudicate` (sandbox-only, requires UNDER_REVIEW) → `CUSTOMER.DISPUTE.RESOLVED` |
| Fallback resolve | `accept-claim` `PARTIAL_REFUND` ≥ requested amount resolves and fires RESOLVED (documented) |
| Security | Webhook signature verification (`/v1/notifications/verify-webhook-signature`), OAuth client credentials, idempotency via `PayPal-Request-Id` |
| Ledger | `list_transactions` (Transaction Search) for reconciliation in the AG Grid ledger |

**Sandbox lifecycle, re-checked today** (https://developer.paypal.com/platforms/disputes/test-go-live):
- **Create:** `POST /v1/customer/disputes` (sandbox-only) with **buyer credentials via a `PayPal-Auth-Assertion` JWT**, buyer_transaction_id, reason, and amount ≤ the transaction. Returns `201`. **Wait a few minutes** before actions appear.
- **Source transaction:** the doc's path is the sandbox personal account doing **Send and Request** to the business account, **paid by card** for chargeback eligibility. Whether an Orders v2 checkout capture works as the source is **[unverified]**, so it's spike item 1.
- **Escalation timing by amount:** $5.00–5.99 escalates on day 5, $9.00–9.99 on day 9, and $11+ on day 11. A demo order of $68 escalates on day 11. Use the **escalate** link to force it.
- **`ACCELERATED_RESPONSE_ENABLED`** in `evidences[].notes` at creation (INR/SNAD only). Its effect is **[unverified]**, so spike it.
- **Act only on HATEOAS links present** (make-offer, send-message, escalate, provide-evidence, adjudicate, require-evidence). The UI must render actions from links, which is a nice correctness signal for DevRel.
- **make-offer** needs seller funds. **accept-offer** (buyer) returns `200` or `202`. **deny-offer** requires a note.
- **`require-evidence`** (sandbox-only) moves UNDER_REVIEW to WAITING_FOR_SELLER/BUYER_RESPONSE. **`adjudicate`** needs UNDER_REVIEW, gives BUYER_FAVOR or SELLER_FAVOR, and fires RESOLVED.
- **accept-claim** `PARTIAL_REFUND` below the requested amount emails the buyer for consent. At or above the requested amount, it resolves.
- **One dispute per transaction, ever.** Pre-seed **many** transactions for retakes.
- Error simulation: dispute ID `ERRDIS015` returns FORBIDDEN. Useful for the on-screen failure test.
- **Still unverified:** (a) the exact transition into UNDER_REVIEW after evidence or escalation; (b) which webhook fires on accept-offer; (c) whether `send-message` works in sandbox INQUIRY; (d) whether a pre-case partial refund still lets the buyer open a case for the remainder (it matters for the "you keep your PayPal protection" claim).

---

## 7. Three-minute video, beat by beat

| Time | Beat | On screen |
|---|---|---|
| **0:00–0:20 Hook** | Split screen. **Left:** Ana's phone, 11:42 pm: "It's been 16 days. It was a birthday gift. I'm opening a PayPal case." **Right:** Maya's dark bedroom, her phone face down. Caption: *"Every order problem has two people waiting."* Then Settled replies to Ana in 4 seconds. | Human first, no dashboard. The emotional hook is the gift and the deadline, from both sides. |
| 0:20–0:35 Promise | Ana sees Maya's **Resolution Promise** card above the chat: "Damaged? Full refund or replacement. Late? 10% back or free reship." Plus a persistent **"Open a PayPal case instead"** button. VO: "The seller's agent, with rules the buyer can see." | Trust and fairness up front |
| 0:35–1:15 Case 1, pre-case, damage | Ana uploads a photo of a cracked mug. Vision panel: packing photo vs buyer photo, "same item ✓, damage visible ✓, consistent with transit". The agent proposes a replacement. The policy engine shows ✓ within ceiling. The **real `create_refund`** fires (debug drawer: request ID, `201`), or a replacement is logged. Ana: "That's it?" Counter: **"Settled in 1 min 52 s. No case opened."** | Real API call visible |
| 1:15–1:35 **Failure path** | A second buyer sends a dark, blurry photo. Vision: **"Can't tell."** The agent does **not** decide. It asks for one more photo in daylight and tells the buyer the floor still applies. Maya gets a quiet notification only if no photo arrives in 24h. Caption: *"When the AI isn't sure, it says so. It can only say yes on its own."* | Honest AI limits |
| 1:35–2:20 Case 2, buyer went straight to PayPal | Ben opened a PayPal INR inquiry without using the link. Webhook `CUSTOMER.DISPUTE.CREATED` lands, the agent reads tracking ("delivered to mailbox Tue 3:12 pm"), and **sends a message inside PayPal** with the scan, then **makes an offer** per the promise (reship if not found by Friday). Ben (sandbox buyer) accepts. API returns **`202 Accepted`**, and the UI honestly shows **"PayPal is processing, money not moved yet"** until the webhook confirms. | Shows the two-sided thread and an unhappy path DevRel cares about |
| 2:20–2:40 Seller morning | Maya wakes up to a summary: 3 problems settled overnight, $0 in dispute fees, 1 needs her (above her $80 ceiling). AG Grid ledger: case, remedy, amount, policy check, PayPal IDs. | Seller value |
| 2:40–2:55 Proof it works | Eval table: 60 scenarios, decision agreement X%, **unfair-denial rate Y%**, over-refund Z%, 0 policy violations executed, N proposals blocked. One line: "Rules alone scored W%." | Measured, not cherry-picked |
| 2:55–3:00 Close | "Problems happen. Weeks of waiting don't have to." Logo, PayPal sandbox note. | |

Pre-seed all disputes several hours before recording, and record the 202 path from a real run. If a step can't be produced live, show the real request and the documented response, labelled "documented response", and never fake success.

---

## 8. Prize target

- **Primary PayPal category: Best Use of PayPal + AI ($5k).** This idea has the deepest PayPal surface (Orders, Tracking, Refunds, Disputes with 5+ actions, webhooks, Transaction Search, Agent Toolkit plus custom tools), with AI doing what code can't. Most Impactful and Best Demo Delivery are reachable from the same build, and Agentic Commerce is secondary (an agent holding bounded refund authority).
- **ONE sponsor prize target: AG Grid.** The case ledger plus the eval table are both natural grids (filter by remedy, pivot by reason, cell renderers for policy-check badges and PayPal IDs). It's a sponsor niche with few competitors and costs about one day. Render hosting is a free side bet, not a target. Skip APIMatic, Bryntum and Channel3.

---

## 9. Ten-day scope (Nov 2 → submit Nov 12 daytime IST)

**MUST**
1. Demo shop: one product page, PayPal Buttons, Orders v2 capture, receipt with a signed problem link, packing-photo capture page (mobile).
2. Buyer chat page: Resolution Promise card, "Open a PayPal case" button, photo upload.
3. Agent: an LLM with vision, Agent Toolkit read tools, and `propose_resolution`.
4. Deterministic policy engine (floor, ceiling, caps) and executor with idempotency.
5. Custom toolkit-style dispute tools: send_message, make_offer, provide_evidence, accept_claim.
6. Webhooks: DISPUTE.CREATED / UPDATED / RESOLVED with signature verification, deduplication, and the 202-pending state.
7. Seller console: promise editor, timeline, one AG Grid ledger plus audit log.
8. Eval harness: 60 scenarios, 40 photo pairs, rules-only baseline, results table in the README and in the app.
9. Hosted on Render. Public repo, LICENSE, README with "what broke and how we fixed it", Tools section, AI-use disclosure (no co-author trailers).
10. A video under 3 minutes.

**CUT** (roadmap only)
- Signed Off / intangible sellers (roadmap line with honest wording: "files the strongest evidence PayPal's intangible-goods terms ask for; PayPal decides").
- Chargebacks (`process-chargeback` sandbox), appeals, REFUND_WITH_RETURN plus acknowledge.
- Multi-seller onboarding (Partner Referrals). Use one sandbox business account and say so.
- Email/SMS notifications (in-app only), multilingual chat, an address-change pre-ship guard, an upstream PR to the toolkit.

**Day plan**
- **D1 (Nov 2): spike (below).** Render skeleton plus webhook endpoint live.
- **D2:** shop, Orders, tracking, packing photo. Pre-seed 15 sandbox transactions.
- **D3:** agent loop plus toolkit read tools plus policy engine plus executor (refund path).
- **D4:** buyer chat UI plus Resolution Promise.
- **D5:** vision compare plus "can't tell". Shoot the 40 photo pairs.
- **D6:** dispute path (webhook → send_message → make_offer → accept → evidence).
- **D7:** seller console plus AG Grid ledger plus audit.
- **D8:** eval set labelling plus harness plus baseline. Failure-path polish.
- **D9:** README, script, record.
- **D10 (Nov 11):** edit, upload to YouTube, submit to Devpost. Nov 12 is buffer.

---

## 10. Risks and the Day-1 spike

| Risk | Mitigation |
|---|---|
| Sandbox dispute creation from an Orders v2 capture doesn't work, or needs the assertion JWT dance | Spike 1. Fallback: the doc's path (Send and Request from the sandbox personal account, paid by card), using that transaction for Case 2 only |
| accept-offer webhook unclear, or 202 never resolves | Spike 2. Fallback: seller `accept-claim PARTIAL_REFUND` ≥ requested (documented to fire RESOLVED) |
| `send-message` not available in sandbox INQUIRY | Spike 3. Fallback: put the message in `make-offer`'s note field (to verify) |
| Can't reach UNDER_REVIEW for adjudicate | Spike 4. Adjudicate is optional in the new story (the hero is pre-case resolution), so it moves to a README demo |
| "You keep your PayPal protection" claim after a pre-case partial refund | Spike 5. If unverified, the UI says only "You can still open a PayPal case at any time" |
| Vision overclaims | Vision never denies. A "can't tell" class plus the eval |
| Prompt injection through the message or photo | The LLM has no direct write tool; the policy engine is outside it; 5 adversarial eval cases |
| Video too dense | Two cases plus one failure only |
| Overlap with other entrants' dispute tools | Lead with the buyer and the promise floor; the tools are plumbing |
| Name collision | Check on D1; fallback names: "Squared Away", "Fairshake" |

**Day-1 spike (kill-test, about 6 hours, all with curl/Postman scripts, no UI):**
1. Orders v2 checkout (sandbox buyer pays by card) → capture → `POST /v1/customer/disputes` with the buyer assertion JWT on that capture. Record the delay until HATEOAS actions appear.
2. Seller `make-offer` REFUND $10 → buyer `accept-offer` → log the HTTP code (200/202) and **which webhook fires**.
3. `send-message` on an INQUIRY-stage dispute.
4. `escalate` → `provide-evidence` (OTHER with a JPEG plus PDF) → poll status → if UNDER_REVIEW, `adjudicate SELLER_FAVOR` → RESOLVED webhook.
5. Pre-case partial refund via toolkit `create_refund` → then create a dispute for the remainder: is it allowed?
6. Webhook signature verification on Render. Duplicate delivery handling.
7. Toolkit: confirm the exact tool names in the pinned version, and whether `accept_dispute_claim` is affected by the bugs in #109/#118.

**Kill rule:** if spikes 1 and 2 both fail (no dispute can be created on our own capture *and* no offer can be accepted), the "one thread into PayPal" pillar falls back to Send and Request transactions and the accept-claim path. The pre-case flow (the hero) still stands on Orders plus Refunds alone. The idea survives either way.

---

## 11. Hostile PayPal PM attack, and patches

| Attack | Patch |
|---|---|
| "This is a seller's bot dressed up as neutral. It'll talk buyers out of Buyer Protection." | The agent is **labelled** "Maya's shop assistant (acts for the seller)". The **Open a PayPal case** button is always visible and never hidden behind the chat. The agent is forbidden (by system prompt *and* by a UI invariant) from asking a buyer not to open or to close a case. In a PayPal case it only uses PayPal's own offer flow, where PayPal's rules apply. |
| "AI deciding who gets money is a liability." | The AI can only say **yes**, within a floor and ceiling the seller published. Every **no** is a human (seller tap) or PayPal. Policy and execution are deterministic and audited. |
| "Auto partial refunds will be farmed by friendly fraud." | Per-buyer and per-month caps, one remedy per order, a photo required for damage, a vision "different item" flag that routes to a human, all deterministic. The over-refund rate is measured and published. |
| "Sandbox theatre: adjudicate isn't real life." | The hero (pre-case refund, in-case offer) uses production-available endpoints. Sandbox-only calls (create, adjudicate, require-evidence) are labelled as test harness in the UI and README. |
| "Gorgias or Fini already do this." | They live in Shopify or helpdesk stacks and charge merchants. Settled targets PayPal-first sellers with no helpdesk (button, invoice and link sellers), works *inside* PayPal's case thread, and publishes a buyer-visible floor. If a judge names a product that does all four, concede, and point to the eval and the PayPal depth. |
| "Buyers won't click a seller link." | They don't have to. The same agent meets them inside the PayPal inquiry via the webhook. |
| "Photo privacy." | Photos are stored only against the order, deleted on resolve plus 180 days (the dispute window), never used for training. Stated in the UI. |
| "A $68 demo doesn't prove scale." | The eval set has 60 cases, and the AG Grid ledger replays them in batch. Note that the design is per-seller and stateless besides the ledger. |
| "Webhooks can be spoofed or duplicated." | Signature verification, and dedupe by event ID. Shown in the audit log. |
| "Why not just tell sellers to reply faster?" | They're asleep, at a day job, or at a craft fair. 23% of buyers file immediately (Chargeflow survey), so minutes matter. |

**Residual risk after patches:** it's still a seller-deployed tool, so the neutrality claim has to stay modest: "fair by published rule", not "neutral". Keep that wording.

---

## 12. Self-score (1–10)

| Criterion | Score | Reason |
|---|---|---|
| Tech | **8** | Orders, Tracking, Refunds, five or more Disputes actions, signed webhooks, Transaction Search and the Agent Toolkit with a gated write path is deep and correct, but much of the dispute depth is sandbox-only and partly unverified until the Day-1 spike. |
| Design | **8** | A buyer chat with a visible promise, a seller morning summary and a ledger is a real two-sided product with a consumer moment, not a back-office console. |
| Impact | **8** | Both sides of every small-shop PayPal order benefit, with measured buyer-harm and seller-harm rates, though real-world deflection can't be proven within 10 days. |
| Innovation | **7** | Pre-dispute AI and dispute automation exist, but a code-enforced buyer-visible floor, one thread from receipt into PayPal's case, and packing-photo vision together are fresh. |
| Presentation | **8** | Opening on two waiting people, then a sub-2-minute settlement, an honest "can't tell" and a real 202 is clear to non-technical viewers and credible to DevRel. |
| Feasibility | **6** | Solo in 10 days with an LLM, vision, a policy engine, webhooks, a dispute lifecycle and an eval is tight, and is only safe because the hero path doesn't depend on the fragile adjudicate step. |
| User-fit | **7** | The pain is real and complained about by buyers and sellers, PayPal is central and the AI is meaningful, but the direct operator is still a seller, so "everyone" is reached only as a buyer. |

**Total 52/70** (official five: 39/50), up from 49 (Judge 1) and 46 (Judge 2). P(top-3 or a $5k category) is roughly **12–14%**, competitive with Handshake and HoldMySpot on the official five while keeping the strongest "Best Use of PayPal + AI" claim.

Sources (new this round):
- https://developer.paypal.com/platforms/disputes/test-go-live
- https://github.com/paypal/agent-toolkit/pulls?q=is%3Apr+dispute
- https://sift.com/index-reports-disputes-q4-2025/
- https://cmotech.uk/story/half-of-uk-online-shoppers-shun-retailers-with-slow-refunds
- https://www.legalshield.com/newsroom/new-legalshield-study-americans-forgo-returns-on-broken-unwanted-products-citing-barriers-from-retailers
- https://www.globenewswire.com/news-release/2025/02/05/3021332/0/en/New-Chargeflow-Research-Shows-that-As-Many-as-80-Percent-of-Chargebacks-Are-Abusive.html
- https://www.paypal-community.com/t5/Refunds-and-cancellations/The-seller-isn-t-responding-to-my-messages-in-the-Resolution/td-p/630708
- https://www.paypal-community.com/t5/Disputes-and-claims-Archive/How-long-must-I-wait-for-Paypal-to-resolve-a-dispute/m-p/342524
- https://www.paypal.com/vn/webapps/mpp/buyer-dispute-resolution
- https://www.usefini.com/guides/ai-agents-charge-disputes-intake-to-resolution
- https://www.pulse.bot/fintech/news/payments-entrepreneur-strikes-again-7fb2da1a-c80d-47d1-93b6-868ef4ab6812/
- https://machineherald-io.pages.dev/article/2026-04/04-visa-launches-six-ai-tools-to-overhaul-credit-card-dispute-resolution-as-global-volumes-surpass-106-million
