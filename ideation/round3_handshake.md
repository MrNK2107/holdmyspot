# Round 3: Handshake, refined

_2026-11-01. Refiner for Handshake (C#1, also B#2 SafeHandoff and Judge 2's "Handshake Pro"). I resolve the judges' five blocking issues against developer.paypal.com, then give the refined concept, attack it, patch it, and self-score._

_Tags: **[V]** means verified from a source quoted below. **[U]** means unverified and needs the Day-1 spike. No code in this document._

---

## 0. Verdicts on the five blocking issues

### Issue 1: How does a seller with a PERSONAL PayPal account get paid?

**Verdict: Handshake is a PayPal Multiparty (Platform) app. It follows PayPal's own documented in-person-pickup pattern, and the seller is the payee. Casual sellers with personal accounts can onboard *before payment* through Partner Referrals with PayPal Checkout in the US. Going live requires approved-partner status, which is the normal gate for every marketplace. The platform never takes possession of the money.**

Evidence:

| Claim | Status | Source |
|---|---|---|
| Multiparty, onboarding before payment with **PayPal Checkout**: "If you use PayPal Checkout, sellers do not need a business account. They can use their personal account to onboard." The country table marks the US and Canada eligible for **casual** sellers onboarding before payment with PayPal Checkout | **[V]** | https://developer.paypal.com/docs/multiparty/seller-onboarding/ |
| Onboarding **after** payment excludes casual sellers ("sellers with a personal (non-business) type of PayPal account") and **excludes authorization payments**. Lazy "pay first, onboard later" is therefore impossible for Handshake, and the seller has to connect PayPal before sending the first link | **[V]** | same page; https://developer.paypal.com/docs/multiparty/seller-onboarding/after-payment/ |
| Expanded Checkout (card fields) requires a business account. Casual sellers get **PayPal-wallet checkout only** | **[V]** | same page |
| PayPal's in-person-pickup integration: `intent=AUTHORIZE`, `purchase_units.payee` = seller, shipping type `PICKUP_IN_PERSON`, capture "when the buyer and seller meet", optional `platform_fees`. Onboarding must "enable casual and business accounts to accept payments" with product `PPCP`. **It is US only and for approved partners only** | **[V]** | https://developer.paypal.com/limited-release/commerce-platform/v2/payment/enable-in-person-pickup/ |
| Same page: "This feature does not support seller protection because the buyer can verify items before purchasing." | **[V]** | same |
| The platform auth-capture guide says to "use the `purchase_units/payee` object to specify the end receiver of the funds" on order and authorize. Capturing less than the authorization is allowed | **[V]** | https://developer.paypal.com/platforms/checkout/standard/customize/auth-capture.md |
| **Sandbox:** Create App with Type = **Platform** in the dashboard, which auto-creates a "Platform Partner App" sandbox account. "You can call and test the PayPal Complete Payments Platform APIs with your sandbox credentials before you are approved." The page also says to share the client ID with an account manager "to configure your sandbox environment and enable testing" | **[V]** | https://developer.paypal.com/platforms/create-account/ |
| Forum reports of 403 / NOT_AUTHORIZED on sandbox Partner Referrals until PayPal support enables it | **[V that the reports exist]**, current status **[U]** | https://www.paypal-community.com/t5/Sandbox-Environment/Does-sandbox-API-for-Commerce-Platform-need-a-partner-onboarding/m-p/2703565 |
| Buyer side: PayPal Purchase Protection excludes **Item Not Received** for in-person collection, but an item picked up in person can still be **SNAD**-eligible | **[V]** (secondary summary of the US buyer-protection terms) | https://www.paypal.com/us/legalhub/buyer-protection ; https://conductatlas.com/platform/paypal/paypal-buyer-and-seller-protection/in-person-pickup-eligible-for-snad-claims/ |

**Architectures considered:**

| Option | Verdict |
|---|---|
| **A. Multiparty platform. The seller (personal or business account) onboards once through Partner Referrals and is the `payee`. Handshake calls authorize, capture and void with `PayPal-Auth-Assertion` and `PayPal-Partner-Attribution-Id`** | **CHOSEN.** This is PayPal's documented pickup pattern, the money goes buyer → seller directly, and Handshake never holds it. Honest go-live caveat: it needs approved-partner status, and the pickup feature is US-only and limited release. |
| B. "Seller must open a free business account." Order `payee` = their email, created from Handshake's own REST app | **Rejected as the primary.** Without a consent relationship, PayPal returns `PAYEE_NOT_CONSENTED`: "The payee has not consented for the API caller to process this transaction" (https://developer.paypal.com/api/rest/troubleshooting/rest_not_authorized/). Third-party payee plus AUTHORIZE is the riskiest combination **[U]**. It also adds friction that option A removes. |
| C. Handshake is the merchant of record, captures to itself, then sends the seller a Payout | **Rejected.** Handshake would be holding and forwarding other people's money (escrow and money-transmission optics, and almost certainly not allowed by PayPal's terms for an unapproved app). The buyer's statement would show "Handshake", not the seller. A PayPal engineer would flag it immediately. |

**Exactly what is sandbox-demoable:**
- **Tier 1 (target):** a Platform-type sandbox app. Create a referral link through Partner Referrals for a **personal** sandbox seller account, receive MERCHANT.ONBOARDING.COMPLETED and store the seller's `merchant_id`. Every order is then AUTHORIZE with `payee.merchant_id` = seller, and capture and void run with the auth-assertion header. This is fully real and multi-seller.
- **Tier 2 (fallback, if Partner Referrals returns 403 in sandbox and the hackathon Discord/DevRel can't enable it by Day 2):** the seller is a sandbox **business** account whose own REST credentials are stored in Handshake (a "seller self-hosted" demo mode). The money moves the same way (buyer → seller, AUTHORIZE, partial capture, void), but onboarding is pre-linked. The UI shows a visible "Sandbox: seller pre-linked" chip, and the README states exactly which step is stubbed and why.
- In both tiers, Handshake's own account never receives the sale money. `platform_fees` is optional and off by default, because it needs the PARTNER_FEE onboarding feature.

### Issue 2: Partial capture, `final_capture`, payment sources and hold periods

| Question | Answer | Status / source |
|---|---|---|
| What does `final_capture` mean? | "Indicates whether you can make additional captures against the authorized payment. Set to `true` if you do not intend to capture additional payments." After `true`, further captures fail with `AUTHORIZATION_ALREADY_CAPTURED` | **[V]** Payments v2 schema: https://developer.paypal.com/api/payments/v2/schema.yaml |
| Does `final_capture=true` release the remainder? | The current docs don't say explicitly. The legacy API says a "Complete" capture voids the remainder automatically (https://developer.paypal.com/api/nvp-soap/paypal-payments-standard/integration-guide/authcapture/). The authorization status enum includes `PARTIALLY_CAPTURED` | **[U]** for REST and sandbox |
| **Design decision** | Don't depend on implicit release. Use a **partial capture with `final_capture=false`, then an explicit `POST /authorizations/{id}/void`**. PayPal's authorize/capture guidance (per search summary) says an authorization "can also be voided after a partial capture, as long as final_capture was set to false." This gives a deterministic release and a visible `PAYMENT.AUTHORIZATION.VOIDED` webhook. If the explicit void misbehaves in sandbox, use `final_capture=true` as plan B and show `GET authorization` status | Path **[V]** from docs and summary; sandbox behaviour **[U]**, Day-1 spike |
| Hold periods | Authorization valid 29 days, 3-day honor period. Reauthorize from day 4 to day 29 with a new ID and a new 3-day honor period, US up to 115% / +$75. A reauthorization itself can't be voided; void the parent instead (`CANNOT_BE_VOIDED`). A capture can't exceed the authorized amount (422) | **[V]** https://developer.paypal.com/docs/checkout/standard/customize/authorization/ ; Payments v2 schema |
| Contradiction | One PayPal page says "In the United States, authorizations are valid for 3 days." The newer pages say 29 days with a 3-day honor period | **[V]** that the contradiction exists. Design for **meetups within 72h by default**; beyond that, a worker reauthorizes |
| Payment sources | Reauthorize is described as "Reauthorizes an authorized **PayPal account** payment." Casual sellers can only take PayPal Checkout (wallet), not card fields. So Handshake v1 = **PayPal wallet only** (balance, linked bank or card inside the wallet) | **[V]** schema + multiparty eligibility |
| Is authorization allowed for this use? | Yes. It is PayPal's own documented in-person-pickup pattern. Two caveats: "Authorization and capture can incur merchant fees in some markets," and for live PayPal accounts the auth-capture feature may need to be enabled on the account | **[V]** pickup page, platform auth-capture page; enablement note **[U]** |

### Issue 3: Why the SELLER sends the link

Sellers' pains, with sources:
- **No-shows and ghosting:** "2 buyers that agreed to come collect at a certain date & time but never showed up". Facebook's own report flow has "Didn't show up" and "Deliberately low offer" options: https://reddit.sentinel-team.org/subreddits/FacebookMarketplace/snapshots/2026-01-20T05%3A41%3A06.288734Z , https://reddit.sentinel-team.org/subreddits/FacebookMarketplace/snapshots/2026-01-10T04%3A10%3A48.144662Z , https://www.guidingtech.com/how-to-report-and-avoid-scammers-on-facebook-marketplace/
- **Lowballers:** "$5 for a vintage design book I listed at $45", then daily "changed your mind yet?" messages (same Jan-10 snapshot).
- **Fake "payment sent" emails.** The West Mercia Police fraud update describes Marketplace sellers of phones and consoles receiving a fake PayPal email that asks for a tracking number "before the money can go into the victim's account": https://www.ledburytowncouncil.gov.uk/uploads/FRAUD%20UPDATE%20FROM%20WEST%20MERCIA%20POLICE.pdf . A US local-news case: https://www.fox17online.com/news/local-news/kent/man-scammed-by-fake-paypal-emails . A police warning about PayPal impersonation on Marketplace: https://www.wxyz.com/money/consumer/dont-waste-your-money/berkley-public-safety-warns-of-paypal-impersonation-scams-on-facebook-marketplace
- **Scale (both sides):** the FTC says social-media scam losses were $2.1B in 2025, Facebook $794M, and shopping the most-reported type: https://www.ftc.gov/node/330237 , https://search.ftc.gov/system/files/ftc_gov/pdf/social-media-spotlight.pdf . Facebook's Purchase Protection excludes local pickup and off-Facebook payment (Judge 2): https://oneshop.com/blog/facebook-marketplace-purchase-protection

What the seller gets, in the order the pitch says it:
1. **"Held, safe to drive."** The seller sees PayPal's authorization (verified by webhook and `GET`) before leaving home. A buyer who won't place a hold was never coming. That filters out no-shows and lowballers without the seller having to say no.
2. **"Paid" can't be faked.** The seller's own phone shows status from Handshake's server, which reads PayPal. Screenshots and emails count for nothing. A built-in **"Is this email real?"** check takes any "PayPal payment received" email or screenshot and answers from the real order or authorization ID (`get_order` / `GET authorization`), never from the email's text.
3. **The price is locked.** The hold is for the agreed price. Renegotiation can only go *down*, and only with an inspection reason both people see. "$200 cash, take it or leave it" at the curb loses its leverage.
4. **A record of what the buyer checked.** A timestamped packet of the listing, the inspection photos, the AI checklist results and both taps. Seller Protection doesn't cover pickups, so this is an honest claim: it is *evidence* the seller can submit if the buyer later files SNAD for a defect they inspected and accepted. It is not a guarantee.

The seller's copy-paste message: _"I take Handshake: tap to hold $340 with PayPal. You're not charged until you've seen it in person."_

### Issue 4: The AI's exact job, and how it's measured

**The AI is advisory.** Every money action is a human tap or a deterministic rule. AI output never reaches a PayPal call directly, except that its advisory price can pre-fill a number, which code then clamps to at most the authorized amount and which both people must accept.

| AI task | Why plain code can't do it | Output |
|---|---|---|
| **1. Listing → item-specific checklist** | Free-text listing plus seller photos → 5–8 checks a layperson wouldn't think of: "iPhone 13 128GB blue: Settings > General > About shows 128GB; Activation Lock off; battery health ≥ 85% (listing says 'great battery'); crack in the bottom-left corner of the case (photo 3)." No rule table covers every item category, and the checks depend on what this listing *claims* | A structured checklist, each check with a source citation (listing sentence or photo index) |
| **2. Same unit and same condition** | Compare 2–4 curb photos with the listing photos for identity marks (scratches, stickers, colour, model text) and new damage, which needs visual reasoning across images | Per-check verdict: match / mismatch / **can't tell**, with the image region and reason |
| **3. Read on-screen and label states in frame** | OCR plus meaning: battery-health percentage, storage, an Activation Lock screen, a serial or IMEI label, a "Hello" setup screen | Facts linked to checklist items |
| **4. Discrepancy → suggested adjustment range** | Turns "battery 81% vs 'great battery'" into a defensible range with the reason in plain words | A suggestion only. **Code** clamps it, and **both humans** must accept the exact number |
| **5. Fake-payment-message triage** | Classify a pasted email or screenshot as PayPal-like or not and extract any claimed ID | Classification only. **The verdict comes from code** (`get_order`) |

**What is deliberately NOT AI:** capture, void and reauthorize decisions; amounts above the authorization (blocked in code, and PayPal returns 422 anyway); timers (no-show void, reauthorize); payment verification; webhook handling.

**Eval (published in the README and shown for 8 seconds in the video):**
- **Dataset: about 60 listing↔curb pairs across 4 categories** (phones, small electronics, bikes, furniture). Sources:
  - About 15 of my own household items, each photographed as "listing" and "curb", as three variants: same unit (match), same model but a different unit (swap), and the same unit with a staged defect (a cracked case, a missing charger, a non-matching sticker).
  - About 15 public listing images paired with images of the same model from other sources (to test swaps).
  - All licences noted. No copyrighted listing photos in the repo; use URLs or my own photos.
- **Labels:** the per-check truth, written by me *before* running the model.
- **Metrics:**
  - **Mismatch recall** (did it flag the swap or defect?).
  - **False-alarm rate on honest pairs.** This is the cost that matters, because a false flag cheats an honest seller. Report it with high prominence, and set the target first: **≤5% false alarms**, then maximise recall.
  - **Abstain rate** ("can't tell" is allowed and counts neither as right nor wrong).
  - **Checklist usefulness:** the fraction of my hand-written "must check" items the generated checklist covers.
  - **Latency** per inspection (target under 8s for 3 photos).
- **Baseline:** a non-AI baseline of perceptual hash plus colour histogram on the same pairs. This shows what the LLM adds (it should beat the hash on same-model swaps and on reading screens; the hash may win on exact re-uploads).
- **Honesty line in the README:** "Advisory. ~60 pairs, author-labelled, not an independent benchmark."

### Issue 5: Failure paths on screen

Video (both shown):
1. **Wrong unit → void.** The second meetup in the video: the AI flags "Activation Lock is ON. This phone is tied to someone else's Apple ID", and model text on the back doesn't match. The buyer taps **Walk away** → void → `PAYMENT.AUTHORIZATION.VOIDED` → the seller's phone shows "Hold released. No money moved."
2. **A system unhappy path, as a 5-second "under the hood" overlay:** the seller's phone double-fires the release. Both calls carry the same `PayPal-Request-Id`, and PayPal returns the same capture (an idempotent 200 response is defined in the Payments v2 schema), so there's no double charge. Then a capture on the voided authorization → 422 `AUTHORIZATION_VOIDED`, which the UI shows as "Already released".

Also implemented and in the README test matrix: AI "can't tell" (bad light) → the buyer is asked for one more photo; a seller no-show (not checked in by T+20 min) → automatic void, the safe direction; honor period passed → worker reauthorizes, or voids if reauthorization fails; `AUTHORIZATION_EXPIRED`; webhook signature failure → ignored, then reconciled by polling `GET`; a buyer closes the tab mid-flow → state is recovered from the server.

---

## 1. The refined concept

**Name:** **Handshake**

**One-line pitch:** _"Send a Handshake link instead of 'cash only'. PayPal holds the buyer's money before anyone drives anywhere. At the curb, AI checks the item against the listing, and the deal closes for the full price, a fair lower price, or nothing."_

**Target user:**
- **Primary (the one who adopts): US casual sellers** on Facebook Marketplace, Craigslist and OfferUp, selling things worth $100–$1,500 (phones, consoles, bikes, furniture). They're tired of no-shows, lowballers and fake "payment sent" emails.
- **Secondary:** the buyer, who gets a free, no-install web page. The buyer is protected from paying for a swapped or broken item and from scams that move them to Friends & Family.

**Not for:** shipped sales (PayPal's normal checkout covers those), items over about $2k, or meetups more than 29 days out.

### Flow and PayPal APIs per step

| Step | What happens | PayPal | AI |
|---|---|---|---|
| 0. Seller connects PayPal (once) | "Connect PayPal" → Partner Referrals link (PayPal Checkout, PPCP, features PAYMENT + REFUND), personal account allowed | `POST /v2/customer/partner-referrals`; webhook `MERCHANT.ONBOARDING.COMPLETED`; store `merchant_id` | — |
| 1. Seller creates a link | Pastes listing text and photos; sets price and a meetup window; optionally names a public "safe exchange zone" | — | **Checklist generated**; seller can edit it (the seller sees what the buyer will check, which builds trust) |
| 2. Buyer opens the link | Sees the listing, the checklist and plain-English terms ("held, not charged; released only by you at the meetup; auto-released if the seller doesn't show") | Orders v2 `create` with `intent=AUTHORIZE`, `payee.merchant_id`, shipping `PICKUP_IN_PERSON`, `PayPal-Partner-Attribution-Id`, `PayPal-Request-Id`; JS SDK button with `intent=authorize` | Answers questions only from the listing (optional, cut first) |
| 3. Hold placed | Both phones show "Held $340" | `POST /v2/checkout/orders/{id}/authorize`; webhook `PAYMENT.AUTHORIZATION.CREATED` (+ `GET` to confirm) | — |
| 4. Seller's "Is this payment real?" | Pastes an email or screenshot | Toolkit **`get_order`** / `GET /v2/payments/authorizations/{id}` | Classifies and extracts; code decides |
| 5. Meetup check-in | Both tap "I'm here" | — | — |
| 6. Inspection | Buyer takes 2–4 guided photos per checklist step | — | **Same-unit and condition check; on-screen facts; verdict with reasons** |
| 7a. Full release | Buyer taps Release → seller sees **Paid** → handover | `POST /authorizations/{id}/capture` (full); `PAYMENT.CAPTURE.COMPLETED` | — |
| 7b. Fair lower price | AI suggests $300–$315; code clamps; seller proposes $310; buyer accepts | Capture $310 with `final_capture=false`, then `POST /authorizations/{id}/void`; `CAPTURE.COMPLETED` + `AUTHORIZATION.VOIDED` | Suggestion and reason |
| 7c. Walk away | Either side cancels | `void` → `AUTHORIZATION.VOIDED` | Explains why |
| 8. Timers (worker) | Seller no-show → void; meetup on day 4 or later → reauthorize; day 29 → void | `void`, `reauthorize` | — |
| 9. After the sale | Evidence packet saved; "it died the next day" → seller can refund in one tap | Toolkit **`create_refund`**, `get_refund` | Summarises the packet |

**Agent Toolkit usage (honest and sized):**
- Use toolkit tools for `get_order`, `create_refund` and `get_refund`.
- Add three **custom tools in toolkit style**: `capture_authorization`, `void_authorization`, `reauthorize_authorization`. The toolkit has no authorization tools (round 1 verification).
- These tools sit behind a **policy gate in code**: the agent may call `void` on its own (it only ever releases money), but `capture` needs a signed two-party consent record (buyer tap + seller tap + amount ≤ authorization).
- This is "an agent with bounded authority over a held payment". It is not a chatbot, and it doesn't pretend the LLM is in charge of money.
- An upstream PR is optional. Hackathon entrants are already sending PRs, so it is no longer a differentiator.

**Stack:** a Next.js mobile-first web app (no install), Node API, Postgres, and a Render **web service + background worker** (timers, reauthorize, webhook reconciliation). The model is a vision-capable hosted LLM with structured output, named in the Devpost "Tools" section.

**Safety and trust copy in the product:** suggest a public safe-exchange spot; never ask for the buyer's card; "Handshake never holds your money: PayPal does."

---

## 2. The 3-minute video, beat by beat

| Time | Beat |
|---|---|
| 0:00–0:15 | **Cold open, seller's pain.** Maya's phone: "is this available?" ×3, "$150 cash?", then a convincing "PayPal: Payment received $340, provide tracking to release funds" email. Caption: _FTC: $2.1B lost to scams that started on social media in 2025. Facebook: $794M._ |
| 0:15–0:30 | Maya pastes that email into Handshake → "No PayPal payment exists for this sale. This email is fake." (Code checks PayPal; the AI only reads the email.) "Send a Handshake link instead." |
| 0:30–0:50 | Maya creates the link: listing photos → an **AI checklist** appears with citations. Onboarding shown in 3 seconds: "Connected with your personal PayPal account." |
| 0:50–1:05 | Buyer (Sam) opens the link on another phone, sees the checklist and "held, not charged", approves in PayPal sandbox → both phones flip to **"Held $340: safe to drive."** Webhook log ticks on a side panel. |
| 1:05–1:50 | **Hero, at the curb (outdoors, two phones).** Sam takes 3 guided photos. Overlays tick: "Same unit: bezel scratch matches listing photo 3 ✓ · 128GB ✓ · Activation Lock off ✓ · Battery 81% (listing: 'great battery') ⚠". Suggestion: "Fair range $300–$315. Your call." Maya offers $310 and Sam taps Accept → **capture $310 → void $30**, two webhooks. Maya's phone: "Paid $310." The phone is handed over. |
| 1:50–2:15 | **Failure path.** A second buyer meets a different seller. AI: "Activation Lock ON. This phone belongs to another Apple ID." The buyer taps Walk away → void → "Hold released. No money moved." Overlay: double-tap release → same `PayPal-Request-Id`, no double charge; capture after void → 422 handled. |
| 2:15–2:35 | **Under the hood** (one screen): the architecture strip (Partner Referrals → AUTHORIZE with payee=seller → capture/void/reauthorize; worker timers; the AI advisory box with "code decides money"). Eval card: "60 pairs · false alarms 4% · swap recall 85% · abstain 10%" (**placeholder numbers; show the real ones**). |
| 2:35–2:55 | **Why PayPal:** "This is PayPal's own in-person-pickup pattern, made usable by anyone with a personal PayPal account, plus the inspection a non-expert can't do." Honest line: "Sandbox today. Production needs PayPal partner approval." |
| 2:55–3:00 | Tagline: _"Hold it. Check it. Shake on it."_ |

Recording notes:
- A friend holds the second phone, or use one phone plus a laptop browser in "phone" mode.
- Record the curb scene with stills, not live video inference.
- Pre-seed one authorization on Nov 2 so a real reauthorization (day 4 or later) can be shown in the README log.
- No third-party trademarks in the video: blur the Apple logo, and say "phone" in voice-over. Marketplace logos stay off screen.

---

## 3. Prize targeting

- **One sponsor prize: Render.** It is used meaningfully: web service + background worker (timers are core to correctness: no-show void, reauthorize, reconciliation) + Postgres. The prize is small (credits), but it fits honestly. AG Grid would be bolted on, and Bryntum doesn't fit. Don't spend effort on others.
- **Grand and category lines to aim the video at:** Best Demo Delivery and Most Creative first, then Best Use of PayPal + AI. (Per the FAQ, at most one sponsor prize plus one grand prize or honorable mention. Check in the rules which bucket the $5k category prizes fall into **[U]**.)

---

## 4. Ten-day build scope (Nov 2 – Nov 12, submit early check by Nov 5)

**Must have:**
1. Seller onboarding, Tier 1 or Tier 2 (decided by end of Day 2).
2. Link creation → AI checklist (editable).
3. Buyer page → AUTHORIZE (PayPal wallet) → both-phone live status (webhooks + `GET` polling fallback, signature verification, idempotency keys).
4. Guided inspection → AI verdict per check, including "can't tell".
5. Release full / partial capture + void / walk-away void, each with a two-tap consent record.
6. Worker: seller no-show void, reauthorize, day-29 void.
7. Fake-payment-email check (via `get_order`).
8. Eval harness + README results table + baseline.
9. README: architecture, sandbox tiers, "what broke and how we fixed it", 5-minute setup, LICENSE, seed script that creates sandbox accounts and data.
10. Video.

**Should (only if ahead on Day 7):** evidence-packet PDF; one-tap post-sale refund via `create_refund`; a buyer no-show fee (see attack #7: risky, off by default).

**Cut:** agent-vs-agent haggling; pre-meetup Q&A chatbot; Disputes API evidence submission (Seller Protection doesn't apply, and the sandbox dispute lifecycle is fragile); cards / Expanded Checkout; Venmo; native app; Payouts.

**Day plan:**
- **D1:** spikes (below) and the skeleton on Render.
- **D2:** onboarding tier decided; orders and authorization.
- **D3:** capture, void, reauthorize, webhooks, worker.
- **D4:** checklist AI.
- **D5:** inspection AI; collect the eval photos.
- **D6:** eval runs and tuning; the fake-email check.
- **D7:** UX polish, failure states.
- **D8:** README and seed scripts; early Devpost submission.
- **D9:** film.
- **D10:** edit, final submit (Nov 12 evening IST).

---

## 5. Top risks and the Day-1 spike checklist

| Risk | Likelihood | Mitigation |
|---|---|---|
| Sandbox Partner Referrals is gated (403) | Medium | Ask in the hackathon Discord/DevRel on Day 1; Tier 2 fallback; README honesty |
| AUTHORIZE with `payee` = a different merchant fails in sandbox | Medium | Tier 1 uses auth-assertion as documented; Tier 2 uses the seller's own credentials |
| Partial capture then void misbehaves | Low–medium | Plan B: `final_capture=true` plus status check; if both fail, the hero becomes full release vs walk away (still a strong story) |
| Vision false alarms | Medium | Advisory only, abstain allowed, a false-alarm target, the eval on screen |
| Filming two phones outdoors solo | Medium | Friend, or tripod plus a browser device frame; stills |
| Judges: "only one API family" | Medium | Partner Referrals + Orders + Payments (auth/capture/void/reauth) + webhooks + toolkit tools + refunds: 5 surfaces |

**Day-1 spike checklist (kill test by the end of Day 1):**
- [ ] Create a **Platform**-type sandbox app; confirm the "Platform Partner App" account exists.
- [ ] Partner Referrals call → onboard a **personal** sandbox account → record whether it succeeds or returns 403, and whether `MERCHANT.ONBOARDING.COMPLETED` arrives.
- [ ] Orders v2 AUTHORIZE with `payee.merchant_id` = that seller and `PICKUP_IN_PERSON` → buyer approval in sandbox → authorize.
- [ ] Capture $310 of $340 with `final_capture=false` → void → `GET` shows the expected statuses (`PARTIALLY_CAPTURED` then `VOIDED`?) → both webhooks received. Repeat with `final_capture=true` and record what happens to the remainder.
- [ ] Same `PayPal-Request-Id` twice → idempotent response; capture after void → 422 `AUTHORIZATION_VOIDED`.
- [ ] Create a long-lived authorization today for the day-4+ reauthorize demo.
- [ ] Toolkit `get_order` against a sandbox order (with auth assertion or seller creds).
- [ ] Vision smoke test: 3 pairs (match / swap / defect) → structured output under 8s.
- [ ] Kill rule: if Tier 1 **and** Tier 2 both fail to authorize to a seller payee by the end of Day 2, fall back to HoldMySpot (same engine, unambiguous merchant), as the judges agreed.

---

## 6. Hostile PayPal engineer attacks, and the patches

1. **"Your production story needs approved-partner status a student can't get, and the pickup feature is limited release."**
   - Patch: agreed and stated on screen. This is the same gate every marketplace (OfferUp-scale) passes. The product case is that **PayPal already built this primitive and it has no consumer front end**.
   - A realistic route to market is as a feature licensed to an existing approved marketplace partner. The sandbox shows the exact production call sequence, not a substitute flow.
2. **"Casual sellers only get wallet checkout. Buyers without PayPal are locked out."**
   - Patch: true, so v1 is wallet only. PayPal accounts are widely held in the US (number not cited **[U]**), and a guest/card path would need the seller to have a business account (Expanded Checkout).
   - The UI offers "Seller has a business account? Card checkout available" as a roadmap item, not a demo feature.
3. **"The 3-day honor period makes a Saturday meetup set on Monday unreliable."**
   - Patch: the default meetup window is ≤72h. Otherwise the worker reauthorizes on day 4 or later (PayPal-wallet authorizations only, allowed once per the reauthorize schema text), and the buyer is told up front. A failed reauthorize → void plus notify both sides. That's in the test matrix.
4. **"Who stops the buyer from taking the item and never tapping Release?"**
   - Patch: the protocol is **release before handover**. The seller's phone (authenticated, server-driven, from a PayPal capture webhook or a `GET` of the capture) must show Paid before the item changes hands.
   - The seller is coached in-app: "Only your phone counts. Never a buyer's screen."
5. **"After capture, the buyer files SNAD. You've told the seller they're protected."**
   - Patch: we never say "protected". Seller Protection doesn't apply to pickups (PayPal's own doc). We say "a record of what the buyer inspected and accepted", which the seller can submit as evidence; PayPal decides.
   - Removed every "you won't lose" phrase.
6. **"The AI says 'matches', the item fails, and the buyer blames you."**
   - Patch: every AI line is labelled "Suggestion". Abstain is allowed. The buyer's tap confirms "I inspected it myself". The eval and false-alarm rate are published.
   - The AI never triggers capture, and its price suggestion is clamped and needs both people's consent.
7. **"Capturing a no-show fee from an authorization for goods never delivered invites unauthorized-transaction disputes."**
   - Patch: the no-show fee is **cut from the demo** and off by default. The hold already does the seller's filtering, and the safe automation is void only.
8. **"Webhooks arrive late or twice in sandbox."**
   - Patch: verify signatures, store event IDs (dedupe), drive state from `GET` reconciliation by the worker, and use `PayPal-Request-Id` on every write. "What broke" goes in the README.
9. **"You're an escrow service."**
   - Patch: Handshake never holds funds. The authorization is PayPal's, the payee is the seller, and the seller's money never touches a Handshake account (option C was rejected for this reason).
10. **"Fees."**
    - Patch: the seller pays PayPal's standard goods-and-services fee (the exact rate is not quoted here **[U]**), and "Authorization and capture can incur merchant fees in some markets" (PayPal). The pitch frames the fee as cheaper than one fake-payment loss, and the README is honest about it.
11. **"Personal safety at meetups."**
    - Patch: the link suggests public safe-exchange zones and never shows the seller's address until both check in. Out of scope beyond that.

**What I could not patch:** Partner Referrals sandbox access (depends on PayPal); the exact `final_capture=true` remainder behaviour (spike); the US-only and limited-release status of the pickup feature.

---

## 7. Self-score (/10)

| Criterion | Score | Reason |
|---|---|---|
| Tech | **8** | Partner Referrals + Orders AUTHORIZE with seller payee + capture/partial capture/void/reauthorize + webhooks + toolkit tools behind a code policy gate is deep and correct, but it rests on one Day-1 sandbox assumption (Tier 1). |
| Design | **7** | Two linked mobile pages with honest status and failure states form a complete product, though a two-sided state machine is hard to polish solo. |
| Impact | **8** | A mass audience with FTC-scale losses and a documented protection gap, and the seller now has a selfish reason to send the link; it isn't 9 because it is wallet-only and partner-gated in production. |
| Innovation | **8** | A consumer front end and AI inspection on top of PayPal's own pickup primitive exist nowhere on Devpost (the look-alikes are blockchain escrow). |
| Presentation | **9** | A fake email busted, a held $340, a curb renegotiation to $310 with a released $30, and a wrong-unit walk-away: four visceral beats in under 3 minutes. |
| Feasibility | **6** | The core is small, but onboarding gating, two-device filming and the vision eval are three independent risks for one person in 10 days. |
| User-fit | **9** | Everyone has bought or sold locally, PayPal holding the money is the product, the AI does the inspection a layperson can't, and it pitches in one sentence. |
| **Total** | **55/70** | Same as Judge 2's total, but issue #1 now has a documented and honest answer instead of a hand-wave. |

## Sources
- https://developer.paypal.com/docs/multiparty/seller-onboarding/
- https://developer.paypal.com/docs/multiparty/seller-onboarding/after-payment/
- https://developer.paypal.com/docs/multiparty/seller-onboarding/before-payment/
- https://developer.paypal.com/limited-release/commerce-platform/v2/payment/enable-in-person-pickup/
- https://developer.paypal.com/platforms/checkout/standard/customize/auth-capture.md
- https://developer.paypal.com/platforms/create-account/
- https://developer.paypal.com/docs/multiparty/checkout/standard/integrate/
- https://developer.paypal.com/docs/checkout/standard/customize/authorization/
- https://developer.paypal.com/api/payments/v2/schema.yaml (final_capture, PARTIALLY_CAPTURED, AUTHORIZATION_ALREADY_CAPTURED, CANNOT_BE_VOIDED, reauthorize text, idempotent 200 example)
- https://developer.paypal.com/api/rest/troubleshooting/rest_not_authorized/
- https://developer.paypal.com/api/nvp-soap/paypal-payments-standard/integration-guide/authcapture/ (legacy: a complete capture voids the remainder)
- https://www.paypal-community.com/t5/Sandbox-Environment/Does-sandbox-API-for-Commerce-Platform-need-a-partner-onboarding/m-p/2703565
- https://www.paypal.com/us/legalhub/buyer-protection ; https://conductatlas.com/platform/paypal/paypal-buyer-and-seller-protection/in-person-pickup-eligible-for-snad-claims/
- https://www.ftc.gov/node/330237 ; https://search.ftc.gov/system/files/ftc_gov/pdf/social-media-spotlight.pdf
- https://www.ledburytowncouncil.gov.uk/uploads/FRAUD%20UPDATE%20FROM%20WEST%20MERCIA%20POLICE.pdf ; https://www.fox17online.com/news/local-news/kent/man-scammed-by-fake-paypal-emails ; https://www.wxyz.com/money/consumer/dont-waste-your-money/berkley-public-safety-warns-of-paypal-impersonation-scams-on-facebook-marketplace
- https://reddit.sentinel-team.org/subreddits/FacebookMarketplace/snapshots/2026-01-20T05%3A41%3A06.288734Z ; https://reddit.sentinel-team.org/subreddits/FacebookMarketplace/snapshots/2026-01-10T04%3A10%3A48.144662Z ; https://www.guidingtech.com/how-to-report-and-avoid-scammers-on-facebook-marketplace/
- https://oneshop.com/blog/facebook-marketplace-purchase-protection
