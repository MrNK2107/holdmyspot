import type { PaymentsGateway } from './gateway.js';
import { type FetchLike, PayPalRestGateway, SANDBOX_BASE } from './rest.js';

/** One HTTP request exactly as the real PayPal REST adapter would send it (minus the bearer token). */
export interface RestPreview {
  seq: number;
  at: number;
  op: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: unknown;
}

const OPS = ['placeHold', 'authorizeApprovedOrder', 'capture', 'void', 'reauthorize', 'refund', 'createVaultSetup', 'completeVaultSetup'] as const;

/**
 * Simulator mode only. For every call the engine makes on the simulator, run the *real* REST adapter
 * against a capturing fetch and keep the request it builds: method, URL, PayPal-Request-Id, negative-testing
 * header and JSON body. Nothing leaves the machine; responses are discarded. This shows judges the exact
 * Orders v2 / Payments v2 / Vault v3 payloads behind each simulated step.
 */
export class RequestPreview {
  readonly requests: RestPreview[] = [];
  private op = '';
  private readonly rest: PayPalRestGateway;

  constructor(
    private now: () => number,
    baseUrl = '',
  ) {
    const capture: FetchLike = async (url, init) => {
      if (url.endsWith('/v1/oauth2/token')) {
        return { status: 200, json: async () => ({ access_token: 'preview', expires_in: 3600 }), text: async () => '' };
      }
      const { Authorization: _auth, ...headers } = init.headers;
      this.requests.push({
        seq: this.requests.length + 1,
        at: this.now(),
        op: this.op,
        method: init.method,
        url,
        headers,
        ...(init.body ? { body: JSON.parse(init.body) } : {}),
      });
      if (this.requests.length > 500) this.requests.shift();
      // a non-2xx status makes the adapter stop after building the request; its result is ignored
      return { status: 599, json: async () => ({}), text: async () => '' };
    };
    this.rest = new PayPalRestGateway({
      clientId: 'preview',
      clientSecret: 'preview',
      baseUrl: SANDBOX_BASE,
      returnUrl: `${baseUrl}/paypal/return`,
      cancelUrl: `${baseUrl}/paypal/cancel`,
      fetch: capture,
      now,
    });
  }

  /** Wrap a gateway: each call is mirrored as a preview, then the wrapped gateway answers it. */
  wrap<G extends PaymentsGateway>(inner: G): PaymentsGateway {
    const out = { mode: inner.mode } as PaymentsGateway;
    for (const op of OPS) {
      (out as any)[op] = async (...args: unknown[]) => {
        this.op = op;
        try {
          await (this.rest as any)[op](...args);
        } catch {
          // expected: the capturing fetch answers 599
        }
        return (inner as any)[op](...args);
      };
    }
    return out;
  }
}
