# Round 1, Ideator A: real-pain mining

_2026-11-01. Lens: recurring, emotionally intense money pains of PayPal users that PayPal's APIs can actually touch in sandbox. Reddit itself was barely reachable through search, and PayPal Community pages refused direct fetch (ECONNREFUSED). Quotes below come from search snippets of those pages. Each source says whether it was confirmed, and anything marked **[unverified]** was not checked against a primary source._

## TL;DR ranking

| # | Idea | Pain strength | PayPal depth | Novelty vs Casefile Resolve | My take |
|---|---|---|---|---|---|
| 1 | **Signed Off**: proof-of-delivery locker plus dispute agent for people who sell art, design, lessons and other intangibles | Very high (they have almost no seller protection) | High (Invoicing, Orders, Webhooks, Disputes evidence, Refunds) | Different audience, same dispute engine | **Best new idea. Also merges cleanly into Casefile** as "Casefile for creators" |
| 2 | **Before the Case**: an AI helpdesk the buyer reaches from the receipt that resolves "where is it?" before the buyer opens a dispute | High | High (Tracking, Orders, Refunds, Disputes webhooks) | Upstream of Casefile, so it is the front half of the same product | Strong as a Casefile add-on, weaker alone |
| 3 | **Treasurer**: dues and collections agent for clubs, PTAs and youth teams | Medium-high, widespread but low intensity | High (Invoicing, Transaction Search, Refunds, Payouts) | New audience | Best "broad non-technical" pitch. PayPal Pool Money overlaps |
| 4 | **Thank-You Desk**: donor receipts and rescue of failed recurring gifts for micro-nonprofits | Medium | Medium (Subscriptions, Transaction Search, webhooks) | New | Crowded by free tools (Zeffy, Givebutter, Donorbox) |
| 5 | **Safe Deal**: a Goods & Services deal link for Marketplace and Reddit sales that blocks the Friends & Family scam pattern | Very high (scam losses) | Medium | New | Pain is huge, but the honest party isn't the victim, so adoption logic is weak |

---

## 1. Signed Off: "Get paid for creative work, and keep it."

**Pitch:** Commission artists, designers, tutors and coaches sell intangible work, where PayPal's tracking-number protection doesn't apply. Signed Off runs each job through PayPal milestone invoices, logs every delivery and every client sign-off as PayPal-grade evidence, and when a "never received" dispute arrives, its agent files that evidence through the Disputes API within minutes.

**Who suffers:** Freelance and commission sellers of digital goods and services: illustrators, logo designers, 3D-model sellers, ghostwriters, online tutors, coaches. Freelancers Union (2015, n=5,358) found about 1 in 2 freelancers had trouble getting paid in 2014: https://onlabor.org/wp-content/uploads/2017/05/FU_NonpaymentReport_r3.pdf. In a New York coalition survey, 62% had lost wages and 91% had been paid late at least once: https://authorsguild.org/news/survey-finds-62-percent-of-ny-freelance-workers-have-lost-wages-due-to-nonpayment. The often-quoted "71% / 34% stiffed" figure is **[unverified]**.

**Evidence of the pain:**
- An artist on PayPal Community, in a post titled "I fear a scammer will try to get a refund after I've given them art", asks what to do. https://www.paypal-community.com/t5/Managing-Risk-and-Fraud/I-fear-a-scammer-will-try-to-get-a-refund-after-i-ve-given-them/m-p/2812339 (page wouldn't load. Seen in search results only.)
- From search snippets of PayPal Community threads: "a chargeback for digital art almost 2 months later", with screenshots showing the buyer received it. https://www.paypal-community.com/t5/Disputes-and-Limitations/Seller-protection-Doesn-t-seem-like-it/m-p/1699923
- Forum replies say: "there is no seller protection for digital, virtual goods and service since you cannot prove delivery with a tracking number." An artist who wrote "no physical item" on the invoice still had the amount debited. https://www.paypal-community.com/t5/About-Protections/The-client-asks-to-refund-the-money-for-digital-services/m-p/1162094
- "Freelancer's Nightmare - Digital Product Seller Protection & Fraudulent Disputes": https://www.paypal-community.com/t5/About-Protections-Archive/Freelancer-s-Nightmare-Digital-Product-Seller-Protection-amp/m-p/958450
- A logo designer's clients filed "Item not Received" after the work was finished and approved, then tried a debit-card chargeback: https://imjustcreative.com/paypal-advice-tips/2016/08/25
- CGTrader forum thread "Chargeback on Digital Product – Seller Loses, Buyer Keeps Files": https://www.cgtrader.com/forum/selling-buying-3d-models/chargeback-on-digital-product-seller-loses-buyer-keeps-files
- Furry-art community coverage, "Creators cope with chilling charge-backs": https://flayrah.com/7570/creators-cope-chilling-charge-backs
- An artist's advice found in search: "PLEASE USE PAYPAL INVOICES. it will SAVE you." Artists already improvise this playbook: half up front, staged approvals, a no-refund point once colour work begins.
- **The opening:** search snippets of PayPal's Seller Protection terms (AU, and a January 2025 version) say intangible items need "compelling evidence", for example "a system log showing the date it was sent… electronically sent to the recipient, including the recipient's address (email, IP…) or received or accessed by the recipient". So the evidence PayPal accepts is exactly the kind of log software can generate automatically. https://www.paypal.com/au/legalhub/paypal/seller-protection. **[Partly verified: the policy page wouldn't fetch, so this rests on search snippets. Exact wording and US applicability are unverified.]**

**PayPal APIs:**
- **Invoicing v2:** milestone invoices, using `allow_partial_payment` and `minimum_amount_due` for the deposit (verified: https://developer.paypal.com/api/invoicing/v2/definitions/partial_payment; not available in IN, BR or IL), plus reminders (the endpoint exists per docs, but the exact path is **[unverified]**).
- **Orders v2:** for one-off shop items.
- **Webhooks:** INVOICING.INVOICE.PAID and CUSTOMER.DISPUTE.CREATED / UPDATED.
- **Disputes v1:** `provide-evidence` (with document upload), `send-message`, `make-offer` (INQUIRY stage only), `accept-claim`, and sandbox `/adjudicate`. Endpoints verified: https://developer.paypal.com/docs/api/customer-disputes/v1/
- **Payments v2 refunds:** partial refunds when scope is cut.
- **Agent Toolkit:** list/get dispute, create_refund, invoices. Add the missing evidence and offer tools as custom tools, as Casefile Resolve proposes.

**What the AI does, and why plain code isn't enough:**
1. Turns a messy DM brief ("can u draw my OC + bg, half now?") into a scoped milestone plan and invoice line items.
2. Reads client replies and classifies them as approval, revision request or scope change. A message like "love it!!" becomes a logged sign-off. Plain code can't tell "love it, but make the hair blue" apart from "approved".
3. On a dispute, it maps the logs (watermarked-preview views, final-file download with timestamp and IP, approval messages) onto PayPal's intangible-evidence requirements. It then writes the narrative, picks fight or refund, and drafts a calm message to the buyer.

The money policy (auto-refund cap, deadlines) stays deterministic and outside the LLM.

**20-second hero moment:** A phone buzzes: "PayPal case: Item not received, $120 commission." Within a few seconds the screen shows the timeline the agent assembled: deposit paid, sketch approved ("omg yes!!" at 14:02), final file downloaded 3 times from the buyer's IP, and the PDF evidence packet. One tap sends it through `provide-evidence`. Sandbox adjudicate fires the RESOLVED webhook: "You kept $120."

**Weaknesses:**
- It only works for jobs run through Signed Off, so it gives no help with past disputes.
- Whether PayPal actually honours system-log evidence for US intangible sellers is **[unverified]**, and the outcome is at PayPal's discretion. Card chargebacks follow card-network rules, not PayPal's.
- The sandbox dispute lifecycle carries the same risks as Casefile Resolve.
- Artists who take payment by PayPal.me or Friends & Family aren't covered, and it needs a business account (free to upgrade).
- It is close to Casefile Resolve. I'd pitch it as Casefile's second audience, or as the whole product if judges find physical-goods disputes dull.

---

## 2. Before the Case: "Most disputes are a question nobody answered."

**Pitch:** Every PayPal receipt and invoice from a small shop includes a "Problem with your order?" link to the seller's AI agent. The agent checks live tracking, shows proof, and either fixes the issue or refunds within the seller's limits. It resolves the buyer's worry before the buyer opens a PayPal case.

**Who suffers:** Small eBay, Etsy, Shopify and Instagram sellers using PayPal, plus their buyers. WISMO ("where is my order") estimates run from 10-25% to 30-50% of e-commerce support tickets, depending on the vendor source. No primary source exists: https://gokarla.io/blog/wismo-inquiries-ecommerce-scale-cost-impact and https://www.ringly.io/blog/wismo-tickets. **[Unverified figures.]**

**Evidence of the pain:**
- A seller on PayPal Community: a buyer "no contact, now 140 days later opens an INR dispute… escalated to a claim by the buyer 1 minute after it was opened." https://www.paypal-community.com/t5/Selling-on-eBay/Please-help-me/m-p/1058417 (seen in search results only)
- "buyer opened a case even though she received items": https://www.paypal-community.com/t5/Managing-Risk-and-Fraud/buyer-opened-a-case-even-though-she-received-items/td-p/1963806
- eBay Community: "Paypal dispute but nothing from ebay": https://community.ebay.com/t5/Selling/Paypal-dispute-but-nothing-from-ebay/td-p/30467020
- Fees on a lost claim: $15 dispute fee, plus $20 per chargeback (see CRITIC_REPORT).

**PayPal APIs:**
- **Orders v2 / Transaction Search:** look up the order from the buyer's email and the amount.
- **Shipment Tracking:** read and add tracking.
- **Payments refunds:** full or partial, within the policy cap.
- **Disputes:** if a case is opened anyway, CUSTOMER.DISPUTE.CREATED hands it to the Casefile engine with the chat transcript attached as evidence.
- **Webhooks**, and the **Agent Toolkit** for get_order, create_refund and the tracking tools.

**What the AI does:** It holds a natural conversation with an anxious buyer, decides between "show tracking", "it's late, offer reship or 10% off" and "refund now", and explains the decision in plain words. The buyer side is a real conversation, which is why an LLM is needed. Money limits stay deterministic.

**20-second hero moment:** The buyer types, "it's been 2 weeks, where is my stuff?? I'm about to open a PayPal case." The agent replies with the carrier's "delivered to mailbox Tue 3:12pm" scan and offers "check with neighbours, or I'll reship if not found by Friday." On the second case (lost in transit), it issues an instant partial refund through the PayPal API. A counter ticks: "disputes avoided: 2."

**Weaknesses:**
- Customer-support bots (Gorgias, Tidio) already do WISMO, so the novelty is the PayPal refund authority.
- Buyers may ignore the link and go straight to PayPal.
- There is no metric we can measure in a 10-day build.
- Best used as part of Casefile, not alone.

---

## 3. Treasurer: "The volunteer treasurer's PayPal assistant."

**Pitch:** A volunteer treasurer of a club, PTA, scout troop or youth team pastes the roster and says "collect $45 spring dues and $20 for the field trip." The agent sends PayPal invoices, matches every incoming payment (even "for Jake" from Grandma's account) to the right member, chases politely, refunds dropouts, reimburses the parent who fronted the pizza money, and produces the board report.

**Who suffers:** Volunteer treasurers. The US has about 20k+ PTA units (PTA-affiliated only; overall count **[unverified]**), plus clubs, Toastmasters, sports leagues, alumni groups and churches. PayPal itself cites roughly 86 million US money-pooling events in 2023: https://newsroom.paypal-corp.com/2024-11-14-PayPal-Unveils-Innovative-Money-Pooling-Feature,-Simplifying-Group-Expenses-Between-Family-and-Friends

**Evidence of the pain** (moderate; few first-person rants found):
- PTAs have to beg parents to "include Student's name, grade level and homeroom teacher in the notes of the PayPal transaction." That instruction exists because matching fails: https://www.pinellasacademy.com/families/ptso
- A Toastmasters forum thread, "how to check which members paid dues", describes treasurers updating a tracking screen by hand from each PayPal notification: https://support.toastmastersclubs.org/kunena-2025-02-09/general-discussion/32662-how-to-check-which-members-paid-dues (returned HTTP 500 on fetch; search snippet only)
- Treasurer checklists include a monthly "send PayPal list to Committee Chairs" step: https://www.nigp.org/chapters/financial-management/check-list-treasurers.pdf
- A club asks members to add a note "2025 dues for <name>" because matching is hard: https://forum.ih8mud.com/threads/happy-new-year-its-b-n-t-club-dues-season.1353655/
- An aMember forum thread, "PayPal payment reconciliation tools?": https://www.amember.com/forum/threads/paypal-payment-reconciliation-tools.16828
- Cancelled-event refunds: plain PayPal has no bulk refund (from search; **[unverified]**), and ticketing tools advertise bulk refunds as a feature: https://help.redpodium.com/en/articles/4543905-issue-refunds-if-an-event-is-cancelled-mass-cancellation

**PayPal APIs:**
- **Invoicing v2:** one invoice per member, with reminders and partial payments for instalment plans.
- **Transaction Search:** catch payments made outside invoices (PayPal.me and "send money").
- **Payments refunds:** dropouts and cancelled events, done in bulk by the agent.
- **Payouts:** reimburse volunteers who fronted costs, many at once.
- **Webhooks:** INVOICING.INVOICE.PAID and PAYMENT.CAPTURE.COMPLETED.
- **Agent Toolkit:** invoice create, send, remind and list, plus list_transactions.

**What the AI does:**
1. Fuzzy-matches payments to the roster using the payer name, note text, amount and family links ("Grandma Rose → Jake").
2. Parses a chat instruction such as "refund everyone who signed up for the cancelled trip except the Lees, they're rolling it over" into a refund and payout plan for the treasurer to approve.
3. Writes tactful reminders in the right tone.
4. Writes the board report.

Plain code can't do the fuzzy matching or the instruction parsing. Amount caps and the approval gate stay deterministic.

**20-second hero moment:** In a grid of 32 kids, 29 show paid. Three payments sit "unmatched". The agent shows: "'Rosemary T — for J's trip' → Jake Thompson (grandmother, 92%)", and the treasurer taps to confirm. The treasurer then types "trip's cancelled, refund everyone but the Lees". The agent shows 28 refunds totalling $560 and one rollover, the treasurer taps once, and 28 sandbox refunds fire live. The AG Grid table fits naturally.

**Weaknesses:**
- PayPal's own **Pool Money** (Nov 2024, US) covers simple collection: https://techcrunch.com/2024/11/14/paypals-new-feature-will-let-you-easily-split-expenses-with-family-and-friends. Whether Pool Money has an API is **[unverified]**, probably not.
- Requires a business account. Transaction Search in sandbox can lag by hours **[unverified]**.
- Free incumbents exist (Zeffy, MemberPlanet, TeamSnap).
- The pain is a chronic annoyance rather than an acute loss, which is less dramatic in a video.

---

## 4. Thank-You Desk: "Every PayPal donation thanked, receipted, and kept."

**Pitch:** For micro-nonprofits that take PayPal donations. The agent sends personalised thank-yous and tax-compliant receipts, builds January year-end giving statements from Transaction Search, and when a monthly donor's PayPal subscription payment fails, it reaches out personally before the gift lapses.

**Who suffers:** Small 501(c)(3)s run by volunteers. Roughly 1.5M US nonprofits **[unverified count]**, most of them tiny.

**Evidence of the pain:**
- PayPal Community, "Generate tax receipt for donors?": "I'm on the board of a small 501(c)3 nonprofit with a PayPal account…" https://www.paypal-community.com/t5/About-Payments-Archive/Generate-tax-receipt-for-donors/td-p/898149
- Statements are due by about January 31: https://bloomerang.com/nonprofit-glossary/donation-acknowledgment-letter
- Evidence for the failed-recurring-gift pain (donor churn) is **[not found this round]**.

**PayPal APIs:**
- **Transaction Search:** donor history.
- **Subscriptions:** monthly gifts. Use the BILLING.SUBSCRIPTION.PAYMENT.FAILED and SUSPENDED webhooks, then revise or reactivate the subscription.
- **Orders:** one-off gifts.
- **Invoicing:** pledges.
- **Refunds:** mistaken double gifts.

**AI:** Matches donors across name and email variants, writes thank-you notes that reference what the gift funded, and drafts the lapse-rescue message. Receipt law text stays templated, not AI.

**Hero moment:** A failed-payment webhook arrives. The agent writes, "Hi Maria, your $15/month feeds 3 kids at our Saturday program; your card expired. Here's a one-tap PayPal link." Maria re-subscribes in sandbox, and the counter reads "$180/yr saved."

**Weaknesses:**
- Crowded with free, well-funded tools (Zeffy, Givebutter, Donorbox), and PayPal Giving Fund exists.
- PayPal API usage is mostly read-only.
- Low on agentic commerce.

---

## 5. Safe Deal: "Pay a stranger the safe way."

**Pitch:** For Facebook Marketplace, Reddit swap and ticket sales between strangers. The seller pastes the listing, and the agent creates a PayPal Goods & Services invoice whose description matches the listing exactly (which strengthens any not-as-described claim). It then guides shipping and tracking upload. On the buyer side, it reads the chat and flags scam patterns ("pay F&F to avoid fees", overpayment, urgency, shipping-label tricks).

**Who suffers:** Buyers and honest sellers on peer-to-peer marketplaces. Payment-app scam losses quoted at $210M (FTC 2023), with PayPal at 28% of complaints. **[Secondary source, unverified]**: https://www.omniwatch.com/scams/is-paypal-safe/

**Evidence of the pain:**
- "Scammed via 'friends and family' payment option": https://paypal-community.com/t5/Disputes-and-Limitations/Scammed-via-quot-friends-and-family-quot-payment-option-Paypal/m-p/2797414
- A Facebook Marketplace deposit with nothing delivered: https://www.paypal-community.com/t5/Disputes-and-Limitations/Put-deposit-down-on-Facebook-marketplace-seller-did-not-deliver/td-p/2807414
- A PayPal statement in the UK press: protection excludes friends-and-family payments, and buyers should refuse such requests: https://www.sundaypost.com/fp/raw-deal-fears-over-scammers-taking-advantage-of-paypals-friends-and-family-option/
- "PayPal Friends and Family not as safe as you think": https://www.elitefourum.com/t/paypal-friends-and-family-not-as-safe-as-you-think/30229

**PayPal APIs:**
- **Invoicing** or **Orders:** create the G&S payment.
- **Shipment Tracking:** add tracking.
- **Webhooks**
- **Disputes:** listing-matched evidence if a claim follows.

**AI:** Detects scams in chat screenshots (vision plus text), normalises the listing into an invoice description, and generates a fairness checklist. A detector precision/recall evaluation is possible, built from labelled scam chats.

**Hero moment:** A chat screenshot is uploaded: "Can you send F&F? saves us both fees 😊." A red banner reads "This removes your buyer protection." One tap creates a G&S PayPal invoice with the listing photo and description locked in, and the buyer pays in sandbox.

**Weaknesses:**
- The person who would use it (an honest seller) isn't the victim, and the victim (the buyer) only benefits if the scammer agrees to G&S, which scammers won't. It is mostly an education tool.
- PayPal's own app already warns users about F&F. **[unverified current UX]**
- It can't intercept the buyer's own F&F payment (the same API wall that killed "family money guardian").
- Casual sellers need a business account for API invoices.

---

## Ideas considered and dropped

- **Hold Lifter** (new-seller 21-day holds released through auto-tracking): the pain is real (https://www.paypal.com/smarthelp/article/faq3297, https://community.shopify.com/t/experiences-with-paypal-holding-funds-as-a-new-seller/16264), but this is essentially "Unhold", which the critic already scored at about 3%. The AI isn't needed; it's plain tracking sync.
- **Tutor and lesson billing** (cancellations and make-up credits): the pain is implied by every studio's late-fee policy (https://musicteacher.com/resources/music-lesson-cancellation-policy), but I found no first-person complaints, and My Music Staff already owns the niche.
- **Group pooling**: PayPal shipped Pool Money in Nov 2024.

## Recommendation to the next round

Strongest move: **Casefile Resolve + Signed Off + Before the Case as one product.** Before the Case catches the problem before a dispute is opened. Casefile resolves physical-goods disputes. Signed Off covers intangible sellers (artists, freelancers, tutors), the people PayPal's tracking-based protection leaves out, and its "love it!!" approval-as-evidence moment is the most human and pitchable part. If the team wants one audience only, **Signed Off for commission artists** has the most emotional, most relatable story for non-technical judges. The key fact to verify on Day 1 is the wording of the US Seller Protection intangible-goods evidence clause.
