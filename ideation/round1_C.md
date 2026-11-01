# Round 1, Ideator C: innovation and an unforgettable demo

_2026-11-01. Lens: novel, emotional on video, grounded in a pain people complain about, and built for a broad non-developer audience. "UNVERIFIED" marks claims I did not confirm from a source._

## Shared facts I verified

- **PayPal Agent Toolkit tools** (https://github.com/paypal/agent-toolkit, sandbox is the default):
  - Invoices (20 tools, including `generate_invoice_qr_code`, `send_invoice_reminder`, `record_payment_for_invoice`, `create_conditional_rules_for_invoice`, and recurring series)
  - Orders: `create_order`, `get_order`, `pay_order`, `create_refund`, `get_refund`
  - Disputes (3 tools), Tracking (3), Catalog (3), Subscriptions (7), Reporting (2)
  - **No Payouts tools and no authorize/capture tools.** Those would have to be added as custom tools over REST.
- **Authorize now, capture later** (Orders v2 `intent=AUTHORIZE`):
  - A hold lasts up to 29 days, with a 3-day honor period. Reauthorization is possible from day 4 to day 29 and gives a new authorization ID.
  - This is the mechanism a "hold the money until the handoff" product needs.
  - Sources: https://developer.paypal.com/docs/checkout/standard/customize/authorization , https://docs.paypal.ai/payments/methods/paypal/delayed-capture
  - Sandbox works for authorize, capture and void through the REST API (standard; UNVERIFIED that the sandbox enforces honor-period timing).
- **Friends & Family payments have no buyer protection.** Scammers push buyers toward F&F for that reason, and Goods & Services is the protected option. https://www.paypal-community.com/t5/Managing-Risk-and-Fraud/Cancelled-friends-and-family-payment/td-p/2729438 , https://closo.co/blogs/platform-specific-guides/is-paypal-safe-to-use-for-facebook-marketplace

---

## 1. Handshake: "Pay at the curb. Released at the handshake."

**One-line pitch:** For Facebook Marketplace, Craigslist and OfferUp meetups. The buyer's money is held by PayPal before anyone drives anywhere. At the meetup, the buyer points their phone at the item, AI checks it against the listing photos, and one tap releases the money.

**Audience and pain:**
- Anyone who buys or sells used goods locally. This is a mass, non-technical audience.
- Each side carries a different risk today:
  - The buyer pays a stranger through F&F, Zelle or cash with no protection, or arrives to find a different or broken item.
  - The seller gets no-shows, fake "payment sent" emails and lowballers.
- Evidence:
  - FTC: social media is the top contact method for scam losses ($2.7B reported since 2021). Online shopping is the most common social media scam category (44% of reports in H1 2023). Facebook led platform losses in 2025. https://www.securitymagazine.com/articles/99992-ftc-finds-that-social-media-scams-lead-to-more-losses-than-other-scams , https://www.wcpo.com/life/money/ftc-reports-social-media-scams-caused-more-than-90-million-in-losses-in-2025
  - Fake PayPal receipts and deposit scams: https://maketecheasier.com/common-facebook-marketplace-scams/ , https://www.thinkmoney.co.uk/blog/the-facebook-marketplace-scams-you-didnt-know-about/
  - Seller pain from no-shows and "is this still available" ghosting (r/FacebookMarketplace snapshots): https://reddit.sentinel-team.org/subreddits/FacebookMarketplace/snapshots/2026-01-10T04%3A10%3A48.144662Z , https://www.theautopian.com/the-message-everyone-hates-to-get-on-facebook-cotd/
- **UNVERIFIED:** Facebook's own Purchase Protection does not cover local pickup or cash deals. I believe this is true but have not sourced it. It is the gap Handshake fills.

**PayPal APIs:**
- **Orders v2 with intent AUTHORIZE:** the buyer approves a hold when the meetup is set. This works in the sandbox.
- **Authorizations:**
  - `capture` when the handoff is confirmed.
  - `void` when the buyer rejects at the meetup or the seller no-shows.
  - `reauthorize` for meetups more than 3 days out.
- **Partial capture:** used when the AI finds a defect and both sides agree to a lower price on the spot. The authorization stays open, the agreed amount is captured, and the rest is voided.
- **Webhooks:** PAYMENT.AUTHORIZATION.CREATED, PAYMENT.CAPTURE.COMPLETED and PAYMENT.AUTHORIZATION.VOIDED drive both phones' live status.
- **Agent Toolkit:** `create_order`, `get_order` and `create_refund` for the post-meetup "it died the next day" window. Add custom `capture_authorization` and `void_authorization` tools in toolkit style, and offer them as an upstream PR, the same play the critic suggested for Casefile.
- **Disputes (optional):** if a captured sale is contested, the meetup evidence (photos, AI report, timestamps) is ready.

**What the AI does, and why AI is needed:**
1. **Listing to checklist.** A vision model reads the listing photos and text and builds an inspection checklist for that specific item: "iPhone 13, 128GB, blue. Check the serial on the box, the screen for cracks, the battery health screen, and that Activation Lock is off." A non-expert buyer doesn't know what to check, and the AI does.
2. **Live inspection at the curb.** The buyer films the item. The AI compares it to the listing:
   - Same object? (scratches, color, model markings)
   - Condition matches the claim?
   - Red flags? (a different model, an iCloud lock screen)
   It returns a verdict with reasons and a suggested fair price if there's a defect.
3. **Fair-price renegotiation.** If there's a mismatch, the AI proposes a partial price from comparable items. Both phones get a one-tap "accept $X". A deterministic rule enforces that the capture can't exceed the authorized amount.
4. **Scam-message shield (cheap add-on).** The seller pastes a "payment sent" email or a buyer chat, and the AI flags fake PayPal receipts and "I'll send extra for shipping" scripts. This verifies payment status against the real authorization through `get_order`, not by reading the email.

**Deterministic, outside the LLM:**
- Capture is never more than the authorized amount.
- Capture needs the buyer's tap, or an expiry rule.
- Voids happen automatically on no-show timeouts.

**The 20-second hero moment:** Split-screen with two phones in a parking lot. The buyer points the camera at a used iPhone. Text overlays tick through: "Model matches ✓ · Scratch on bezel matches listing photo 3 ✓ · Battery health 81% (listing said 90%) ⚠". The AI says: "Fair price with 81% battery: $310 instead of $340." Both phones show "Accept $310?" Two taps, and a PayPal sandbox capture of $310 fires. The seller's phone buzzes "$310 received", and the remaining $30 hold is released. Real webhook, real money state.

**Crowdedness check:**
- AI escrow on Devpost is all blockchain (AI Decentralized Escrow on Polygon: https://devpost.com/software/ai-decentralized-escrow , https://devpost.com/software/ai-decentralized-escrow-ruwgvh ; lablab TrustArc on Arc/USDC).
- I found no PayPal authorize/capture "meetup escrow" with vision inspection. **Low crowding.**
- The generic "AI marketplace seller" idea exists (AutoSeller AI, CartAI), but those are online-only.

**Weaknesses:**
- **Demo realism:** the sandbox needs two accounts on two devices. That works, but staging a parking-lot video solo is a little awkward (a friend can hold the second phone).
- **Adoption chicken-and-egg:** both parties need the app. Mitigation: the seller sends a link, and the buyer uses a web page with no install. PayPal checkout is already familiar.
- **Vision reliability:** the AI can't truly read battery health from a photo of the settings screen unless the screen is in frame (fine for the demo). "Same object" matching is fuzzy. Keep the AI's verdict advisory, and the human taps.
- **UNVERIFIED:** whether sandbox partial capture plus void of the remainder behaves exactly like live (`final_capture=true` should release the rest).
- **Policy:** PayPal's terms on using authorizations as escrow for peer-to-peer sales could need a merchant model. The seller would need to be a PayPal business account or the platform a partner. Frame it as the seller's "checkout" in the pitch.

**My take:** This is my top pick for "Most Creative" and "Best Demo Delivery". It also has a strong claim to Agentic Commerce if the seller-agent negotiation in #2 is folded in.

---

## 2. Haggle: "Your listing gets its own sales agent."

**One-line pitch:** A seller's AI agent answers every "is this still available?", negotiates within the seller's hidden floor price, and only lets a buyer book a pickup once they've placed a refundable PayPal deposit. No-shows and lowballers just disappear.

**Audience and pain:**
- Casual sellers on Marketplace, Craigslist and OfferUp.
- The pain:
  - Dozens of empty "is this available?" messages (37 on day one in one post; a 50:1 ratio in another).
  - Ghosting after agreeing a price.
  - $5 offers on a $45 item followed by daily nagging.
  - Evidence: https://reddit.sentinel-team.org/subreddits/FacebookMarketplace/snapshots/2026-01-10T04%3A10%3A48.144662Z , https://reddit.sentinel-team.org/subreddits/FacebookMarketplace/snapshots/2026-01-20T05%3A41%3A06.288734Z , https://embedded.substack.com/p/the-new-rules-of-facebook-marketplace

**PayPal APIs:**
- **Orders v2 AUTHORIZE** for a small hold deposit (e.g. $10) when a pickup slot is booked. Capture it if the buyer no-shows, void it on a completed sale, or roll it into the full payment.
- **Invoicing** through the toolkit (`create_invoice`, `send_invoice`, `generate_invoice_qr_code`) for the final price, with the QR shown at pickup.
- **Webhooks** for deposit placed, paid and voided.
- **Optional:** a buyer agent on the other side, giving PayPal-mediated agent-to-agent commerce.

**What the AI does:**
- Negotiates in natural language within the seller's private policy: floor price, bundle rules, "no holds without a deposit", and "first to deposit wins".
- Detects scam scripts (overpayment, "my mover will pick up", fake-shipping offers).
- Answers item questions from the listing.
- Summarizes buyer seriousness.
- The floor price is enforced deterministically, so the LLM never sees it as negotiable text. It only gets "accept / counter at ≥X".

**The 20-second hero moment:** A seller's phone sits face-down on a table while 30 messages roll in on screen. Cut to the agent's view:
- 27 "still available?" answered.
- 2 lowballers politely declined.
- 1 buyer negotiated from $120 to $105.
- "Deposit $10 placed via PayPal ✓ Pickup Sat 2pm."

Then a buyer agent (a second LLM) haggles live with the seller agent, with a price ticker converging, ending in a PayPal sandbox authorization.

**Crowdedness check:** Agent-vs-agent haggling exists on Devpost. CartAI (https://devpost.com/software/cartai), The Haggle (https://devpost.com/software/the-haggle), ArcAgent on lablab, and Anthropic's own "Project Deal" agent-to-agent experiment has been widely covered. **Medium-high crowding for the haggling itself.** The no-show deposit through a PayPal authorization is the novel part.

**Weaknesses:**
- Marketplace has no API, so the agent can't actually live inside FB Messenger. The demo would use its own listing page or chat link. That's an adoption gap a judge will notice.
- Haggling is already done. On its own this is weaker than Handshake. **Best used as the "before the meetup" half of Handshake.**

---

## 3. Kitty: "The group chat collects the money so nobody has to chase."

**One-line pitch:** Add Kitty to a WhatsApp or Telegram group: "collect $25 each for Priya's farewell gift by Friday." Kitty sends each person a PayPal link, nudges stragglers privately (never publicly shaming them), shows a live tally, and pays the organizer or buys the gift. If the goal isn't met, it refunds everyone.

**Audience and pain:**
- Office collections, group gifts, class trips, team dinners, wedding parties. Very broad and very relatable.
- PayPal killed Money Pools in 2021 and pointed users to Send/Request. Vendors (Collctiv, Collection Pot) built businesses on that gap. https://www.collctiv.com/blog/paypal-money-pools-timeline , https://wise.com/gb/blog/paypal-money-pool-alternatives , https://www.thankbox.com/blog/paypal-collection-alternatives-for-efficient-group-gifting
- The social awkwardness is well documented: https://www.cbsnews.com/news/the-party-fund-problem-collecting-money-in-the-workplace , https://www.askamanager.org/?p=11973 , https://yourtango.com/node/380602

**PayPal APIs:**
- **Invoicing** through the toolkit: one invoice per member (`create_invoice`, `send_invoice`), with `send_invoice_reminder` driven by the AI's timing and `record_payment_for_invoice` for cash contributors. Alternatively, Orders per contributor.
- **Refunds** (`create_refund`) when a goal fails.
- **Payouts** (REST, sandbox OK) to forward the pot to the organizer or recipient.
- **Webhooks** (INVOICING.INVOICE.PAID) update the group tally.

**What the AI does:**
- Parses the messy group-chat intent: "everyone except Raj, he already gave cash; Mike's paying for his wife too."
- Writes tactful, personalized private nudges.
- Handles "can I put in $10 instead?"
- Suggests a gift within the pot and drafts the card.

**The 20-second hero moment:** A real-looking group chat. Someone types "Kitty, collect $25 from everyone for Priya, deadline Friday." Seven PayPal links appear as DMs, and the tally bar fills to 6/7 as payments land via webhook. Kitty privately messages the 7th person: "No pressure, want to chip in $10 instead? Totally fine to skip." The final payout lands for the organizer: "$160 collected. Nobody had to be the bad guy."

**Crowdedness check:** Bill-splitting bots are crowded, but crypto-based (Split Agent on PIX, SplitEasy on Celo, SplitWiseD, ArcAgent WhatsApp USDC). No PayPal one found. https://www.karmahq.xyz/project/spliteasy-agent/about , https://lablab.ai/submissions/cmh9ru9yt00002t6z6i6x8pfd . **Medium crowding as a category; low on PayPal.**

**Weaknesses:**
- The pain is real but low-stakes. "Impact" is weaker than in the scam and money-loss ideas.
- Splitwise, Venmo groups and Collctiv exist, and judges may say "PayPal could just bring back Pools."
- The WhatsApp Business API is painful for a solo build. Use Telegram, which is easy.
- AI is "nice to have", not essential.

---

## 4. Proof of Work: "Pay your contractor when the photo proves the job."

**One-line pitch:** Homeowners and small contractors agree milestones in plain language. The contractor uploads progress photos, AI checks each one against the agreed scope, and PayPal releases that milestone's money. The homeowner is protected from deposit-and-vanish, and the contractor gets paid the same day instead of chasing.

**Audience and pain:**
- Homeowners hiring small trades, and small contractors who get paid late.
- Evidence:
  - Deposit-and-vanish stories are constant local news: https://www.kold.com/2026/04/30/vanishing-vendor-tucson-contractor-out-3000-after-company-takes-deposit-vanishes/ , https://foxkansas.com/news/local/scammed-and-pool-less-wichita-homeowners-say-contractor-took-deposits-and-disappeared , https://moneywise.com/news/top-stories/florida-man-out-111k-for-unfinished-pool-after-contractor-took-his-money-and-disappeared-and-he-wasnt-the-only-victim-how-to-spot-the-red-flags
  - BBB Canada ranks home-improvement scams the #3 riskiest type, with a median loss of $1,500: https://business.ottawabot.ca/news/details/news-release-2025-04-30-04-30-2025
  - Angi guide: https://angi.com/articles/what-can-you-do-when-contractor-takes-your-deposit-and-runs.htm
  - No US national total was found.

**PayPal APIs:**
- **Invoicing** through the toolkit: one invoice per milestone, with `create_conditional_rules_for_invoice` and `send_invoice` triggered when the AI-verified milestone is approved.
- Or **Orders AUTHORIZE** per milestone, though the 29-day limit means it only fits short jobs.
- **Payouts** for subcontractors.
- **Webhooks.**
- **Disputes** evidence pack if a milestone is contested.

**What the AI does:**
- Turns a quote or text thread into structured milestones with visual acceptance criteria.
- Checks before/after photos against the criteria, with perceptual-hash checks for reused or edited photos.
- Flags partial completion and drafts a fair partial amount.

**The 20-second hero moment:** A bathroom demo-day photo is uploaded. The AI shows "Old tile removed ✓ · Subfloor exposed ✓ · Debris not cleared ✗". The homeowner taps "release 90% now, 10% when cleared." The PayPal invoice is paid and the contractor's phone buzzes.

**Crowdedness check:** **High.** There's GigSmartPay on Devpost (AI vision plus smart-contract milestone escrow, and it even found the duplicate-photo exploit): https://devpost.com/software/gigsmartpay . Also Optic-Gov (HackQuest), Ratedeed (Product Hunt), Bidroom, Veribound and ContractorsNest.

**Weaknesses:**
- Crowded.
- Real contractor jobs exceed the 29-day authorization, so invoices are needed, which makes it less "escrow".
- Hard to film convincingly (you need a real renovation).
- Liability around AI judging construction quality.

---

## 5. Stall: "Talk to your phone, get paid. A voice money-manager for home and pop-up sellers."

**One-line pitch:** Home bakers, tiffin cooks, farmers'-market and pop-up vendors take orders through DMs and voice notes in any language. Stall listens: "Maria, two dozen tamales, Saturday, half up front." It creates the PayPal invoice and QR, collects a deposit, reminds Maria, and gives the vendor a daily spoken summary: who's paid and who hasn't.

**Audience and pain:**
- Informal and cottage-food sellers, many of them non-English-first. A huge, sympathetic, non-technical group.
- The pain:
  - Orders come through DMs and story replies.
  - Addresses are kept in a notes app.
  - Payments are checked by scrolling bank history at night.
  - No-shows are common, and deposits are the standard fix.
- Evidence: https://reddit.sentinel-team.org/posts/1tjql91/snapshots/2026-05-21T23%3A34%3A23.978364Z , https://unil.ink/blog/how-to-build-baker-shop , https://findhomegrown.com/blog/order-management-tools-home-baker
- **Thin:** mostly vendor-blog evidence. A stronger Reddit search (r/cottagefood, r/smallbusiness) is needed.

**PayPal APIs:**
- **Invoicing** through the toolkit: `create_invoice`, `send_invoice`, **`generate_invoice_qr_code`** for in-person payment at the stall, `send_invoice_reminder`, `record_payment_for_invoice` for cash, and the partial-payment/deposit setting on the invoice.
- **Catalog** (`create_product`) for the menu.
- **Reporting** (`list_transactions`, `get_merchant_insights`) for the "how did I do this week" voice answer.
- **Webhooks** for paid notices.

**What the AI does:**
- Multilingual speech-to-structured orders (Spanish, Hindi, Tagalog and so on).
- Matches a voice note to the menu and the existing customer.
- Writes reminders in the customer's own language.
- Gives a spoken end-of-day money summary.
- Every money action (amount, deposit %) is confirmed by voice before sending.

**The 20-second hero moment:** A vendor with flour on her hands says in Spanish: "Dos docenas de tamales para María, sábado, la mitad ahora." Two seconds later, María's phone shows a PayPal invoice for a $24 deposit in Spanish, and she pays. The vendor's phone speaks back: "María pagó el depósito. Te faltan 3 pagos para el sábado." Then cut to the market stall, where the vendor holds up the QR from `generate_invoice_qr_code` and a customer scans and pays.

**Crowdedness check:**
- Voice-commerce assistants and "AI invoice from chat" are crowded generically. The brief lists "AI invoice chaser" as crowded.
- A multilingual voice-first take for informal vendors is rarer. I found no specific Devpost match, but did not search exhaustively.
- **Medium.**

**Weaknesses:**
- Close to the "AI invoice chaser" that hundreds will build. The differentiation rests entirely on voice, multilingual and in-person QR.
- The pain evidence is vendor-heavy.
- **UNVERIFIED:** whether sandbox invoices render in Spanish (the invoice `detail.locale` field exists in docs; check it).

---

## Honorable mention, dropped: Seatcheck (fan-to-fan ticket resale held by PayPal)

- The pain evidence is excellent:
  - Lloyds: Taylor Swift fans lost an estimated £1m+, £332 on average, with over 90% of cases starting on Facebook. https://www.fortune.com/europe/2024/04/17/beware-swifties-a-major-british-bank-just-issued-a-warning-after-fans-lost-an-estimated-1-million-in-taylor-swift-concert-ticket-scams
  - Oasis fans lost £2m+ across 1,000+ cases. https://www.irishtimes.com/world/uk/2025/04/23/oasis-fans-in-uk-have-lost-more-than-2m-to-ticket-scams
- It's dropped because:
  - A 29-day authorization can't span months-ahead events.
  - The AI can't reliably verify a ticket transfer (screenshots are forgeable), so the "AI is necessary" claim is thin.
- Could be revived as a Handshake mode for same-week resales.

## Ranking (my lens: innovation × demo × real pain)

| # | Idea | Novelty | Demo wow | Pain strength | Breadth | Crowding | Solo 10-day |
|---|---|---|---|---|---|---|---|
| 1 | **Handshake** (+ Haggle as pre-meetup) | High | **Very high** | High (FTC-level) | Very broad | Low | Medium (two-device staging) |
| 2 | Stall (voice vendor) | Medium | High | Medium | Broad | Medium | High |
| 3 | Kitty (group chip-in) | Medium | Medium-high | Medium (low stakes) | Very broad | Medium | High |
| 4 | Haggle (alone) | Low-medium | High | Medium | Broad | Med-high | High |
| 5 | Proof of Work | Medium | Medium | High | Medium | **High** | Medium |

**Against Casefile Resolve:**
- Handshake's video is more visceral: a physical object, two humans, and money moving at the moment of truth.
- It speaks to buyers *and* sellers, and it uses a PayPal primitive (authorize, then partial capture or void) that few entrants will touch.
- Casefile has deeper PayPal-API coverage (disputes) and a more settled business model.
- A hybrid is possible: Handshake's meetup evidence pack becomes Casefile-style dispute evidence if the sale is later contested.
