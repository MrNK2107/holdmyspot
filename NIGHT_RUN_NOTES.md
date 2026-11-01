# Night run notes: HoldMySpot

## 2026-11-01 (branch `night-run/2026-11-01`, local only, never pushed)

Plan: `docs/superpowers/plans/2026-11-01-holdmyspot-plan.md` (tasks 1-17). Design: `docs/superpowers/specs/2026-11-01-holdmyspot-design.md`.
The folder was not a git repo: initialised, initial commit on `master`, all work on `night-run/2026-11-01`.

### Done (plan tasks)
- **1** npm workspaces (`server`, `web`), TypeScript, vitest, Fastify.
- **2-3** `server/src/domain/stateMachine.ts`, `clock.ts` (DemoClock: time travel fires due jobs), `audit.ts`.
- **4** `server/src/paypal/gateway.ts` + `mock.ts`: deterministic sandbox simulator (3-day honor period, 29-day expiry, reauthorize from day 4, capture <= authorized, void only open auths, idempotency by PayPal-Request-Id, INSTRUMENT_DECLINED negative tests, Vault v3 setup tokens, webhooks with custom_id delivered async).
- **5** `server/src/paypal/rest.ts`: real Orders v2 intent=AUTHORIZE (buyer-present with store_in_vault, MIT with vault_id + stored_credential), Payments v2 capture/void/reauthorize/refund, Vault v3 setup/payment tokens, webhook signature verification. Tested only with recorded HTTP.
- **6** webhook dedupe + routing by custom_id; HTTP endpoint refuses events unless `PAYPAL_WEBHOOK_ID` verification is configured (unverified events could fake an authorization).
- **7** `server/src/domain/policy.ts`: rules, `decide()`, capture invariants, code-generated client summary + hash.
- **8** `server/src/ai`: `LlmProvider`, `FakeLlmProvider`, `FrontDesk` (whitelists outputs, audits), `AnthropicProvider` (Claude, structured outputs via `output_config.format`, model `claude-sonnet-5-5` per design; tested with an injected client, no network). Boundary test: no AI module imports paypal/engine.
- **9-11** `server/src/engine/engine.ts`: settlement, ask-me-first/autopilot cards, attendance at +10m, end-of-day NEEDS_REVIEW, capture (+ reauthorize after honor period), refund, refill (top-3 fan-out, claim fills only on authorization, declined claimer → next), T-72h MIT hold + reauth fallback, failure path 1 with re-approval link, vault-first booking for >72h, excused clients rebook by replying 1-3.
- **12** `seed.ts` (Priya, 3 services, 12 bookings, 3 waitlisters, scripted decliners Jordan + Eli), `workspaces.ts` (per-visitor, capped at 100).
- **13** `app.ts`: REST + SSE, simulator approval page `/sim/:ws/paypal/approve/:id`, public booking API (`/slots`, `/book`).
- **14** `web/`: owner console (week grid with money chips, approval cards, money timeline, time-travel scenes, owner mode, message simulator phone with quick replies), policy editor (compile → questions → approve), client booking page `/book`. URL params `?ws=&sel=<bookingId>&phone=<clientId>&tab=policy` for screenshots/video.
- **15** `npm run eval` (`server/src/eval/run.ts`): message reader macro-F1 / cost-weighted errors / abstain, injection money effects through the real engine (0 on fake), waitlist matcher. Data in `server/eval/*.json` is a DRAFT starter set (40 messages, 20 pairs) that the author must review/extend and freeze.
- **16 (code only)** Anthropic provider + PayPal sandbox smoke script `server/src/scripts/sandbox-smoke.ts`. Not run: no keys.
- **17** README (architecture, where we refused AI, invariants, failure paths, honest not-built list), MIT LICENSE, `render.yaml` draft (not deployed), `.env.example`.

### Verified
- `npm test` (root) → 97 tests passing (11 files). Peak memory ~0.9 GB under memcap.
- An independent read-only review of the money engine found 11 bugs (no-hold cancel crash, refund > captured, failed claimer re-offered, late approvals reviving cancelled bookings, cards resolved before the action ran, in-flight claims at cutoff, >72h refill claims, double reauthorization, per-attempt idempotency keys, stale webhooks, expired voids). All fixed with regression tests in `server/test/regressions.test.ts`.
- `npm run eval` (fake provider, draft data): held-out intent F1 1.0, reason F1 0.857, 1 wrongful charge (cost 3); injection money effects 0; waitlist 20/20.
- App started headless on port 18080, all hero flows driven over HTTP (failure 1, hero 1 excuse, hero 2 refill with Eli's decline then Chris, hero 3 no-show capture + refund), policy compile. Screenshots in `docs/screenshots/` (console-main, console-hero2-refilled, console-hero3-noshow, booking-page-mobile). Server killed at the end.

### Next (in order)
1. **User input needed** (see `_night_run/2026-11-01/NEEDS_INPUT.md`): PayPal sandbox app keys (+ webhook id, 4 sandbox personal accounts), Bryntum licence answer (trial packages are on public npm, 7.3.8), Anthropic key.
2. With keys: run `node --env-file=../.env --import tsx src/scripts/sandbox-smoke.ts` from `server/` for the Day-1 spikes (MIT authorize with vault_id; partial capture with final_capture; INSTRUMENT_DECLINED on authorize). Adjust `rest.ts` only; the engine is gateway-agnostic. Then run the app with `PAYMENTS=sandbox` and use `/book`: in sandbox mode it redirects to the PayPal approval URL and PayPal returns to `/paypal/return` (needs `PUBLIC_URL`), which completes the hold or vault save. The JS SDK popup button is not built (redirect works).
3. Bryntum Scheduler swap-in for `WeekGrid` in `web/src/App.tsx` once licence is confirmed (fallback FullCalendar).
4. Eval: author reviews the draft labels, extends to 80 messages (30 dev / 50 held-out, freeze), adds 15 real public policies with gold rules for the policy-compiler eval (design §7). Then run evals with `AI=anthropic`.
5. Agent Toolkit `create_refund` / `list_transactions` (design §5) — currently refund goes through `PaymentsGateway.refund`.
6. Design gap: a late cancel before any hold exists (wallet not approved, or `freeCancelHours` > 72 with the hold still to come at T-72h) now just frees the slot (CANCELLED_EARLY, no fee possible). Consider still offering the slot to the waitlist there.
7. Deploy to Render (needs user approval; `render.yaml` is a draft: `tsx` is a devDependency, so keep `npm ci` without `--omit=dev`).

### Gotchas
- Windows Bash tool: long heredocs with apostrophes break; write files with the editor tool. Python one-off patch scripts inside heredocs mangle `\b`/`\d` escapes; check regexes after patching.
- Run tests under memcap: `bash ../_night_run/tools/memcap.sh 2 5 'npm test'`.
- Headless screenshots: `~/AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe --screenshot=... --timeout=9000 --window-size=1680,1000 URL` with a fresh `--user-data-dir`; first attempt sometimes captures the loading state, retry.
- `npx tsx src/index.ts` spawns npx → tsx → node; kill all three PIDs.
- The fake classifier is deliberately simple; do not tune it to the held-out set.

## 2026-11-01, pass 2 (21:40-00:30 IST, same branch, local only)

### Done
- **No-hold late cancel gap fixed** (`engine.ts` `requestSettlement`/`refillCutoff`/`onAuthorized`, `stateMachine.ts`): a late cancel (PENDING_REFILL or OWNER_REVIEW outcome) on a booking with no authorization now goes to PENDING_REFILL and is offered to the waitlist like a held booking; if unfilled at the slot start it becomes EXCUSED automatically (no capture card, not counted as a policy excusal). Pending buyer approvals for it are dropped, and an authorization that still arrives is voided. Early cancels and EXCUSE outcomes with no hold still just free the slot. Snapshot money is `none` for finished bookings that never had an authorization. Tests: `server/test/noHoldRefill.test.ts` (6).
- **Guided demo** (`server/src/demo.ts`, `GET /api/ws/:ws/demo`, `POST /api/ws/:ws/demo/next`, simulator only): 13 beats on the scripted clock (week → policy → Jordan decline + re-approve → Sam excused → Maya late cancel, Eli declines, Chris refills → injection → Alex no-show, charge, refund). When the clock jumps, routine visits are marked arrived (owner tap in the audit log) so the cards show only the story. UI: "Guided demo" toggle / `?demo=1`, → or N key, `&autoplay=12`.
- **One command:** `npm run demo` (builds web, starts on 18080, prints the guided-demo URL). Smoke-tested on 18082 and killed.
- **E2E over HTTP** (`server/test/e2e.test.ts`, 8 tests): real Fastify socket + fetch, per-test visitor workspace: hero 1 (+ rebook by "2"), hero 2 + failure 2, hero 3 + refund + double-refund refusal, failure 1 via the simulator HTML page, booking page book+approve+slot taken, SSE change event, the whole guided demo, off-script refusal.
- **Headless UI check** `npm run ui-check` (`server/src/scripts/ui-check.ts`): starts the app in-process on 18091, isolated headless Chromium via project-local `playwright-core@1.64.1` (uses the cached chromium_headless_shell-1248) + `axe-core@4.14.0`; plays all 13 beats, checks chip texts, 390px no-sideways-scroll for console and booking page, books + approves on the booking page, unknown-workspace error state. **axe: 0 violations of any impact on 8 screens.** Refreshes `docs/screenshots/` (console-main, policy-editor, console-hero1-excused, console-hero2-refilled, console-hero3-charged, console-demo-end, console-mobile, booking-page-mobile, booking-page-booked).
- **UI polish:** money chips show the real amount (captured/refunded use `capturedCents`; released shows `· $0`), money strip sums captured amounts and shows refunds, legend has a "What do these mean?" panel, booking panel explains the money state in a sentence; loading spinner + unknown-workspace page + lost-connection banner; booking page loading/empty/error/sending states and a "what's missing" hint; darker money colours (contrast), landmarks, h1/h2 order, labels, focusable scroll regions; phone layout: grid scrolls inside its card, travel bar scrolls sideways.
- **Bug found by the UI run:** `useEffect(() => el.scrollIntoView())` returned a Promise in Chrome 156, React called it as a cleanup and the console crashed on tab switch. Fixed (and the thread now scrolls itself instead of the page).
- **Docs:** `docs/DEMO_SCRIPT.md` (2:52 storyboard, what to press/say, honesty line about the simulator), `docs/DEVPOST_SUBMISSION.md` (draft with [TODO]s; not submitted), README run section.

- **Second money review** (independent read-only reviewer, 8 findings, nothing high): fixed: PENDING_REFILL without a hold showed "$20 refilling" (now `none`); a failed void of a late authorization was swallowed and logged as released (now `unreleasedAuths` + red banner in "Needs you"); approval links are dropped on every move into PENDING_REFILL (covers the reauth-strategy HOLD_FAILED case); `freeCancelHours` capped at 72 in `validateRules` (a longer fee window could never be charged); the demo only marks seeded regulars as arrived (a judge's own booking is left for a real tap); OWNER_REVIEW on a no-hold cancel leaves an audit note; no-hold clients get honest replies (`refilled_no_hold`). Tests strengthened (simulator VOIDED status, off-script demo leaves money unchanged, HOLD_FAILED path, claim timeout on a no-hold slot).

### Verified
- `npm test` → 118 passing (13 files), peak 0.95 GB under memcap. `npm run ui-check` passes (axe 0 violations on 8 screens), peak 0.88 GB. `npm run build` passes.

### Next
1. Keys (see NEEDS_INPUT): run `sandbox-smoke.ts`, then record the video on the real sandbox (the guided demo is simulator-only; walk the same beats with the time-travel buttons).
2. Record the video from `docs/DEMO_SCRIPT.md`; resolve the [TODO]s in `docs/DEVPOST_SUBMISSION.md`.
3. Decide on `PITCH.md` (stale Casefile text), Bryntum, Render deploy.

### Gotchas (new)
- Python patching on Windows: set `PYTHONUTF8=1` and write with `newline=''`, or CRLF files get rewritten. The repo mixes LF and CRLF files.
- `PITCH.md` is stale (it describes the earlier "Casefile" idea). Left untouched; the user should delete or rewrite it.

## 2026-11-01, pass 3 (22:08- IST, same branch, local only)

Goal: raise the judged score without keys. An independent read-only "judge" review scored (before): Tech 7, Design 7, Impact 8, Innovation 8, Presentation 6; prize fit Agentic Commerce 3, PayPal+AI 6, AG Grid 1, Render 2, Most Impactful 7. Top weaknesses: no real agent, no AG Grid, render.yaml draft, "AI: fake" badge, empty compiled-rules on the policy beat, booking confirmation missing the date, no problem framing in the cold open, dev-tool toolbar.

### Done
- **Front desk as a tool-calling agent** (`server/src/ai/agent.ts`, wired in `Engine.receiveMessage`): per client text, the model picks one tool per step (max 8) from `get_booking`, `get_policy` (read), `classify_message` (label only), `propose_settlement` (proposal into `decide()`), `finish`. No authorize/capture/void/refund tool exists; any other tool name is recorded as **denied** and nothing runs. If the model never proposes, the fixed classify → decide pipeline runs (traced as fallback). YES-to-offer and rebook picks are routed by code and traced as such. New AI task `agent_step` (fake planner + Anthropic schema/instructions; Anthropic untested live). The offline provider replays a `create_refund` attempt for injection messages so the denial is visible (documented as a red-team replay in the trace's "why" line and in DEMO_SCRIPT).
- **Agent runs** (`engine.agentRuns`, in the snapshot): steps in causal order (tool call → policy check → money gate), PayPal calls made by the engine, and later the owner's tap + the PayPal call it caused. Gate kinds: owner_approval / auto_release / refill / code / none.
- **UI:** "Agent trace" tab (toolset vs. tools it does not have, runs list, full step detail with args/results) and a "Front desk agent" card in the console side column. Injection beat (10) opens the trace tab.
- **AG Grid ledger** (`web/src/Ledger.tsx`, `ag-grid-react`/`ag-grid-community` 36.2.0 MIT, lazy-loaded chunk): bookings view (money chip, held/charged/refunded, PayPal auth/capture/refund ids, policy hash, refill links, pinned totals row) and a PayPal-calls view (API calls + webhooks from the audit log); quick search, filters, CSV export, row click opens the booking.
- **Render:** `render.yaml` fixed (`npm ci --include=dev && npm run build`, NODE_VERSION 22, HOST 0.0.0.0, autoDeployTrigger, webhook id + model env), `PUBLIC_URL || RENDER_EXTERNAL_URL` for PayPal return links; README "Deploy on Render"; test checks the Blueprint against package scripts and the health route. Production start smoke-tested on 18093 (killed). Not deployed.
- **Review gap closed:** `server/test/vaultedCancel.test.ts` (wallet saved via Vault, cancelled before T-72h: no hold ever placed, slot freed, vault kept, late wallet approval does not revive it).
- **Polish:** booking confirmation shows date/time + authorization id (was "Gel manicure, ."); demo start card frames who/problem; policy beat compiles on open (rules + the AI's question visible); manual clock controls hidden during the guided demo; "All quiet" Needs-you state; AI badge "offline provider".
- **Docs:** README (agent section, ledger, deploy), DEMO_SCRIPT (beats 0/2/5/10/13 + honesty notes), DEVPOST draft. PITCH.md untouched.

### Verified
- `npm test` → 132 passing (16 files), peak 0.94 GB. `npm run ui-check` passes: all 13 beats, agent trace (denied create_refund, proposal + policy check), ledger (ids, totals, calls search), 390 px no sideways scroll on console/agent/ledger/booking, **axe 0 violations on 13 screens**, peak 1.01 GB. `npm run build` passes. `npm run eval`: injection money effects 0, 16 denied agent tool calls.

### Later in pass 3
- **Owner asks the front desk** ("Ask your front desk" box, `POST /api/ws/:ws/assistant`, `Engine.askAssistant`): same agent loop with `list_transactions`, `find_booking` (read) and `propose_refund`, which creates a **Refund / Keep the fee** approval card (new approval kind `refund`); only the tap calls `refund()`. Guided-demo beat 13 now goes through it (ask → card → tap). Tests `server/test/assistant.test.ts`.
- **Agent provider outage** falls back to the fixed classify → decide pipeline (client) or an honest "nothing was changed" answer (owner). Test in `agent.test.ts`.
- **REST request preview** (`server/src/paypal/preview.ts`): in simulator mode each gateway call is mirrored through the real `PayPalRestGateway` with a capturing fetch; `GET /api/ws/:ws/paypal-requests`; Ledger → "REST requests" view with a JSON detail panel. Proves the Orders v2 / Payments v2 / Vault v3 payloads without keys. Tests `server/test/preview.test.ts`.
- Second independent judge review (after): Tech 7, Design 8, Impact 7, Innovation 8, Presentation 7; prize fit Agentic Commerce 7 (was 3), PayPal+AI 8 (was 6), AG Grid 6 (was 1), Render 3 (was 2), Most Impactful 6. Its fixes applied: "Claude" → "the AI" in demo beats, policy draft label, "routed by code" instead of "0 tool calls", ledger columns fit, REST request view.
- Gotcha: switching between `AgGridReact` instances in one JSX slot reuses the component; give each a `key` or a column getter sees the other view's rows.

### Verified (end of pass 3)
- `npm test` → 141 passing (17 files), peak ~1.07 GB under memcap. `npm run ui-check` passes (13 beats, agent trace, owner refund via agent, ledger 3 views with AG Grid column groups, 390 px), **axe 0 violations on 14 screens**, peak ~0.92 GB. `npm run build` passes. `npm run eval`: injection money effects 0.

### Next
1. Keys (NEEDS_INPUT): PayPal sandbox → `sandbox-smoke.ts`, then record on the real sandbox; Anthropic key → run `npm run eval` with `AI=anthropic` and check the agent_step tool choice live (only tested with injected/fake providers).
2. User: deploy the Blueprint on Render (outward action), put the URL in DEVPOST_SUBMISSION.md.
3. Record the video from DEMO_SCRIPT (about 2:54; trim beat 4 if long). Decide on the injection replay (NEEDS_INPUT) and PITCH.md.
4. Optional: real-numbers cold-open stat (needs a cited source), AG Grid row grouping by day.

## 2026-11-02 pass 4 (00:46- IST, same branch, local only)

Goal: maximise judged score without keys (gallery, judge re-read fixes, cold-open stat).

### Done
- **Devpost gallery** `npm run gallery` (`server/src/scripts/gallery.ts`): app in-process on 18095 (PayPal simulator, offline AI), drives the guided demo over HTTP, captures the console at 1680 CSS px (time-travel bar hidden) and frames each under a caption bar: `docs/gallery/01-week, 02-policy, 03-refill, 04-agent-denied, 05-owner-approval, 06-ledger` (1920x1080) + `thumbnail.png` (1200x800, 3:2). Referenced in `DEVPOST_SUBMISSION.md` (Gallery section with upload order + captions) and the README.
- **Bug (state vs. copy):** after a no-show, while the capture card waits, Alex's chip said "refilling $20" while the card said "wasn't refilled". The snapshot now reports `held` for a PENDING_REFILL booking with an open capture card (`engine.ts` snapshot). Agent-trace gate copy for CLARIFY / NO_ACTION is plain language (`NO_MONEY_SUMMARY`), no more "No money moved · no money moved (CLARIFY)". Tests `server/test/pass4.test.ts`; ui-check asserts beat 11 shows `held $20`.
- **Cold open with a cited stat:** Zenoti 2026 Beauty & Wellness Benchmark (summarised at https://www.zenoti.com/thecheckin/no-show-revenue-calculator, 13 May 2026): nail studios 4% no-show, 11% cancellation, $73 median ticket. Verified on the page itself; it is vendor platform data (primary report PDF not found). Used in the demo start card, DEMO_SCRIPT cold open (with footnote), README first screen and Devpost Inspiration. Removed the unverified "most owners never charge the fee" claim.
- **README first screen:** problem (cited), what it does, gallery image, "look at these three things", honest status (simulator, offline AI, red-team replay noted), 2x2 gallery.
- **Independent judge re-read** (read-only agent, after the gallery): Tech 8, Design 7, Impact 7, Innovation 8, Presentation 7. Fixed from its list: ledger showed Alex as booking state "charged" next to "refunded" (now "refunded", plus a **Kept (net)** column with a $0 net total); Eli's closed refill claim read "cancelled early" (now "claim closed (no hold)"); capture card copy ("Alex Morgan didn't show (Thu, Nov 5 11:00 AM). Nobody to refill the spot. Charge the fee from their PayPal hold?", title in ink, not link red); header "Studio: Polished by Priya (demo)"; policy rules "Excused: none (1x / 6 mo)" contradiction ("not set yet: answer the question below") and "Live now (v1): what clients see; your draft is not live yet"; trace "Provider: fake" -> offline stand-in label; gallery 04 now shows the "Tools it does not have" panel; DEMO_SCRIPT retimed to 2:50 with no overlaps; phone empty state explains you play the client; agent card rows say what changed (booking A -> B, which PayPal call); refill pair chips no longer clip; "every cent reconciled" -> "traced"; "recorded HTTP" corrected to "scripted HTTP exchanges written from PayPal's API reference (not live recordings)".

### Verified (end of pass 4)
- `npm test` -> 144 passing (18 files), peak 1.05 GB. `npm run ui-check` passes (now also asserts beat 11 shows `held $20`), axe 0 violations on 14 screens, peak 0.94 GB. `npm run build` passes (0.86 GB). `npm run gallery` peak 0.73 GB. `npm run eval`: injection money effects 0, 16 denied tool calls.
- No long-lived processes: the gallery and ui-check run the app in-process and close it.

### Next
1. Keys (unchanged): PayPal sandbox -> `sandbox-smoke.ts`, record on the live sandbox, re-shoot the gallery (`npm run gallery`) if the UI badges change; Anthropic key -> eval with `AI=anthropic`.
2. Upload `docs/gallery/*` to Devpost in the listed order with the captions in DEVPOST_SUBMISSION.md; thumbnail `docs/gallery/thumbnail.png`.
3. Pending user decisions: PITCH.md, the create_refund replay, Render deploy, model name confirmation.
4. Optional polish from the judge list not done: Agent Toolkit / MCP framing for the Agentic Commerce prize (needs real toolkit integration to be honest); the ledger's right-hand PayPal-id columns scroll off at 1680 px (by design: horizontal scroll).

## 2026-11-02 pass 5 (01:06- IST, same branch, local only)

Goal: the judge's remaining weak point, Agentic Commerce without the PayPal Agent Toolkit / MCP.

### Done
- **Research** -> `docs/AGENT_TOOLKIT.md` (cited): `@paypal/agent-toolkit` 1.11.0 (repo LICENSE Apache-2.0; npm package.json says ISC, noted), 47 tools in the installed build, read vs money-moving table, `@paypal/mcp` 1.8.1 (`--tools=` values), remote MCP URLs. Finding: the toolkit's `handleToolCall()` dispatches any method name regardless of `configuration.actions` (the filter only affects `getTools()`); the MCP server class does enforce (unregistered tool -> "not found"). Devpost page refused fetches; prize text taken from the PayPal blog ($5k honorable mention), flagged for the user to check.
- **Design (option C):** owner's agent gets five toolkit READ tools (`paypal.list_transactions/get_order/get_refund/list_disputes/get_dispute`); money stays behind the code gate. Client-text agent gets none (least privilege).
- **Implementation** `server/src/paypal/toolkit.ts` (`PayPalToolkitReader`): allow-list config, dispatch gate (refuses non-allow-listed names, cleans args), HTTP gate (axios adapter on the toolkit's own axios instance: GET + OAuth token POST only, only inside an AsyncLocalStorage HoldMySpot call; everything else 403 + logged). Simulator backend answers the toolkit's real requests from `MockPayPalGateway.readView()` (new, read-only copy; refunds now stored with ids). Sandbox backend wired via `toolkitCredentials` (untested, no keys). Toolkit loaded lazily (~110 MB RSS; eager loading pushed `npm test` over the 2 GB cap).
- **Flag** `PAYPAL_AGENT_TOOLKIT`: unset = function calling (default), `mcp` = PayPal's MCP server class (`@paypal/agent-toolkit/mcp`) over the MCP SDK in-memory transport (`@modelcontextprotocol/sdk` 1.32.2 added as a direct dep), `off`.
- **Agent**: `AgentTool.source` / `TraceStep.source`; offline planner confirms the capture via `paypal.list_transactions` before `propose_refund` (beat 13) and cross-checks the weekly summary. Agent trace tab lists the toolkit tools and, struck through, the toolkit money tools (`not on allow-list`).
- **Tests** `server/test/toolkit.test.ts` (14): advertised == allow-list; all 42 other toolkit tools refused with zero HTTP; raw `handleToolCall('create_refund'/'pay_order')` blocked at the HTTP gate; stray axios call -> 403; PayPal-shaped reads; trace shows source + GET; **a scripted model asking for every toolkit money tool (prefixed and bare) gets all denied, 0 money ops, 0 toolkit HTTP**; client texts never offered toolkit tools; flag off; MCP tools/list == allow-list, MCP rejects money tools, MCP read works, owner agent in mcp mode. `assistant.test.ts` step lists updated. ui-check asserts the toolkit tools in the agent tab and on beat 13.
- **Docs**: README (agent section, look-at-these point 2, config, honest list, tools), DEVPOST draft (PayPal APIs table row, How we used AI, What's next, Built with, 158 tests), `.env.example`. Gallery re-shot (04 shows the toolkit tools). PITCH.md and the create_refund replay untouched.

### Verified
- `npm test` -> 158 passing (19 files), peak 1.48 GB (was 1.05; toolkit + MCP SDK in the toolkit test worker). `npm run ui-check` passes (axe 0 violations, 14 screens), peak 1.05 GB. `npm run build` passes, 0.86 GB. `npm run gallery` 0.76 GB. `npm run eval`: injection money effects 0, 16 denied calls.
- Note: one early probe (scratch script, before the HTTP gate existed in that process) sent one GET with a fake token to api.sandbox.paypal.com (401). No secrets involved; the gate now blocks any toolkit request outside a HoldMySpot call.

### Next
1. With sandbox keys: run the owner questions with `PAYMENTS=sandbox` (and once with `PAYPAL_AGENT_TOOLKIT=mcp`); Transaction Search can lag hours, so a fresh capture may be missing from `list_transactions`.
2. Check the Devpost "Best Use of Agentic Commerce" wording; optionally add one DEMO_SCRIPT line for beat 13 ("checks PayPal through the Agent Toolkit").
3. `npm audit` shows advisories in toolkit deps (`@langchain/core`, `@ai-sdk/provider-utils`) that our entry points do not load; revisit when the toolkit updates.
4. Simulator ids fail the toolkit's MCP schema regexes for get_order/get_refund (documented); padding simulator ids would fix it but touches many tests/screenshots.

## 2026-11-02 pass 6 (01:24-01:55 IST, same branch, local only)

Goal: close pass-5 loose ends and harden for submission. PITCH.md and the create_refund replay untouched.

### Done
- **PayPal-shaped simulator ids** (`server/src/paypal/ids.ts`, used by `mock.ts`): orders, authorizations, captures, refunds and Vault setup tokens are 17 upper-case alphanumerics; webhook events `WH-<17>-<17>`; Vault payment tokens 7 lower-case chars (seeded clients too). Deterministic (counter through a 32-bit bijection, so unique and repeatable). The toolkit's MCP schemas (order `^[A-Z0-9]{17,32}$`, refund/capture `^[A-Za-z0-9_-]{15,32}$`) now accept them: `get_order` / `get_refund` work in both modes. `toolkit.test.ts`: id-format test, uniqueness test, and the read-tool test runs once per mode (`describe.each(['functions','mcp'])`). Tests that matched `VSETUP-` / `REFUND-` / `VAULT-` and ui-check's `/CAPTURE-/` updated. Ledger id columns widened (172 px) so ids are not cut; gallery 06 shows authorization + capture ids in full.
- **DEMO_SCRIPT**: beat 13 line cut to 24 words ("Alex apologises. Priya asks her front desk; it checks the capture with PayPal's Agent Toolkit and prepares the refund. Only her tap sends it."), Ledger shot moved to "Shots to cut in". Whole storyboard retimed so every slot is at least its line at 2.5 words/s (cold open and beat 10 also overran before): total **2:52**. Guided-demo beat 13 `say` (`server/src/demo.ts`) matches.
- **npm audit**: traced which packages the running server resolves (module hook; serve web app, all 13 beats, owner question in functions and MCP mode). Loaded and flagged: `@fastify/static`, `glob`/`minimatch`, `zod`, `mathjs`, `@paypal/agent-toolkit`. Not loaded: `@langchain/core`, `langsmith`, `ai`, `@ai-sdk/*`, `jsondiffpatch`, `uuid`, `openai`, vitest chain. Fixed: `@fastify/static` 8.3.0 -> 10.1.6 (exact; 10.1.7/10.1.8 were < 2 weeks old), `vitest` 3.2 -> 4.1.12 (dev). 18 advisories (2 critical) -> 15 (0 critical). A root `overrides` for mathjs 15.2 did not apply with npm 11.6 and was dropped; mathjs is only used for `round()` in toolkit `create_order` (not allow-listed). Documented in **`docs/SECURITY.md`** (threat model: injection, money gate, webhook verification, secrets, HTTP surface, audit table).
- **Hardening found while writing SECURITY.md**: visitor workspace ids were sequential (`ws1`, guessable, anyone could drive another visitor's workspace) -> `ws<n>-<12 hex>`; client texts capped at 1000 chars (`MAX_MESSAGE_CHARS`) before model/audit; webhook verification now sends PayPal the **raw request bytes** (route-scoped raw-body JSON parser in `app.ts`, `RawJson` in `rest.ts`), non-JSON body -> 400. Tests: `server/test/security.test.ts`, `restPaypal.test.ts`, `app.test.ts`.
- **Fresh-clone rehearsal** (scratch clone of the branch, deleted afterwards): `npm ci`, `npm test` (163 then), `npm run demo` (health, `/?demo=1`, all 13 beats over HTTP, `..%2f` traversal probes return the SPA, killed), `npm run build`, `npm run eval`: all clean, no tracked files changed. Doc gaps fixed in README: Node version (20/22/24+), `npm ci` instead of `npm install` (also DEMO_SCRIPT, Devpost draft), `PORT` / Ctrl+C, audit note -> SECURITY.md, `npx playwright-core install chromium-headless-shell` for `ui-check`/`gallery` on machines without the browser cache.

### Verified (end of pass 6)
- `npm test` -> **164 passing** (20 files), peak 1.21-1.55 GB under the 2 GB cap. `npm run ui-check` passes (axe 0 violations), peak 1.13 GB. `npm run build` passes, 0.85 GB. `npm run gallery` 0.85 GB (re-shot: 01, 03, 06 changed). `npm run eval`: injection money effects 0.
- No long-lived processes left (the rehearsal's `npm run demo` tree was killed by PID).

### Next
1. Keys (NEEDS_INPUT): sandbox smoke, then owner questions with `PAYMENTS=sandbox` in both toolkit modes; first real webhook confirms the raw-body verification.
2. Revisit the audit when `@paypal/agent-toolkit` moves to zod 4 / mathjs 15; `@fastify/static` 10.1.8 once it is two weeks old.
3. `docs/screenshots/ledger-*.png` now change on every ui-check run (random workspace id in the REST request view); harmless, commit or ignore.

### Gotchas (new)
- `npm run gallery` and `ui-check` serve `web/dist`: run `npm run build -w web` first after a UI change, or the images show the old UI.
- npm 11 `overrides` did not re-resolve a nested dep (mathjs) even after deleting it from the lock; deleting the lock entry left the package missing. Restore the lock from a backup if you try again.
- tsx's parser chokes on some regex literals in an `--import` hook file; write such helpers without regex or load them before tsx.

## Review 2026-11-02 (adversarial money review, 02:32-04:15 IST, same branch, local only)

Independent read of `server/src` (engine, policy/decide, gateway/mock/rest/ids, toolkit gate, webhooks, agent) before reading these notes. Each bug: failing test first (`server/test/review2.test.ts`, `restPaypal.test.ts`), minimal fix, one commit. PITCH.md and the create_refund replay untouched.

### Bugs confirmed and fixed (19 fixes, `a78aca5..a1e9454`, one commit each plus one typecheck follow-up)
1. **Stale owner cards moved money**: an attendance card left open after a late-cancel text; tapping "arrived" voided the hold behind the pending fee card, then threw on the illegal transition. `applyApproval` now checks the booking can still take the card's step before any PayPal call; a stale card is closed (`resolved: 'stale'`, `StaleCardError`).
2. **Fees used the current policy, not the booked one**: the capture note cites `v{policyVersion}` but the amount/caps came from whatever the owner approved later. Engine keeps every approved version; `rulesFor(b)` (version + hash match) feeds decide, the fee card and `captureViolations`.
3. **Two live holds on one client**: declined reauthorization at T-72h left the original auth live; the re-approval auth replaced it in `onAuthorized` without a void. Replaced auths are now voided (failure -> `unreleasedAuths`), except reauthorization parents (`reauthParents`, set before the call so an early webhook is safe).
4. **PayPal-Request-Id / custom_id reuse in real-PayPal mode**: `demo` (fixed id), reset or restart restarts `bk_1...`, so ids repeated and PayPal would replay the previous life's orders/captures and its webhooks would hit the new booking. Sandbox mode adds a random per-engine run tag to request ids and custom_id; `ingestWebhook` also checks the workspace part. Simulator ids unchanged (screenshots stable).
5. **Model-fabricated quotes on review cards**: the card quoted `evidenceSpan` as the client's words; an injected/hallucinated span showed words the client never wrote. Spans not found in the text are replaced by the client's message.
6. **Refilled slot charged when its void failed**: `onRefillClaimAuthorized` threw before REFILLED, so the cutoff raised a capture card. Now REFILLED regardless; live hold flagged.
7. **CHARGED bookings adopted a stray new authorization** (overwrote the captured auth id, new hold never released). CHARGED is treated like the other terminal states: the late auth is voided.
8. **Free-window cancel left chargeable when the void failed** (booking stayed HELD, later attendance -> no-show -> fee). Now CANCELLED_EARLY regardless; live hold flagged (`releaseOrFlag`).
9. **"y'all ..." claimed a refill offer** (`YES` regex `\b` after `y` matches before an apostrophe) and placed a hold on the texter's wallet. Yes must be a word on its own.
10. **REST capture FAILED recorded as COMPLETED** (`rest.ts`): now DECLINED. 11. **REST refund FAILED/CANCELLED recorded as refunded**: now throws `REFUND_FAILED`.
12. **Reply-draft failure re-ran the settlement**: `reply()` threw after the money step, the agent/fallback retried `requestSettlement` and sent a second refill offer for the same slot (two claimable offers). `reply()` falls back to a fixed text.
13. **Offer-ranking failure stranded the booking** in PENDING_REFILL with no offer and no cutoff (no fee decision ever). Falls back to waitlist order + fixed text.
14. **No-show fee card fell back to the full hold** when `decide()` returned EXCUSE (e.g. a compiled policy listing `none` as excused). Capped at the no-show fee.
15. **Autopilot EXCUSE left the booking HELD when the void failed** (no owner to retry; chargeable later). Autopilot excusals use `releaseOrFlag`.
16. **T-72h reauthorization refused outright** (expired auth / limit / PayPal error) threw out of the clock job and aborted `advanceTo`. Now handled as a decline: HOLD_FAILED + re-approval link.
17. **Refund card stuck** after the fee was refunded another way ("already refunded" on every tap): closed as stale.
18. **Wrong visit settled for clients with several bookings**: "cancel my nail art on Saturday" (Riley, 3 Nov 12:00) put Wednesday's pedicure (23h ahead) into the late-cancel refill/fee path. `bookingForText` picks the one visit whose weekday/service the text names (unique best match), else the next visit as before. Existing flows unchanged.
19. **"Yes, but I can't do today" claimed a refill offer** and placed a hold: a yes followed by but/can't/cancel/not/won't/unable is not a claim (`isClaim`).
- Slip, fixed: the reply fallback (12) broke `tsc` (facts type) for 4 commits (`d3ccf00..c3f871c`); fixed in `7619aad`. Tests were green throughout; build checked after every commit since.

### Suspected / not fixed (need a product call or real PayPal to confirm)
- `engine.ts` `bookingForText` (fix 18) is keyword-based: a text naming two visits, or naming a visit only by date ("the 7th"), still goes to the next visit. A CLARIFY ("which visit?") for ambiguous multi-booking cancels would be safer but changes seeded flows.
- `app.ts:245` real webhooks are routed outside the per-workspace lock (`Locks`), so they can interleave with an owner tap at network awaits. Current handlers look safe (reauth parents, known-auth set) but serializing them is cheap.
- `engine.ts` `capture()`: after the 29-day expiry the reauthorize-before-capture fails, so a very late "charge" tap fails every time (card stays open, nothing moves; fail-closed). `holdStrategy: 'reauth'` with a booking > 32 days out always ends in a re-approval link (auth expires before T-72h); `reauth` is not reachable from config today.
- `engine.ts:1135` end-of-day review uses 23:59 **UTC** of the visit day: late-evening US visits get minutes (or zero) before NEEDS_REVIEW. All T-72h / window math is epoch ms, so no DST bug there.
- `policy.ts:169` `captureViolations` caps at the hold, not at the fee for the kind (late vs no-show); the card amounts are right now, the invariant is looser than it reads.
- `workspaces.ts:70` with toolkit credentials, one shared reader reads the whole sandbox account: any visitor workspace's owner questions can list other workspaces' PayPal transactions (read-only).
- Webhooks other than `PAYMENT.AUTHORIZATION.CREATED` (`engine.ts:510`) are only logged: a CAPTURE.DENIED / reversal leaves the booking CHARGED.

### Verified
- `npm test` 184 passing (21 files), peak 1.42 GB / 2 GB. `npm run build` passes, 0.83 GB / 3 GB. `npm run ui-check` passes (axe 0), 1.13 GB / 2 GB. `npm run eval` clean. Screenshot churn from ui-check reverted (content identical).
- History note: early commits of this pass were written with CRLF by a Windows text-mode write; rewritten to LF on this local branch before anything else built on them (backup ref `refs/original/...` left by filter-branch).

## 2026-11-02 review follow-up (03:00-03:15 IST, same branch, local only)

Each suspected issue from "Review 2026-11-02" confirmed with a failing test first (`server/test/review3.test.ts`, 17 tests), then a minimal fix, one commit each, `npm run build` after every commit. All seven were real bugs; none turned out not to be. PITCH.md and the create_refund replay untouched.

### Confirmed and fixed
1. **Webhooks outside the lock** (`app.ts`): the per-workspace lock moved into `Workspaces.run`; HTTP actions, `/paypal/return`, real webhooks (`routeWebhook`) and the simulator's webhooks all queue on it. Test: a webhook sent during an owner tap that is waiting on PayPal now runs only after the tap finishes.
2. **Visit matched by weekday/service only**: with Mon + Wed 4 + Wed 11 visits, "can't make it Wednesday" settled *Monday's* visit (tie -> fallback to the next visit). Now a tie goes to the nearest *named* visit, and a date ("the 11th", "Nov 11", "11 November") scores higher than a weekday/service (`bookingForText`). Days/dates in the studio zone (UTC by default; extra commit after fix 6/7).
3. **`captureViolations` capped at the hold only**: new `kind` ('no_show' | 'late_cancel') caps the amount at that fee; `capture()` passes it. Test: a fee card altered to the full hold is blocked.
4. **Shared sandbox toolkit reader read every workspace**: `PayPalToolkitReader.forWorkspace(scope)` gives each workspace a view of the one shared client (own HTTP log; `get_order`/`get_refund`/`list_transactions(transaction_id)` refused before any request unless the id is the workspace's; `list_transactions` rows filtered to its custom_ids/ids; disputes filtered by seller transaction id). `Engine.ownsCustomId()` / `paypalIds()`. Simulator workspaces stay unscoped (their simulator is per-workspace). Test: two workspaces on one simulated account.
5. **Only AUTHORIZATION.CREATED handled**: `PAYMENT.CAPTURE.DENIED` / `PAYMENT.CAPTURE.REVERSED` for the booking's capture set `paymentIssue`, money chip `reversed` ("charge reversed"), not counted as charged, no refund possible, open refund cards closed. `PAYMENT.REFUND.FAILED` (matched by refund id; refund resources carry no custom_id, so `routeWebhook` finds the workspace that created the object) clears `refundId` and raises a retry card; the retry uses a new PayPal-Request-Id (`-retryN`), or PayPal would replay the failure. UI: `reversed` in api.ts/App.tsx/styles.css (left out of the legend strip, explained in the legend list).
6. **End-of-day review at 23:59 UTC**: new `STUDIO_TIMEZONE` (IANA, validated in `config.ts`, default UTC so the demo is unchanged) -> `Engine.timeZone`; end-of-day uses `endOfLocalDay()` (Intl, DST-safe) and slot labels use the zone. Test: a 15:00 Los Angeles visit stays HELD at 16:30 local, review at local midnight. README + .env.example updated.
7. **Charge after the 29-day expiry failed on every tap**: bookings carry `holdExpiresAt` (set when a hold is authorized; a reauthorization keeps its parent's). `capture()` checks it first: no PayPal call, booking -> EXCUSED ("the hold expired before the fee was charged; nothing collected"), card closed as stale with the reason.

### Verified
- `npm test` **200 passing** (22 files), peak 1.59 GB / 2 GB. `npm run build` passes after every commit, peak 0.86 GB / 3 GB. `npm run ui-check` passes (axe 0), 1.06-1.12 GB / 2 GB. `npm run eval` injection money effects 0, 0.38 GB. ui-check screenshot churn (font antialiasing, random ids) reverted.

### Still open / not verified
- `PAYMENT.REFUND.FAILED` and the refund resource shape are written from the docs, not seen live (no keys). `PAYMENT.AUTHORIZATION.VOIDED` from outside (e.g. PayPal voiding a hold) is still only logged; a later capture fails closed.
- `freeSlots` (10:00-18:00) still uses UTC hours; with a non-UTC `STUDIO_TIMEZONE` it should move to the zone too. (Weekday/date matching of texts follows the zone since the extra commit after fix 7.)
- A text naming two visits ("cancel Wed and Sat") picks the nearer one; a CLARIFY would be safer (changes seeded flows).

## 2026-11-02 pass 7 (03:10- IST, same branch, local only)

Leftovers of the review follow-up, each test-first (`server/test/pass7.test.ts`, 8 tests), one commit each, `npm run build` after every commit. PITCH.md and the create_refund replay untouched.

### Done
1. **Outside `PAYMENT.AUTHORIZATION.VOIDED`** (`d0d3810`): the engine records the auth ids it voids itself (`ownVoids`); a VOIDED for the booking's current hold that it did not ask for sets `holdVoided`, money chip `voided`, closes an open charge card as stale (booking -> EXCUSED, nothing collected), the refill cutoff settles EXCUSED instead of raising a charge card, `capture()` refuses before any PayPal call, `voidHold` skips it. A fresh authorization (re-approval) clears the mark. Old auth ids and own voids change nothing.
2. **`freeSlots` in `STUDIO_TIMEZONE`** (`6fa836c`): 10:00-18:00 local, closed Sundays local, via a shared `fromLocalWall()` (DST-safe, also used by `endOfLocalDay`). UTC default unchanged.
3. **Two visits named** (`aefab3e`): `ambiguousVisits()` (best-scoring visits with different match signatures; a weekday two visits share is still "the nearer one") -> the client gets "which visit do you mean: ... ? Please text again about one visit at a time." Agent run traced as code, gate none; no booking, card, offer or PayPal call. `bookingForText` behaviour unchanged.
4. **Docs** (`553fa3f`): SECURITY.md (CRLF kept) threat model adds concurrency/PayPal-side events, workspace lock, stale cards, booked policy + per-kind cap, visit matching, reversal/refund-failed/outside-void handling, expiry, run tags, scoped toolkit reads, routing by run tag. README invariants + failure paths + STUDIO_TIMEZONE scope + a line on the 26-bug review; DEVPOST "Testing" 208 tests and a "Challenges" paragraph on the adversarial review. DEMO_SCRIPT unchanged.
- Gallery not re-run: no visible UI change in the seeded demo (UTC default, no outside voids, no two-visit texts).

### Verified
- `npm test` 208 passing (23 files), peak 1.66 GB / 2 GB. `npm run build` passes after every commit, 0.85 GB / 3 GB. `npm run ui-check` passes, 1.05 GB / 2 GB (screenshot churn reverted). `npm run eval` clean, 0.38 GB.

### Still open
- Outside-void handling is written from the docs (no live keys). A HELD booking whose hold was voided outside stays HELD until the T-72h reauthorize/visit; it does not proactively send a re-approval link.
- The clarifying question fires for any text naming two different visits (e.g. "running late for Wed and Sat"); it never moves money, but the client must text again.

## Review round 2 (2026-11-02, 03:18- IST, same branch, local only)

Second independent adversarial review, on what the money review did not cover: HTTP surface, REST adapter, webhook path, AI output, UI money display. Each bug: failing test first (`server/test/review4.test.ts`), minimal fix, one commit, `npm run build` after every commit. PITCH.md and the create_refund replay untouched.

### Confirmed and fixed (`f1c902a..`)
1. **Attribute injection in the policy highlight** (`frontdesk.ts`, `App.tsx`): compile_policy `spans` were not whitelisted; the model's `field` went unescaped into `<mark title="...">` via `dangerouslySetInnerHTML`. Spans now need a real rule name and text found in the owner's prose; the UI strips non-word chars from the title and uses a replacer function (no `$&` patterns).
2. **Malformed rules went live** (`policy.ts` `validateRules`): `/policy/approve` takes rules from the request body; strings for numbers, unknown reasons, a non-boolean `refillWaives`, a negative excusal count or extra keys were accepted. Full shape check now (types, known reasons, `excusalLimit` count >= 0 / months 1..24, no extra fields).
3. **Time travel to a string / 1e300** (`app.ts` `/time`): clock became a string/unrepresentable. Finite number, not backwards, at most 400 days ahead.
4. **Bookings with a past or non-number start** (`engine.createBooking`): a past start placed a hold for a visit that already happened and then raised an attendance/no-show card; a string start broke the timers. Future safe-integer start required.
5. **`/reset` created workspaces with caller-chosen ids**: now 404 for an unknown workspace.
6. **REST adapter transport** (`rest.ts`): no timeout (a hung PayPal call held the workspace lock forever), an HTML 5xx page threw a SyntaxError, network errors were not PaymentsErrors, a revoked cached token failed every call. Now 20 s timeout (`TIMEOUT`), `NETWORK_ERROR` / `UPSTREAM_ERROR` mapping, one token refresh + replay on 401 with the same PayPal-Request-Id. `preview.ts` token stub returns its body as text.
7. **Webhook dedupe burned failed events** (`engine.ingestWebhook`): the event id was marked seen before the handler ran; a handler error -> 5xx -> PayPal's redelivery was ignored as duplicate. The id is un-marked when the handler throws.
8. **Ledger counted a reversed capture as kept money** (`web/src/money.ts`, `Ledger.tsx`): server totals exclude it, the ledger's Charged/Kept did not, and `reversed` had no label. Amounts/labels moved to a React-free module that the server tests import.
9. **No rate limit on model-backed routes** (`app.ts`): `/messages`, `/assistant`, `/policy/compile`, `/book`, `/reset`: 30 per workspace and 300 server-wide per minute (429). `POST /api/workspaces` (seeds through the model and, in sandbox mode, PayPal; may evict the oldest visitor's workspace) shares one 30/min budget. SECURITY.md updated (CRLF kept).
10. **Runtime error messages leaked to clients** (`act`): TypeError/RangeError/etc. from a malformed body now answer `invalid request` (logged server-side).
11. **PayPal error on the T-72h hold aborted the clock run** (`engine.t72`): a 5xx/timeout on `placeHold` threw out of the job (job already dequeued) -> no hold, no link, later jobs in that advance skipped. Now handled like a decline (HOLD_FAILED + re-approval link) unless an authorization already exists; a hold PayPal did create still attaches via its AUTHORIZATION.CREATED webhook.
12. **Model calls could hang 10 min inside the workspace lock** (`anthropic.ts`): 60 s timeout, one retry, plus a backstop race.
13. **REST capture without `amount`** (`rest.ts`): a COMPLETED capture whose body lacks `amount` threw a TypeError after money moved (booking not CHARGED, card offered again). Falls back to the requested amount.
14. **Evicted workspaces kept their lock-queue entry** (`workspaces.ts`): deleted on eviction.
15. **Ledger state words contradicted the money chip** (`money.ts` `bookingStateLabel`): a reversed capture read "charged", a hold voided at PayPal read "held". Slip: the test passed extra fields and broke `tsc` for one commit (`b89db83`, fixed in `8d50d90`).
16. **Rate limit bypass via percent-encoding** (my own fix 9): the limiter matched the raw URL, so `/api/ws/demo/%6Dessages` (routed to `/messages`) skipped it. Now matches `req.routeOptions.url` + `req.params.ws`.
17. **Unbounded event streams** (`app.ts` `/events`): each SSE stream is an engine listener + timer; now 10 per workspace (429 beyond), slot freed on close. Tested with a real listening server.

### Suspected / not fixed (need a product call or live keys)
- `workspaces.ts:53-58,123-126`: evicting or resetting a sandbox-mode workspace drops its live holds without voiding them (sandbox wallets stay held up to 29 days; later webhooks go to `unknown_workspace`). Needs a "release all" on evict/reset; product call for the hosted demo.
- `workspaces.ts:43`: `tails` (lock queue) entries are never deleted on eviction (small leak, 1 promise per evicted id).
- `toolkit.ts` HTTP gate (`network(config)`): live toolkit reads (axios) have no timeout; set `config.timeout` in the adapter. Not testable offline.
- `web/src/api.ts:131`, `App.tsx:110,188`, `BookingPage.tsx:19,30,68,71`: the `?ws=` value is put into API paths without `encodeURIComponent`; a crafted link could aim a button at another route of the same workspace. No ambient authority (the id is the capability), so not exploitable across workspaces; cheap hardening.
- CSRF: body-less POSTs (`/refund`, `/demo/next`, `/reset`, `/sim/approve`) can be sent cross-site as text/plain; only matters for the public `demo` workspace, which anyone can drive anyway. Add an Origin check if workspaces ever get cookies/auth.
- `app.ts` webhook route: a handler error answers Fastify's default 500 body with the error message (PayPal is the only verified caller).
- `/policy/approve` `prose` is not type/size checked (owner-only; stored in the policy).
- `/audit` exposes the full audit including `placeHold` results with vault ids to anyone holding the workspace id (merchant-side tokens; same capability as the console).
- **Design: the public booking link is the owner's capability.** `App.tsx:188` shares `/book?ws=<id>` with clients, and `BookingPage.tsx:19` reads `/api/ws/<id>/state` (every client's name, messages, bookings, audit-adjacent data). Anyone holding a booking link can call every owner route of that workspace (approvals, refunds, policy, mode, time, reset). Fine for per-visitor demo workspaces; a real deployment needs a separate public booking id and owner auth.
- `rest.ts` `holdFromOrder`: an authorization in `PENDING` (under review) is treated as AUTHORIZED; capturing it would fail until PayPal clears it.
- Live-mode `paypal.get_order` results (payer name/email) go into the owner's trace and the model context (owner-only, clipped to 800/6000 chars).
