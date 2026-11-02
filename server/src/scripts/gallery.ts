/**
 * Devpost gallery: starts the app in-process (PayPal simulator, offline AI provider) on an unusual
 * port, plays the guided demo over HTTP and captures one framed 1280x720 image (rendered at 1.5x,
 * so 1920x1080) per key beat into docs/gallery/, plus a 3:2 thumbnail. Needs `npm run build -w web`
 * and the cached Playwright headless Chromium (same as ui-check).
 *
 *   npm run gallery            # from the repo root
 */
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Page } from 'playwright-core';
import { buildApp } from '../app.js';
import { Workspaces } from '../workspaces.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const out = resolve(root, 'docs/gallery');
const port = Number(process.env.GALLERY_PORT ?? 18095);
const W = 1280;
const H = 720;
const CAPTION = 64;
const SCALE = 1.5;
/** The console is laid out for a laptop: capture it at 1680 CSS px wide (phone simulator visible) and fit it into the frame. */
const APP_W = 1680;
const APP_H = Math.round((APP_W * (H - CAPTION)) / W);

const workspaces = new Workspaces();
const app = await buildApp({ workspaces, webDist: resolve(root, 'web/dist') });
await app.listen({ port, host: '127.0.0.1' });
const base = `http://127.0.0.1:${port}`;
mkdirSync(out, { recursive: true });
const raw = resolve(out, '.raw');
mkdirSync(raw, { recursive: true });

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

/** Puts a raw app capture under a caption bar, at exactly W x H CSS px. */
async function frame(browser: Browser, rawPath: string, file: string, n: string, title: string, sub: string): Promise<void> {
  const img = readFileSync(rawPath).toString('base64');
  const p = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: SCALE });
  await p.setContent(`<!doctype html><html><head><style>
    *{box-sizing:border-box;margin:0}
    body{width:${W}px;height:${H}px;background:#ece4f7;font-family:'Segoe UI',system-ui,sans-serif;overflow:hidden}
    .cap{height:${CAPTION}px;display:flex;align-items:center;gap:16px;padding:0 24px;color:#1f1b24;border-bottom:1px solid #d6c9ea}
    .n{font-weight:700;font-size:13px;letter-spacing:.08em;color:#fff;background:#6b3fa0;border-radius:999px;padding:4px 10px}
    .t{font-size:22px;font-weight:700}
    .s{font-size:15px;color:#4a4152;margin-left:auto;text-align:right;max-width:600px;line-height:1.3}
    img{display:block;width:${W}px;height:${H - CAPTION}px}
  </style></head><body>
    <div class="cap"><span class="n">${esc(n)}</span><span class="t">${esc(title)}</span><span class="s">${esc(sub)}</span></div>
    <img src="data:image/png;base64,${img}">
  </body></html>`);
  await p.screenshot({ path: resolve(out, file) });
  await p.close();
}

const browser = await chromium.launch({ headless: true });
try {
  const created = (await (await fetch(`${base}/api/workspaces`, { method: 'POST' })).json()) as { id: string; ownerToken: string };
  const ws = created.id;
  const headers = { 'x-owner-token': created.ownerToken };
  const demo = async () => (await (await fetch(`${base}/api/ws/${ws}/demo`, { headers })).json()) as { step: number; bookingIds: Record<string, string> };
  const next = async (to: number) => {
    while ((await demo()).step < to) {
      const r = await fetch(`${base}/api/ws/${ws}/demo/next`, { method: 'POST', headers });
      if (!r.ok) throw new Error(`demo/next failed: ${r.status} ${await r.text()}`);
    }
  };
  const page: Page = await browser.newPage({ viewport: { width: APP_W, height: APP_H }, deviceScaleFactor: 1.25 });
  page.on('pageerror', (e) => console.error('page error', e.message));
  const open = async (q: string, ready: string) => {
    await page.goto(`${base}/?ws=${ws}${q}#owner=${created.ownerToken}`);
    await page.locator(ready).first().waitFor({ timeout: 10000 });
    // the gallery shows the product, not the demo's time-travel controls
    await page.addStyleTag({ content: 'nav.travel{display:none!important}' });
    await page.waitForTimeout(400);
  };
  const ids = async () => (await demo()).bookingIds;
  type Shot = { file: string; n: string; title: string; sub: string };
  const shots: Shot[] = [];
  const take = async (s: Shot, prep?: () => Promise<void>) => {
    if (prep) await prep();
    const r = resolve(raw, s.file);
    await page.screenshot({ path: r });
    shots.push(s);
  };

  // 1. The week: every appointment carries its money state.
  await next(1);
  await open(`&sel=${(await ids()).taylor}&phone=sam`, '.strip');
  await take({ file: '01-week.png', n: '01', title: "Priya's week", sub: 'Every booking carries a $20 PayPal hold: authorized, never charged unless she taps' });

  // 2. Policy in her words, compiled to rules.
  await next(2);
  await open('&tab=policy', '.strip, h2');
  await page.getByRole('button', { name: /compile/i }).first().click().catch(() => undefined);
  await page.waitForTimeout(800);
  await take({ file: '02-policy.png', n: '02', title: 'Her policy, in her words', sub: 'The AI compiles it into rules and asks about the gaps. Code enforces it.' });

  // 3. Late cancel refilled from the waitlist: Maya pays $0.
  await next(9);
  await open(`&sel=${(await ids()).maya}&phone=chris`, '.strip');
  await take({ file: '03-refill.png', n: '03', title: 'Late cancel, refilled', sub: "Eli's hold declined, Chris's authorized: slot refilled, Maya's hold voided, $0 fee" });

  // 4. Agent trace: the injected create_refund call is denied.
  await next(10);
  await open(`&tab=agent&sel=${(await ids()).taylor}`, '.trace-detail');
  await take({ file: '04-agent-denied.png', n: '04', title: 'A text cannot move money', sub: 'Prompt injection reaches for create_refund: denied, not in the agent toolset' });

  // 5. Owner approval: the no-show charge waits for her tap.
  await next(11);
  await open(`&sel=${(await ids()).alex}&phone=alex`, '.strip');
  await take({ file: '05-owner-approval.png', n: '05', title: 'Only her tap charges', sub: 'Alex no-showed. The engine proposes the $20 capture; Priya decides' });

  // 6. AG Grid ledger after charge + refund.
  await next(13);
  await open('&tab=ledger', '.ag-row');
  await take({ file: '06-ledger.png', n: '06', title: 'Every cent, traced', sub: 'AG Grid ledger: holds, captures, refunds and the PayPal ids behind them' });

  // 7. The eval table: every case behind the AI's numbers, misses first.
  await open('&tab=agent', '.eval-card .ag-row');
  await take(
    { file: '07-evals.png', n: '07', title: 'Measured, misses included', sub: '70 eval cases in AG Grid. Prompt injections moved $0; each miss shows its money effect' },
    async () => {
      await page.locator('.eval-card').evaluate((el) => el.scrollIntoView({ block: 'start' }));
      await page.waitForTimeout(300);
    },
  );

  for (const s of shots) await frame(browser, resolve(raw, s.file), s.file, s.n, s.title, s.sub);

  // Thumbnail (3:2): title card next to the refill capture.
  const img = readFileSync(resolve(raw, '03-refill.png')).toString('base64');
  const t = await browser.newPage({ viewport: { width: 900, height: 600 }, deviceScaleFactor: 4 / 3 });
  await t.setContent(`<!doctype html><html><head><style>
    *{box-sizing:border-box;margin:0}
    body{width:900px;height:600px;background:#1f1b24;color:#fff;font-family:'Segoe UI',system-ui,sans-serif;overflow:hidden;position:relative}
    .txt{position:absolute;left:56px;top:70px;width:470px;z-index:2}
    .logo{font-size:18px;font-weight:700;letter-spacing:.02em;color:#c9b3ef}
    h1{font-size:54px;line-height:1.02;margin:18px 0 18px;font-weight:750}
    p{font-size:21px;line-height:1.35;color:#ddd5e8}
    .chips{display:flex;gap:8px;margin-top:26px;flex-wrap:wrap}
    .chip{font-size:15px;font-weight:600;border-radius:999px;padding:5px 12px;background:#fff;color:#1f1b24}
    .held{background:#2459c9;color:#fff}.void{background:#17704a;color:#fff}.cap{background:#b4233c;color:#fff}
    .shot{position:absolute;left:470px;top:120px;width:820px;border-radius:12px;transform:rotate(-3deg);box-shadow:0 20px 60px #0009}
    .fade{position:absolute;inset:0;background:linear-gradient(90deg,#1f1b24 50%,#1f1b2400 66%);z-index:1}
  </style></head><body>
    <img class="shot" src="data:image/png;base64,${img}"><div class="fade"></div>
    <div class="txt"><div class="logo">&#9670; HoldMySpot</div>
    <h1>No-shows,<br>settled fairly.</h1>
    <p>An AI front desk for one-chair businesses. PayPal holds the fee; only the owner's tap charges it.</p>
    <div class="chips"><span class="chip held">held $20</span><span class="chip void">released $0</span><span class="chip cap">charged $20</span></div></div>
  </body></html>`);
  await t.screenshot({ path: resolve(out, 'thumbnail.png') });
  console.log(`gallery: ${shots.length} images + thumbnail in docs/gallery`);
} finally {
  rmSync(raw, { recursive: true, force: true });
  await browser.close();
  await app.close();
}
