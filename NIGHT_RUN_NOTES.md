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
