/**
 * Headless UI check: starts the app in-process (PayPal simulator, fake LLM) on an unusual port,
 * drives the built web UI in an isolated headless Chromium, runs axe-core on every screen, and
 * refreshes docs/screenshots. Needs `npm run build -w web` first and the Playwright Chromium build
 * (`npx playwright-core install chromium-headless-shell` if missing).
 *
 *   npm run ui-check            # from the repo root
 *   UI_CHECK_SHOTS=0 npm run ui-check   # skip screenshots
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from 'playwright-core';
import { buildApp } from '../app.js';
import { Workspaces } from '../workspaces.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const shots = resolve(root, 'docs/screenshots');
const takeShots = process.env.UI_CHECK_SHOTS !== '0';
const port = Number(process.env.UI_CHECK_PORT ?? 18091);
const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

type Violation = { id: string; impact: string; help: string; nodes: Array<{ target: string[] }> };
const failures: string[] = [];
const report: string[] = [];

async function axe(page: Page, label: string): Promise<void> {
  await page.addScriptTag({ content: axeSource });
  const v = (await page.evaluate(async () => {
    // @ts-expect-error injected global
    const r = await window.axe.run(document, { resultTypes: ['violations'] });
    return r.violations.map((x: any) => ({ id: x.id, impact: x.impact, help: x.help, nodes: x.nodes.map((n: any) => ({ target: n.target })) }));
  })) as Violation[];
  const bad = v.filter((x) => x.impact === 'serious' || x.impact === 'critical');
  report.push(`axe ${label}: ${v.length} violations (${bad.length} serious/critical)${v.length ? ': ' + v.map((x) => `${x.id}[${x.impact}]x${x.nodes.length}`).join(', ') : ''}`);
  for (const x of bad) failures.push(`${label}: ${x.id} (${x.impact}) ${x.help} @ ${x.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
}

async function shot(page: Page, name: string, fullPage = false): Promise<void> {
  if (takeShots) await page.screenshot({ path: resolve(shots, name), fullPage });
}

function check(cond: boolean, what: string): void {
  report.push(`${cond ? 'ok  ' : 'FAIL'} ${what}`);
  if (!cond) failures.push(what);
}

const workspaces = new Workspaces();
await workspaces.create('demo');
const app = await buildApp({ workspaces, webDist: resolve(root, 'web/dist') });
await app.listen({ port, host: '127.0.0.1' });
const base = `http://127.0.0.1:${port}`;
mkdirSync(shots, { recursive: true });

const browser = await chromium.launch({ headless: true });
try {
  // the owner token reaches the console once, in the URL fragment (the workspace id alone is the booking link)
  const tokens = new Map<string, string>();
  const newWs = async () => {
    const j = (await (await fetch(`${base}/api/workspaces`, { method: 'POST' })).json()) as { id: string; ownerToken: string };
    tokens.set(j.id, j.ownerToken);
    return j.id;
  };
  const owner = (ws: string) => `#owner=${tokens.get(ws)}`;

  // ---- desktop console + guided demo ----
  const desk = await browser.newPage({ viewport: { width: 1680, height: 1000 } });
  desk.on('pageerror', (e) => failures.push(`page error: ${e.message} ${(e.stack ?? '').split('\n').slice(0, 4).join(' <- ')}`));
  desk.on('console', (m) => m.type() === 'error' && report.push(`console: ${m.text()}`));
  const ws1 = await newWs();
  await desk.goto(`${base}/?ws=${ws1}&demo=1${owner(ws1)}`);
  await desk.getByRole('button', { name: /^Start:/ }).waitFor();
  await axe(desk, 'console desktop (start)');
  await shot(desk, 'console-main.png');
  const chipText = async (client: string) => (await desk.locator('.booking .chip.big').textContent())?.trim() + ` (${client})`;
  const beats: Record<number, string> = {};
  for (let i = 1; i <= 13; i++) {
    await desk.locator('.demo-next').click();
    await desk
      .getByText(`Beat ${i} of 13`)
      .waitFor({ timeout: 8000 })
      .catch(async (e) => {
        await desk.screenshot({ path: resolve(root, `ui-check-fail-beat${i}.png`) });
        throw new Error(`beat ${i} did not show (${failures.join('; ')}): ${e}`);
      });
    await desk.waitForTimeout(150);
    if (i === 2) {
      await axe(desk, 'policy tab');
      await shot(desk, 'policy-editor.png');
    }
    if ([4, 6, 9, 11, 12, 13].includes(i)) beats[i] = await chipText(String(i));
    if (i === 6) await shot(desk, 'console-hero1-excused.png');
    if (i === 9) {
      await axe(desk, 'console desktop (hero 2 refilled)');
      await shot(desk, 'console-hero2-refilled.png');
    }
    if (i === 5) await shot(desk, 'console-agent-card.png');
    if (i === 10) {
      await desk.locator('.trace-detail').waitFor();
      const trace = (await desk.locator('.trace-detail').textContent()) ?? '';
      check(/create_refund/.test(trace) && /not in the front desk's toolset/.test(trace), 'agent trace shows the injected create_refund call denied');
      check(/propose_settlement/.test(trace) && /policy check/.test(trace), 'agent trace shows the proposal and the policy check');
      const toolset = (await desk.locator('.toolsets').textContent()) ?? '';
      check(/paypal\.list_transactions/.test(toolset) && /PayPal Agent Toolkit/.test(toolset) && /paypal\.create_refund/.test(toolset), 'agent tab lists the PayPal Agent Toolkit read tools and the toolkit money tools it does not get');
      await axe(desk, 'agent trace tab');
      await shot(desk, 'agent-trace-injection.png');
    }
    if (i === 12) await shot(desk, 'console-hero3-charged.png');
    if (i === 13) {
      const card = (await desk.locator('.trace-card').textContent()) ?? '';
      check(/find_booking/.test(card) && /propose_refund/.test(card) && /owner tap/.test(card), 'beat 13: agent card shows the owner request, the refund proposal and the tap');
      check(/paypal\.list_transactions/.test(card), 'beat 13: agent checked the capture on PayPal through the Agent Toolkit before proposing');
      check(/Tap "Refund"/.test((await desk.locator('.ask-card').textContent()) ?? ''), 'beat 13: the front desk answered the owner');
      await shot(desk, 'console-owner-refund.png');
    }
  }
  check(/^held \$20/.test(beats[4]), `beat 4 Jordan re-approved → ${beats[4]}`);
  check(/^released · \$0/.test(beats[6]), `beat 6 Sam excused → ${beats[6]}`);
  check(/^released · \$0/.test(beats[9]), `beat 9 Maya refilled → ${beats[9]}`);
  check(/^held \$20/.test(beats[11]), `beat 11 Alex no-show, fee card waiting: still only held → ${beats[11]}`);
  check(/^charged \$20/.test(beats[12]),`beat 12 Alex charged → ${beats[12]}`);
  check(/^refunded \$20/.test(beats[13]), `beat 13 Alex refunded → ${beats[13]}`);
  await desk.locator('details.legend summary').click();
  await axe(desk, 'console desktop (end, legend open)');
  await shot(desk, 'console-demo-end.png');
  check((await desk.getByRole('button', { name: /Replay from the start/ }).count()) === 1, 'demo ends with a replay button');

  // ---- AG Grid ledger ----
  await desk.getByRole('button', { name: /^Ledger/ }).click();
  await desk.locator('.ag-row').first().waitFor({ timeout: 10000 });
  const ledgerText = (await desk.locator('.ledger-grid').textContent()) ?? '';
  check(/refunded/.test(ledgerText) && /[A-Z0-9]{17}/.test(ledgerText),'ledger grid lists money states and PayPal ids');
  check(/Total/.test(ledgerText), 'ledger grid has a totals row');
  await axe(desk, 'ledger (AG Grid)');
  await shot(desk, 'ledger.png');
  await desk.getByRole('button', { name: 'PayPal calls' }).click();
  await desk.getByRole('searchbox').fill('capture');
  await desk.getByText(/capture \$20\.00 \(final_capture\)/).first().waitFor({ timeout: 10000 }).catch(() => undefined);
  check(/final_capture/.test((await desk.locator('.ledger-grid').textContent()) ?? ''), 'ledger PayPal-calls view finds the capture by search');
  await shot(desk, 'ledger-paypal-calls.png');
  await desk.getByRole('searchbox').fill('');
  await desk.getByRole('button', { name: 'REST requests' }).click();
  await desk.locator('.rest-json').waitFor({ timeout: 10000 });
  const restText = (await desk.locator('.rest-json').textContent()) ?? '';
  check(/POST https:\/\/api-m\.sandbox\.paypal\.com\/v2\/payments\/authorizations\/.+\/capture/.test(restText) && /final_capture/.test(restText) && /PayPal-Request-Id/.test(restText), 'ledger REST view shows the real capture request');
  check(!/Bearer/.test(restText), 'REST preview carries no token');
  await axe(desk, 'ledger REST requests');
  await shot(desk, 'ledger-rest-requests.png');
  await axe(desk, 'ledger PayPal calls');

  // ---- phone-width console ----
  const mob = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const demoIds = (await (await fetch(`${base}/api/ws/${ws1}/demo`, { headers: { 'x-owner-token': tokens.get(ws1)! } })).json()).bookingIds;
  await mob.goto(`${base}/?ws=${ws1}&sel=${demoIds.maya}&phone=maya${owner(ws1)}`);
  await mob.locator('.strip').waitFor();
  const overflow = await mob.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(overflow <= 0, `console at 390px has no sideways page scroll (overflow ${overflow}px)`);
  await axe(mob, 'console 390px');
  await shot(mob, 'console-mobile.png');
  for (const tab of ['agent', 'ledger']) {
    await mob.goto(`${base}/?ws=${ws1}&tab=${tab}${owner(ws1)}`);
    await mob.locator(tab === 'agent' ? '.trace-detail' : '.ag-row').first().waitFor({ timeout: 10000 });
    const o = await mob.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(o <= 0, `${tab} tab at 390px has no sideways page scroll (overflow ${o}px)`);
    await axe(mob, `${tab} tab 390px`);
  }

  // ---- booking page (390px): book + approve the hold ----
  const ws2 = await newWs();
  const book = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await book.goto(`${base}/book?ws=${ws2}`);
  await book.locator('.slot').first().waitFor();
  const bOverflow = await book.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(bOverflow <= 0, `booking page at 390px has no sideways scroll (overflow ${bOverflow}px)`);
  await axe(book, 'booking page 390px');
  await book.locator('.slot').first().click();
  await book.getByLabel('Your name').fill('Jamie Doe');
  await book.getByRole('checkbox').check();
  await shot(book, 'booking-page-mobile.png', true);
  await book.getByRole('button', { name: 'Book and approve with PayPal' }).click();
  await book.getByRole('heading', { name: 'One last step' }).waitFor();
  await axe(book, 'booking page approve step');
  await book.getByRole('button', { name: 'Approve with PayPal' }).click();
  await book.getByRole('heading', { name: "You're booked" }).waitFor();
  const doneText = (await book.locator('.book-card.done').textContent()) ?? '';
  check(/not a charge/.test(doneText), 'booking page confirms the hold is not a charge');
  check(/(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \w+ \d+ at \d/.test(doneText), `booking confirmation shows the date and time (${doneText.slice(0, 80)})`);
  await shot(book, 'booking-page-booked.png');

  // ---- error state: unknown workspace ----
  const err = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await err.goto(`${base}/?ws=gone`);
  await err.getByRole('heading', { name: /isn’t available/ }).waitFor();
  await axe(err, 'console unknown workspace');
  check(true, 'unknown workspace shows an error state');
} finally {
  await browser.close();
  await app.close();
}

console.log(report.join('\n'));
if (failures.length) {
  console.error(`\n${failures.length} failure(s):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('\nui-check passed');
