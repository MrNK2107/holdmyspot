# HoldMySpot: implementation plan

_2026-11-01. Implements `docs/superpowers/specs/2026-11-01-holdmyspot-design.md` (approved). Where this plan and the design disagree, the design wins._

## Principles
- **Test first.** Every task starts with a failing test (vitest), then the minimum code to pass it.
- **Demo-driven.** Each task moves one of the three hero flows (excused, refilled, no-show) or failure path 1/2 closer to clickable. Anything not on that path waits.
- **The engine is the only caller of money.** AI code never imports the payments gateway; a test enforces this.
- **Everything runs without keys.** PayPal sits behind `PaymentsGateway`; `MockPayPalGateway` is a deterministic sandbox simulator. The LLM sits behind `LlmProvider`; `FakeLlmProvider` is deterministic. Real adapters are selected by env vars.
- Narrow scope per design §2 and the cut order in §10.

## Layout
```
package.json            npm workspaces: server, web
server/src/
  domain/      types.ts, stateMachine.ts, policy.ts (rules schema + decide)
  clock.ts     DemoClock (controllable time, due-job runner)
  audit.ts     per-workspace append-only audit log
  paypal/      gateway.ts (interface), mock.ts (simulator), rest.ts (Orders v2 / Payments v2)
  ai/          provider.ts (interface), fake.ts, frontdesk.ts (compile_policy, classify_message,
               parse_waitlist_entry, rank_and_draft_offer, draft_reply)
  engine/      engine.ts (settlement, approvals, attendance, refill, T-72h job)
  webhooks.ts  ingestion, dedupe by event id, routing by custom_id
  store.ts     in-memory workspace store (SQLite/Postgres later behind same interface)
  seed.ts      Priya, 3 services, ~12 bookings, 3 waitlisters, 4 sandbox buyers
  app.ts       Fastify routes + SSE;  index.ts entry
server/test/   one test file per module + flows.test.ts (hero flows end to end on the mock)
web/           React + Vite owner console, booking page, message simulator
```

## Tasks

| # | Task | Test first (what proves it) | Demo value |
|---|---|---|---|
| 1 | Scaffold monorepo (npm workspaces, TS, vitest, Fastify) | `npm test` runs a trivial test | — |
| 2 | Domain types + booking state machine `BOOKED→VAULTED→HELD→{ATTENDED,CANCELLED_EARLY,EXCUSED,PENDING_REFILL→{REFILLED,CHARGED}}`, `HOLD_FAILED`, `NEEDS_REVIEW` | legal transitions pass, illegal throw; money-state mapping | all flows |
| 3 | DemoClock + AuditLog | `advance()` fires due jobs in order; audit entries are append-only and per booking | time-travel control, money timeline |
| 4 | `PaymentsGateway` interface + `MockPayPalGateway` simulator: create+authorize order (buyer-present or `vault_id` MIT), capture (≤ authorized, `final_capture`), void, reauthorize (only day 4–29 of honor period), refund; negative-testing `INSTRUMENT_DECLINED`; idempotency by `PayPal-Request-Id`; emits webhook events with `custom_id` | amounts, honor-period errors, idempotent replays return same result, declines, events emitted | every money movement |
| 5 | `PayPalRestGateway` (real sandbox, Orders v2 `intent: AUTHORIZE`, Payments v2) with injectable `fetch` | recorded HTTP fixtures: OAuth token caching, correct paths/bodies/headers (`PayPal-Request-Id`, `PayPal-Mock-Response` for declines), error mapping | real sandbox traffic |
| 6 | Webhook ingestion: dedupe by event id ("duplicate, ignored" in audit), route by `custom_id` → workspace/booking | duplicate event is a no-op; unknown custom_id is logged | failure-path list in README |
| 7 | Policy rules schema + `decide()` + invariants (amount ≤ authorized, ≤ policy max, no capture under τ, protected reasons never auto-capture, every capture needs owner tap) | table-driven scenario cards | engine/AI boundary |
| 8 | `LlmProvider` interface + `FakeLlmProvider`; front-desk tools with structured outputs | fake returns deterministic labels; injection text yields no money parameters | policy compiler, message reader |
| 9 | Engine: `requestSettlement`, approval cards ("Ask me first"), attendance prompt at start+10m, end-of-day `NEEDS_REVIEW`, refund after capture | hero 1 (excused → void), hero 3 (no-show → approval → capture) on the mock | hero flows 1, 3 |
| 10 | Waitlist refill: code filter + AI rank, offer top 3, first YES claims, slot filled only on claimer's authorization webhook, declined claimer → next | hero 2 + failure path 2 | hero 2 |
| 11 | T−72h hold job (MIT authorize; fallback reauthorize), failure path 1 (declined → `HOLD_FAILED` → re-approval link → HELD) | time-travel to T−72h triggers it | failure path 1 |
| 12 | Seed + per-visitor workspace clone + reset | two workspaces are isolated | hosted demo |
| 13 | Fastify HTTP API + SSE (bookings, messages, approvals, time travel, policy compile, audit, webhooks endpoint) | `app.inject` tests for each route | console + simulator |
| 14 | Web: owner console (week grid with money-state chips; Bryntum Scheduler swap-in once licence checked), approval cards, time-travel, money timeline, message simulator, booking page | Vite build passes; headless screenshot | the video |
| 15 | Eval harness skeleton (`npm run eval`): message reader + policy compiler sets, injection money effects = 0 | runs on fake provider | eval table |
| 16 | Real adapters wired by env: Anthropic `LlmProvider`, PayPal sandbox smoke script, JS SDK approval on booking page | manual sandbox smoke (needs keys) | real traffic |
| 17 | `render.yaml`, README (architecture, "where we refused to use AI", what broke, production gating, run in 5 min), MIT LICENSE | — | submission |

## Day-1 spikes that need the user's sandbox keys (design §10)
MIT authorize with vaulted wallet; partial capture with `final_capture`; `INSTRUMENT_DECLINED` on authorize; Bryntum licence; Agent Toolkit `create_refund` / `list_transactions`. The mock implements the documented behaviour so the app is testable now; the spike results may change `rest.ts` only.
