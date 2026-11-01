# Submission checklist (PayPal "Build What's Next with PayPal and AI")

Deadline: **13 Nov 2026, 01:30 IST** on Devpost. Last full re-check: 2026-11-02 (branch `night-run/2026-11-01`, local, not pushed).

## Done (verified 2026-11-02)

- `npm test`: 272 tests in 25 files pass, also from a fresh clone (`npm ci --offline` then `npm test`).
- `npm run demo` from a fresh clone: builds and serves on 18080 (`PORT=` to change). All 13 guided-demo beats played over HTTP on the shared `demo` workspace (open console) and on a private workspace (owner token), plus a second run after reset. Every beat succeeds; final totals are $20 charged and $20 refunded, with no open cards.
- Guided demo in headless Chromium, on both a private and the shared workspace: at every beat the week-grid money chips, the selected booking's chip and the money strip match `/state`. The ledger totals row matches the server totals ($100 held, $20 charged, $20 refunded, $0 kept). The owner token works as intended: the console keeps access after a reload, and a fresh browser with only the booking link sees "owner access needed" and no bookings.
- `npm run ui-check`: passes, 0 axe violations on 14 screens. It now also fails on any browser console error on the desktop console. This caught AG Grid error #200: the tooltip module was missing, so the "Kept (net)" header tooltip and the Refill tooltips did not show. Fixed.
- `npm run eval`: intent F1 1.0, reason F1 0.857, injection money effects 0 (10 cases, 16 denied tool calls), waitlist 20/20 (offline provider).
- `npm run build` passes after every commit.
- Gallery (`npm run gallery`) re-shot because the legend now lists "partly refunded" (01, 03, 05, thumbnail changed). All six captions still describe what the images show.
- `docs/DEMO_SCRIPT.md`: 2:52 total. Every voice-over line fits its slot at 2.5 words per second. Beat titles and on-screen money chips match the running demo.
- `docs/DEVPOST_SUBMISSION.md`: test count updated to 272, the third (surface) review added. The eval numbers and the 14 axe screens match reality.

## Your steps, in order

1. **PayPal sandbox keys.** At developer.paypal.com, create a sandbox REST app with Vault ("save payment methods") enabled. Put `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` in `paypal-ai-hackathon/.env`, which is gitignored and never committed. Create **4 sandbox personal (buyer) accounts** for the demo clients who approve holds.
2. **Sandbox smoke.** From `server/`: `node --env-file=../.env --import tsx src/scripts/sandbox-smoke.ts`. Approve the printed link with a sandbox buyer, then rerun with `authorize <orderId>`. Then rerun with the vault id for the merchant-initiated hold, the partial capture and the decline test. Then run `PAYMENTS=sandbox npm run demo` and walk the scenes by hand; the guided demo is hidden in sandbox mode. If anything differs from the simulator, fix it before recording, and update the "Honest status" text in README.md and DEVPOST_SUBMISSION.md.
3. **Record the video** from `docs/DEMO_SCRIPT.md`: `npm run demo`, open `/?demo=1` at 1680x1000, 2:52 target, keep the honesty line on screen. Upload to YouTube as public. No copyrighted music.
4. **Render deploy.** Push the branch, then in the Render Dashboard go to New → Blueprint and pick the repo; `render.yaml` is keyless by default. For live payments, set `PAYMENTS=sandbox`, the PayPal secrets and `PAYPAL_WEBHOOK_ID` in the Dashboard. Point the sandbox app's webhook at `https://<service>.onrender.com/api/paypal/webhook`. Open `/?demo=1` on the deployed URL once to check it. The free plan resets the demo after about 15 idle minutes.
5. **Devpost form fields.** Copy from `docs/DEVPOST_SUBMISSION.md`:
   - Name, tagline, and links (GitHub repo URL, hosted URL, YouTube URL).
   - Inspiration, What it does, How we built it, PayPal APIs used, How we used AI, Challenges, Accomplishments, What we learned, What's next.
   - Built with.
   - Resolve every `[TODO]`: links, the "Honest status" after the sandbox run, the AI-tool disclosure wording for development, and the eval numbers (keep the offline numbers, or rerun `npm run eval` with `AI=anthropic`).
   - Make the repo public, with LICENSE (MIT) visible in About.
6. **Gallery upload order:** thumbnail `docs/gallery/thumbnail.png` (3:2), then `01-week.png`, `02-policy.png`, `03-refill.png`, `04-agent-denied.png`, `05-owner-approval.png`, `06-ledger.png`. Use the captions in DEVPOST_SUBMISSION.md. If you have time after the sandbox run, re-shoot with `npm run gallery`.

## Open decisions (yours)

- **PITCH.md** still describes the old "Casefile" idea. Delete it or rewrite it before the repo goes public.
- **`create_refund` replay.** For prompt-injection texts, the offline provider deliberately requests `create_refund` (denied), so the guard is visible in beat 10. The trace and DEMO_SCRIPT label it as a red-team replay. Keep it, or remove it (one `if` in `server/src/ai/fake.ts` `agentStep`).
- **Bryntum Scheduler.** The licence check is still pending, so the week grid is hand-built. Ship the hand-built grid (the README says so), or add Bryntum if a free hackathon licence is confirmed.
- **Partial-refund cards.** After a partial refund made in the PayPal dashboard, the front desk's prepare-refund card and the refund-failed card still show the full captured fee. The refund itself sends only the rest. The code sits next to the agent refund path and the replay, so it is left for your call. It never shows in the seeded demo.
