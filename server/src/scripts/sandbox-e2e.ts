/**
 * Real PayPal SANDBOX end-to-end through the running app: book on the public page's API, approve the hold in a
 * real PayPal checkout with the sandbox buyer (browser automation), then check the booking is held.
 *
 *   node --import tsx src/scripts/sandbox-e2e.ts [baseUrl]      (app must run with PAYMENTS=sandbox)
 *
 * Buyer credentials come from ../.env.sandbox-accounts (gitignored). Nothing secret is printed.
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium, type Page } from 'playwright-core';

const base = process.argv[2] ?? 'http://localhost:18080';
const shots = process.env.E2E_SHOTS ?? resolve('e2e-shots');
mkdirSync(shots, { recursive: true });

const creds: Record<string, string> = {};
for (const l of readFileSync(resolve('../.env.sandbox-accounts'), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m) creds[m[1]] = m[2].trim();
}
const email = creds.SANDBOX_BUYER_EMAIL;
const password = creds.SANDBOX_BUYER_PASSWORD;
if (!email || !password) throw new Error('SANDBOX_BUYER_EMAIL / SANDBOX_BUYER_PASSWORD missing in .env.sandbox-accounts');

const api = async (path: string, init?: RequestInit) => {
  const r = await fetch(`${base}/api/ws/demo${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${path}: ${r.status} ${(j as { error?: string }).error ?? ''}`);
  return j as any;
};
const shot = (p: Page, n: string) => p.screenshot({ path: resolve(shots, `${n}.png`), fullPage: true }).catch(() => undefined);

const slots: number[] = await api('/slots?service=gel&n=6');
if (!slots.length) throw new Error('no free slots');
const booked = await api('/book', { method: 'POST', body: JSON.stringify({ name: 'Sandbox Buyer', serviceId: 'gel', start: slots[0] }) });
const b = booked.result ?? booked.booking ?? booked;
console.log('booked:', b.id, 'state', b.state, 'approval link:', b.approvalLink ? 'yes' : 'no');
if (!b.approvalLink) throw new Error('no approval link returned: ' + JSON.stringify(booked).slice(0, 300));

const browser = await chromium.launch({ headless: process.env.E2E_HEADED !== '1' });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
try {
  await page.goto(b.approvalLink, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  await shot(page, '1-checkout-landing');
  const emailBox = page.locator('input#email, input[name="login_email"]').first();
  await emailBox.waitFor({ timeout: 30000 });
  await emailBox.fill(email);
  const next = page.locator('#btnNext');
  if (await next.count()) await next.click();
  const pw = page.locator('input#password, input[name="login_password"]').first();
  await pw.waitFor({ timeout: 30000 });
  await pw.fill(password);
  await page.locator('#btnLogin').first().click();
  await page.waitForTimeout(6000);
  await shot(page, '2-after-login');
  console.log('after login url:', new URL(page.url()).pathname);
  // review page: continue / agree / complete (label varies)
  for (let i = 0; i < 4 && !page.url().startsWith(base); i++) {
    const btn = page.getByRole('button', { name: /agree and continue|continue|agree|complete|pay now|save and continue/i }).first();
    if (!(await btn.count())) break;
    await btn.click().catch(() => undefined);
    await page.waitForTimeout(5000);
    await shot(page, `3-step-${i}`);
  }
  await page.waitForURL((u) => u.toString().startsWith(base), { timeout: 30000 }).catch(() => undefined);
  console.log('final url:', page.url().startsWith(base) ? new URL(page.url()).pathname + new URL(page.url()).search.replace(/token=[^&]+/, 'token=…') : new URL(page.url()).origin + new URL(page.url()).pathname);
  await shot(page, '4-final');
} finally {
  await browser.close();
}

await new Promise((r) => setTimeout(r, 1500));
const s = await api('/state');
const x = s.bookings.find((y: { id: string }) => y.id === b.id);
console.log('booking now:', JSON.stringify({ id: x?.id, state: x?.state, money: x?.money, auth: x?.authorizationId ? 'yes' : 'no', holdCents: x?.holdCents }));
process.exit(x?.money === 'held' ? 0 : 1);
