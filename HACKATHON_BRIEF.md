# PayPal AI Hackathon — Brief & Analysis

_Written 2026-11-01. Source: Devpost listing (pasted). Status: registered._

## Key facts

| Item | Detail |
|---|---|
| Deadline | **Nov 13, 2026 @ 01:30 IST** → treat **Nov 12 evening IST** as the real cutoff |
| Time left | ~11.5 days (from Nov 1) |
| Format | Online, solo or team, new or existing project (meaningful progress during hackathon) |
| Competition | ~26,100 registrants (most won't submit; typical Devpost submit rate is a few %) |
| Prize pool | $67,500 cash + credits/subscriptions |
| Hard rule | Must **meaningfully use both PayPal and AI**. PayPal must be **central**, not a checkout button bolted on. |
| Environment | PayPal **sandbox** (free) |

## Submission checklist (all mandatory)

- [ ] Working project using PayPal developer platform (sandbox) + an AI tool/model
- [ ] Text description of features & functionality
- [ ] **Functional demo**: hosted URL *or* complete setup/run instructions (mockups/static don't count) → plan: **hosted URL** (Render) **and** README instructions
- [ ] "Tools" section: which models/AI services were used and how
- [ ] **Public** GitHub repo, all source + assets + run instructions, **open-source LICENSE visible in the repo About section**
- [ ] Demo video **< 3 min**, on **YouTube, public**, shows it running on the target device, **no copyrighted music / third-party trademarks** without permission
- [ ] Comply with Official Rules (read the full rules — check prize stacking, eligibility for India, IP terms)

## Prizes — where the realistic value is

| Prize | Cash | Notes |
|---|---|---|
| 1st / 2nd / 3rd | $12k / $8k / $5k | Hardest; judged on all 5 criteria |
| Most Creative / Most Impactful / Best Demo Delivery | $5k each | Demo Delivery = rewards a great video, very achievable with polish |
| **Best Use of PayPal + AI** | $5k | Direct fit for any strong entry |
| **Best Use of Agentic Commerce** | $5k | PayPal is clearly pushing agents (Agent Toolkit / MCP server) — strongest thematic bet |
| **AG Grid** 1st/2nd/3rd | $5k / $2k / $1k ×3 | 5 winners, sponsor niche → far fewer competitors. Cheap to include if the app has any data table (ledger, orders, invoices) |
| APIMatic | $1k ×3 + 6-mo subscription | Uses their context plugins / SDK generation |
| Bryntum | $1k ×3 | Scheduler/Gantt/calendar components — fits anything time-based |
| Channel3 | $1.5k ×1 | Product catalog/search API for commerce agents — fits agentic shopping |
| Render | $1k/$750/$500 credits | Free win if we host on Render anyway |

**To verify in Official Rules:** whether one project can win an overall prize *and* sponsor prizes (usually yes on Devpost, but confirm).

**Strategy implication:** one project that (a) is agentic commerce at its core, (b) uses AG Grid for its data views, (c) is hosted on Render, (d) optionally uses Channel3/Bryntum where natural — is eligible for ~6 prize lines at once without diluting the idea.

## Judging criteria → what each means for us

1. **Technological Implementation** — non-trivial PayPal usage (multiple APIs: Orders, Payouts, Subscriptions, Invoicing, Disputes, Webhooks, Agent Toolkit/MCP), real AI work (tool-calling agent, not just a chat wrapper).
2. **Design** — a complete product experience, not a tech demo. Coherent UI, onboarding, empty states.
3. **Potential Impact** — a *specific* real audience with a *specific* real problem, and the demo must prove the solution addresses it.
4. **Innovation** — differ from "AI shopping assistant + checkout" which hundreds will build.
5. **Presentation** — video shows end-to-end working flow + clear problem / who / why.

## Judges (who we're pitching to)

Mostly PayPal: 3 developer advocates, a software engineer, an engineering manager, a senior PM. Plus sponsor reps (AG Grid, APIMatic, Bryntum, Channel3, Elastic, Postman, Render). → They'll recognise shallow PayPal usage instantly; depth of PayPal integration matters more than model novelty.

## PayPal surface area to consider (verify against current docs)

- Orders v2 / Checkout (JS SDK), Payments (capture/refund/authorize)
- Payouts (paying many recipients)
- Subscriptions / Billing plans
- Invoicing v2
- Disputes, Transaction Search / Reporting
- Webhooks (event-driven agents)
- **PayPal Agent Toolkit** & **PayPal MCP server** — first-party ways to let LLM agents call PayPal; very likely what "agentic commerce" judges want to see
- Venmo / Pay Later (region-dependent in sandbox)

## Webinars (recordings worth skimming)

- Oct 6 — Start building with PayPal (recording available)
- Oct 7 — APIMatic Context Plugins
- Oct 12 — Build a payments dashboard without building a dashboard
- Oct 13 — Start building with PayPal (repeat)

## Constraints on our side

- Solo (per past patterns) — scope must fit ~10 working days including video.
- Overlaps with Kiroween (deadline Dec 5) — this one comes first.
- No AI co-author attribution in commits; check if Devpost/rules require AI-use disclosure (the "Tools" section covers it).

## Next step

Pick the idea (brainstorming in progress), write a design doc, then a build plan. Day budget sketch:
- D1: idea locked, PayPal sandbox app + keys, skeleton deployed on Render
- D2–D7: core build
- D8–D9: polish, AG Grid views, README, LICENSE
- D10: video recording/editing, Devpost submission (submit a day early)

---

## Research log (2026-11-01)

### Consumer trust in agent payments (2026 surveys)
- NMI (1,000 US adults): only 10% would give AI full purchase control; 69% don't trust AI to process payments securely.
- 5-country EU study: 53.3% use agents to compare prices, 50.1% wouldn't trust an agent with card details.
- Accenture (25,590 people, 16 countries): 32% would let an agent choose *if they confirm payment*; 9% fully autonomous.
- ACI (UK): 19% trust AI for everyday purchase decisions vs 55% a human adviser.

### Pain points found
1. **Aging parents: missed bills + scams** (chosen direction). FBI IC3 2025: 60+ filed 201,266 complaints, ~$7.75B lost (+59% YoY); ~$1.04B tech-support scams; $352M AI-related. Carefull cites 45M US caregivers managing a loved one's money (self-reported).
2. Small sellers losing PayPal "item not received" disputes (backup idea; PayPal Disputes API).
3. Freelancers chasing invoices (crowded).
4. Forgotten trials / uncancellable subscriptions (weak PayPal fit).
5. Roommate IOUs (Splitwise exists).

### Startups in the elder-finance space
| Company | What it does | Gap we can exploit |
|---|---|---|
| **True Link** (YC) | Prepaid Visa for seniors; family blocks merchant types (gift cards, casinos) | Parent must switch to a new card — friction |
| **EverSafe** | Monitors bank/card accounts, alerts "trusted advocates" | **Read-only — can't block**, detects after the fact |
| **Carefull** ($16.5M Series A) | Account monitoring + **ScamCheck** (AI: "is this text/letter/voicemail a scam?") | Analysis is separate from the payment itself |

### Startups in agent payments (developer infra — avoid competing head-on)
- **Allowance** (YC S26): one-time virtual cards for agents with limits / merchant locks / expiry.
- **Locus** (YC F25): spending limits, per-agent permissions, approval rules, audit trail.
- **Payman**: control plane for agent spend — policies, approval thresholds, audit logs.
- Common design principle: **limits enforced server-side, outside the model**, so prompt injection can't raise them.

### Positioning
Monitoring tools alert *after* money moves; agent-payment startups serve developers. Our gap: **a consumer product where an AI agent handles an older person's payments through the PayPal they already use, and blocks scams *before* money moves**, with family oversight.

---

## Razorpay AI Buildathon 2026 (reference) — razorpay.com/buildathon

Student hiring buildathon (AI Builder Intern, ₹75k/mo, Bangalore); applications closed Sept 5, 2026. **No public winners list or submission gallery found.**

| Track | Problem | Bar |
|---|---|---|
| 01 AI Growth & Agentic Commerce | Agent that grows merchant revenue, or makes a merchant transactable by an AI buyer end to end | Every money action explainable, bounded, gated; audit trail; one failure handled gracefully |
| 02 AI Risk Manager | Detector/verifier/auto-responder for one class of loss: fraud, returns, chargebacks (e.g. chargeback evidence responder) | Measured precision/recall on held-out set incl. false-positive cost; defense-only |
| 03 AI Revenue Recovery | Detect revenue at risk → choose intervention → bounded recovery (failed payments, abandoned checkout, overdue receivables) | Measured money recovered across a batch, compliant escalation, stopping rules, audit trail |
| 04 AI Finance Controller | Close one finance-ops loop (reconciliation, settlement Q&A, cash forecast) over 50+ records | Throughput + measured accuracy + honest exception list |
| 05 Open | Anything real | Same bar |

Evaluation (via careerstn repost): **Problem taste**, **Build quality**, **AI judgment (use deterministic code where AI isn't needed)**, **Failure recovery (what broke, how fixed)**.

Public submissions seen (Track 01):
- Antariksh62/razorpay-AI-buildathon-track-01-AI-growth-Agentic-commerce — AI buyer + declarative policy engine (spend caps, mandate expiry, kill switch, JIT price check), SSE audit log, 14 failure cases. **≈ our earlier generic "agent on a leash" idea → generic version is already commoditised.**
- ta1rc/Razorpay_buildathon — merchant catalog → agent-readable catalog (scrape/CSV + ambiguity review), shopping agent with clarifying questions, live requote before payment, HMAC-verified checkout, end-to-end audit chain.

### Lessons to carry over
1. Policy engine outside the LLM is now table stakes — differentiate on *who* it protects (vertical), not on the guardrail itself.
2. Show **measured** results (e.g. scam detector precision/recall on a labelled set of real scam messages + false-positive cost), not one cherry-picked demo.
3. Use deterministic code where AI isn't needed; say so explicitly.
4. Document "what broke and how we fixed it" in the README.
5. Show failure cases handled gracefully on screen.
