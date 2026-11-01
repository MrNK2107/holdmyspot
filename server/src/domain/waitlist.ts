import type { WaitlistConstraints } from './types.js';

/** Deterministic filter: does a slot satisfy a parsed waitlist entry? (The AI only parses and ranks.) */
export function slotMatches(p: WaitlistConstraints, serviceId: string, start: number, durationMin: number): boolean {
  const d = new Date(start);
  const startMin = d.getUTCHours() * 60 + d.getUTCMinutes();
  if (p.serviceIds.length && !p.serviceIds.includes(serviceId)) return false;
  if (p.days.length && !p.days.includes(d.getUTCDay())) return false;
  return startMin >= p.earliestMin && startMin + durationMin <= p.latestMin;
}
