import { HOUR } from './clock.js';
import { approve, DEFAULT_RULES } from './domain/policy.js';
import type { Engine } from './engine/engine.js';
import { simPayPalId } from './paypal/ids.js';
import { STUDIO_HOURS } from './domain/hours.js';

/** Demo clock starts Monday 2 Nov 2026, 09:00 (all demo times are UTC). */
export const DEMO_START = Date.UTC(2026, 10, 2, 9, 0);

export const PRIYA_POLICY_PROSE =
  "Hi loves! Please give me 24 hours notice if you need to cancel, otherwise there's a $20 fee. No-shows are charged $20 too. " +
  "Life happens: if it's a real emergency, just tell me. If I can fill your spot from my waitlist, you won't be charged.";

/** What a new real studio starts with: neutral wording, the owner rewrites it in setup. */
export const STUDIO_POLICY_PROSE =
  "Please give 24 hours notice if you need to cancel, otherwise there's a $20 fee. No-shows are charged $20 too. If it's a real emergency, just tell me. If I can fill your spot from my waitlist, you won't be charged.";

export const SEED_POLICY = approve(undefined, DEFAULT_RULES, PRIYA_POLICY_PROSE, DEMO_START - 24 * HOUR);

const at = (day: number, hour: number) => Date.UTC(2026, 10, day, hour, 0);

/**
 * Priya's home nail studio. Hero bookings:
 * - Sam   Wed 4 Nov 17:00  gel   → "kiddo threw up"   → excused, hold voided   (hero 1)
 * - Maya  Thu 5 Nov 17:00  gel   → late cancel        → refilled, $0           (hero 2; Eli's hold declines first = failure 2)
 * - Alex  Thu 5 Nov 11:00  pedi  → no-show            → owner taps charge      (hero 3)
 * - Jordan Fri 6 Nov 14:00 art   → T-72h hold declined → re-approval link       (failure 1)
 */
export async function seed(e: Engine, opts: { studioOnly?: boolean } = {}): Promise<void> {
  if (opts.studioOnly) {
    // Real PayPal sandbox: the seeded clients carry simulator wallet ids that PayPal rejects (403), so start with
    // the studio only. Visitors book on /book and approve real holds with a sandbox buyer account.
    e.hours = { ...STUDIO_HOURS };
    e.audit.add('system', 'studio ready: add your services and hours, then share the booking link');
    return;
  }
  e.addService({ id: 'gel', name: 'Gel manicure', durationMin: 60, priceCents: 4500 });
  e.addService({ id: 'pedi', name: 'Pedicure', durationMin: 60, priceCents: 5000 });
  e.addService({ id: 'art', name: 'Nail art full set', durationMin: 90, priceCents: 8000 });

  const clients: Array<[string, string, boolean, boolean]> = [
    // id, name, vaulted, sandbox decline
    ['sam', 'Sam Rivera', true, false],
    ['maya', 'Maya Chen', true, false],
    ['alex', 'Alex Morgan', true, false],
    ['jordan', 'Jordan Lee', true, true],
    ['riley', 'Riley Park', true, false],
    ['taylor', 'Taylor Brooks', true, false],
    ['noor', 'Noor Haddad', true, false],
    ['ben', 'Ben Okafor', false, false],
    ['eli', 'Eli Santos', true, true],
    ['chris', 'Chris Patel', true, false],
    ['dana', 'Dana Kim', false, false],
  ];
  for (const [i, [id, name, vaulted, decline]] of clients.entries()) {
    e.addClient({ id, name, ...(vaulted ? { vaultId: simPayPalId('VAULT', 900_000 + i) } : {}), ...(decline ? { sandboxDecline: true } : {}) });
  }

  const bookings: Array<[string, string, number]> = [
    ['riley', 'gel', at(2, 15)],
    ['taylor', 'pedi', at(3, 10)],
    ['noor', 'art', at(3, 14)],
    ['sam', 'gel', at(4, 17)],
    ['riley', 'pedi', at(4, 11)],
    ['alex', 'pedi', at(5, 11)],
    ['maya', 'gel', at(5, 17)],
    ['taylor', 'gel', at(5, 14)],
    ['jordan', 'art', at(6, 14)],
    ['noor', 'gel', at(6, 10)],
    ['ben', 'pedi', at(7, 11)],
    ['riley', 'art', at(7, 14)],
  ];
  for (const [clientId, serviceId, start] of bookings) await e.createBooking({ clientId, serviceId, start });

  // Eli ranks first for Maya's Thursday slot but his hold will decline (failure path 2).
  await e.addWaitlist('eli', 'Gel manicure, Thursday after 4pm');
  await e.addWaitlist('chris', 'gel manicure, weekdays after 5');
  await e.addWaitlist('dana', 'pedicure or gel, any time');
  e.audit.add('system', 'demo workspace seeded');
}
