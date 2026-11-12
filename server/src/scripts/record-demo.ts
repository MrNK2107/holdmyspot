/**
 * Records the HoldMySpot demo video against the REAL PayPal sandbox: a studio created in the UI, a client booking
 * approved in PayPal's own checkout with the sandbox buyer, texts typed into the app, owner taps, charge, refund.
 * No simulator: the API must run with PAYMENTS=sandbox. Only the studio clock is simulated, and the video says so.
 *
 *   PAYMENTS=sandbox PUBLIC_URL=http://localhost:18174 node --env-file=../.env --import tsx src/scripts/record-demo.ts
 *   (UI: `npm run dev -w web` on 18174, which proxies /api and /paypal to the API on 18080)
 *
 * Writes ../video/out/raw/*.webm and ../video/out/beats.json (when each narration clip starts). Credentials are read
 * from ../.env.sandbox-accounts (gitignored) and never printed.
 */
import { mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium, type BrowserContext, type Locator, type Page } from 'playwright-core';

const UI = process.env.UI_URL ?? 'http://localhost:18174';
const W = 1680;
const H = 1000;
const root = resolve('..');
const outDir = resolve(root, 'video/out');
mkdirSync(resolve(outDir, 'raw'), { recursive: true });

const creds: Record<string, string> = {};
for (const l of readFileSync(resolve(root, '.env.sandbox-accounts'), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m) creds[m[1]] = m[2].trim();
}
if (!creds.SANDBOX_BUYER_EMAIL || !creds.SANDBOX_BUYER_PASSWORD) throw new Error('buyer credentials missing in .env.sandbox-accounts');
const dur: Record<string, number> = JSON.parse(readFileSync(resolve(root, 'video/audio/vo/durations.json'), 'utf8'));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const INIT = `(() => {
  if (window.__hms) return; window.__hms = 1;
  const add = () => {
    const c = document.createElement('div'); c.id = '__cur';
    c.style.cssText = 'position:fixed;z-index:2147483647;width:22px;height:22px;border-radius:50%;background:rgba(107,63,160,.30);border:2px solid #6b3fa0;pointer-events:none;transform:translate(-50%,-50%);left:-60px;top:-60px;transition:transform .12s';
    document.documentElement.appendChild(c);
    const cap = document.createElement('div'); cap.id = '__cap';
    cap.textContent = 'PayPal sandbox: test money  ·  the studio clock skips ahead  ·  everything else is live';
    cap.style.cssText = 'position:fixed;z-index:2147483646;left:16px;bottom:14px;padding:6px 14px;border-radius:999px;background:rgba(22,22,40,.9);color:#f5eefc;font:600 13px/1.2 Segoe UI,system-ui,sans-serif;pointer-events:none';
    document.documentElement.appendChild(cap);
    addEventListener('mousemove', (e) => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; }, true);
    addEventListener('mousedown', () => { c.style.transform = 'translate(-50%,-50%) scale(.6)'; }, true);
    addEventListener('mouseup', () => { c.style.transform = 'translate(-50%,-50%) scale(1)'; }, true);
  };
  if (document.documentElement) add(); else document.addEventListener('DOMContentLoaded', add);
})();`;

let mouse = { x: 800, y: 500 };
async function moveTo(page: Page, loc: Locator) {
  await loc.scrollIntoViewIfNeeded();
  const b = await loc.boundingBox();
  if (!b) return;
  const x = b.x + b.width / 2;
  const y = b.y + b.height / 2;
  await page.mouse.move(x, y, { steps: 22 });
  mouse = { x, y };
}
async function click(page: Page, loc: Locator) {
  await moveTo(page, loc);
  await sleep(180);
  await loc.click();
}
async function type(page: Page, loc: Locator, text: string, delay = 55) {
  await moveTo(page, loc);
  await loc.click();
  await loc.pressSequentially(text, { delay });
}

/** PayPal's own checkout, signed in as the sandbox buyer; resolves when PayPal sends the browser back. */
async function approveInPayPal(page: Page, returnPrefix: string) {
  const email = page.locator('input#email, input[name="login_email"]').first();
  await email.waitFor({ timeout: 60000 });
  await email.fill(creds.SANDBOX_BUYER_EMAIL);
  const next = page.locator('#btnNext');
  if (await next.count()) await next.click();
  const pw = page.locator('input#password, input[name="login_password"]').first();
  await pw.waitFor({ timeout: 60000 });
  await pw.fill(creds.SANDBOX_BUYER_PASSWORD);
  await page.locator('#btnLogin').first().click();
  await page.waitForTimeout(4000);
  for (let i = 0; i < 4 && !page.url().startsWith(returnPrefix); i++) {
    const btn = page.getByRole('button', { name: /agree and continue|continue|agree|complete|pay now|save and continue/i }).first();
    if (!(await btn.count())) break;
    await btn.click().catch(() => undefined);
    await page.waitForTimeout(4000);
  }
  await page.waitForURL((u) => u.toString().startsWith(returnPrefix), { timeout: 60000 });
}

const beats: Array<{ id: string; at: number; ms: number }> = [];
/** stretches of real waiting (PayPal's own pages) that the edit plays faster */
const marks: Array<{ name: string; at: number }> = [];
let t0 = 0;
async function beat(id: string, fn: () => Promise<void>, tail = 500) {
  const start = Date.now();
  beats.push({ id, at: (start - t0) / 1000, ms: 0 });
  console.log(`[${((start - t0) / 1000).toFixed(1)}s] ${id}`);
  await fn();
  const need = (dur[id] ?? 0) * 1000 + tail - (Date.now() - start);
  if (need > 0) await sleep(need);
  beats[beats.length - 1].ms = Date.now() - start;
}

/** A second client books in the background, through the same public API and PayPal checkout (not recorded). */
async function backgroundBooking(ctx: BrowserContext, ws: string, name: string, slotIndex: number): Promise<{ start: number }> {
  const slots: number[] = await (await fetch(`${UI}/api/ws/${ws}/slots?service=gel&n=8`)).json();
  const start = slots[slotIndex];
  const r = await (await fetch(`${UI}/api/ws/${ws}/book`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, serviceId: 'gel', start }) })).json();
  const link = r.result?.approvalLink as string | undefined;
  if (!link) throw new Error('background booking got no approval link: ' + JSON.stringify(r).slice(0, 200));
  const p = await ctx.newPage();
  await p.goto(link);
  await approveInPayPal(p, UI);
  await p.close();
  return { start };
}

const browser = await chromium.launch({ headless: true });
const bg = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: resolve(outDir, 'raw'), size: { width: W, height: H } } });
await ctx.addInitScript(INIT);
const page = await ctx.newPage();
t0 = Date.now();

try {
  await page.goto(UI + '/');

  await beat('b01_hook', async () => {
    await page.mouse.move(700, 420, { steps: 30 });
    await sleep(6000);
    await moveTo(page, page.getByLabel('Studio name'));
  });

  await beat('b02_create', async () => {
    await type(page, page.getByLabel('Studio name'), 'Polished by Priya', 45);
    await type(page, page.getByLabel('Your first name'), 'Priya', 45);
    await click(page, page.getByRole('button', { name: 'Create studio' }));
    await page.getByRole('button', { name: 'Keep this policy' }).waitFor({ timeout: 30000 });
  });
  const ws = new URL(page.url()).searchParams.get('ws')!;
  console.log('studio:', ws);

  await beat('b03_policy', async () => {
    await sleep(1500);
    await click(page, page.getByRole('button', { name: 'Keep this policy' }));
  });

  await beat('b04_paypal', async () => {
    await sleep(2500);
    await click(page, page.getByRole('button', { name: 'Continue' }));
  });

  let link = '';
  await beat('b05_share', async () => {
    await sleep(800);
    link = await page.locator('.share-link').inputValue();
    await moveTo(page, page.locator('.share-link'));
    await sleep(800);
    await click(page, page.getByRole('button', { name: 'Open my studio' }));
  });

  // the booking happens on the client's side of the link: the same page, the studio's public booking link
  let alex: Promise<{ start: number }> | undefined;
  await beat('b06_book', async () => {
    alex = backgroundBooking(bg, ws, 'Alex Morgan', 3);
    alex.catch(() => undefined);
    await page.goto(link);
    await click(page, page.locator('.svc').first());
    await click(page, page.locator('.slot').first());
    await type(page, page.getByPlaceholder('First and last name'), 'Jordan Lee', 55);
    await click(page, page.locator('label.check input'));
    await click(page, page.getByRole('button', { name: 'Book and approve with PayPal' }));
    await click(page, page.getByRole('link', { name: 'Continue to PayPal' }));
    marks.push({ name: 'pp_start', at: (Date.now() - t0) / 1000 });
    await approveInPayPal(page, UI);
    marks.push({ name: 'pp_end', at: (Date.now() - t0) / 1000 });
    await page.locator('text=/held|spot is|you.?re booked|approved/i').first().waitFor({ timeout: 30000 }).catch(() => undefined);
    await sleep(2800);
  });
  const alexInfo = await alex!;

  await beat('b07_held', async () => {
    await page.goto(`${UI}/?ws=${ws}`);
    await page.locator('.event').first().waitFor({ timeout: 30000 });
    await sleep(1200);
    await click(page, page.locator('.event', { hasText: 'Jordan' }).first());
  });

  await beat('b08_text', async () => {
    // later that day: inside 24 hours a cancel is late, so the policy asks the owner instead of releasing on its own
    await click(page, page.getByText('Demo controls'));
    await click(page, page.getByRole('button', { name: '+1 hour' }));
    await sleep(700);
    await click(page, page.getByRole('button', { name: '+1 hour' }));
    await sleep(700);
    await click(page, page.getByText('Demo controls'));
    await page.locator('aside.phone-col select').selectOption({ label: 'Jordan Lee' });
    await type(page, page.getByRole('textbox', { name: 'Message' }), "so sorry, my kiddo threw up all night and I can't make it tomorrow", 38);
    await click(page, page.getByRole('button', { name: 'Send' }));
  });

  await beat('b09_excuse', async () => {
    const excuse = page.getByRole('button', { name: /Excuse \(no charge\)/ });
    await excuse.waitFor({ timeout: 60000 });
    await sleep(3500);
    await click(page, excuse);
    await page.locator('.chip', { hasText: /released/i }).first().waitFor({ timeout: 60000 });
  });

  await beat('b10_noshow', async () => {
    await click(page, page.getByText('Demo controls'));
    for (let i = 0; i < 12; i++) {
      if (await page.getByRole('button', { name: 'No-show' }).count()) break;
      await click(page, page.getByRole('button', { name: /Next job/ }));
      await sleep(900);
    }
    await click(page, page.getByText('Demo controls')); // close the sheet
    await click(page, page.getByRole('button', { name: 'No-show' }));
  });

  await beat('b11_charge', async () => {
    const charge = page.getByRole('button', { name: /^Charge$/ });
    await charge.waitFor({ timeout: 60000 });
    await sleep(1200);
    await click(page, charge);
    await page.locator('.chip', { hasText: /charged/i }).first().waitFor({ timeout: 60000 });
  });

  await beat('b12_refund', async () => {
    await click(page, page.locator('.event', { hasText: 'Alex' }).first());
    const refund = page.getByRole('button', { name: /Refund fee|Refund the remaining/ });
    await refund.waitFor({ timeout: 30000 });
    await sleep(500);
    await click(page, refund);
    await page.locator('.chip', { hasText: /refunded/i }).first().waitFor({ timeout: 60000 });
  });

  await beat('b13_ledger', async () => {
    await click(page, page.locator('nav.tabs').getByRole('button', { name: 'Ledger' }));
    await page.locator('.ag-row').first().waitFor({ timeout: 30000 });
    await sleep(2500);
  });

  await beat('b14_close', async () => {
    await click(page, page.locator('nav.tabs').getByRole('button', { name: 'Schedule' }));
    await page.evaluate(() => {
      const c = document.getElementById('__cap');
      if (c) c.textContent = 'HoldMySpot  ·  PayPal sandbox  ·  voice by ElevenLabs';
    });
    await sleep(1000);
  }, 1500);

  console.log('alex slot start', alexInfo.start);
} finally {
  const v = page.video();
  await ctx.close();
  await bg.close();
  await browser.close();
  const p = v ? await v.path() : undefined;
  if (p) {
    const name = resolve(outDir, 'raw/demo.webm');
    for (const f of readdirSync(resolve(outDir, 'raw'))) void f;
    renameSync(p, name);
  }
  writeFileSync(resolve(outDir, 'beats.json'), JSON.stringify({ beats, marks }, null, 1));
  console.log('beats:', beats.length, 'total', ((Date.now() - t0) / 1000).toFixed(1) + 's');
}
