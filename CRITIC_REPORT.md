# Critic report: PayPal AI Hackathon idea (2026-11-01)

## Verdict
Keep the dispute space but change the story. Casefile as pitched ("fight unfair disputes") is a back-office form-filler: the same idea as Razorpay's Track 02 example and a well-known product category (Chargeflow, Justt). The winning variant is **Casefile Resolve**: a seller's agent with *bounded money authority*. It settles each PayPal case the cheapest fair way (prove, offer, or refund), proves damage claims with packing-photo vision, and runs on the official PayPal Agent Toolkit, extended with the dispute actions the toolkit is missing.

## Scores (1-10)
| | Casefile (original) | **Casefile Resolve** | Shopfront (runner-up) | Unhold | Agent-purchase mandate receipts |
|---|---|---|---|---|---|
| Tech implementation | 7 | **8** | 8 | 5 | 8 |
| Design / completeness | 6 | **7** | 7 | 6 | 5 |
| Potential impact | 7 | **8** | 5 | 7 | 4 |
| Innovation | 5 | **7** | 6 | 4 | 8 |
| Presentation / video | 5 | **8** | 8 | 4 | 6 |
| P(top-3 or $5k category) | ~7% | **~15%** | ~10% | ~3% | ~7% |
| Solo 10-day feasibility | 7 | **6.5** | 7 | 4 | 5 |

The probabilities are judgment calls, not measurements. The Devpost listing showed 2,277 participants, not the 26k registrants in the brief (unverified which is current).

## One-line pitch
"Your buyer just opened a PayPal case. Casefile already knows whether to prove it, offer a fix, or refund, and does it within the limits you set, before you've finished your coffee."

## Problem and audience
Small PayPal sellers (Etsy/eBay/Instagram/indie) face disputes with deadlines. A lost claim costs the sale plus a $15 fee ($30 at high volume), and a chargeback adds $20.
- Fees: https://www.chargeflow.io/chargebacks-101/paypal-chargeback and PayPal help350 (dispute-rate fee)
- Tracking is essential to Seller Protection and to hold release: https://developer.paypal.com/api/tracking/track-orders/integrate and https://www.paypal.com/smarthelp/article/faq3297
- The incumbents (Chargeflow, Justt) serve larger merchants on a contingency fee. The "~94% of non-responders lose" figure is a vendor claim and unverified.

## PayPal and AI
- **Agent Toolkit (official, sandbox default):** list_disputes, get_dispute, accept_dispute_claim, get_order, create_refund, create/get/update_shipment_tracking, list_transactions. Verified: https://github.com/paypal/agent-toolkit
- **Gap the toolkit doesn't cover:** It has no provide_evidence, make_offer, send_message, escalate or appeal. Add these as custom tools in the same toolkit style on top of the Disputes REST API, then open an upstream PR. Dev-advocate judges will notice; whether they would merge it is unverified.
- **Webhooks:** CUSTOMER.DISPUTE.CREATED / UPDATED / RESOLVED.
- **Sandbox (verified in docs):** Disputes can be created through the sandbox Resolution Center or `POST /v1/customer/disputes` with buyer credentials. `/adjudicate` (BUYER_FAVOR / SELLER_FAVOR) is sandbox-only and fires RESOLVED. Evidence type in tests is OTHER / PROOF_OF_FULFILLMENT. Source: https://developer.paypal.com/platforms/disputes/test-go-live
- **Still unverified:** How a dispute reaches UNDER_REVIEW (adjudicate requires it), whether make-offer can be accepted from the buyer side in sandbox, and the delay of a few minutes after creation.
- **AI (tool-calling agent):**
  1. Classifies the reason and the evidence gaps.
  2. Uses vision to compare the buyer's damage photo with the seller's packing photo, and flags a mismatch or real damage.
  3. Picks a strategy (prove, offer, or refund) with a stated rationale.
  4. Drafts the evidence narrative and the buyer message.
- **Deterministic and outside the LLM:** The seller's money policy (e.g. "auto-offer up to 25% partial refund under $40; anything above needs my tap"), deadlines, and Seller Protection rule checks.
- **Measured results:** Evaluate on about 40 labelled dispute scenarios (built from public seller-forum stories) and report agreement and the false-refund rate in the README.

## 3-minute demo
1. **0:00-0:20 Hook.** Maya's shop, a phone notification: "New PayPal case: Item damaged, $68 mug set."
2. **0:20-0:45 Packing proof.** Earlier, Maya snapped the parcel at packing. Casefile attached it to the order and added tracking via the toolkit (live API call shown).
3. **0:45-1:30 Case 1 (SNAD).** The buyer's photo shows a different glaze. Vision flags the mismatch, Casefile builds evidence, Maya taps once, provide-evidence fires, and sandbox adjudicate leads to a RESOLVED webhook: "You kept $68."
4. **1:30-2:10 Case 2 (real damage).** Vision confirms a crack that matches the item. Under Maya's policy, Casefile makes a 20% partial-refund offer automatically and messages the buyer kindly. "Fixed in 2 minutes instead of 30 days, no claim fee."
5. **2:10-2:35 Case 3 (INR, no tracking).** Casefile says honestly: "You'll likely lose; refund now." It also shows the pre-ship guard that would have prevented it (address-change warning).
6. **2:35-3:00 Results.** An AG Grid case ledger (money kept, fees avoided, policy audit log) and the eval numbers. Close: "Resolve fast, fight fair."

## Prize targets
Best Use of PayPal + AI (primary), Most Impactful, Best Demo Delivery, Agentic Commerce (agent with delegated refund authority; secondary), AG Grid (case ledger), Render (hosting). APIMatic only if it's cheap to add.

## Top risks and mitigations
1. **Sandbox dispute lifecycle breaks** (UNDER_REVIEW, offer acceptance, delays). Spike on Day 1 before any UI. Pre-seed disputes hours before recording. Fall back to the Resolution Center UI. If one action is unworkable in sandbox, show the real API call plus its documented response rather than faking a success.
2. **"Not agentic commerce" / boring back-office.** Frame it as an agent holding money authority under hard limits. Make the vision compare and the auto-offer the on-screen moments. Never show a form.
3. **Political risk ("helps sellers beat PayPal").** Pitch it as making PayPal's process work: complete evidence, fewer escalations to PayPal agents, refunds when the buyer is right. Buyer fairness should be visible (Case 3).

## Why it beats the runner-up (Shopfront: "Store Sync for small sellers via MCP")
Shopfront demos magically, but it fails the user's own test: no seller is complaining about AI-agent discoverability yet. It also re-implements a product PayPal already sells (Store Sync / Agent Ready), and it lands in the most crowded lane (hundreds of shopping-agent entries). Resolve has documented money pain, uses the deepest set of PayPal APIs, has a fairness story PayPal can endorse, and has fewer look-alikes.

Sources: https://github.com/paypal/agent-toolkit · https://developer.paypal.com/platforms/disputes/test-go-live · https://developer.paypal.com/docs/api/customer-disputes/v1/ · https://developer.paypal.com/docsai/growth/agentic-commerce/overview · https://developer.paypal.com/community/blog/PayPal_AI_Hackathon · https://developer.paypal.com/community/blog/winners-dev-days-hackathon · https://www.chargeflow.io/blog/agentic-commerce-chargebacks-liability
