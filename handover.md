# B-PAY (app) — Session Handover

**New file — this repo had no `handover.md` before this session.** Drafted
after cloning fresh and reading the actual current code (`stores/auth-store.ts`,
`config/supabase.ts`, `supabase/functions/*`, `supabase/migrations/`), plus
B-Pay-backend's own `handover.md` for the sibling-repo context — not written
from the product goal alone. Every finding below is something actually
observed in the code, not assumed from the "make it like Wise" brief.

## Sibling repos

Kept in sync with the same section in Mavins-web's and B-Pay-backend's own
`handover.md` files — copy edits to this section into both of theirs too.

- **`Zapier-codes/B-PAY-backend`** (local: `~/B-PAY-backend`) — Render-hosted
  Express service. Stateless request router/proxy over four payment
  providers (`providers/paystack.js`, `payscribe.js`, `korapay.js`,
  `juicyway.js`): `POST /api/pay` (collect), `GET /api/verify`,
  `POST /api/payout`, `GET /api/payout/verify`, `GET /api/banks`,
  `POST /api/webhooks/:provider`. **No database, no ledger, no persistence
  layer of any kind** — every call is a stateless pass-through to whichever
  provider `ROUTING_RULES` picks. `/pay` and `/payout` are gated by
  `requireInternalApiKey`; `/verify` and `/banks` are not (open question,
  B-Pay-backend's own Task 42 Part b-b, still unresolved as of that repo's
  last note).
- **`Zapier-codes/Mavins-web`** (local: `~/mavins-web`) — separate product
  (artist streaming-campaign platform), calls B-Pay-backend independently
  via its own Supabase Edge Functions (`initialize-payment`,
  `korapay-webhook`). Not this app's concern directly, but shares the same
  B-Pay-backend service and the same `INTERNAL_API_KEY` secret — a key
  rotation or routing change on that side is a cross-repo event.
- **This repo (`B-PAY`)** — Expo/React Native wallet app, **its own separate
  Supabase project** (not Mavins-web's). Currently has a *second,
  independent* integration to Payscribe and Paystack living directly in its
  own Edge Functions (`supabase/functions/payscribe-transfer`,
  `payscribe_balance`, `paystack-webhook`, `webhook`) — parallel to, and
  currently disconnected from, B-Pay-backend's own copies of the same
  provider logic. This duplication is Task 1 below, not a design to build
  more features on top of as-is.

## Unified hand-off command format — MANDATORY, every session, all three repos

Same rules as Mavins-web's and B-Pay-backend's own copies of this section —
not re-derived here, see either of theirs for the full rationale. Patch
filename slug for this repo: `b-pay`. Local clone dir: `~/B-PAY` (matches
GitHub casing, all-caps).

## Build-focus + mandatory task-splitting — MANDATORY, every session, all three repos

Same rule as the other two repos: pick one task, split it into up to 5
lettered parts (a–e), build only one part per session, leave the rest
explicitly marked not-started. See Mavins-web's `handover.md` for the full
original write-up.

---

## A note before Task 1: this app moves real money — verification standard is higher than the other two repos

Mavins-web and Velune's own handover files both note, repeatedly, that
neither sandbox can compile/run their apps, so verification there means
brace-balancing and read-throughs. That limitation applies here too — but
the cost of an unverified bug is different: a broken campaign banner is a
display bug, a broken balance-crediting RPC is money that's wrong. Two
standing rules for every task below, not just a suggestion:

1. **No task in this file is "done" on a clean `node --check`/read-through
   alone if it touches balance, ledger, payout, or provider-credential
   code.** State explicitly what was and wasn't verified, the same
   discipline B-Pay-backend's own Task 42 already uses (functional test
   cases run against the actual function, not just syntax-checked).
2. **Nothing in this file authorizes deploying a real payout, real ledger
   migration, or real credential change against production without the
   product owner's own confirmation** — same standing limitation already
   true of every migration/deploy in Mavins-web's handover: neither sandbox
   has a live-DB network path, and this app has real user money in it,
   not seed data.

---

## Task 1 — Reconcile the duplicate payment-provider integration (this app's own Edge Functions vs. B-Pay-backend) [ ]

**Trigger:** found this session, not requested — while reading this repo's
`supabase/functions/`, discovered `payscribe-transfer`/`payscribe_balance`/
`paystack-webhook` call Payscribe/Paystack directly, independently of
B-Pay-backend's own `providers/payscribe.js`/`paystack.js`. Two live
integrations to the same providers, maintained separately, is the single
biggest risk in this codebase before any new feature work — a fix in one
place (a signature-verification bug, a currency bug) doesn't propagate to
the other, and it's not obvious from either repo alone that the duplicate
exists.

**Not split into parts yet — this session's job is confirming the shape of
the problem, not fixing it (needs a product-owner decision before any code
changes: which side wins).**

- 1a. Inventory: list every provider call this app's own Edge Functions
  make directly (not yet done — `payscribe-transfer`, `payscribe_balance`,
  `paystack-webhook` confirmed to exist and reference Payscribe/Paystack
  directly this session; full call-by-call inventory of what each one does
  vs. B-Pay-backend's equivalent route is NOT done yet).
- 1b. Decision needed from the product owner: does B-Pay-backend become the
  **sole** caller of every payment provider going forward (this app's Edge
  Functions become thin proxies to B-Pay-backend, or are retired entirely),
  or does this app keep its own direct integration for some providers and
  B-Pay-backend for others? Mavins-web's own Task 71 ("B-Pay-backend
  becomes the single source of truth for all payment/utility services")
  suggests the intended direction is full consolidation — but that task
  lives in a different repo's handover and hasn't been confirmed against
  this app specifically.
- 1c. Once decided: migration plan (not written yet) for moving this app's
  wallet screens off its own direct Edge Functions and onto B-Pay-backend's
  `/pay`, `/verify`, `/payout`, `/payout/verify` routes.

---

## Task 2 — Replace the mutable `profiles.balance` column with an immutable ledger [ ]

**Trigger:** found this session. `stores/auth-store.ts` reads/writes
`balance` as a plain column on `profiles` (`data.balance`,
`profile.balance`, `account.balance`). `supabase/migrations/` contains
exactly one file, `20250614120836_remote_schema.sql`, **and it's empty** —
meaning the live schema (this table included) was built directly against
the dashboard and was never captured in git. There is currently no way to
answer "why is this balance what it is" for any user from this repo alone.

**This is the actual foundation "liquidity and pay-in/pay-out
functionality" needs to sit on** — crediting/debiting a column directly
(rather than through an atomic, auditable ledger) is exactly the pattern
Mavins-web's own migrations already had to fix twice for wallet-adjacent
work (`credit_wallet_deposit`, `debit_wallet_balance`) after finding races
and inconsistent state. Building payout/liquidity features on top of a bare
column here would repeat that mistake with real user money.

Split, not started:
- 2a. Pull the actual live schema for `profiles` and any other
  balance-adjacent tables (dashboard export or `pg_dump` against the real
  project — neither sandbox has a network path to do this itself) and
  commit it to this repo, closing the "empty migration file" gap.
- 2b. Design a `wallet_ledger`-style table (double-entry or single-entry
  append-only, decision needed) — reference the row shape the ledger fix
  eventually needs; don't just copy Mavins-web's schema verbatim since that
  app's wallet semantics (campaign budgets, listener payouts) aren't this
  app's (person-to-person transfers, bill pay, savings/vaults per
  `readme.md`'s feature list).
- 2c. Atomic RPC(s) for credit/debit, replacing every direct
  `update profiles set balance = ...` call-site — inventory of those
  call-sites not done yet.
- 2d. Backfill: reconcile existing `profiles.balance` values into opening
  ledger entries, one-time, carefully — needs the product owner directly
  for this step, not a sandbox decision.
- 2e. Migration + verification plan, once 2a–2d are actually written.

---

## Task 3 — Pay-in (deposit) flow, routed through B-Pay-backend [ ]

**Blocked on Task 1's decision** (which backend owns the call) **and Task
2** (what gets credited needs to be a ledger, not a column). Not started.
Scope once unblocked: virtual account / card / bank-transfer collection,
using B-Pay-backend's `POST /api/pay` + `GET /api/verify`, crediting the
ledger only on a verified webhook (never on the client's own say-so that a
payment succeeded) — same principle Mavins-web's `initialize-payment`
Edge Function already uses for its own collection flow (Task 33 in that
repo's handover), reusable as a reference pattern, not copied wholesale
since this app's user/session model differs.

---

## Task 4 — Payout (withdrawal / send) flow, routed through B-Pay-backend [ ]

**Blocked on Task 1 and Task 2, same as Task 3.** Not started. Scope once
unblocked: wire the app's existing send/withdraw UI
(`components/send/`, `hooks/useSendData.ts` — both already exist, not yet
read in full this session) to B-Pay-backend's `POST /api/payout` +
`GET /api/payout/verify`, debiting the ledger atomically with an explicit
pending → success/failed state machine, reconciled via both the polling
verify call and B-Pay-backend's own webhook handler once that side closes
its own open gap (B-Pay-backend's Task 42: "no way to be PUSHED a payout's
outcome" is still open in that repo as of its last note).

---

## Task 5 — Liquidity/treasury reconciliation [ ]

**Not started, and only partly a code task.** "Liquidity" for a wallet app
means: the sum of every user's ledger balance must always be coverable by
real funds sitting with the providers (Korapay/Paystack/Payscribe balances,
or a pre-funded settlement account) — if a payout succeeds provider-side
but the app's own ledger doesn't reflect real backing, that's insolvency,
not a bug. Needed, not yet built or decided:
- A daily (at minimum) reconciliation job comparing sum(ledger balances)
  against actual provider account balances (B-Pay-backend's `Payscribe`
  provider already has a balance-check equivalent this app's own
  `payscribe_balance` function also duplicates — see Task 1).
- An explicit, product-owner-decided policy for **how payouts are funded**
  — floated from a pre-funded settlement account vs. drawn live from
  provider balance per transaction — this changes the reconciliation logic
  significantly and is a business decision, not one this session can make.
- Alerting on drift beyond a tolerance, not just a report nobody reads.

---

## Task 6 — Multi-currency / cross-border (the actual "like Wise" piece) [ ]

**Not started.** Everything above gets this app to "NGN wallet with real
pay-in/payout," not to Wise's actual defining feature: holding balances in
multiple currencies and converting between them at a transparent rate.
Real gaps, not yet addressed by anything in this repo or B-Pay-backend:
- B-Pay-backend's `international` route maps to `juicyway`, which
  Mavins-web's own `handover.md` (Task 71) already found has **3 confirmed
  bugs against Juicyway's real API** (wrong auth header prefix, wrong
  endpoint path, incomplete payload) — not production-ready today,
  independent of anything built in this app.
- No per-currency balance model exists yet anywhere in this app's schema
  (Task 2 above is single-balance-per-user, not yet multi-currency by
  design — worth deciding before 2b is finalized, not after).
- FX rate sourcing, mid-market-rate disclosure, and fee transparency (the
  specific things Wise is known for) have no design anywhere in this repo
  yet.

---

## Task 7 — Compliance: KYC/AML, not a code task this session can complete [ ]

**Flagging explicitly, not building around it.** A wallet app that holds
user balances and moves real money — especially cross-border — is
regulated in essentially every jurisdiction (money transmitter / e-money
institution licensing, KYC identity verification, transaction monitoring
and suspicious-activity reporting, sanctions screening). Nothing in this
repo currently implements identity verification beyond whatever
`is_verified`/`tier` fields on `profiles` already do (not yet audited this
session). This is a product-owner-and-legal decision, not something a
coding session should quietly design around — flagging here so it isn't
lost, not attempting a KYC implementation without that direction.

---

## Task 8 — Security hardening for money-movement code paths [ ]

**Not started; informed by findings already made in the sibling repos.**
B-Pay-backend's own Task 67 already learned, the hard way, that "a raw ID
is not a credential" (a device/user ID in a request body was initially
treated as sufficient auth for a balance-reading route). Before Task 3/4
wire real money movement through this app:
- Idempotency keys on every credit/debit path (client retries must not
  double-credit or double-debit) — not designed yet.
- Rate limiting on payout-initiating routes.
- Audit logging of every ledger mutation (who/what/when), separate from
  general app logs.
- A secrets review — this app's own Edge Functions currently hold direct
  Payscribe/Paystack keys (Task 1's duplication finding) in a second
  location beyond B-Pay-backend's own; consolidating per Task 1 also
  shrinks this surface.

---

## Suggested order

1 (decision) → 2 (ledger foundation) → 3 & 4 (pay-in/payout, can run in
parallel once 1+2 land) → 8 (harden 3/4 as they're built, not after) → 5
(liquidity reconciliation, needs 3/4's real transaction flow to reconcile
against) → 6 (multi-currency) → 7 (compliance — in practice this needs to
start in parallel with 1, on the product-owner/legal side, not waited on
until the end).

**Nothing above has been built this session — this file is the plan, not
a status report.** Next session should pick Task 1 (it blocks everything
else) and produce 1a's full inventory as its one part, per this file's own
task-splitting rule.
