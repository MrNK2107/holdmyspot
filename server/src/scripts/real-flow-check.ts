/**
 * Real-flow check against the running app with PAYMENTS=sandbox (real PayPal sandbox, real clock):
 * create a studio, add a service and hours through the API, book as a client in the browser, approve in PayPal's own
 * checkout, land on the confirmation, open the client's private page, send a message, and check the owner sees it.
 *
 *   PAYMENTS=sandbox PUBLIC_URL=http://localhost:18174 node --env-file=../.env --import tsx src/scripts/real-flow-check.ts
 *
 * Screenshots go to $FLOW_SHOTS (default ./flow-shots). The buyer's password is read from ../.env.sandbox-accounts and never printed.
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

const UI = process.env.UI_URL ?? 'http://localhost:18174';
const shots = process.env.FLOW_SHOTS ?? resolve('flow-shots');
mkdirSync(shots, { recursive: true });
const creds: Record<string, string> = {};
for (const l of readFileSync(resolve('../.env.sandbox-accounts'), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m) creds[m[1]] = m[2].trim();
}

const j = async (path: string, init: RequestInit & { token?: string } = {}) => {
  const r = await fetch(UI + path, { ...init, headers: { 'Content-Type': 'application/json', ...(init.token ? { 'x-owner-token': init.token } : {}) } });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${path} ${r.status} ${(body as { error?: string }).error ?? ''}`);
  return body as any;
};
const check = (ok: boolean, what: string) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
  if (!ok) process.exitCode = 1;
};

const studio = await j('/api/workspaces', { method: 'POST', body: JSON.stringify({ business: 'Glow Studio', owner: 'Asha', timeZone: 'Asia/Kolkata' }) });
const ws: string = studio.id;
const tok: string = studio.ownerToken;
await j(`/api/ws/${ws}/services`, { method: 'POST', token: tok, body: JSON.stringify({ name: 'Haircut', durationMin: 45, priceCents: 3500 }) });
await j(`/api/ws/${ws}/hours`, { method: 'POST', token: tok, body: JSON.stringify({ openHour: 0, closeHour: 24, closedDays: [], leadMinutes: 60, stepMinutes: 60 }) });
console.log('studio', ws);

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 430, height: 900 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => page.url().startsWith(UI) && console.log('BROWSER ERROR:', e.message.slice(0, 300)));
page.on('console', (m) => m.type() === 'error' && page.url().startsWith(UI) && console.log('BROWSER CONSOLE:', m.text().slice(0, 200)));
try {
  await page.goto(`${UI}/book?ws=${ws}`);
  await page.locator('.slot').first().waitFor({ timeout: 20000 });
  const firstSlot = (await page.locator('.slot').first().innerText()).trim();
  const dayHeads = await page.locator('.slot-day-h').allInnerTexts();
  check(dayHeads.length >= 1 && /Today|Tomorrow|\w{3}/.test(dayHeads[0]), `slots grouped by day (${dayHeads.slice(0, 2).join(', ')}), first ${firstSlot}`);
  await page.screenshot({ path: resolve(shots, '1-booking.png'), fullPage: true });
  await page.locator('.slot').first().click();
  await page.getByPlaceholder('First and last name').fill('Jordan Lee');
  await page.locator('label.check input').check();
  await page.getByRole('button', { name: 'Book and approve with PayPal' }).click();
  await page.getByRole('link', { name: 'Continue to PayPal' }).click();

  const email = page.locator('input#email, input[name="login_email"]').first();
  await email.waitFor({ timeout: 60000 });
  await email.fill(creds.SANDBOX_BUYER_EMAIL);
  if (await page.locator('#btnNext').count()) await page.locator('#btnNext').click();
  const pw = page.locator('input#password, input[name="login_password"]').first();
  await pw.waitFor({ timeout: 60000 });
  await pw.fill(creds.SANDBOX_BUYER_PASSWORD);
  await page.locator('#btnLogin').first().click();
  await page.waitForTimeout(4000);
  for (let i = 0; i < 4 && !page.url().startsWith(UI); i++) {
    const btn = page.getByRole('button', { name: /agree and continue|continue|agree|complete|pay now|save and continue/i }).first();
    if (!(await btn.count())) break;
    await btn.click().catch(() => undefined);
    await page.waitForTimeout(4000);
  }
  await page.waitForURL((u) => u.toString().startsWith(UI), { timeout: 60000 });
  await page.getByRole('heading', { name: "You're booked" }).waitFor({ timeout: 20000 });
  const confirm = await page.locator('.book-card.done').innerText();
  check(/Haircut/.test(confirm) && /at \d/.test(confirm), 'confirmation names the visit (service and time)');
  check(/PayPal approved the hold/.test(confirm), 'confirmation says the hold was approved');
  await page.screenshot({ path: resolve(shots, '2-confirmed.png'), fullPage: true });

  await page.getByRole('link', { name: /See my visit or message/ }).click();
  await page.getByRole('heading', { name: 'Your visits' }).waitFor({ timeout: 20000 });
  await page.getByText('Your spot is confirmed').waitFor({ timeout: 20000 });
  check(true, 'client page shows "Your spot is confirmed"');
  await page.getByRole('textbox', { name: 'Message' }).fill("so sorry, my kid is sick and I can't make it");
  await page.getByRole('button', { name: 'Send' }).click();
  await page.waitForTimeout(4000);
  await page.screenshot({ path: resolve(shots, '3-portal-after-send.png'), fullPage: true });
  console.log('portal error text:', (await page.locator('.error').allInnerTexts()).join(' | ') || '(none)');
  await page.locator('.msg.out').first().waitFor({ timeout: 20000 });
  await page.locator('.msg.in').first().waitFor({ timeout: 30000 });
  check(true, 'message sent and the studio replied in the same thread');
  await page.screenshot({ path: resolve(shots, '3-portal.png'), fullPage: true });

  const state = await j(`/api/ws/${ws}/state`, { token: tok });
  const b = state.bookings[0];
  check(b?.money === 'held' && !!b.authorizationId, `owner sees a real PayPal hold (${b?.state}, ${b?.money})`);
  check(state.messages.some((m: { text: string }) => m.text.includes('kid is sick')), 'owner sees the client message');
  check(state.clockMode === 'real' && Math.abs(state.now - Date.now()) < 5000, 'studio runs on the real clock');
  console.log('open owner cards:', state.approvals.map((a: { kind: string; prompt: string }) => `${a.kind}: ${a.prompt.slice(0, 80)}`));
  console.log('owner console:', `${UI}/?ws=${ws}#owner=${tok}`);
} finally {
  await browser.close();
}
