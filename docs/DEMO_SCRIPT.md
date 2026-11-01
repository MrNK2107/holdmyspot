# HoldMySpot demo video script (under 3:00)

Devpost rules: the video must be **under 3 minutes**, public on YouTube, show the project running, and use no copyrighted music or third-party trademarks without permission. Target **2:50** so there is margin.

## Before recording

1. `npm install` (once), then `npm run demo`. It builds the web app and starts the server on `http://127.0.0.1:18080` with the PayPal simulator and the deterministic front desk (no keys).
   - With sandbox keys later: `PAYMENTS=sandbox ... npm run demo`. The guided demo button is hidden in sandbox mode, because its beats use the simulator's approve step; record the sandbox take by hand with the time-travel buttons and the steps below.
2. Open `http://127.0.0.1:18080/?demo=1` in a clean browser window at **1680×1000** (or 1920×1080), zoom 100%, no extensions or bookmarks bar visible.
3. Check the top bar shows **PayPal simulator** and the guided-demo bar says "Start: Priya's week".
4. Press **→** (or click the purple button) to play each beat. Each press runs one scripted step on the server and points the console at the right booking and phone thread.
   - Hands-free take: `/?demo=1&autoplay=12` advances every 12 s.
   - Mistake? Click **Reset demo**; the script restarts from beat 0.
5. Record the screen only; add voice-over afterwards (or read the narration live). Music: none, or a track you made / licensed for this.

Honesty line (keep it on screen or say it): *"Payments in this recording run on HoldMySpot's PayPal sandbox simulator; the same engine calls the real PayPal sandbox adapter once keys are set."* Replace the take with a real-sandbox recording if keys arrive before submission.

## Storyboard

| Time | Beat (press →) | On screen | Say (voice-over) |
|---|---|---|---|
| 0:00–0:15 | *(cold open, before pressing anything)* | Console, Monday 9 AM: the week grid, each visit with a money chip (**held $20** for this week, **wallet saved** for later ones) | "Solo appointment pros lose a day's income to every no-show, and most never charge their own cancellation fee, because it feels unfair. HoldMySpot is an AI front desk that makes it fair, without the fight." |
| 0:15–0:27 | 1 · Priya's week | Money strip: **$… held, not charged** | "Priya runs a one-chair nail studio. Every booking carries a $20 PayPal hold: authorized, never charged unless she taps." |
| 0:27–0:42 | 2 · Her policy, in her words | Policy tab: prose on the left; click **Compile into rules** to show the questions (optional, adds 5 s) | "She pastes the policy she already texts clients. Claude turns it into rules and asks about the gaps. She approves. Code, not the model, enforces it." |
| 0:42–0:55 | 3 · Tue 2 PM: Jordan's hold declines | Clock jumps to Tue 2 PM; Jordan's Friday event turns red, **hold failed**; his phone shows a re-approval link | "72 hours before Jordan's visit we place the hold on his saved PayPal wallet. It declines, so he hears about it three days early, not at the door." |
| 0:55–1:02 | 4 · Jordan re-approves | Jordan's chip turns blue, **held $20** | "He re-approves in PayPal. Fixed." |
| 1:02–1:17 | 5 · Wed 9 AM: Sam's kid is sick | Sam's text: "kiddo threw up all night"; **Needs you** card suggests *Excuse (no charge)* | "Sam texts in plain words. Claude labels the message; the policy engine decides: excused. Priya is in ask-me-first mode, so she gets a card." |
| 1:17–1:27 | 6 · One tap: hold voided | Sam's chip turns green, **released · $0**; phone offers three rebook times | "One tap voids the authorization. Sam pays nothing and gets three times to rebook." |
| 1:27–1:40 | 7 · Thu 9 AM: Maya cancels late | Maya's chip turns amber, **refilling $20**; three waitlisters get the offer | "Maya cancels eight hours out. That's inside the fee window, but the fee is the last resort: the slot goes to the waitlist first." |
| 1:40–1:52 | 8 · Eli says yes, his hold declines | Eli's thread: "couldn't place the hold"; Maya still **refilling** | "Eli says yes first, but the slot is only his once PayPal authorizes his hold. It declines, so the offer stays open." |
| 1:52–2:07 | 9 · Chris claims it: Maya pays $0 | Chris's new booking **held $20** beside Maya's **released · $0**; strip: "1 late cancel refilled · $0 lost" | "Chris's hold authorizes, the slot is refilled, and Maya's hold is voided. **Late cancel. $0 lost. $0 charged.**" |
| 2:07–2:17 | 10 · A message cannot move money | Taylor's injection text; Taylor's chip stays **held $20** | "A prompt injection does nothing: the model only proposes a label. It has no PayPal tools." |
| 2:17–2:27 | 11 · Thu 11:10 AM: did Alex show? | Alex marked no-show; capture card **Fee $20 from the existing hold** | "Ten minutes after Alex's slot, the console asks. Silence never charges: unanswered, it goes to review." |
| 2:27–2:37 | 12 · She taps Charge | Alex's chip turns red, **charged $20**; the panel shows the capture ID | "Nobody to refill, so Priya taps Charge, and the engine captures $20 from the authorization." |
| 2:37–2:45 | 13 · Changed her mind: refund | **refunded $20**; scroll the money timeline briefly | "Alex apologises; one tap refunds it. Every AI output and PayPal call is in the audit log." |
| 2:45–2:52 | *(close)* | Strip + logo | "HoldMySpot. Fair, without the fight." |

Total: about 2:52. If a take runs long, drop the optional compile click in beat 2 and shorten beat 10.

## What each beat calls

The guided demo (`server/src/demo.ts`) drives the same engine methods as the HTTP API: clock time travel (`POST /api/ws/:ws/time`), client texts (`/messages`), owner taps (`/approvals/:id`), simulator approval (`/sim/approve/:id`) and refund (`/bookings/:id/refund`). When the clock jumps past routine visits, the script marks those clients as arrived (their holds are voided, and the audit log records Priya's tap) so the "Needs you" column only shows the story. `server/test/e2e.test.ts` plays all 13 beats over HTTP and checks the final money states; `npm run ui-check` plays them in a headless browser.

## Shots to cut in if there is time

- The client booking page on a phone (`/book?ws=demo`): pick a time, read the policy, **Book and approve with PayPal** → "You're booked. PayPal is holding $20. It is not a charge."
- The legend's **What do these mean?** panel for the money states.
- `npm run eval` output: injection money effects 0.
