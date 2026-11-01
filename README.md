# HoldMySpot

**Fair, without the fight.** An AI front desk for solo appointment pros (nail techs, barbers, tutors) who book by text or Instagram DM. It turns a plain-English cancellation policy into rules, holds the fee with PayPal before each visit, reads "can't make it" messages, and tries to refill the slot from the waitlist before anyone is charged.

**The problem.** At nail studios about 1 booking in 25 is a no-show and 1 in 9 is cancelled ([Zenoti 2026 benchmark](https://www.zenoti.com/thecheckin/no-show-revenue-calculator); $73 median ticket). A solo owner either eats the empty chair or charges a regular whose kid was sick. Both feel bad.

**What HoldMySpot does.** A $20 PayPal **authorization** (not a charge) sits behind every visit. When a client texts "can't make it", an AI agent reads the reason and *proposes*; a deterministic policy engine decides; the slot goes to the waitlist first; and money only moves when the owner taps. The agent has no payment tool at all.

![Late cancel refilled: Maya pays $0, Chris's hold authorizes](docs/gallery/03-refill.png)

**Look at these three things** (about 3 minutes, no keys: `npm ci && npm run demo`, then open `/?demo=1`):

1. **Refill first, fee last** (beats 7-9): a late cancel is offered to the waitlist; the slot fills only when the claimer's own PayPal hold authorizes, so the canceller pays $0.
2. **A text cannot move money** (beat 10, *Agent trace* tab): a prompt injection makes the model reach for `create_refund`; it is denied because that tool does not exist in its toolset (offline, this attempt is a scripted red-team replay; the denial path is the same for a live model). The owner's agent reads PayPal through the official **PayPal Agent Toolkit**, limited to five read tools; the toolkit's money tools are never given ([how](docs/AGENT_TOOLKIT.md)).
3. **Every cent traced** (*Ledger* tab, AG Grid): each booking's PayPal authorization, capture and refund ids, every API call, and the exact Orders v2 / Payments v2 / Vault v3 request behind each step.

> **Honest status:** payments run on a deterministic PayPal sandbox **simulator** (labelled in the UI). The real PayPal REST adapter is written and tested against scripted HTTP exchanges written from PayPal's API reference (not live recordings), and its requests are previewed in the ledger; it has not yet run against the live sandbox (keys pending). The AI runs on a deterministic offline provider unless an Anthropic key is set. Built for the PayPal "Build What's Next with PayPal and AI" hackathon.

| | |
|---|---|
| ![Agent trace](docs/gallery/04-agent-denied.png) | ![Owner approval](docs/gallery/05-owner-approval.png) |
| ![Policy compiler](docs/gallery/02-policy.png) | ![AG Grid ledger](docs/gallery/06-ledger.png) |

## Run it in 5 minutes

Needs Node.js 20, 22 or 24+ (developed on 24; the Render Blueprint pins 22) and npm 10+. No keys, no accounts: the PayPal simulator and the offline AI provider are the defaults.

```bash
npm ci                   # exact versions from package-lock.json (npm prints audit advisories: see docs/SECURITY.md)
npm run demo             # builds the web app, starts http://127.0.0.1:18080 (no keys needed; PORT=... to change, Ctrl+C to stop)
npm test                 # server tests, incl. end-to-end tests over a real HTTP server
npm run ui-check         # headless browser: plays the guided demo, axe accessibility checks, refreshes docs/screenshots
npm run eval             # message reader / injection / waitlist evals
npm run gallery          # headless browser: regenerates the framed Devpost images in docs/gallery
```

`ui-check` and `gallery` drive a headless Chromium through the project-local `playwright-core`. On a machine without Playwright's browser cache, install it once with `npx playwright-core install chromium-headless-shell` (about 100 MB download). `npm test`, `npm run demo`, `npm run build` and `npm run eval` need no browser, and in the default (simulator) mode the app and the tests make no outbound requests.

Open `http://127.0.0.1:18080/?demo=1` for the **guided demo**: 13 beats, about 3 minutes, one press of → per beat (or `&autoplay=12`). The video script is in [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md). `/book?ws=demo` is the client booking page. Or walk it yourself with the time-travel buttons:

| Scene | What happens |
|---|---|
| Tue 2:00 PM · Jordan's T−72h hold | The merchant-initiated hold is declined (sandbox negative test). Jordan's event turns red and he gets a re-approval link: we find out 3 days early. Approve it from his booking panel and it turns blue. |
| Wed 9:00 AM · Sam texts | "kiddo threw up" → classified, policy says excused → one-tap card → hold voided, new slots offered. |
| Thu 9:00 AM · Maya texts | Late cancel → refill first. Offer goes to the top 3 waitlisters. Eli says YES but his hold is declined, so the spot stays open; Chris says YES, his hold authorizes, Maya's hold is voided. **Late cancel. $0 lost. $0 charged.** |
| Thu 11:10 AM · did Alex show? | Owner taps No-show → nobody to refill → capture card → one tap captures $20. Refund is one more tap. |

Every booking has a money timeline: AI outputs, engine decisions, PayPal calls and webhooks. Two more tabs:

- **Agent trace**: every client text is one run of the front desk agent. You see each tool call with its arguments and result, the policy check it triggered, the money gate (released automatically, refill first, or waiting for the owner's tap) and, later, the owner's tap and the PayPal call it caused.
- **Ledger** (AG Grid): one row per booking with its money state, held / charged / refunded amounts and the PayPal authorization, capture and refund ids, plus a pinned totals row; a second view lists every PayPal API call and webhook. Quick search, column filters, CSV export. Click a row to open that booking on the schedule.
- **Ledger → REST requests** (simulator mode): every call the simulator answers is also run through the real REST adapter (`server/src/paypal/rest.ts`) against a capturing fetch (`server/src/paypal/preview.ts`), so you can inspect the exact request it would send to `api-m.sandbox.paypal.com`: method, path, `PayPal-Request-Id`, the `PayPal-Mock-Response` negative-testing header for scripted declines, and the JSON body (no token, nothing leaves the machine).

| Agent trace (prompt injection denied) | Ledger (AG Grid) |
|---|---|
| ![Agent trace](docs/screenshots/agent-trace-injection.png) | ![Ledger](docs/screenshots/ledger.png) |

## Architecture

```
 Booking page ──┐                          ┌─ PaymentsGateway
 Message sim ───┼─► Fastify API ─► Engine ─┤    ├─ MockPayPalGateway (deterministic sandbox simulator)
 Owner console ─┘    (+ SSE)       (decides │    └─ PayPalRestGateway (Orders v2 intent=AUTHORIZE, Payments v2)
                                   & calls) │
                        FrontDesk (AI) ◄────┘   LlmProvider: FakeLlmProvider | AnthropicProvider
                        labels + text only
```

- `server/src/domain` – booking state machine, policy rules, `decide()`, capture invariants.
- `server/src/engine/engine.ts` – the only caller of the payments gateway.
- `server/src/ai` – the front desk. It returns labels and text. A test fails the build if any AI module imports the payments or engine code.
- `server/src/ai/agent.ts` – the front desk as a tool-calling agent (see below).
- `server/src/paypal` – the gateway interface, the simulator, the real REST adapter.
- `web/` – React + Vite owner console and booking page.

### The front desk agent

Each inbound client text runs a tool-calling loop (`FrontDeskAgent`, max 8 steps). The model picks one tool per step from the toolset the engine hands it; the server executes it and feeds the result back.

| Tool | Access | What it does |
|---|---|---|
| `get_booking` | read | the client's next active booking and its hold state |
| `get_policy` | read | the approved policy version, hash, fee window, excused reasons |
| `classify_message` | model, label only | intent, reason, confidence, evidence words (whitelisted) |
| `propose_settlement` | proposal | hands a label to `decide()`; the engine picks the outcome |
| `finish` | – | ends the turn |

There is no tool that authorizes, captures, voids or refunds: those exist only in the engine. A request for any other tool is logged as **denied** and nothing runs. Releasing a hold is automatic when the policy says so (it only returns money); every charge waits for the owner's tap. If the model stops without proposing, the fixed pipeline (classify → `decide()`) handles the message, so a client is never ignored. A YES to a refill offer and a rebook pick ("2") are routed by code, not by the model, and are traced as such.

**The owner can talk to the same agent** ("Ask your front desk" box in the console, `POST /api/ws/:ws/assistant`). Its owner toolset is `list_transactions` and `find_booking` (read only) and `propose_refund`, which creates a **Refund / Keep the fee** card; only the owner's tap makes the engine call PayPal's refund. "How did this week go?" is answered from `list_transactions`; "Alex apologised, refund her fee" finds the capture and prepares the card. Tests: `server/test/assistant.test.ts`.

**PayPal Agent Toolkit (read only).** The owner's agent also gets five tools from PayPal's official [`@paypal/agent-toolkit`](https://github.com/paypal/agent-toolkit) 1.11.0: `paypal.list_transactions`, `paypal.get_order`, `paypal.get_refund`, `paypal.list_disputes`, `paypal.get_dispute`. Before proposing a refund it confirms on PayPal that the capture settled; a weekly summary is cross-checked against PayPal's transaction report. The toolkit's money tools (`create_refund`, `pay_order`, `create_order`, `accept_dispute_claim`) are not given, and three gates keep it that way: the toolkit is configured with read actions only; our wrapper refuses any other name before the toolkit sees it (the toolkit's own `handleToolCall` would dispatch any name, we checked); and an HTTP gate on the toolkit's client lets only GETs out. `PAYPAL_AGENT_TOOLKIT=mcp` serves the same five tools through PayPal's MCP server class, in-process. Client texts never get these tools. In simulator mode the toolkit's real code runs and its GETs are answered from the simulator; against the live sandbox it is untested (no keys yet). Design, research and limits: [`docs/AGENT_TOOLKIT.md`](docs/AGENT_TOOLKIT.md). Tests: `server/test/toolkit.test.ts` (17, including one where a model asks for every toolkit money tool and nothing moves).

Without an API key the agent runs on the deterministic offline provider, which plans the same tool sequence and, for a message carrying a prompt injection, first replays what a manipulated model would try (`create_refund`) so the demo shows the denial. With `AI=anthropic`, Claude picks the tools through structured outputs (`agent_step`). Tests: `server/test/agent.test.ts`.

### Where we refused to use AI
- **Money.** The AI has no amount, authorization or PayPal parameter anywhere in its output schemas. The engine decides; every capture needs an owner tap.
- **Matching.** Which waitlisters can take a slot is a deterministic filter (`slotMatches`); the AI only parses free text and ranks the filtered list.
- **The client-facing policy summary** is generated by code from the approved rules, and its hash is stored on every booking.

### Engine invariants
Capture ≤ authorized amount; ≤ policy maximum; never below the confidence threshold; never on emergency/medical/bereavement without the owner; every capture needs an owner tap; silence never charges (unanswered attendance becomes "Needs review"); every PayPal write carries a `PayPal-Request-Id`; duplicate webhooks are logged and ignored; a capture is capped at the fee for its kind (no-show or late cancel) under the policy version the client booked with; owner taps, webhooks and timer steps run one at a time per workspace; a card the booking has outgrown is closed as stale before any PayPal call.

An adversarial review of the money engine (2026-11-02) found 26 money-state bugs, from stale owner cards that voided a hold to a reversed capture still shown as collected; each is fixed with a regression test (`server/test/review2.test.ts`, `review3.test.ts`, `pass7.test.ts`).

Threat model (prompt injection, the money gate and workspace lock, PayPal reversals/voids/expiry, scoped toolkit reads, webhook verification, secrets, dependency audit): [`docs/SECURITY.md`](docs/SECURITY.md).

### Failure paths handled
T−72h hold declined → re-approval link · late cancel before any hold exists → same refill-first path, fee waived automatically if unfilled · refill claimer declined → next candidate · duplicate webhook ignored · low-confidence message → clarifying question · prompt injection → zero money effect (measured: `npm run eval`) · capture after the 3-day honor period → reauthorize first, honest error if refused · charge after the 29-day expiry → settled up front, nothing sent to PayPal · capture denied/reversed by PayPal → shown as not collected, no refund offered · refund failed at PayPal → retry card with a new request id · hold voided at PayPal from outside → shown as voided, no charge card · void failed → hold flagged to the owner, booking never chargeable · a text naming two visits → "which visit?", nothing changes.

## Configuration
See `.env.example`. `PAYMENTS=sandbox` + `PAYPAL_CLIENT_ID/SECRET` uses real PayPal sandbox. `PAYPAL_AGENT_TOOLKIT` = unset (toolkit function calling), `mcp` (PayPal's MCP server class) or `off`. `STUDIO_TIMEZONE` (IANA, e.g. `America/Los_Angeles`; default UTC) sets the studio's end of day for the attendance review, the opening hours of offered free slots (10:00-18:00 local, closed Sundays), the weekdays and dates matched in client texts, and the time zone of slot labels. `AI=anthropic` + `ANTHROPIC_API_KEY` uses Claude (`claude-sonnet-5-5` by default) with structured outputs. `server/src/scripts/sandbox-smoke.ts` runs the Day-1 PayPal spikes.

## Deploy on Render

`render.yaml` is a Blueprint for one free Node web service (not deployed yet). In the Render Dashboard: **New → Blueprint**, pick the repo, keep the defaults. It builds with `npm ci --include=dev && npm run build` (tsx is a dev dependency), starts with `npm start`, listens on Render's `PORT` with `HOST=0.0.0.0`, and health-checks `/api/health`. With no secrets it runs keyless (simulator + offline provider) and the guided demo is at `https://<service>.onrender.com/?demo=1`.

For the real PayPal sandbox and Claude, set `PAYMENTS=sandbox`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `AI=anthropic` and `ANTHROPIC_API_KEY` in the Dashboard (they are `sync: false`, never in git). PayPal return/cancel URLs use Render's `RENDER_EXTERNAL_URL` unless `PUBLIC_URL` is set. Point the sandbox app's webhook at `https://<service>.onrender.com/api/paypal/webhook`. State is in memory: the free plan spins down after about 15 idle minutes, which resets the demo. `server/test/app.test.ts` checks the Blueprint against the real scripts and health route.

## Not built yet (honest list)
The PayPal Agent Toolkit is used for reads only, by design (money stays in the engine) and is not yet run against the live sandbox; Bryntum Scheduler (licence check pending; hand-built week grid for now); policy-compiler eval on 15 real policies; persistence (state is in memory per demo workspace).

## Tools
- PayPal Orders v2 (intent=AUTHORIZE, merchant-initiated with `vault_id` + `stored_credential`), Payments v2 (capture, void, reauthorize, refund), Vault v3 (setup token → payment token for bookings more than 72h out), webhooks (signature-verified; the endpoint refuses events when no `PAYPAL_WEBHOOK_ID` is configured).
- Claude (Anthropic API) for policy compilation, the front desk agent's tool choice, message classification, waitlist parsing/ranking and reply drafting, behind a provider interface with a deterministic offline provider for tests and keyless demos.
- PayPal Agent Toolkit (`@paypal/agent-toolkit` 1.11.0, Apache-2.0 per its repo) for the owner agent's five read-only PayPal tools, optionally through its MCP server class (`@modelcontextprotocol/sdk`).
- AG Grid Community (MIT) for the money ledger; Render Blueprint for hosting.

## Licence
MIT, see `LICENSE`.
