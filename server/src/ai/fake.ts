import { DEFAULT_RULES, type PolicyRules } from '../domain/policy.js';
import type { CancelReason, MessageIntent, Service, WaitlistConstraints } from '../domain/types.js';
import type { AiTask, AiTasks, Ambiguity, LlmProvider } from './provider.js';

/**
 * Deterministic stand-in for the LLM. Keyword rules, no network. Used by tests and by the demo
 * when no ANTHROPIC_API_KEY is configured. It is deliberately simple; the eval harness measures
 * the real provider against the same labelled sets.
 */
export class FakeLlmProvider implements LlmProvider {
  readonly name = 'fake';

  async run<K extends AiTask>(task: K, input: AiTasks[K]['input']): Promise<AiTasks[K]['output']> {
    const impl = {
      compile_policy: (i: AiTasks['compile_policy']['input']) => compilePolicy(i.prose),
      classify_message: (i: AiTasks['classify_message']['input']) => classify(i.text),
      parse_waitlist_entry: (i: AiTasks['parse_waitlist_entry']['input']) => parseWaitlist(i.text, i.services),
      rank_and_draft_offer: (i: AiTasks['rank_and_draft_offer']['input']) => ({
        order: i.candidates.map((c) => c.id),
        offer: `A ${i.serviceName} spot just opened: ${i.slot}. Reply YES to claim it. First yes gets it.`,
      }),
      draft_reply: (i: AiTasks['draft_reply']['input']) => ({ text: draftReply(i.clientName, i.situation, i.facts) }),
    } as const;
    return (impl[task] as (x: unknown) => AiTasks[K]['output'])(input);
  }
}

const has = (t: string, re: RegExp) => re.test(t);

function firstMatch(text: string, re: RegExp): string {
  const m = text.match(re);
  return m ? m[0] : '';
}

export function classify(raw: string): AiTasks['classify_message']['output'] {
  const t = raw.toLowerCase();
  const injection = has(t, /ignore (all |any )?(previous|prior|above) instructions|system prompt|you are now|refund me|\$\d+/);
  let intent: MessageIntent = 'other';
  let evidence = '';
  const intents: Array<[MessageIntent, RegExp]> = [
    ['running_late', /running (a bit )?late|\b\d+ ?min(ute)?s? late|be late/],
    ['reschedule', /reschedul|move (it|my)|another (day|time)|different (day|time)|push (it|my)/],
    ['cancel', /can'?t make it|cannot make it|won'?t make it|cancel|can'?t come|not (going to|gonna) make|have to skip|need to skip/],
    ['confirm', /see you|confirm|still on|i'?ll be there/],
    ['question', /\?$/],
  ];
  for (const [k, re] of intents) {
    const m = firstMatch(t, re);
    if (m) {
      intent = k;
      evidence = m;
      break;
    }
  }
  const reasons: Array<[CancelReason, RegExp]> = [
    ['bereavement', /passed away|funeral|died|death in/],
    ['medical_emergency', /hospital|\ber\b|emergency room|ambulance|urgent care/],
    ['illness_dependent', /(kid|kiddo|son|daughter|child|baby|toddler|mom|dad|mother|father)\b.*(sick|fever|threw up|throwing up|vomit|ill|flu)|(sick|fever|threw up|vomit|flu).*(kid|kiddo|son|daughter|child|baby)/],
    ['illness_self', /i'?m (sick|ill|unwell)|i have (a fever|the flu|covid)|feeling (sick|unwell|ill)|migraine/],
    ['emergency_other', /emergency|flood|fire|burst pipe/],
    ['work', /work|boss|shift|meeting/],
    ['transport', /car|bus|train|traffic|flat tire|uber/],
    ['forgot', /forgot/],
  ];
  let reason: CancelReason = intent === 'cancel' || intent === 'reschedule' ? 'no_reason' : 'none';
  for (const [k, re] of reasons) {
    const m = firstMatch(t, re);
    if (m && (intent === 'cancel' || intent === 'reschedule')) {
      reason = k;
      evidence = `${evidence} … ${m}`.trim();
      break;
    }
  }
  const hedged = has(t, /\b(might|maybe|not sure|possibly|probably)\b/);
  let confidence = intent === 'other' ? 0.5 : reason === 'no_reason' ? 0.85 : 0.92;
  if (hedged) confidence = 0.55;
  if (injection) confidence = Math.min(confidence, 0.3);
  const proposedTime = firstMatch(t, /(mon|tues|wednes|thurs|fri|satur|sun)day( (morning|afternoon|evening))?|tomorrow|next week/) || undefined;
  return { intent, reason, confidence, evidenceSpan: evidence || raw.slice(0, 40), ...(proposedTime ? { proposedTime } : {}) };
}

export function compilePolicy(prose: string): AiTasks['compile_policy']['output'] {
  const t = prose.toLowerCase();
  const rules: PolicyRules = structuredClone(DEFAULT_RULES);
  const spans: AiTasks['compile_policy']['output']['spans'] = [];
  const dollars = [...prose.matchAll(/\$(\d+(?:\.\d{2})?)/g)].map((m) => ({ cents: Math.round(Number(m[1]) * 100), text: m[0], idx: m.index ?? 0 }));
  const hours = prose.match(/(\d+)\s*(hours?|hrs?)/i);
  if (hours) {
    rules.freeCancelHours = Number(hours[1]);
    spans.push({ field: 'freeCancelHours', text: hours[0] });
  } else if (/(\d+)\s*days?/i.test(prose)) {
    const d = prose.match(/(\d+)\s*days?/i)!;
    rules.freeCancelHours = Number(d[1]) * 24;
    spans.push({ field: 'freeCancelHours', text: d[0] });
  }
  if (dollars.length) {
    const max = Math.max(...dollars.map((d) => d.cents));
    rules.holdCents = max;
    rules.lateCancelFeeCents = dollars[0].cents;
    rules.noShowFeeCents = max;
    const noShowIdx = t.indexOf('no-show') >= 0 ? t.indexOf('no-show') : t.indexOf('no show');
    if (noShowIdx >= 0) {
      const nearest = dollars.find((d) => d.idx > noShowIdx) ?? dollars[dollars.length - 1];
      rules.noShowFeeCents = nearest.cents;
      spans.push({ field: 'noShowFeeCents', text: nearest.text });
    }
    spans.push({ field: 'lateCancelFeeCents', text: dollars[0].text });
  }
  rules.refillWaives = /(fill|rebook|refill)/.test(t) || DEFAULT_RULES.refillWaives;
  rules.excusedReasons = [];
  if (/\bsick\b|illness|\bill\b/.test(t)) rules.excusedReasons.push('illness_self');
  const ambiguities: Ambiguity[] = [];
  const emergency = firstMatch(prose, /[^.]*emergenc[^.]*\./i);
  if (emergency) {
    spans.push({ field: 'protectedReasons', text: emergency.trim() });
    ambiguities.push({
      id: 'sick-child',
      question: 'Does a sick child count as an emergency?',
      span: emergency.trim(),
      options: [
        { label: 'Yes, excuse it once every 6 months', patch: { excusedReasons: [...rules.excusedReasons, 'illness_dependent'], excusalLimit: { count: 1, months: 6 } } },
        { label: 'No, the normal fee applies', patch: {} },
      ],
    });
  }
  if (!/no[- ]show/.test(t)) {
    ambiguities.push({
      id: 'no-show-fee',
      question: 'Your policy does not mention no-shows. Charge the same as a late cancel?',
      span: '',
      options: [
        { label: 'Yes, same fee', patch: { noShowFeeCents: rules.lateCancelFeeCents } },
        { label: 'Never charge no-shows', patch: { noShowFeeCents: 0 } },
      ],
    });
  }
  return { rules, ambiguities, spans };
}

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export function parseWaitlist(raw: string, services: Service[]): WaitlistConstraints {
  const t = raw.toLowerCase();
  const serviceIds = services.filter((s) => s.name.toLowerCase().split(/\s+/).some((w) => w.length >= 3 && t.includes(w))).map((s) => s.id);
  let days: number[] = [];
  if (/weekday/.test(t)) days = [1, 2, 3, 4, 5];
  else if (/weekend/.test(t)) days = [0, 6];
  else DAYS.forEach((d, i) => t.includes(d) && days.push(i));
  if (/any ?(day|time)|whenever|anytime/.test(t)) days = [];
  let earliestMin = 0;
  let latestMin = 24 * 60;
  const toMin = (h: string, ampm?: string) => {
    let n = Number(h);
    if ((ampm === 'pm' || (!ampm && n < 8)) && n < 12) n += 12;
    return n * 60;
  };
  const after = t.match(/after (\d{1,2})\s*(am|pm)?/);
  const before = t.match(/before (\d{1,2})\s*(am|pm)?/);
  if (after) earliestMin = toMin(after[1], after[2]);
  if (before) latestMin = toMin(before[1], before[2]);
  if (/morning/.test(t)) [earliestMin, latestMin] = [8 * 60, 12 * 60];
  if (/afternoon/.test(t)) [earliestMin, latestMin] = [12 * 60, 17 * 60];
  if (/evening/.test(t)) [earliestMin, latestMin] = [17 * 60, 21 * 60];
  if (/lunch/.test(t)) [earliestMin, latestMin] = [11 * 60 + 30, 14 * 60];
  return { serviceIds, days, earliestMin, latestMin };
}

function draftReply(name: string, situation: string, f: Record<string, string>): string {
  const first = name.split(' ')[0];
  switch (situation) {
    case 'excused':
      return `So sorry, ${first}. No charge, your hold is released. Want one of these instead: ${f.slots ?? 'any time next week'}?`;
    case 'cancelled_early':
      return `No problem, ${first}. You cancelled in time, so your hold is released. Hope to see you soon!`;
    case 'pending_refill':
      return `Thanks for letting me know, ${first}. I'll try to fill your spot from the waitlist first. If I do, you pay nothing.`;
    case 'refilled':
      return `Good news, ${first}: your spot was filled, so you pay $0. Your hold is released.`;
    case 'charged':
      return `Hi ${first}, we couldn't fill your spot, so the ${f.fee ?? 'cancellation'} fee from your hold was applied, per the policy you agreed to.`;
    case 'clarify':
      return `Hi ${first}, just to check: do you want to cancel your ${f.appointment ?? 'appointment'}, or move it?`;
    case 'owner_review':
      return `I'm so sorry, ${first}. I've passed this to ${f.owner ?? 'the owner'} personally; nothing will be charged without them.`;
    case 'hold_failed':
      return `Hi ${first}, PayPal couldn't place the hold for your visit. Please re-approve here so we can keep your spot: ${f.link ?? ''}`;
    default:
      return `Thanks, ${first}! Got it.`;
  }
}
