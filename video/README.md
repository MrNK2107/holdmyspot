# HoldMySpot demo video (real PayPal sandbox)

Recorded against the real PayPal sandbox with a studio created live in the UI; only the studio clock is simulated (the video says so on screen).

1. API: `cd server && PAYMENTS=sandbox PUBLIC_URL=http://localhost:18174 node --env-file=../.env --import tsx src/index.ts`
2. UI: `npm run dev -w web` (port 18174, proxies `/api` and `/paypal` to the API)
3. Voice (ElevenLabs "Chris", keys in `~/.secrets/elevenlabs.key`): `python video/tools/tts.py` (cached per segment)
4. Record: `cd server && PAYMENTS=sandbox node --env-file=../.env --import tsx src/scripts/record-demo.ts` (needs `.env.sandbox-accounts`, gitignored)
5. Cut: `python video/tools/assemble.py --speed 2` writes `video/out/holdmyspot_demo.mp4`

Script: `video/script/narration.json`. The front-desk AI is the offline provider unless `AI=anthropic` and `ANTHROPIC_API_KEY` are set before step 1.
