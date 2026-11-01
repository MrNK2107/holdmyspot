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
