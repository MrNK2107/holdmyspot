# Night run notes: HoldMySpot

## 2026-11-01 (branch `night-run/2026-11-01`, local only, never pushed)

Plan: `docs/superpowers/plans/2026-11-01-holdmyspot-plan.md` (tasks 1-17). Design: `docs/superpowers/specs/2026-11-01-holdmyspot-design.md`.

### Done
- Repo initialised (was not a git repo), `.gitignore`, initial commit on master, work on `night-run/2026-11-01`.
- Plan tasks 1-13 (server): npm workspaces (`server`, `web`), TypeScript + vitest + Fastify.
  - `server/src/domain`: types, booking state machine, policy rules + `decide()` + capture invariants.
  - `server/src/clock.ts` DemoClock (time travel fires due jobs), `audit.ts` append-only audit log.
  - `server/src/paypal`: `PaymentsGateway` interface; `mock.ts` deterministic sandbox simulator (honor period, 29-day expiry, reauthorize from day 4, idempotency by PayPal-Request-Id, negative-testing declines, webhooks with custom_id); `rest.ts` real Orders v2 intent=AUTHORIZE + Payments v2 adapter, tested only with recorded HTTP.
  - `server/src/ai`: `LlmProvider` interface, `FakeLlmProvider` (keyword rules), `FrontDesk` (whitelists every AI output, audits it). Test enforces that no AI module imports paypal/engine.
  - `server/src/engine/engine.ts`: holds (MIT with vault, buyer-present links), T-72h job (+ reauth fallback), failure path 1 (decline → re-approval link), settlement via `decide()`, approval cards (ask-me-first / autopilot), refill with top-3 fan-out and claim-on-authorization (failure path 2), attendance prompt at +10m, end-of-day NEEDS_REVIEW (silence never charges), capture with invariants (+ reauthorize after honor period), refund.
  - `seed.ts` (Priya, 3 services, 12 bookings, 3 waitlisters), `workspaces.ts` (per-visitor workspaces, webhook routing by custom_id).
  - `app.ts` HTTP API + SSE, simulator approval page, `/api/paypal/webhook`. `config.ts` picks mock vs sandbox from env.
- Tests: `npm test` (root) → 73 passing.

### In progress / next
- See the bottom of this section (updated at the end of the run).

### Gotchas
- Windows: the Bash tool fails on long heredocs with apostrophes; write files with the editor tool.
- Run tests under memcap: `bash ../_night_run/tools/memcap.sh 2 5 'npm test'` (peak ~0.8 GB).
- No `.env` exists yet: real PayPal sandbox calls need the user's sandbox app keys (see `_night_run/2026-11-01/NEEDS_INPUT.md`).
- Bryntum Scheduler is not on public npm (trial/licensed registry). The console uses a hand-built week grid for now; swap-in is plan task 14b once the licence question is answered.
