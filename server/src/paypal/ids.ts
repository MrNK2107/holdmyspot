// PayPal-shaped ids for the simulator.
//
// Real PayPal ids: orders, authorizations, captures, refunds and Vault setup tokens are 17 upper-case
// alphanumerics (e.g. 5O190127TN364715T); webhook events are WH-<17>-<17>; Vault v3 payment tokens are
// short lower-case alphanumerics. The PayPal Agent Toolkit's MCP schemas validate these (order ids
// /^[A-Z0-9]{17,32}$/, refund and capture ids /^[A-Za-z0-9_-]{15,32}$/), so the simulator issues ids
// in the same shapes. They are still deterministic (derived from a counter) so tests, demo and
// screenshots repeat exactly, and unique (the counter goes through a 32-bit bijection).

export type SimIdKind = 'ORDER' | 'AUTH' | 'CAPTURE' | 'REFUND' | 'VSETUP' | 'VAULT' | 'WH';

/** Regexes for the real formats (the first four are the toolkit's own). */
export const PAYPAL_ID_FORMATS = {
  order: /^[A-Z0-9]{17,32}$/,
  capture: /^[A-Za-z0-9_-]{15,32}$/,
  refund: /^[A-Za-z0-9_-]{15,32}$/,
  resource17: /^[A-Z0-9]{17}$/,
  webhookEvent: /^WH-[A-Z0-9]{17}-[A-Z0-9]{17}$/,
  vaultPaymentToken: /^[a-z0-9]{7}$/,
} as const;

const UPPER = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I / O, like PayPal ids
const LOWER = '0123456789abcdefghijklmnopqrstuvwxyz';
const SALT: Record<SimIdKind, number> = { ORDER: 0x1f3a, AUTH: 0x2b71, CAPTURE: 0x3c95, REFUND: 0x4d02, VSETUP: 0x5e4c, VAULT: 0x6f81, WH: 0x70d7 };

/** lowbias32: an invertible 32-bit mix, so distinct inputs give distinct outputs. */
function mix32(x: number): number {
  x = x >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d) >>> 0;
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}

function encode(n: number, alphabet: string, width: number): string {
  let s = '';
  for (let i = 0; i < width; i++) {
    s = alphabet[n % alphabet.length] + s;
    n = Math.floor(n / alphabet.length);
  }
  return s;
}

/** 17 upper-case alphanumerics: 7 unique chars (bijection of the counter) interleaved with 10 filler chars. */
function resource17(seq: number, salt: number): string {
  const unique = encode(mix32(seq ^ (salt << 16)), UPPER, 7); // 34^7 > 2^32: no truncation
  let r = mix32(seq * 2654435761 + salt);
  let filler = '';
  for (let i = 0; i < 10; i++) {
    r = mix32(r + i + 1);
    // PayPal ids are mostly digits with a few letters
    filler += r % 3 === 0 ? UPPER[10 + (r % 24)] : UPPER[r % 10];
  }
  let out = '';
  for (let i = 0, u = 0, f = 0; i < 17; i++) out += i % 5 === 1 || i % 5 === 3 ? unique[u++] ?? filler[f++] : filler[f++] ?? unique[u++];
  return out;
}

export function simPayPalId(kind: SimIdKind, seq: number): string {
  const salt = SALT[kind];
  if (kind === 'WH') return `WH-${resource17(seq, salt)}-${resource17(seq, salt ^ 0x5555)}`;
  if (kind === 'VAULT') return encode(mix32(seq ^ (salt << 16)), LOWER, 7); // 36^7 > 2^32
  return resource17(seq, salt);
}
