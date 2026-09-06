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

## Architecture decisions — confirmed this session by direct product-owner instruction, binding on all future work

These three are standing rules, not one-off tasks — every task below (and
any future one) has to comply with them, the same way the "Sibling repos"
and "Build-focus" sections above already bind every session.

### A. No screen/component calls a backend directly — ever

**Rule:** page/screen components never construct their own `fetch()` to a
provider, B-Pay-backend, or `supabase.functions.invoke(...)` call inline.
All of that lives behind a single Edge-Functions service layer,
initialized once at app boot, that components import and call — they
never touch the network themselves.

**Current state, confirmed this session, is the exact opposite of this
rule — flagging precisely so the gap is understood, not glossed over:**
- `app/(app)/send/success.tsx` defines its own `executePayscribeTransfer`
  function inline and calls `supabase.functions.invoke(...)` directly
  from inside a page component — the **only** `functions.invoke` call
  anywhere in this codebase.
- `services/country.service.ts` instantiates its **own** separate
  `createClient(...)` Supabase client, instead of importing the one
  shared client already exported from `config/supabase.ts` — a second,
  redundant client instance, not a shared service.
- No centralized Edge-Functions service module exists at all today.

**Not built yet.** The shape to build toward: one module (e.g.
`services/edgeFunctions.ts`, exact name TBD when this is actually built)
exporting one function per Edge Function this app calls
(`pay()`, `verifyPayment()`, `payout()`, `verifyPayout()`, `resolveTag()`,
etc., aligned with whichever functions remain after Task 1's consolidation
onto B-Pay-backend), built on the single shared `supabase` client from
`config/supabase.ts`, module-initialized once rather than re-created
per-render or per-screen. Every screen currently doing its own direct call
(`send/success.tsx` today; more will surface once Task 1c's migrations are
actually built) gets rewired onto this layer as part of that same work —
not a separate cleanup pass after the fact.

### B. Geo-detected local currency, local-to-local cross-border transfers

**Rule, stated directly by the product owner:** every user sees their own
local currency as the default, detected via **ipapi.co** at app init —
same third-party service Mavins-web's own `handover.md` already uses for
this exact purpose (Task 27, "GeoProvider: ipapi.co geo-detection at app
initialization, global + login-persistent," originated as B-Pay-backend's
own Task 25) — reuse that precedent's pattern (global context, persists
across logins) rather than re-deriving it from scratch. **Not built in
this repo yet — zero references to ipapi.co found anywhere in this
codebase this session.**

**The payment model this enables, in the product owner's own words:** a
sender pays in their own local currency, and the recipient receives in
their own local currency — conversion happens transparently in the
pipeline, not by requiring either party to hold or think in a shared
intermediate currency. Worked example given: a sender in Ghana pays in
GHS; a recipient in Kenya receives KES, directly. **Per-user multi-currency
"vault" wallets (an explicit USD balance, etc.) are optional and
deliberately NOT required for this to work** — narrows Task 6 below:
the mandatory piece is server-side FX conversion on each transaction, not
giving every user several currency-labeled balances to manage.

**Settlement speed, to be reflected honestly in the UI, not oversold:**
app-to-app transfers (this app to another B-PAY wallet) settle instantly —
an internal ledger movement (Task 2), no external rail involved. Transfers
from this app to an external bank go through the actual payout rail
(Korapay today) and take that rail's normal settlement time — the UI must
not promise "instant" for that path.

**One real technical constraint to check before relying on this, not yet
confirmed:** ipapi.co's free tier is rate-limited (historically 1,000
requests/month) — worth confirming current plan/tier before wiring this
into every app boot, and caching the lookup (once per install or per
login, matching Mavins-web's own "login-persistent" pattern) rather than
calling it on every screen mount.

### C. Watermark + theming standard — document the existing pattern, then formalize it

**Found this session, not designed new — this pattern already exists,
consistently, across 28+ screens; documenting it here so it's captured
once instead of quietly drifting further per-screen.**

- **Theme:** only one color scheme is actually defined
  (`constants/colors.ts` → `colors.dark`), despite `ThemeProvider`
  (`context/theme-context.tsx`) being built to support switching between
  named schemes — there's no second scheme to switch to yet. Background is
  a warm near-black (`hsl(29, 53%, 1%)` in `colors.dark.background`), but
  a plain `#000` literal is also used directly in ~46 places across
  screens instead of referencing that token — two different "black"
  values in play, worth reconciling onto one source of truth rather than
  two. Accent tones are warm amber/gold
  (`button: hsl(27, 52%, 17%)`, `muted: hsl(36, 93.2%, 17.3%)`).
- **Watermark pattern**, confirmed identical (with minor drift noted
  below) across at least 28 screens (`send/*`, `airtime/*`, `ajo/*`,
  `bundles/*`, `card.tsx`, `settings.tsx`, `help.tsx`, and more): a large,
  low-opacity app-icon image, centered via an absolutely-positioned
  wrapper (`StyleSheet.absoluteFillObject`, `justifyContent`/
  `alignItems: 'center'`), `pointerEvents="none"` (purely decorative,
  never intercepts touches), layered behind page content
  (`zIndex: 1` for the watermark, `zIndex: 2` for content). Most screens
  additionally loop a subtle pulse: scale `1 ↔ 1.08` over 2000ms, opacity
  `0.08 ↔ 0.15` over 1500ms, via `Animated.loop(Animated.parallel([...]))`.
  Icon source is **contextual per screen**, not one fixed logo everywhere
  — e.g. `bundles/index.tsx` watermarks itself with `assets/icons/home.png`.
- **Minor drift already found, worth fixing when this is centralized**:
  size varies 280×280 vs 300×300 depending on screen, and baseline opacity
  varies (flat `0.1` on some screens vs the `0.08–0.15` animated range on
  others) — small, but exactly the kind of per-screen copy-paste drift
  that gets worse over time if it isn't captured as one shared component.
- **Not built yet:** a single shared `<ScreenWatermark icon={...} />` (or
  similar, name TBD) component encoding the agreed values once, replacing
  the copy-pasted style blocks currently duplicated across 28 files.

---



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

**1a — full inventory, done this session.** Every provider call in this
app's own `supabase/functions/`, checked one by one against whether
B-Pay-backend already has an equivalent:

| Function | Calls directly | B-Pay-backend equivalent? |
|---|---|---|
| `payment/index.ts` | `POST api.paystack.co/transaction/initialize` | Yes — `POST /api/pay` (provider `paystack`) |
| `verify-paystack-transaction/index.ts` | `GET api.paystack.co/transaction/verify/:ref` | Yes — `GET /api/verify` |
| `paystack-webhook/index.ts` | Paystack webhook, own signature check | Yes — `POST /api/webhooks/paystack` |
| `payscribe-transfer/index.ts` | Payscribe transfer API | Yes — `POST /api/pay` (provider `payscribe`, action `bank_transfer`) |
| `payscribe_balance/index.ts` (file header still says `sync-payscribe-balance`, name was changed without updating the comment) | `GET api.payscribe.ng/api/v1/wallet/balance` | No direct route today, but same provider/credential B-Pay-backend already holds |
| `lizzysub-proxy/index.ts` | `lizzysub.com/api/data` (VTU) | **No** — B-Pay-backend has no Lizzysub integration yet (Mavins-web's Task 71 flags this as future work on that repo) |
| `exam-proxy/index.ts` | exam-pin vending API | **No** — no equivalent anywhere in B-Pay-backend |
| `electric-validation/index.ts` | electricity-bill validation API | **No** — no equivalent anywhere in B-Pay-backend |
| `delete-account`, `offer`, `resolve_tag`, `send-push-notification` | no external payment provider | N/A — not a duplication concern either way |

**Korapay and Juicyway: zero direct calls found anywhere in this app.**
Payout can be adopted straight from B-Pay-backend with nothing to retire
on that side.

**1b — decided this session, by direct product-owner instruction:
B-Pay-backend becomes the sole caller of every payment provider this app
uses.** This app's own Paystack/Payscribe Edge Functions are retired, not
kept as a parallel path. The three utility integrations
(`lizzysub-proxy`, `exam-proxy`, `electric-validation`) are a different
case — B-Pay-backend has nothing to switch to yet, so those need porting
into B-Pay-backend first (new task, not yet filed — B-Pay-backend's own
Task 71 already covers Lizzysub specifically; exam-pin and electricity
validation aren't mentioned anywhere in that repo's handover yet and need
their own entry there).

**1c — migration plan, per function, not yet built:**
- `payment/index.ts` → replace body with a call to B-Pay-backend's
  `POST /api/pay` (`action: "collect_payment"` or explicit
  `provider: "paystack"`), forwarding `X-Internal-Api-Key`. Whatever
  currently calls this Edge Function client-side needs to point at the
  Edge Function still (keep the Supabase Auth/RLS boundary between the
  app and any backend secret), with the Edge Function itself becoming a
  thin proxy — same shape as Mavins-web's own `initialize-payment`
  function already uses for the exact same backend.
- `verify-paystack-transaction/index.ts` → thin proxy to
  `GET /api/verify?reference=...&provider=paystack`.
- `paystack-webhook/index.ts` → **do not simply delete.** Paystack's
  dashboard webhook URL currently points at this function; retiring it
  means either re-pointing that dashboard URL at B-Pay-backend's own
  `/api/webhooks/paystack` (manual step, outside any sandbox's reach,
  same class of step Mavins-web's Task 33-1b flagged for its own Korapay
  webhook re-point) or keeping this function alive purely as a forward-
  to-B-Pay-backend relay until the dashboard is re-pointed. Decide which
  before deleting anything — a dropped webhook silently breaks payment
  confirmation, it doesn't fail loudly.
- `payscribe-transfer/index.ts` → thin proxy to `POST /api/pay`
  (`action: "bank_transfer"`, routes to `payscribe` per B-Pay-backend's
  own `ROUTING_RULES`).
- `payscribe_balance/index.ts` → **no direct B-Pay-backend route exists
  for this today** (routes.js has no balance-check endpoint for any
  provider besides the payout-side `/banks`). Needs a new route added to
  B-Pay-backend first, or this stays a direct call as a deliberate,
  documented exception — product-owner call, not decided yet.
- None of the above is built yet. Per this file's own task-splitting
  rule, the next session should pick **one** of these five (the
  `payment.ts` → `/pay` swap is the most self-contained starting point)
  rather than doing all five in one sitting.

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

**Scope narrowed this session — see "Architecture decisions B" above.**
The mandatory piece is server-side FX conversion so a sender's local
currency reaches the recipient in *their* local currency automatically —
**not** giving every user several currency-labeled balances to hold and
manage. Per-currency "vault" wallets are now explicitly optional, a
possible future add-on, not a requirement for this task to be considered
done.

**Not started.** Everything above gets this app to "NGN wallet with real
pay-in/payout," not to Wise's actual defining feature: holding balances in
multiple currencies and converting between them at a transparent rate.
Real gaps, not yet addressed by anything in this repo or B-Pay-backend:
- B-Pay-backend's `international` route maps to `juicyway`, which
  Mavins-web's own `handover.md` (Task 71) already found has **3 confirmed
  bugs against Juicyway's real API** (wrong auth header prefix, wrong
  endpoint path, incomplete payload) — not production-ready today,
  independent of anything built in this app.
- No FX conversion logic exists yet anywhere in this app's schema or
  B-Pay-backend — the actual sender-local-currency-to-recipient-local-
  currency conversion "Architecture decisions B" describes has to be
  designed and built, most likely as a new B-Pay-backend capability (rate
  sourcing, spread/fee policy, conversion applied at transfer time), not
  something either repo has today.
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

## Task 9 — Complete stub/incomplete screens [ ]

**Trigger:** requested directly by the product owner, plus a real
grep-and-read pass this session (not just a keyword match — every hit
below was opened and confirmed, filtering out normal TextInput
`placeholder=` props, which are not stubs). Split, none started:

- 9a. **`send/tabs/International.tsx`, `DigitalDollars.tsx`,
  `eNaira.tsx`** — all three are literally just a "Coming Soon" screen,
  26 lines each, no logic behind them at all. Likely the biggest single
  chunk of work in this task: International in particular is the same
  cross-border flow Task 6 (multi-currency) above already depends on, so
  building this screen for real and closing Task 6's design gap are the
  same piece of work, not two.
- 9b. **`components/TransferBottomSheet.tsx`** — never built past the
  default Expo/RN scaffold (`<Text>TransferBottomSheet</Text>`, 9 lines).
  Needs the actual transfer-confirmation bottom sheet design/content
  clarified before building — not enough context in the repo alone to
  know what this was meant to show without the product owner's own spec.
- 9c. **`ajo/tabs/creator-tools.tsx`** — the "AJO" (rotating
  savings-group) creator tools screen is mostly built (1267 lines), but
  "Suspend AJO" and "Cancel AJO" are both stub `Alert.alert(...,
  'This feature is coming soon')` calls, not real actions.
- 9d. **`(Auth)/welcome-back.tsx`** — biometric login is a stub toast
  (`"Biometric login coming soon!"`), not implemented.
- 9e. **Not yet resolved, needs checking before any of the above:** both
  `app/(app)/login.tsx` and `app/(app)/(Auth)/login.tsx` exist. Unclear
  which one the router actually uses — possible dead duplicate. Worth
  confirming which is live before spending time polishing either, since
  fixing the wrong one wastes the session.

None of 9a–9e is built yet — flagging the full set here so a future
session doesn't rediscover them one at a time, per this file's own
"don't lose an inventory to the next 60 session notes" lesson (see
Mavins-web's own Task 52 note on exactly that failure mode).

---

## Task 10 — Centralize all backend access behind one Edge-Functions service layer [ ]

**Trigger:** direct product-owner instruction — see "Architecture
decisions A" above for the full finding and target shape. Not split into
parts yet; natural split once started would likely be (a) build the
service-layer module itself against whichever Edge Functions survive
Task 1's consolidation, (b) migrate `send/success.tsx`'s inline
`executePayscribeTransfer` onto it — the one confirmed existing violation
— and (c) fix `services/country.service.ts`'s redundant second Supabase
client onto the shared one from `config/supabase.ts`. **Blocked on Task
1c landing first** (no point building the service layer against Edge
Functions that are about to be replaced by thin proxies to B-Pay-backend)
— sequence this after Task 1, not before or in parallel.

---

## Task 11 — Geo-detected default currency + local-to-local cross-border transfers (ipapi.co) [ ]

**Trigger:** direct product-owner instruction — see "Architecture
decisions B" above for the full model and the worked Ghana→Kenya example.
Not started; zero ipapi.co references exist in this repo today. Split, none
started:
- 11a. App-init geo detection via ipapi.co, mirroring Mavins-web's own
  `GeoProvider` pattern (Task 27 in that repo's handover) — global context,
  persists across logins, not re-queried per screen. Confirm ipapi.co's
  current rate-limit tier before wiring this into every app boot.
- 11b. Default-currency wiring: every balance/amount display defaults to
  the detected local currency, not a hardcoded NGN/USD assumption — needs
  an audit of every screen currently assuming a fixed currency (not done
  yet).
- 11c. Server-side FX conversion at transfer time (the actual "Ghana sender
  pays GHS, Kenya recipient receives KES" mechanic) — this is the same
  underlying capability Task 6 above needs; building it once should satisfy
  both tasks, not duplicate the work.
- 11d. UI honesty pass: app-to-app transfers labeled/behave as instant;
  app-to-bank transfers reflect the real payout-rail settlement time, no
  overstated "instant" claim on that path.

---

## Task 12 — Formalize the watermark + theming pattern into a shared component [ ]

**Trigger:** direct product-owner instruction to document and standardize
what's already in use — see "Architecture decisions C" above for the full
audit (28+ screens, exact style values, the size/opacity drift already
found). Not started:
- 12a. Build the shared `<ScreenWatermark icon={...} />` component (name
  TBD) encoding one agreed size/opacity/animation, replacing the
  copy-pasted style blocks.
- 12b. Migrate existing screens onto it, resolving the 280×300 and
  opacity drift already found in the process rather than baking the
  inconsistency into the shared component.
- 12c. Reconcile the `#000` literal vs. `colors.dark.background` token
  drift found in "Architecture decisions C" while touching this area,
  since it's the same class of "one value, two representations" issue.

---

## Suggested order

1 (decision) → 10 (edge-function centralization, right after 1c lands) →
2 (ledger foundation) → 3 & 4 (pay-in/payout, can run in parallel once
1+2 land) → 8 (harden 3/4 as they're built, not after) → 11 (geo-currency
+ local-to-local FX — 11c overlaps Task 6's own core requirement, build
once) → 5 (liquidity reconciliation, needs 3/4's real transaction flow to
reconcile against) → 6 (multi-currency vaults, now optional/deferred per
Task 11's scope note) → 7 (compliance — in practice this needs to start in
parallel with 1, on the product-owner/legal side, not waited on until the
end) → 12 (watermark/theming — cosmetic, lowest urgency, fine to slot in
whenever).

**Nothing above has been built this session — this file is the plan, not
a status report.** Next session should pick Task 1 (it blocks everything
else) and produce 1a's full inventory as its one part, per this file's own
task-splitting rule.
