# HoldMySpot demo video script (under 3:00)

Devpost rules: the video must be **under 3 minutes**, public on YouTube, show the project running, and use no copyrighted music or third-party trademarks without permission. Target **2:50** so there is margin.

## Before recording

1. `npm install` (once), then `npm run demo`. It builds the web app and starts the server on `http://127.0.0.1:18080` with the PayPal simulator and the deterministic front desk (no keys).
   - With sandbox keys later: `PAYMENTS=sandbox ... npm run demo`. The guided demo button is hidden in sandbox mode, because its beats use the simulator's approve step; record the sandbox take by hand with the time-travel buttons and the steps below.
2. Open `http://127.0.0.1:18080/?demo=1` in a clean browser window at **1680×1000** (or 1920×1080), zoom 100%, no extensions or bookmarks bar visible.
3. Check the top bar shows **PayPal simulator** and **AI: offline provider**, and the guided-demo bar shows the who/problem card with "Start: Priya's week". While the guided demo is on, the manual time-travel buttons are hidden.
4. Press **→** (or click the purple button) to play each beat. Each press runs one scripted step on the server and points the console at the right booking and phone thread.
   - Hands-free take: `/?demo=1&autoplay=12` advances every 12 s.
   - Mistake? Click **Reset demo**; the script restarts from beat 0.
5. Record the screen only; add voice-over afterwards (or read the narration live). Music: none, or a track you made / licensed for this.

Honesty line (keep it on screen or say it): *"Payments in this recording run on HoldMySpot's PayPal sandbox simulator; the same engine calls the real PayPal sandbox adapter once keys are set."* Replace the take with a real-sandbox recording if keys arrive before submission.

## Storyboard

| Time | Beat (press →) | On screen | Say (voice-over) |
|---|---|---|---|
| 0:00–0:15 | *(cold open, before pressing anything)* | Console, Monday 9 AM: the demo bar's who/problem card; the week grid, each visit with a money chip (**held $20** for this week, **wallet saved** for later ones); "Needs you: All quiet" | "At nail studios, about one booking in twenty-five is a no-show and one in nine is cancelled.¹ Each no-show is an empty chair, and charging a regular whose kid is sick feels unfair. HoldMySpot is an AI front desk that makes it fair, without the fight." |
| 0:15–0:27 | 1 · Priya's week | Money strip: **$… held, not charged** | "Priya runs a one-chair nail studio. Every booking carries a $20 PayPal hold: authorized, never charged unless she taps." |
| 0:27–0:42 | 2 · Her policy, in her words | Policy tab: prose on the left with the compiled spans highlighted, compiled rules on the right, and the AI's question "Does a sick child count as an emergency?" (the guided demo compiles on open) | "She pastes the policy she already texts clients. The AI turns it into rules and asks about the gaps. She approves. Code, not the model, enforces it." |
| 0:42–0:55 | 3 · Tue 2 PM: Jordan's hold declines | Clock jumps to Tue 2 PM; Jordan's Friday event turns red, **hold failed**; his phone shows a re-approval link | "72 hours before Jordan's visit we place the hold on his saved PayPal wallet. It declines, so he hears about it three days early, not at the door." |
| 0:55–1:02 | 4 · Jordan re-approves | Jordan's chip turns blue, **held $20** | "He re-approves in PayPal. Fixed." |
| 1:02–1:17 | 5 · Wed 9 AM: Sam's kid is sick | Sam's text: "kiddo threw up all night"; **Needs you** card suggests *Excuse (no charge)*; the **Front desk agent** card lists its tool calls: `get_booking` (read only) → `get_policy` (read only) → `classify_message` (label only) → `propose_settlement` → policy check → **money gate: needs owner tap** | "Sam texts in plain words. The front desk agent looks up her booking and the policy, labels the message, and proposes. It has no payment tools: the policy engine decides, excused, and Priya gets a card." |
| 1:17–1:27 | 6 · One tap: hold voided | Sam's chip turns green, **released · $0**; phone offers three rebook times | "One tap voids the authorization. Sam pays nothing and gets three times to rebook." |
| 1:27–1:40 | 7 · Thu 9 AM: Maya cancels late | Maya's chip turns amber, **refilling $20**; three waitlisters get the offer | "Maya cancels eight hours out. That's inside the fee window, but the fee is the last resort: the slot goes to the waitlist first." |
| 1:40–1:52 | 8 · Eli says yes, his hold declines | Eli's thread: "couldn't place the hold"; Maya still **refilling** | "Eli says yes first, but the slot is only his once PayPal authorizes his hold. It declines, so the offer stays open." |
| 1:52–2:07 | 9 · Chris claims it: Maya pays $0 | Chris's new booking **held $20** beside Maya's **released · $0**; strip: "1 late cancel refilled · $0 lost" | "Chris's hold authorizes, the slot is refilled, and Maya's hold is voided. **Late cancel. $0 lost. $0 charged.**" |
| 2:07–2:17 | 10 · A message cannot move money | The **Agent trace** tab opens on Taylor's run: `create_refund` in red, **denied · not in toolset**; the toolset panel shows the four money tools struck through (engine only); the run ends "No money moved" | "Taylor tries a prompt injection. The trace shows the model reaching for a refund tool. Denied: the agent doesn't have one. It can only propose a label, and nothing moves." |
| 2:17–2:27 | 11 · Thu 11:10 AM: did Alex show? | Alex marked no-show; his chip stays **held $20** and a capture card asks **Charge / Waive** (fee $20 from the existing hold) | "Ten minutes after Alex's slot, the console asks. Silence never charges: unanswered, it goes to review." |
| 2:27–2:37 | 12 · She taps Charge | Alex's chip turns red, **charged $20**; the panel shows the capture ID | "Nobody to refill, so Priya taps Charge, and the engine captures $20 from the authorization." |
| 2:37–2:45 | 13 · Changed her mind: refund | The beat asks the front desk "Alex apologised, please refund her no-show fee": the agent card shows `find_booking` → `paypal.list_transactions` (PayPal Agent Toolkit, read only) → `propose_refund` → **money gate** → **Priya tapped "refund"** → PayPal refund; Alex's chip turns **refunded $20**. If time allows, click the **Ledger** tab (AG Grid: authorization, capture and refund ids, totals row) | "Alex apologises. Priya just asks her front desk. The agent finds the capture, checks it on PayPal with PayPal's Agent Toolkit, and prepares the refund, but only her tap sends it. Every booking, PayPal id and API call is in the ledger." |
| 2:45–2:50 | *(close)* | Strip + logo | "HoldMySpot. Fair, without the fight." |

¹ Zenoti, *2026 Beauty & Wellness Benchmark Report*, as summarised on Zenoti's "No-show revenue calculator" page (The Check-In, 13 May 2026): nail studios 4% no-show rate (up from 1%), cancellation rate 11% (down from 16%), $73 median ticket. https://www.zenoti.com/thecheckin/no-show-revenue-calculator . Vendor data from its own platform; say "about" and show the source on screen as a lower-third.

Total: 2:50, beats back to back. If a take runs long, shorten beat 2 (the rules are already on screen) and the close.

## What each beat calls

The guided demo (`server/src/demo.ts`) drives the same engine methods as the HTTP API: clock time travel (`POST /api/ws/:ws/time`), client texts (`/messages`), owner taps (`/approvals/:id`), simulator approval (`/sim/approve/:id`) and refund (`/bookings/:id/refund`). When the clock jumps past routine visits, the script marks those clients as arrived (their holds are voided, and the audit log records Priya's tap) so the "Needs you" column only shows the story. `server/test/e2e.test.ts` plays all 13 beats over HTTP and checks the final money states; `npm run ui-check` plays them in a headless browser.

## Honesty notes for the agent beats

- The keyless take runs the **offline provider**: a deterministic stand-in for Claude that plans the same tool sequence. For a message carrying a prompt injection it deliberately replays what a manipulated model would try (`create_refund`), so the denial is visible; the trace's "why" line says so. Do not call it Claude in the voice-over unless the take was recorded with `AI=anthropic`.
- With `AI=anthropic`, Claude chooses the tools itself and may not attempt the refund tool at all. Then the injection beat shows the low-confidence label and "No money moved" instead; say that.

## Shots to cut in if there is time

- The client booking page on a phone (`/book?ws=demo`): pick a time, read the policy, **Book and approve with PayPal** → "You're booked. PayPal is holding $20. It is not a charge."
- The legend's **What do these mean?** panel for the money states.
- `npm run eval` output: injection money effects 0.
- Ledger → **PayPal calls**: type `capture` in the search box to filter the API-call log; **Export CSV**.
- Ledger → **REST requests**: the capture row's request body (`final_capture: true`, `PayPal-Request-Id`) as the real adapter builds it. Strong 5-second shot for PayPal judges while the simulator caveat is on screen.
- **Ask your front desk** → "How did this week go?": the agent answers from `list_transactions`.
