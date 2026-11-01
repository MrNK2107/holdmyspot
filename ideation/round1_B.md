# Round 1, Ideator B: judge and platform alignment

_Written 2026-11-01. Lens: what the PayPal judges and the platform will reward. Each claim is tagged **[V]** if I verified it today from a primary source, or **[U]** if it is unverified or comes from a secondary source._

---

## Part 1: What the platform and judges signal

### 1. Hackathon pages (Devpost overview, resources, rules, FAQ, updates; fetched today)
- **[V] The "Review example projects" link points to the Resources page.** It does not lead to a gallery of example projects. Instead it has an **Inspiration** section that lists PayPal's own seed ideas:
  - **Agents:** an agent that shops and checks out; a "scheduling assistant that pays contractors automatically when a job is marked complete"; agent-to-agent negotiation and settlement.
  - **Money movement:** "send money with just a phone number"; a freelancer cross-client payment dashboard; a gig payout "the moment a task is approved"; "splitting a group dinner bill automatically by scanning a receipt"; donations split across causes.
  - **Business:** multi-currency invoicing for freelancers; creator tipping and memberships; marketplace split payments; a POS add-on.
  - **Consumer:** a budgeting app that categorizes PayPal transactions; "request money" inside a chat app; "a simpler checkout flow for a niche audience (students, families, seniors) that PayPal doesn't fully serve today."
  - **Social impact:** accessible donations, microloans, nonprofit payouts, "neighbors pool money for a shared community project."
  - → **Implication:** hundreds of entrants will build these ideas as written. Use them to show you are aligned with PayPal, but don't copy them literally.
- **[V] The real "example projects" are paid YouTuber tutorial repos** in `github.com/paypaldev/video-*-paypal-tutorial` (NeuralNine, HamedBahram, saimon24, bytemonkio, kubowania, conniexu444, fufu17). They include:
  - a Flask shop plus a SaaS with subscriptions;
  - a Patreon clone (Web SDK v6 subscriptions);
  - "Asset Forge" (AI image generation with credits);
  - a quiz site behind a paywall;
  - "Payment Systems in 2026" (failure modes, duplicate webhooks, failed renewals).
  - → **Implication:** expect a flood of "AI SaaS plus PayPal subscription paywall" entries. Stay out of that lane.
- **[V] There is an AG Grid boilerplate**, `paypaldev/hackathon-paypal-ag-grid-boilerplate` (PayPal transaction data shown in AG Studio), from the Oct 12 webinar.
  - → AG Grid is **less of a niche** than the brief assumed: many entrants will drop the boilerplate in. Win AG Grid only with a grid that is central to the product, such as a pivot or AG Studio's AI assistant over meaningful data.
- **[V] DevRel's build session** (Jo, Marco, Eddie; https://www.youtube.com/watch?v=FFJfCW9z3Do) covered the AI Toolkit, the **sandbox MCP server**, the Postman collection, **webhooks**, **debugging with logs**, and "**demo project and testing unhappy paths**."
  - → The DevRel judges care about robustness: webhook idempotency, PayPal-Request-Id, and failure states shown on screen.
- **[V] The ByteMonk example repo is built entirely around failure modes.** This reinforces that the DevRel team values unhappy paths.
- **[V] Rules:**
  - Stage One is a pass/fail check that the project "reasonably applies the required APIs/SDKs."
  - Stage Two scores **five equally weighted criteria**.
  - **Tie-break uses Technological Implementation first.**
- **[V] FAQ on prize stacking:** "a single project can win **at most one Sponsor Prize** plus either one Grand Prize or one Honorable Mention."
  - → Pick **one** sponsor target: AG Grid, Bryntum, Channel3, Render, or APIMatic. Stacking several sponsors doesn't add winnings, though it doesn't hurt.
- **[V] Multiple submissions are allowed** if they are "substantially different."
- **[V] Update from 4 days ago:**
  - Submit by **Thu Nov 5** for an early eligibility check; you can keep editing afterwards.
  - "Make PayPal and AI impossible to miss. Name both in your description, 'Built With', and video."
- **[V] Participant count: 26,164.**
- **[V] Judges:**
  - **PayPal:** Jo Franchetti, Eddie Jaoude, Marco Podien (DevRel); Karthik Ravi (SWE); Himraj Singh (EM); Nathaniel Olson (Sr PM).
  - **Sponsors:** Sylwia Vargas (AG Grid), Ameer Hassan (APIMatic), Mats Bryntse (Bryntum CEO), Ignacio Valdez Bicard (Channel3), Carly Richmond (Elastic), Pooja Mistry (Postman), Shifra Williams (Render).

### 2. What PayPal ships and pushes (2025–26)
- **[V] Agent Toolkit (`paypal/agent-toolkit`, v1.11, Sep 2026).** Its most recent investment is almost entirely **Invoicing**, added Jul–Sep 2026:
  - `create_recurring_series`, `activate/cancel/delete_recurring_series`
  - `create_conditional_rules_for_invoice` ("early payment discount or automatic cancellation date")
  - `send_invoice_reminder`, `cancel_invoice_auto_reminder`
  - `record_payment_for_invoice` ("external or manual payment"), `record_refund_for_invoice`
  - `generate_invoice_qr_code`, themed invoices, `search_invoicing`
  - Other tool groups: Orders (`create_order`, `get_order`, `pay_order`, `create_refund`), Disputes (`list`, `get`, `accept_claim` only), Shipment tracking, Catalog, Subscriptions, Reporting (`list_transactions`, `get_merchant_insights`).
  - → **The toolkit team (likely the people near engineer Karthik Ravi, EM Himraj Singh and PM Nathaniel Olson, though that is [U]) is building invoicing for agents right now.** An entry that uses recurring series, conditional rules, record_payment and reminders as an agent's actuators shows judges the new work they shipped in use.
- **[V] Hackathon entrants are already sending upstream PRs to the toolkit**, so "extend the toolkit and open a PR" is no longer a unique move:
  - #107 adds Payouts tools (open);
  - #91, an "admission gate for real financial actions," was closed without merging;
  - #108–#118 fix dispute, order and subscription bugs, Oct 2026.
- **[V] Payouts is NOT in the toolkit** (PR #107 is still open), so any Payouts use needs a custom tool.
- **[V] `paypal/AI-Toolkit`** is a developer plugin for Claude Code, Codex and Cursor that connects to the **sandbox MCP server**. DevRel demoed it.
- **[V] Store Sync / Agent Ready are gated:**
  - Store Sync requires an access request form, US physical goods only, and existing merchants.
  - I found no sandbox for either.
  - → Don't build on them. Calling a project "Agent Ready-like" also implies competing with a PayPal product.
- **[U] Corporate direction, from secondary sources:**
  - ChatGPT ACP partnership (Oct 2025), Perplexity Instant Buy, Cymbio acquisition (Jan 2026), GTC 2026 talk on an "SMB plug-and-play agent" platform, "Claude for Small Business" PayPal plugin.
  - Q3-2026 call: Lores is working with Meta on personal agents, and **Venmo is the growth lever**. The Venmo credit card now pays extra for **splitting with friends**, and Venmo has scan-and-split receipts.
  - Recurring themes across these: **small businesses**, **trust and buyer/seller protection carried into AI**, and **social splitting**.
- **[V] Authorize-then-capture:** holds last 29 days with a 3-day honor period; reauthorize after the honor period; void link provided. Source: https://developer.paypal.com/docs/checkout/standard/customize/authorization/
  - This is a little-used, judge-recognizable PayPal primitive that suits an agent with bounded money authority.

### 3. Past PayPal hackathon winners
- **[V] PayPal Dev Days 2025** (https://developer.paypal.com/community/blog/winners-dev-days-hackathon):
  1. **CrawlerPal**: a "paywall AI agent assistant," letting bots pay to get past paywalls. This is agent-pays-for-access, a new commerce primitive.
  2. **Codebusters**: migrated Shopware's PayPal integration to the JS SDK v6 beta.
  3. **Rosen**: a PYUSD social trading app.
  - Finalists were picked by PayPal engineering and product leaders; live demos were judged by executives.
  - → PayPal rewards **adopting its newest primitives** (agents paying, SDK v6, PYUSD) more than generic apps. The equivalent today: **toolkit invoicing tools, the sandbox MCP server, authorizations, Web SDK v6**.
- I found no other public PayPal Devpost winners lists **[U]**.

### 4. The judges in public
- **[U] PayPal's DevRel team appears to have been hired in 2026** (Feb 2026 job posts for San Jose, London and Germany).
  - Web profiles still show older employers: Jo at Deno/Ably, Marco at Algorand, Eddie at EddieHub/NatWest. Only their Devpost titles confirm PayPal.
  - **Jo Franchetti:** web platform, TypeScript, PWAs, developer experience, accessibility. One talk is titled "Is everything difficult, or is it just me?"
  - **Eddie Jaoude:** open-source community (EddieHub, BioDrop); values clean public repos, good READMEs, contributor-friendliness.
  - **Marco Podien:** Web3/GenAI DevRel background.
  - → DevRel judges will open the repo. A strong README (architecture, "what broke and how we fixed it", run in 5 minutes), sandbox seed scripts, accessible UI and an upstream-quality custom tool all count for them.
- I found nothing public for Karthik Ravi, Himraj Singh or Nathaniel Olson **[U]**.
  - Product judges reward a clear user, a clear metric, and something that grows PayPal's business: volume, merchants, trust.
- **Sponsor judges:**
  - **Mats Bryntse** (Bryntum's CEO) will reward a Scheduler or Calendar that is the core of the user interface.
  - **Sylwia Vargas** (AG Grid) will reward AG Studio or AI-in-grid use beyond the boilerplate.

### 5. A rubric drawn from this research (used to judge the ideas)
1. **Use PayPal's newest primitives as the agent's actuators:** toolkit invoicing (recurring series, conditional rules, record payment), authorizations, the sandbox MCP server, webhooks.
2. **Give the agent bounded authority over real money moves,** with limits enforced outside the LLM. This is the brief for "Best Use of Agentic Commerce." Avoid "chatbot recommends."
3. **Show unhappy paths on screen,** such as a duplicate webhook, a declined capture or an expired authorization.
4. **Pick a broad, non-developer user with a documented money pain,** and choose one where PayPal's protections or tools are the reason the fix works.
5. **Target one sponsor prize that is core to the UI.**
6. **Avoid crowded lanes:** AI SaaS paywalls, shopping-assistant checkout, receipt bill-split, and the inspiration-list ideas copied word for word.

---

## Part 2: Five ideas

### Idea 1: **HoldMySpot**, an AI front desk that ends no-shows with PayPal holds
**Pitch:** "The booking assistant for one-person businesses. It holds a small deposit through PayPal, handles 'I can't make it' texts by your rules, and releases or keeps the deposit itself."

- **Audience:** solo or small appointment businesses (hairdressers, nail techs, groomers, tutors, photographers, massage therapists) and their clients. Anyone who has booked a haircut understands it immediately.
- **Pain evidence:**
  - About 7% of monthly revenue is lost to no-shows and late cancellations (survey of 200+ UK salons, Dec 2025, vendor-funded) **[U]**: https://professionalbeauty.co.uk/beauty-appointment-cancellations-income-loss-survey
  - Only 8% of UK salons never see no-shows (Fresha, Feb 2026) **[U]**: https://www.fresha.com/en-GB/blog/cancellations-cost-study
  - Deposits cut no-shows by roughly 30–55% (vendor claims) **[U]**: https://www.kitomba.com/blog/deposits-vs-cancellation-fees-salons/
  - Owners hate "the awkward conversation" about charging a no-show: https://www.kitomba.com/blog/how-to-stop-losing-money-to-no-shows-without-the-awkward-conversation/
- **PayPal (deep and unusual):**
  - **Orders v2 with `intent=AUTHORIZE`** puts a hold for the deposit at booking **[V docs]**.
  - **Authorizations API:** capture (full or partial; partial capture **[U]**), **void** on attendance or excused cancellation, and **reauthorize** for bookings more than 3 days out **[V docs]**.
  - **Webhooks:** `PAYMENT.AUTHORIZATION.CREATED/VOIDED`, `PAYMENT.CAPTURE.COMPLETED/DENIED`.
  - Toolkit `create_refund` for goodwill refunds after capture.
  - **Venmo** as a funding option at booking (US sandbox through the JS SDK **[U]**).
  - Bookings more than 29 days out: either capture immediately and refund later, or explain the limit on screen. That is an honest edge case judges will like.
- **AI:**
  - Talks with clients in plain language over a chat/SMS simulator.
  - Classifies cancellation reasons and urgency.
  - Turns the owner's plain-English policy ("first emergency is free; under 24h keep 30%") into structured rules that **deterministic code enforces**.
  - Negotiates a reschedule, offering real open slots, and fills the gap from a waitlist.
  - The LLM never decides money amounts. It picks a policy branch, and code computes the amount and calls PayPal.
- **Hero moment (20 s):** 1h before an appointment the client texts "my son's sick, so sorry". The agent checks the policy: first emergency of the year, so it waives the fee. The PayPal hold is **voided** live with the webhook shown, and the agent offers Thursday 3pm. The slot on the **Bryntum scheduler** moves and a new hold is placed. Cut to a silent no-show: at +15 min the agent **captures 30%**, sends a kind receipt, and offers the freed slot to the waitlist.
- **Prizes:** Best Use of Agentic Commerce (an agent with delegated capture/void authority), Best Use of PayPal + AI, Most Impactful. **Sponsor: Bryntum** (Scheduler is the main screen, so it fits Mats Bryntse naturally; 3 winners). Render hosting.
- **Weaknesses:**
  - Booking tools with deposits already exist (Square, Fresha, Vagaro), so the novelty is the agent handling the conversation and the money decision.
  - Real merchants need PayPal business accounts (fine for small businesses).
  - Clients may resent holds. Mitigate with transparency ("you'll never be charged if you tell us 24h ahead").
  - Sandbox clock: you can't wait 3 days to demo reauthorize. Pre-seed authorizations days ahead, or show the API call and its documented response.

### Idea 2: **SafeHandoff**, protected payments for local marketplace sales
**Pitch:** "Selling on Marketplace or Craigslist? Send a SafeHandoff link instead of 'PayPal me friends & family'. The buyer's money is held by PayPal and released when they scan your QR at pickup, and an AI scam-check reads the chat first."

- **Audience:** anyone who buys or sells second-hand locally (Facebook Marketplace, Craigslist, Gumtree, local groups). A very broad, non-technical audience.
- **Pain evidence:**
  - FTC: about $2.1B lost to scams that started on social media in 2025, Facebook highest at about $794M; over 40% were shopping scams (secondary reports of the FTC spotlight) **[U]**: https://www.mychesco.com/a/news/national/social-media-scams-surge-cost-americans-2-1b/
  - Sellers asking for "Friends & Family" to dodge fees removes buyer protection: https://www.aura.com/learn/facebook-marketplace-scams and https://nordprotect.com/blog/facebook-marketplace-scams
  - Fake-buyer "verification code" takeovers.
- **PayPal:**
  - **Orders v2 `intent=AUTHORIZE`** when the buyer commits.
  - **Capture** when the buyer scans the seller's QR at handoff.
  - **Void** if the meetup fails or the item isn't as described at inspection.
  - Shipment tracking (toolkit) for shipped deals.
  - Webhooks.
  - The flow nudges users onto **Goods & Services** rails, which is PayPal's own trust message, so judges will like the alignment.
  - Production would need the multiparty / Commerce Platform (partner referrals) so sellers are paid directly. That is sandbox-heavy **[U]**; for the demo, sellers are sandbox business accounts.
- **AI:**
  - Vision plus text "scam radar" over pasted chat screenshots and the listing. It flags F&F requests, overpayment, code requests, shipping-only from a stranger, and stock-photo or reposted images.
  - Writes a plain-English verdict ("3 red flags; here's what to say").
  - At handoff, compares the item photo with the listing photo, the same photo-compare tool as Casefile.
  - Measurable: precision/recall on about 50 labelled real scam chats taken from public posts.
- **Hero moment:** the buyer pastes a chat ("I'll ship it, just send F&F to save fees"). Red banner: "This is the #1 Marketplace scam." One tap sends a SafeHandoff link instead and $120 is held. At the meetup the buyer scans the QR, a **capture** webhook fires, and the seller sees "Paid, protected."
- **Prizes:** Most Impactful, Best Use of PayPal + AI, Most Creative. Sponsor: AG Grid (a deals/flags ledger) is weak here; Render.
- **Weaknesses:**
  - It looks like escrow (regulatory optics). Mitigation: PayPal is holding the authorization, not us.
  - Production onboarding for personal-account sellers is the real blocker **[U]**.
  - "Agentic commerce" fit is weaker, since the AI advises and gates rather than transacts autonomously.
  - Facebook has its own checkout in some regions.
  - The scam classifier risks false positives, so measure and show them.

### Idea 3: **Duesday**, an AI treasurer for volunteer-run groups
**Pitch:** "Every PTA, youth team and club has one exhausted volunteer chasing dues in a spreadsheet. Duesday bills everyone through PayPal, reads the cash envelope from practice, pays back volunteers from a receipt photo, and writes the treasurer's report."

- **Audience:** volunteer treasurers and organizers of PTAs and PTOs, youth sports teams, choirs, scout troops, hobby clubs, and parents who pay dues. Very broad and very non-technical.
- **Pain evidence:**
  - Treasurers inherit "half-broken spreadsheets"; spreadsheets don't send reminders, so organizers end up "constantly chasing" (vendor sources) **[U]**: https://moneyminder.com/blog/how-to-get-started-as-a-sports-team-treasurer/ and https://www.teamstats.net/blog/teamstats-vs-spreadsheets-for-managing-team-finances
  - PTA rules: **Venmo is NOT an approved platform** for Utah PTA units: https://www.utahpta.org/files/docs/2B%20-%20Treasurer%20101%20Part%201_%20Duties%20of%20a%20Treasurer.pdf
  - WA PTA warns against personal Venmo accounts one officer controls: https://www.wastatepta.org/ask-wspta-can-a-pta-sign-up-for-a-venmo-account/
  - Monthly independent reconciliation is required: https://moneyminder.com/pto-pta-guides/reconciliation/
- **PayPal (matches the toolkit's newest tools):**
  - Toolkit **`create_recurring_series`** for monthly or season dues.
  - **`create_conditional_rules_for_invoice`** for an early-bird discount and automatic cancellation.
  - **`send_invoice_reminder`** with AI-written, tone-appropriate nudges.
  - **`record_payment_for_invoice`** for cash and check payments read from a photo.
  - `record_refund_for_invoice`, `generate_invoice_qr_code` (QR on the team flyer), `search_invoicing`.
  - `list_transactions` to reconcile.
  - **Payouts** (custom tool in toolkit style, cf. PR #107) to reimburse volunteers.
  - `INVOICING.INVOICE.PAID` webhooks.
- **AI:**
  - Vision reads a handwritten cash-collection sheet and receipts.
  - Matches cash to open invoices.
  - Flags anomalies such as double payments, a family billed twice, or a receipt over the reimbursement cap.
  - Drafts reminders per family; offers a hardship waiver privately, which is a nice dignity touch.
  - Generates the monthly treasurer's report in plain English for the committee.
  - Hard limits (reimbursement cap, two-person approval above $X) are **deterministic**.
- **Hero moment:** the treasurer snaps a crumpled "Tuesday practice: cash" sheet. Six invoices flip to **Paid (recorded)** in the grid, live. One is flagged: "Rivera family paid twice; refund $40?" One tap. Then a receipt photo of orange slices for $63: payout sent to the volunteer, within policy. The **AG Grid** members × months pivot turns green.
- **Prizes:** Most Impactful, Best Use of PayPal + AI. **Sponsor: AG Grid**: a members-by-months pivot plus AG Studio "ask your ledger" is grid use central to the product, not the boilerplate. Render.
- **Weaknesses:**
  - The "agentic commerce" label is weak; this is back-office.
  - Incumbents exist (MoneyMinder, Cheddar Up, TeamSnap, SignUpGenius).
  - The organization pays invoice fees.
  - Handwriting OCR needs a measured eval (about 30 sheets).
  - Less of a "wow" than holds or scams.

### Idea 4: **Studio**, attendance-aware billing for private teachers
**Pitch:** "Piano teachers and tutors lose evenings to make-up lessons, credits and late payers. Write your studio policy in plain English. Studio runs your monthly PayPal billing by it, adjusting for every cancellation."

- **Audience:** private music teachers, tutors, coaches and dance or swim instructors, plus the parents they bill.
- **Pain evidence:**
  - Real studio policies show how complex this is: late fees that grow every 2 weeks, 24h-notice make-ups, credits when the teacher cancels: https://musicteacher.com/resources/music-lesson-cancellation-policy and https://pianoeducation.org/pnotmles.html
  - Parent-side friction (Mumsnet): https://www.mumsnet.com/talk/am_i_being_unreasonable/4483694-Issues-with-missed-private-music-lessons-AIBU
  - I found no hard numbers **[U]**.
- **PayPal:**
  - Toolkit **recurring invoice series** per family.
  - `update_invoicing` to adjust next month for credits and make-ups.
  - Conditional rules (early-pay discount; auto-cancel).
  - Reminders.
  - Subscriptions as the alternative for fixed plans.
  - Webhooks.
- **AI:**
  - Compiles the teacher's prose policy into rules.
  - Reads parents' cancellation messages and classifies them as excused, unexcused or teacher-cancel.
  - Proposes make-up slots.
  - Explains every line of the invoice to the parent ("−$40: make-up credit, Oct 14").
- **Hero moment:** the parent texts "sick, skip Tuesday". The agent books a make-up from the **Bryntum calendar** and the next PayPal invoice is updated live with an explained line item.
- **Prizes:** Best Use of PayPal + AI, Most Impactful. **Sponsor: Bryntum.**
- **Weaknesses:**
  - Overlaps Ideas 1 and 3 and could be merged into either.
  - Incumbents exist (My Music Staff, TutorBird).
  - Narrower audience.
  - Weak "agentic commerce" fit.

### Idea 5: **ChipIn**, a group-gift agent that collects, chases and buys
**Pitch:** "Collecting $15 from twelve people for a farewell gift: ChipIn sends everyone a PayPal link, chases nicely, picks the gift when the pot is full, buys it, and returns any extra."

- **Audience:** office gift organizers, friend groups, sports-team parents, class gifts for teachers.
- **Pain evidence:**
  - PayPal **retired Money Pools** (new pools stopped 30 Sep 2021, closed 8 Nov 2021) **[V secondary]**: https://www.collctiv.com/blog/paypal-money-pools-timeline and https://www.yourmoney.com/saving-banking/paypal-closing-down-money-pools/
  - Organizer awkwardness and chasing: https://www.cbsnews.com/news/the-party-fund-problem-collecting-money-in-the-workplace and https://boredpanda.com/people-asked-pitch-in-contribute-gifts-workplace
  - Fits the Venmo "split with friends" push **[U]**.
- **PayPal:**
  - Orders v2 per contributor, with Venmo enabled.
  - Reminders.
  - Toolkit `create_order`/`pay_order` for the agent's purchase from a sandbox merchant.
  - `create_refund` for overpayment.
  - Webhooks.
- **AI:**
  - Suggests gifts within budget from the recipient's interests using **Channel3** product search.
  - Writes reminders that aren't pushy.
  - When the pot hits its target, buys under a hard cap: "never above pot; group vote if more than 10% off plan".
  - Splits any shortfall fairly.
- **Hero moment:** the 12th contribution lands (webhook), the pot shows $204/$200, and the agent buys the Channel3-picked gift within the cap. The $4 surplus is auto-refunded to the last payer.
- **Prizes:** Best Use of Agentic Commerce, Most Creative. **Sponsor: Channel3** (1 winner, $1.5k, probably few entrants).
- **Weaknesses:**
  - Pooling other people's money raises money-transmitter optics.
  - The agent's purchase can only complete at a merchant we control in sandbox, so "buys anywhere" is fake.
  - Office-gift culture is divisive.
  - Collctiv, Thankbox and Venmo groups already exist.
  - Shallower PayPal depth.

---

## Part 3: Ranking from the judge lens, and how it compares with Casefile Resolve

| | Tech (PayPal depth) | Design | Impact | Innovation | Demo | Agentic fit | Sponsor |
|---|---|---|---|---|---|---|---|
| **HoldMySpot** | 8 (authorize / void / capture / reauth + webhooks, rarely used) | 8 | 7 | 7 | **9** | **8** | Bryntum |
| **SafeHandoff** | 7 | 7 | **9** | 8 | 8 | 5 | weak |
| **Duesday** | **8** (newest toolkit invoicing tools) | 7 | 8 | 5 | 7 | 4 | AG Grid |
| Studio | 7 | 7 | 6 | 5 | 7 | 4 | Bryntum |
| ChipIn | 6 | 7 | 6 | 6 | 8 | 7 | Channel3 |
| _Casefile Resolve (critic's pick, for reference)_ | 8 | 7 | 8 | 7 | 8 | 6 | AG Grid |

All scores are my judgment, not measurements.

**My pick from this lens: HoldMySpot**, with SafeHandoff close behind as the higher-impact but riskier option.
- **Why HoldMySpot:**
  - It uses a **PayPal primitive almost nobody else will touch** (authorizations), and uses it as an agent's bounded money authority. That is a direct "Agentic Commerce" story without competing with Store Sync.
  - It has a universal hook ("no-shows").
  - Bryntum is its natural main screen, a less crowded sponsor lane.
  - Its unhappy paths are photogenic: an expired honor period leads to reauthorize, and a denied capture leads to a graceful message.
- **Notes on Casefile from this lens:**
  - (a) The "upstream toolkit PR" differentiator is weaker than the critic assumed, because many entrants are already opening toolkit PRs in October, including fixes to `accept_dispute_claim`.
  - (b) Its dispute-sandbox lifecycle risk is real, while HoldMySpot's sandbox path (authorize → void/capture) is simple and documented.
  - (c) Casefile and HoldMySpot share the same engine: policy compiled from plain English, enforced by deterministic code, with the AI choosing a branch and a PayPal action carrying it out. That architecture could survive a pivot between them.

**Shared requirements for any of these:**
1. Submit by **Nov 5** for the eligibility check.
2. Name PayPal and AI everywhere.
3. Write the README for DevRel: architecture, an eval table, "what broke", sandbox seed script.
4. Show at least one unhappy path in the video.
5. Pick one sponsor prize only.
