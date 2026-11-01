# PayPal Agent Toolkit and MCP server in HoldMySpot

Status 2026-11-02: implemented and tested against the PayPal simulator. Not yet run against the live PayPal sandbox (no keys yet).

## 1. What PayPal offers (checked 2026-11-02)

| | |
|---|---|
| TypeScript package | `@paypal/agent-toolkit` **1.11.0** (npm `latest`, published 2026-09-01). Entry points: `/openai` (function-calling: `getTools()`, `handleToolCall()`), `/ai-sdk`, `/langchain`, `/bedrock`, `/mcp` (an `McpServer` subclass). |
| Local MCP server | `@paypal/mcp` **1.8.1** = a small CLI around `@paypal/agent-toolkit/mcp` over stdio: `npx -y @paypal/mcp --tools=<list or all>`, env `PAYPAL_ACCESS_TOKEN`, `PAYPAL_ENVIRONMENT=SANDBOX/PRODUCTION`. |
| Remote MCP server | Sandbox `https://mcp.sandbox.paypal.com`, production `https://mcp.paypal.com`, paths `/sse` and `/http`; auth by bearer token or PayPal login in the MCP client. |
| Licence | The GitHub repo `paypal/agent-toolkit` and the `@paypal/mcp` tarball carry **Apache-2.0**. The npm `package.json` of `@paypal/agent-toolkit` says **ISC**. Both licences are permissive and compatible with our MIT. We cite Apache-2.0 (the repo LICENSE) and note the mismatch. |
| Auth | Client id + secret (client-credentials token fetched by the toolkit), or an access token for the MCP server. `context.sandbox: true` selects the sandbox. |

### Tool list (from the installed 1.11.0 build, 47 tools with every action on)

| Area | Tools | Read only? |
|---|---|---|
| Orders / payments | `get_order`, `get_refund` | **read** |
| | `create_order`, `pay_order` (captures an approved order), `create_refund` | **moves money** |
| Reporting | `list_transactions` (Transaction Search, `GET /v1/reporting/transactions`) | **read** |
| | `get_merchant_insights` | read (refused by the toolkit in sandbox mode) |
| Disputes | `list_disputes`, `get_dispute` | **read** |
| | `accept_dispute_claim` | **moves money** (accepting a claim refunds the buyer) |
| Invoices (21) | `list_invoices`, `get_invoice`, `search_invoicing`, `get_recurring_series`, ... | some read; the rest create, send, cancel, delete or record payments/refunds |
| Catalog, subscriptions, shipment | `list_products`, `show_product_details`, `list_subscription_plans`, `show_subscription_details`, `get_shipment_tracking`, ... | some read; the rest write (`create_subscription`, `cancel_subscription`, `update_plan`, ...) |

The online reference (developer.paypal.com/ai-tools/agent-tools) lists fewer tools than the 1.11.0 build and spells one `list_transaction`; we go by the installed code.

### A finding that shaped the design

The toolkit's `configuration.actions` filter only changes what `getTools()` **advertises**. In 1.11.0, `handleToolCall()` passes any method name straight to its dispatcher, so `handleToolCall({ name: 'create_refund' })` on a toolkit configured read-only still sends `POST /v2/payments/captures/{id}/refund`. Our test reproduces this (`server/test/toolkit.test.ts`, "the raw toolkit would dispatch create_refund / pay_order despite the config"), and our HTTP gate blocks it. The MCP server class behaves differently: it registers only the allowed tools, so the MCP layer answers `Tool create_refund not found`.

### Hackathon rules

The PayPal Developer blog lists "Best Use of Agentic Commerce" as one of the $5,000 honorable-mention prizes; the Devpost page itself (paypalaihackathon.devpost.com) refused automated fetches, so the exact prize wording is not quoted here. `HACKATHON_BRIEF.md` records our reading: PayPal is promoting the Agent Toolkit and MCP server for agents, and the judging criteria reward non-trivial PayPal use and a real tool-calling agent. Check the Devpost prize text before submitting.

## 2. Options considered

| Option | For | Against | Verdict |
|---|---|---|---|
| A. Give the agent the toolkit's money tools (`create_refund`, `pay_order`) | the most "agentic" | breaks the core rule: the model must never move money | rejected |
| B. Route the engine's own money calls through the toolkit | one PayPal client | the toolkit has no authorize-with-vault, void, reauthorize or partial `final_capture`; the engine needs all of them, so this would be a partial swap with no safety gain | rejected |
| **C. Read-only toolkit tools for the agent, money behind the code gate** | real PayPal tools in the agent's hands; keeps the safety rule; works without keys against the simulator | the agent reads PayPal but cannot act on it alone (by design) | **chosen** |

## 3. What is built (option C)

- `server/src/paypal/toolkit.ts`, `PayPalToolkitReader`:
  1. **Allow-list.** The toolkit is constructed with `{ transactions: {list}, orders: {get}, payments: {getRefunds}, disputes: {list, get} }`. A test asserts `getTools()` then returns exactly `list_transactions, get_order, get_refund, list_disputes, get_dispute`, and that the toolkit's money tools (`create_order, pay_order, create_refund, accept_dispute_claim`) exist in the installed toolkit and are left out.
  2. **Dispatch gate.** `call(name)` refuses any name outside the allow-list before the toolkit sees it, and passes on only known argument keys (strings, at most 128 characters).
  3. **HTTP gate.** An adapter on the axios instance the toolkit loads lets through `GET` and the OAuth token `POST` only, and only while a HoldMySpot call is in progress (`AsyncLocalStorage`). Any other request is refused with a 403 before it leaves the process and is logged as blocked.
- **Where the tools appear.** Only the owner's agent ("Ask your front desk") gets them, as `paypal.list_transactions`, `paypal.get_order`, `paypal.get_refund`, `paypal.list_disputes`, `paypal.get_dispute` (access `read`, source `paypal-agent-toolkit`). The agent that reads client texts gets none: client texts are untrusted input, so least privilege.
- **In the demo.** Beat 13 ("Alex apologised, refund her"): the agent finds the booking, calls `paypal.list_transactions` with the capture id to confirm on PayPal that the capture settled (trace shows `GET /v1/reporting/transactions → 200`), then `propose_refund`, which creates the Refund / Keep card. Only the owner's tap makes the engine call `refund()`. "How did this week go?" cross-checks the engine's totals against PayPal's transaction report. The Agent trace tab lists the toolkit tools and, struck through, the toolkit money tools the agent does not get.
- **Two transports.** Default (`PAYPAL_AGENT_TOOLKIT` unset): the toolkit's function-calling surface. `PAYPAL_AGENT_TOOLKIT=mcp`: PayPal's MCP server class from the same package, connected in-process over the MCP SDK's in-memory transport (the same code `npx @paypal/mcp` runs). `PAYPAL_AGENT_TOOLKIT=off` removes the tools.
- **Backends.** Simulator mode: the toolkit's real code runs and builds real PayPal requests; the HTTP gate answers them from a read-only copy of the simulator's state in PayPal's response shapes (orders, captures, refunds, transaction search; disputes are always empty). With `PAYMENTS=sandbox` the same reader uses the sandbox client id and secret and its GETs go to `api.sandbox.paypal.com`. That path has not been run (no keys).

## 4. Tests (`server/test/toolkit.test.ts`, 14)

- advertised tools == allow-list; money tools exist in the toolkit and are excluded
- `call()` refuses all 42 non-allow-listed toolkit tools with zero HTTP
- raw `handleToolCall('create_refund' / 'pay_order')` is blocked at the HTTP gate; simulator money operations unchanged
- a toolkit axios call outside a HoldMySpot call gets a 403 and never reaches the network
- read tools return PayPal-shaped data from the simulator through the toolkit's code
- owner agent trace shows `paypal.list_transactions` with source and the GET it made
- **a model that asks for `paypal.create_refund`, `paypal.pay_order`, `paypal.create_order`, `paypal.accept_dispute_claim`, `create_refund`, `pay_order` and `paypal.handleToolCall` gets every one denied; money operations, toolkit HTTP calls and refund cards stay at zero; the toolset the model was offered has only the five read tools**
- client-text agent runs are never offered toolkit tools
- flag off: no toolkit tools, snapshot says so
- MCP: `tools/list` == allow-list; `tools/call` for each money tool → "not found", no HTTP; a read tool works through MCP; the owner agent works with `PAYPAL_AGENT_TOOLKIT=mcp`

## 5. Limits (honest)

- Not run against the live sandbox. The toolkit fetches its own OAuth token with the same client id/secret; Transaction Search can lag by up to a few hours on real PayPal, so a just-made capture may not be listed yet.
- The simulator ignores the date range of `list_transactions` (the demo runs on its own clock) and leaves out PayPal transaction event codes rather than guess them.
- In MCP mode the toolkit's schemas validate PayPal id formats (order ids `^[A-Z0-9]{17,32}$`, capture and refund ids `^[A-Za-z0-9_-]{15,32}$`). The simulator issues ids in PayPal's real shapes (17 upper-case alphanumerics for orders, authorizations, captures, refunds and setup tokens; `WH-<17>-<17>` webhook events; 7-character lower-case Vault payment tokens; `server/src/paypal/ids.ts`), deterministic from a counter, so `get_order` / `get_refund` work in both modes. `server/test/toolkit.test.ts` runs the read-tool test once per mode. The default function-calling mode does not validate.
- `npm audit` reports advisories in some toolkit dependencies (`@langchain/core`, `@ai-sdk/provider-utils`). We load only the `/openai` and `/mcp` entry points, which do not load LangChain or the AI SDK. The toolkit is loaded on first use (~110 MB).
- An owner could also point Claude Desktop at `npx -y @paypal/mcp --tools=transactions.list,orders.get,payments.getRefunds,disputes.list,disputes.get` for the same read-only set. That is not part of the app.

## Sources

- https://github.com/paypal/agent-toolkit (README, LICENSE, `typescript/package.json`)
- https://www.npmjs.com/package/@paypal/agent-toolkit and https://www.npmjs.com/package/@paypal/mcp (versions via `npm view`)
- https://developer.paypal.com/ai-tools/agent-tools (tool reference)
- https://developer.paypal.com/ai-tools/toolkit (quickstart: packages, `getTools`, `handleToolCall`, MCP config)
- https://developer.paypal.com/tools/mcp-server/ (remote URLs, local command, auth)
- https://developer.paypal.com/community/blog/paypal-mcp-agenttoolkit/ (June 2025 announcement)
- https://developer.paypal.com/community/blog/PayPal_AI_Hackathon (prizes, dates)
- Installed code: `node_modules/@paypal/agent-toolkit/openai/index.js` (tool table, `isToolAllowed`, `handleToolCall`), `@paypal/mcp@1.8.1` `dist/index.js` (`--tools` values)
