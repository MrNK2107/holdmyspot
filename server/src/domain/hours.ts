/** When a studio takes visits, in its own time zone. */
export interface StudioHours {
  openHour: number;
  closeHour: number;
  /** 0 = Sunday .. 6 = Saturday */
  closedDays: number[];
  /** offer slots later today (real studios); the demo grid starts tomorrow */
  sameDay: boolean;
  /** no slot sooner than this many minutes from now */
  leadMinutes: number;
  stepMinutes: number;
}

/** The simulator demo: tomorrow onwards, every two hours from 10:00 to 18:00, closed Sundays. */
export const DEFAULT_HOURS: StudioHours = { openHour: 10, closeHour: 18, closedDays: [0], sameDay: false, leadMinutes: 0, stepMinutes: 120 };

/** A new real studio starts here; the owner changes it during setup. */
export const STUDIO_HOURS: StudioHours = { openHour: 9, closeHour: 18, closedDays: [0], sameDay: true, leadMinutes: 60, stepMinutes: 60 };

export function validateHours(raw: unknown, prev: StudioHours): StudioHours {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const num = (v: unknown, d: number) => (v === undefined ? d : Number(v));
  const openHour = num(r.openHour, prev.openHour);
  const closeHour = num(r.closeHour, prev.closeHour);
  const stepMinutes = num(r.stepMinutes, prev.stepMinutes);
  const leadMinutes = num(r.leadMinutes, prev.leadMinutes);
  const closedDays = r.closedDays === undefined ? prev.closedDays : r.closedDays;
  if (!Number.isInteger(openHour) || openHour < 0 || openHour > 23) throw new Error('opening hour must be 0 to 23');
  if (!Number.isInteger(closeHour) || closeHour <= openHour || closeHour > 24) throw new Error('closing hour must be after opening, up to 24');
  if (![30, 60, 90, 120].includes(stepMinutes)) throw new Error('slots every 30, 60, 90 or 120 minutes');
  if (!Number.isInteger(leadMinutes) || leadMinutes < 0 || leadMinutes > 2880) throw new Error('notice must be 0 to 2880 minutes');
  if (!Array.isArray(closedDays) || closedDays.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) throw new Error('closed days are 0 (Sunday) to 6 (Saturday)');
  const uniq = [...new Set(closedDays as number[])].sort();
  if (uniq.length >= 7) throw new Error('the studio has to be open at least one day');
  return { openHour, closeHour, closedDays: uniq, sameDay: prev.sameDay, leadMinutes, stepMinutes };
}
