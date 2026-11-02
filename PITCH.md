# HoldMySpot: elevator pitch

**One line:** HoldMySpot is an AI front desk for solo appointment pros that holds the no-show fee with PayPal, reads "can't make it" texts the way a person would, and refills the slot before anyone is charged.

**Tagline:** Fair, without the fight.

## 30-second pitch

Priya runs a one-chair nail studio and books by text and Instagram DM. About 1 visit in 25 is a no-show and 1 in 9 is cancelled late. She wrote a cancellation policy, but she almost never enforces it: charging a regular whose kid was sick feels wrong, and when she does try, the card declines after the fact.

**HoldMySpot holds the fee, not the grudge.**
Every visit carries a $20 PayPal authorization, not a charge. When a client texts "can't make it", the AI reads the reason; a policy engine Priya approved decides what happens. A sick kid releases the hold. A late cancel goes to the waitlist first, and if someone else's PayPal hold authorizes, the canceller pays nothing. Money only moves when Priya taps.

**HoldMySpot: the empty chair gets refilled, the regular keeps her dignity, and Priya gets paid when it is fair.**

## The three moments it shows up

1. **Three days before the visit:** "Jordan's PayPal hold was declined. I sent him a link to approve it again." (Caught on Tuesday, not at the door on Friday.)
2. **When a client cancels late:** "Maya can't make it. Chris took her slot and his hold authorized, so I released Maya's. Late cancel, $0 lost, $0 charged."
3. **When someone just doesn't show:** "Alex didn't come. Charge the $20 from the hold you already have?" One tap. Refund is one more.

## Why it can be trusted with money

- The AI only labels messages and proposes. It has no tool that authorizes, captures, voids or refunds; a prompt injection that asks for a refund is logged as denied and moves nothing (measured: `npm run eval`).
- A deterministic engine enforces the owner's rules: capture never above the hold or the policy fee, never without the owner's tap, silence never charges.
- The owner's agent reads PayPal through the official PayPal Agent Toolkit, limited to read tools.
- Every cent is traced: each booking's PayPal authorization, capture and refund ids sit in an AG Grid ledger next to the exact REST request behind each step.

## Why PayPal is central, not a checkout button

Orders v2 with `intent=AUTHORIZE`, Vault v3 for saving the wallet now and holding later, a merchant-initiated authorization 72 hours out, void, capture, reauthorize, refund, and webhooks. The product is the authorization lifecycle; take PayPal out and there is nothing left.
