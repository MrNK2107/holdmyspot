# Round 2, Judge 2: product, business and VC lens

_2026-11-01. I am playing a PayPal Senior PM, an Engineering Manager, and a skeptical VC who has sat through 1,000 hackathon demos. I scored independently and have not seen any other judge's scores. All scores are judgment calls, not measurements._

## How I judged

Questions I asked of every idea:
- **Would PayPal want this on PayPal?** Does it grow trusted payment volume, and can a PM endorse it on stage without legal or political flinching?
- **How sharp is the pain?** Money lost or fear counts. Mild admin annoyance doesn't.
- **Is the audience large and reachable?**
- **Does the video land an "I get it" in the first 20 seconds?**
- **Will I remember it after 100 demos?**
- **Does it need both sides of a deal to adopt it?**

Platform facts I applied (from round1_B, verified there):
- A project can win at most one sponsor prize plus one grand prize or honorable mention.
- Ties are broken on Technological Implementation.
- PayPal's own seed ideas (bill split, pool money, AI checkout, freelancer dashboard, etc.) will be copied by hundreds.
- The "AI SaaS + subscription paywall" lane is flooded.

**Base rate.** About 26k registrants. If 2-4% submit, that's roughly 500-1,000 entries competing for 8 slots worth $5k or more: 3 grand prizes, 4 category prizes, and AG Grid 1st. That puts the base rate near 1%. A very polished solo entry in an uncrowded lane realistically reaches 10-20%, and nothing below goes higher.

**Web checks I ran:**
- **Facebook Marketplace Purchase Protection excludes local pickup.** It also excludes payments made off Facebook checkout (cash, Venmo, PayPal, Zelle). Source: Meta Help Centre text quoted in https://oneshop.com/blog/facebook-marketplace-purchase-protection and https://channelx.world/2019/08/facebook-marketplace-purchase-protection-doesnt-exist/. This confirms the gap Handshake needs, which round 1 had marked unverified.
- **PayPal Seller Protection does cover intangible goods** when there is "compelling evidence": a system record of the date sent and the recipient's email or IP. The current legal hub page was updated 26 Jan 2026: https://www.paypal.com/legalhub/seller-protection and https://www.paypal.com/us/webapps/mpp/ua/seller-protection. That supports Signed Off's premise. Wording varies by country, and the decision stays at PayPal's discretion.

## Merges

| Merged candidate | Includes |
|---|---|
| **Handshake** | Handshake (C1), SafeHandoff (B2), Safe Deal (A5). Haggle's deposit idea and Seatcheck (dropped) are possible modes. |
| **Duesday** | Treasurer (A3) and Duesday (B3) |
| **Kitty** | Kitty (C3) and ChipIn (B5) |
| **Casefile Resolve** | Casefile Resolve (critic) plus Before the Case (A2) as its front half |
| Others, scored on their own | Signed Off (A1), HoldMySpot (B1), Studio (B4), Haggle (C2), Proof of Work (C4), Stall (C5), Thank-You Desk (A4), and the critic's Shopfront, Unhold and Mandate Receipts |

---

## Scorecards

Criteria: T = Technological Implementation, D = Design (complete product), I = Potential Impact, N = Innovation, P = Presentation, F = Feasibility (solo, 10 days, sandbox), U = fit with the user's requirements (real pain, broad non-dev audience, pitchable, PayPal central, AI meaningful).

### 1. Handshake: PayPal holds the money until the handoff (merged with SafeHandoff and Safe Deal)
| | Score | Reason |
|---|---|---|
| T | 8 | It uses authorize, partial capture, void and reauthorize, plus webhooks and custom toolkit-style tools, a PayPal primitive almost no entrant will touch. It stops short of 9 because the tool count is lower than Casefile's. |
| D | 7 | Two tightly linked mobile web views (seller link, buyer inspect) form a whole product, but the meetup state machine has many edges to polish solo. |
| I | 8 | Mass audience, FTC-scale losses, and a confirmed gap (Facebook protection excludes local pickup). It isn't 9 because many victims are scammed by counterparties who would simply refuse the link. |
| N | 8 | No PayPal authorize/capture meetup escrow with vision inspection was found. The AI-escrow entries on Devpost are all blockchain. |
| P | 9 | Two phones in a parking lot, a used iPhone, a fair-price counter-offer and a $30 hold released live is the most visceral, memorable 20 seconds in the whole pool. |
| F | 6 | The core flow (authorize → partial capture → void) is simple and documented, but there's two-device staging, vision tuning, unverified partial-capture-plus-void behaviour, and filming outdoors solo. |
| U | 9 | Everyone has bought or sold on Marketplace, the pain is fear of losing money, PayPal is the safety mechanism itself, and the AI does the inspection a non-expert can't. |
| **Total** | **55/70** | |

- **PM lens:** It moves P2P cash and Zelle volume onto PayPal rails with protection, which is exactly PayPal's trust message. A PM would want it. The legal team would ask about escrow optics and AI liability ("your AI said it matched").
- **Two-sided adoption:** a real risk, but it can be solved. The seller has a reason to send the link because it kills no-shows, fake "payment sent" emails and lowballing. The pitch must lead with that, or a VC will kill it.
- **P(top-3 or $5k category): ~14%.** Strongest contender for Most Creative and Best Demo Delivery, plausible for Best Use of PayPal + AI.

### 2. HoldMySpot: an AI front desk that ends no-shows with PayPal holds
| | Score | Reason |
|---|---|---|
| T | 8 | Authorize, void, capture and reauthorize, with the LLM choosing a policy branch and code computing the amount: a clean "bounded agent authority" architecture. |
| D | 8 | The Bryntum scheduler as the main screen, a client chat and an owner policy page add up to a coherent single-business product. |
| I | 7 | No-shows cost small businesses real money (vendor surveys put it around 7% of revenue), but the audience is merchants, not everyone, and the figures are vendor-funded. |
| N | 6 | Square, Fresha and Vagaro already take deposits, so the only novelty is the agent handling the awkward conversation and the money decision. |
| P | 8 | "My son's sick" leading to a hold voided live is warm and instantly understood. The silent no-show capture lands well too. |
| F | 8 | The simplest reliable sandbox path in the pool (authorize/void/capture), single-device, with a Bryntum component off the shelf. |
| U | 7 | The pain is real and the idea is pitchable to anyone who has booked a haircut. But the user is a business owner, and "broad non-developer audience" holds only via the end clients. |
| **Total** | **52/70** | |

- **PM lens:** It brings small-merchant acquisition to PayPal with no political risk. A PM would ship it, but would also say "Square already does this."
- **VC lens:** a nice feature, not a company.
- **P(top-3 or $5k): ~11%.** It is also the best realistic shot at a Bryntum sponsor prize ($1k, 3 winners). Agentic Commerce is plausible.

### 3. Signed Off: proof of delivery plus a dispute agent for creators selling intangibles
| | Score | Reason |
|---|---|---|
| T | 8 | Milestone invoices with partial payment, the Disputes provide-evidence call, webhooks and refunds: deep and coherent. |
| D | 7 | A job timeline, delivery locker and evidence packet make a full product, but there's a lot of surface (file locker plus invoicing plus disputes) for one person. |
| I | 7 | The fear is acute and well documented ("buyer keeps files, seller loses"), and PayPal's own terms now accept system-log evidence. The audience is millions of creators but not mass-market. |
| N | 7 | The "love it!!" message classified as a logged sign-off and turned into PayPal-grade evidence is a fresh use of AI. |
| P | 8 | An artist's phone buzzing "Item not received, $120" and then the timeline assembling itself is emotional and memorable. |
| F | 6 | It carries the same sandbox dispute-lifecycle risk as Casefile (reaching UNDER_REVIEW, adjudicate), plus a file-delivery subsystem. |
| U | 7 | The pain is real and loud, and it's pitchable to anyone ("the artist got robbed"). The direct user is a creator, though, not the general public. |
| **Total** | **50/70** | |

- **PM lens:** Good. It makes digital goods safer to sell on PayPal and reduces bad disputes. There's slight discomfort, because it highlights where Seller Protection is weak.
- **Fatal-ish flaw:** it only protects jobs run through it from day one, so the demo can't help with an existing dispute.
- **P(top-3 or $5k): ~9%.** Best fit is Most Impactful.

### 4. Duesday: an AI treasurer for volunteer-run groups (merged with Treasurer)
| | Score | Reason |
|---|---|---|
| T | 8 | It exercises the newest toolkit invoicing tools (recurring series, conditional rules, record payment, reminders, QR) plus Payouts, which is exactly what the toolkit team just shipped. |
| D | 7 | The roster grid, cash-sheet capture and board report make a complete back-office product, but it looks like admin software. |
| I | 6 | Very broad, but it's a chronic annoyance, not money lost or fear. Judges will nod, not gasp. |
| N | 5 | MoneyMinder, Cheddar Up, TeamSnap and PayPal Pool Money already exist. The novelty is the handwritten cash-sheet OCR. |
| P | 6 | The crumpled cash sheet flipping six invoices to paid is a nice moment, but it's not a 20-second emotional hook. |
| F | 8 | The toolkit tools exist and the sandbox invoicing is reliable. The main risk is a handwriting eval. |
| U | 8 | Every parent knows the exhausted PTA treasurer, it's non-technical, PayPal does the work, and the vision and fuzzy matching are meaningful AI. |
| **Total** | **48/70** | |

- **PM lens:** It brings small-organization invoicing volume to PayPal, and the toolkit team would love seeing their tools used.
- **VC lens:** a crowded, low-ARPU segment.
- **P(top-3 or $5k): ~6%.** Add about +4% for AG Grid 1st ($5k) if the members-by-months pivot is genuinely central. This is the best AG Grid vehicle in the pool.

### 5. Stall: a voice money manager for home and pop-up sellers
| | Score | Reason |
|---|---|---|
| T | 7 | Invoicing, QR codes, deposits, catalog and reporting through the toolkit is solid but conventional. |
| D | 7 | Voice-first, multilingual and an in-person QR form a coherent and distinctive UX. |
| I | 6 | The audience is huge and sympathetic, but the evidence is vendor-blog-heavy and the pain is disorganization, not loss. |
| N | 6 | The multilingual voice angle is rare, but underneath it is the "AI invoice chaser" hundreds will build. |
| P | 8 | A Spanish voice note with flour-covered hands, and a PayPal invoice appearing on María's phone, is charming and memorable. |
| F | 7 | Speech-to-text plus toolkit invoices is straightforward. Invoice locale rendering is unverified. |
| U | 7 | It's broad, non-technical and pitchable, but the pain is soft. |
| **Total** | **48/70** | |

- **P(top-3 or $5k): ~6%.** Possible for Most Creative or Best Demo Delivery.

### 6. Casefile Resolve, with Before the Case as its front half
| | Score | Reason |
|---|---|---|
| T | 8 | It covers the deepest API set (Disputes, Tracking, Refunds, Orders, webhooks) and fills toolkit gaps, but toolkit PRs are no longer unique. |
| D | 7 | A case inbox, policy settings and an AG Grid ledger are complete, but it's a back-office console. |
| I | 7 | Money is lost per dispute, but the audience is small sellers only, and the "fight the buyer" framing narrows it. |
| N | 6 | Chargeflow and Justt exist, and so does Razorpay's own track example. The packing-photo comparison is the only fresh beat. |
| P | 7 | Three cases in 3 minutes is clear but dense. A non-technical viewer needs about 40 seconds to care about "SNAD". |
| F | 5 | The sandbox dispute lifecycle (UNDER_REVIEW, offers, delays) is the riskiest dependency in the pool. |
| U | 6 | The pain is real, but the user is a seller, not broad. It's pitchable only after explaining disputes. |
| **Total** | **46/70** | |

- **PM lens:** Politically awkward. A PM sees "a tool to beat our buyers' claims." The fairness framing helps but doesn't cure it.
- **P(top-3 or $5k): ~8%.** Lower than the critic's 15%, because of the narrow audience and sandbox risk.

### 7. Kitty: group-chat collection (merged with ChipIn)
| | Score | Reason |
|---|---|---|
| T | 6 | Invoices or orders per person, refunds and a payout is shallow and familiar. |
| D | 7 | A Telegram bot with a tally and DMs is a tidy, complete experience. |
| I | 5 | Awkwardness is a real feeling, but nobody loses money, and PayPal shipped Pool Money in 2024. |
| N | 5 | It's literally on PayPal's inspiration list ("neighbors pool money"), so expect many copies. |
| P | 7 | "Nobody had to be the bad guy" is relatable and quick to get. |
| F | 8 | Telegram plus invoices plus refunds is easy. ChipIn's agent purchase is sandbox-fake. |
| U | 7 | It's broad and pitchable, but the pain is mild and the AI is nice-to-have. |
| **Total** | **45/70** | |

- **P(top-3 or $5k): ~3%.**

### 8. Studio: attendance-aware billing for private teachers
| | Score | Reason |
|---|---|---|
| T | 7 | Recurring invoice series with live updates for credits is good toolkit use. |
| D | 7 | The Bryntum calendar plus explained invoice lines is coherent. |
| I | 5 | The audience is narrow and no hard pain numbers were found. |
| N | 5 | My Music Staff and TutorBird own this. |
| P | 6 | "Sick, skip Tuesday" leading to an updated invoice is clear but low-stakes. |
| F | 7 | Straightforward. |
| U | 6 | It's non-technical but narrow and a mild pain. |
| **Total** | **43/70** | |

- **P: ~3%.**

### 9. Haggle: a seller's sales agent with a PayPal deposit
| | Score | Reason |
|---|---|---|
| T | 6 | An authorize deposit plus an invoice QR is fine but thin. |
| D | 6 | It needs its own listing and chat page because Marketplace has no API, which breaks the product story. |
| I | 5 | Ghosting and lowballers are an irritation, not a loss. |
| N | 5 | Agent-vs-agent haggling is well covered on Devpost and in Anthropic's Project Deal. |
| P | 8 | A live price ticker between two agents is fun to watch. |
| F | 7 | Easy apart from the agent-vs-agent tuning. |
| U | 6 | It's broad, but the pain is mild and judges will ask "where does this live?" |
| **Total** | **43/70** | |

- **P: ~3%** alone. It's useful as Handshake's pre-meetup step.

### 10. Proof of Work: milestone payments released by photo checks for contractors
| | Score | Reason |
|---|---|---|
| T | 6 | Milestone invoices plus Payouts are decent. The 29-day authorization limit pushes it to plain invoices. |
| D | 6 | Two parties plus milestones plus photo checks is a lot of UI to complete. |
| I | 7 | Deposit-and-vanish losses are real and painful. |
| N | 5 | GigSmartPay and many others have done AI-vision milestone escrow. |
| P | 6 | A real renovation is hard to film convincingly. |
| F | 5 | Filming plus a two-party flow plus vision of construction quality is hard. |
| U | 7 | Broad homeowner pain, pitchable, but liability-laden. |
| **Total** | **42/70** | |

- **P: ~3%.**

### 11. Shopfront: Store Sync for small sellers via MCP (the critic's runner-up)
| | Score | Reason |
|---|---|---|
| T | 8 | A strong MCP and catalog build. |
| D | 7 | Demos well. |
| I | 4 | No seller is complaining about agent discoverability yet. |
| N | 5 | It reimplements PayPal's own gated Store Sync and Agent Ready. |
| P | 8 | A magical demo. |
| F | 7 | Feasible. |
| U | 3 | Fails the real-pain and broad-audience requirements. |
| **Total** | **42/70** | |

- **P: ~5%.** Agentic Commerce only.

### 12. Thank-You Desk: donor receipts and failed-gift rescue for micro-nonprofits
| | Score | Reason |
|---|---|---|
| T | 5 | Mostly read-only Transaction Search plus subscription webhooks. |
| D | 6 | Simple and complete. |
| I | 5 | Small orgs, and the churn pain is unevidenced. |
| N | 4 | Zeffy, Givebutter and Donorbox do this free. |
| P | 5 | The failed-card rescue is sweet but slight. |
| F | 8 | Easy. |
| U | 6 | Non-technical, but a narrow, soft pain. |
| **Total** | **39/70** | |

- **P: ~2%.**

### 13. Agent-purchase mandate receipts (critic's list)
| | Score | Reason |
|---|---|---|
| T | 8 | Technically interesting. |
| D | 5 | Infra with no product. |
| I | 4 | No consumer complaining yet. |
| N | 8 | Novel. |
| P | 6 | Hard to make emotional. |
| F | 5 | Spec-heavy. |
| U | 3 | Developer-facing, which fails the broad-audience rule. |
| **Total** | **39/70** | |

- **P: ~4%.**

### 14. Unhold (critic's list)
| | Score | Reason |
|---|---|---|
| T | 5 | Tracking sync. |
| D | 6 | Small. |
| I | 6 | New-seller holds hurt. |
| N | 4 | Plain automation. |
| P | 4 | Waiting 21 days isn't demoable. |
| F | 4 | Hold release can't be simulated in sandbox. |
| U | 5 | AI not needed. |
| **Total** | **34/70** | |

- **P: ~2%.**

---

## Ranking

| Rank | Idea | Total /70 | P(top-3 or $5k) |
|---|---|---|---|
| 1 | Handshake | 55 | ~14% |
| 2 | HoldMySpot | 52 | ~11% |
| 3 | Signed Off | 50 | ~9% |
| 4 | Duesday | 48 | ~6% (+~4% AG Grid 1st) |
| 5 | Stall | 48 | ~6% |
| 6 | Casefile Resolve | 46 | ~8% |

Stall and Duesday tie at 48. Duesday ranks higher on the Technological Implementation tie-break (8 vs 7). Casefile has a higher probability than its total suggests because of PayPal-API depth, but it ranks 6th on total.

### What would raise each, and what could kill it

1. **Handshake**
   - **Best single change:** make the seller the customer.
     - Pitch and build the seller side first: "Send a Handshake link. Buyers who won't commit a hold were never coming."
     - Add a "fake payment-sent email" check that verifies through `get_order` rather than by reading the email.
     - This gives the honest party a selfish reason to adopt, which defuses the two-sided adoption objection every VC and PM will raise.
   - **Fatal-flaw watch:**
     - (a) The seller needs a PayPal business account (free, but say so on screen).
     - (b) Partial capture plus void of the remainder must be proven on Day 1 in sandbox, or the hero moment dies.
     - (c) The AI verdict must be advisory, with a human tap, or the liability question sinks it with the PM.
2. **HoldMySpot**
   - **Best single change:** differentiate from Square and Fresha deposits. The agent should take the owner's plain-English policy, handle the client's apology text in the client's own words, and make the void-or-capture decision visible and explainable. Show the "awkward conversation" being removed, not the deposit itself.
   - **Fatal flaw:** "Square already does this" in Q&A. The answer has to be "PayPal-native, conversational, no app switch."
3. **Signed Off**
   - **Best single change:** narrow it to one vivid persona (commission artists) and cut the generic freelancer scope. Also seed the dispute hours before recording.
   - **Fatal flaw:** the sandbox dispute lifecycle. If adjudicate can't be reached reliably, the payoff ("You kept $120") is faked, which DevRel judges will spot.
4. **Duesday**
   - **Best single change:** reframe from admin to money lost, using the documented PTA rule that bans personal Venmo, and treasurer-fraud stories. Make AG Grid's pivot plus AG Studio "ask your ledger" the core screen, to lock in the AG Grid sponsor lane.
   - **Fatal flaw:** no emotional hook. It lands as "nice tool" with no gasp.
5. **Stall**
   - **Best single change:** find first-person evidence of the pain (Reddit r/cottagefood, r/Baking) and add the cash-plus-QR market-stall moment. Without real evidence it's an AI invoice chaser with a voice skin.
   - **Fatal flaw:** it reads as the crowded "AI invoicing" lane.

---

## New hybrids

### Hybrid A: **Handshake Pro**, a seller's meetup agent with a hold, an inspection and a receipt (Handshake + Haggle deposit + Casefile evidence + scam shield)

**Flow:**
1. **Before the meetup.**
   - The seller's link takes the buyer to a page where a small agent answers questions from the listing.
   - The buyer commits a PayPal hold for the full price, authorized as a Goods & Services order.
   - The seller sees "Held $340: safe to drive."
2. **At the meetup.**
   - The buyer gets an AI checklist for that specific item and a camera inspection.
   - A fair-price counter-offer appears, with one-tap partial capture and the remainder voided.
3. **No-show.**
   - The seller didn't show, so the hold auto-voids.
   - The buyer didn't show, so a pre-agreed $10 no-show fee is captured. This rule is deterministic.
4. **After the sale.**
   - A timestamped meetup evidence packet (photos, AI report, both taps) is stored.
   - If a PayPal case is opened later, it is filed via provide-evidence.
5. **Scam shield.** The seller pastes a "PayPal payment received" email, and the app checks the real authorization status through the API.

| | Score | Reason |
|---|---|---|
| T | 9 | Authorize, partial capture, void and reauthorize, plus webhooks, vision, a policy engine outside the LLM, and an optional Disputes evidence call. It wins the tie-break. |
| D | 7 | It's a complete two-sided product, but the risk is shipping it half-polished. |
| I | 8 | Mass audience and a confirmed protection gap, with both sides given a reason to use it. |
| N | 9 | Nothing like it on PayPal. It combines escrow-feel, vision inspection and partial capture. |
| P | 9 | The same parking-lot hero moment, plus the "fake payment email busted" beat in the first 20 seconds. |
| F | 5 | Too much for 10 days solo unless the disputes and pre-meetup chat are kept as stubs. Scope discipline is mandatory. |
| U | 9 | A real fear, everyone gets it, PayPal is the safety net, and the AI does what a layperson can't. |
| **Total** | **56/70** | |

- **P(top-3 or $5k): ~17%**, if scope is cut to a strict core:
  - hold, inspect, partial capture or void, plus the fake-email check;
  - the evidence packet stored, but only one live Disputes call if sandbox allows;
  - no agent-vs-agent haggling.
- **Prize targets:** Most Creative, Best Demo Delivery, Best Use of PayPal + AI, and Agentic Commerce if framed as "an agent with authority over a held payment." Sponsor: Render. Don't force AG Grid.

### Hybrid B: **Held**, a single PayPal-hold engine with two modes (HoldMySpot + Handshake)

**Pitch:** "Whenever you're waiting on a stranger to show up, PayPal holds the money and AI decides fairly." There are two modes: appointment no-shows and marketplace meetups.

| | Score | Reason |
|---|---|---|
| T | 8 | It reuses one authorize, capture and void engine. |
| D | 6 | Two audiences dilute the product story. |
| I | 8 | It covers two markets. |
| N | 7 | Platform framing. |
| P | 7 | Two stories in 3 minutes blur the hook. |
| F | 5 | Double the UI. |
| U | 8 | Broad. |
| **Total** | **49/70** | |

- **Verdict:** worse than either alone. A VC hates "for everyone" at the seed stage, and the video loses focus. **Not recommended.** I'm listing it so nobody re-proposes it.

## Bottom line

- **Build Handshake, scoped as Hybrid A's core.**
  - The pain is sharp: fear of being scammed or stood up, with money lost.
  - The audience is enormous, and Facebook's own protection excludes local pickup.
  - PayPal is the safety mechanism, not a checkout button.
  - The AI does inspection a layperson can't.
  - A PM can endorse it, because it moves risky P2P cash and Zelle onto protected PayPal rails.
- **Day 1 kill-test:** a sandbox authorization, then a partial capture with `final_capture=true`, then confirm the remainder is released and the webhooks arrive. If that fails, fall back to **HoldMySpot**. It uses the same engine, is the safest build, and has a Bryntum sponsor lane.
