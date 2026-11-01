/**
 * One-shot PayPal SANDBOX smoke test for the Day-1 spikes (design §10). Needs PAYPAL_CLIENT_ID and
 * PAYPAL_CLIENT_SECRET (sandbox app) in the environment. Never prints secrets.
 *
 *   node --env-file=../.env --import tsx src/scripts/sandbox-smoke.ts [vault_id]
 *
 * Without a vault id it creates a buyer-present AUTHORIZE order and prints the approval link:
 * approve it with a sandbox personal account, then rerun with `authorize <orderId>`.
 * With a vault id it runs the merchant-initiated authorize -> capture (partial, final) path,
 * then the INSTRUMENT_DECLINED negative test.
 */
import { randomUUID } from 'node:crypto';
import { PayPalRestGateway } from '../paypal/rest.js';

const id = process.env.PAYPAL_CLIENT_ID;
const secret = process.env.PAYPAL_CLIENT_SECRET;
if (!id || !secret) {
  console.error('PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET not set. Create a sandbox app at developer.paypal.com first.');
  process.exit(2);
}
const gw = new PayPalRestGateway({ clientId: id, clientSecret: secret, returnUrl: 'https://example.com/return', cancelUrl: 'https://example.com/cancel' });
const rid = () => `smoke-${randomUUID()}`;
const [cmd, arg] = process.argv.slice(2);

async function main() {
  if (cmd === 'authorize' && arg) {
    console.log(await gw.authorizeApprovedOrder(arg, rid()));
    return;
  }
  if (cmd && cmd !== 'authorize') {
    const hold = await gw.placeHold({ requestId: rid(), amountCents: 2000, customId: 'smoke:mit', description: 'HoldMySpot MIT spike', vaultId: cmd });
    console.log('MIT authorize:', hold);
    if (hold.status === 'AUTHORIZED') {
      console.log('partial final capture $15 of $20:', await gw.capture({ requestId: rid(), authorizationId: hold.authorizationId, amountCents: 1500, finalCapture: true }));
    }
    console.log(
      'negative test:',
      await gw.placeHold({ requestId: rid(), amountCents: 2000, customId: 'smoke:decline', description: 'decline spike', vaultId: cmd, simulateDecline: true }),
    );
    return;
  }
  const o = await gw.placeHold({ requestId: rid(), amountCents: 2000, customId: 'smoke:buyer', description: 'HoldMySpot buyer-present spike' });
  console.log('buyer-present order:', o);
}

main().catch((e) => {
  console.error('smoke failed:', (e as Error).message);
  process.exit(1);
});
