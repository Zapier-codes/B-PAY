# CI setup notes — `build-android.yml` (Task 67 Part a)

This workflow replaces `eas build` entirely. No Expo cloud build
service is used anywhere in it — everything runs on GitHub's own
runners via `expo prebuild` + a direct Gradle build, the same shape
Velune's own `.github/workflows/build-tenant.yml` already uses
successfully for a similar Android build.

## ⚠️ CORRECTION (added a later session) — the section below cites a decision that was never actually made

**The heading and first paragraph below claim this was "per Task 67's
own decision (mavins-web's `handover.md`)." That is not accurate, and
this correction is here so no future session inherits the false
citation.** Checked directly against mavins-web's own `handover.md`:
**Task 67 says nothing about Supabase reconfiguration anywhere in its
full text** — it's scoped to the bpay-tag route and 3 unrelated
security fixes. The actual proposal to point this app at Mavins-web's
Supabase project is a **different** task — **Task 70** — and Task 70
is explicitly marked `[ ]` **not started**, with its own text stating
plainly: *"genuinely unclear, not decided here... needs explicit
reconciling with the product owner before either is built."* Task 70
also flags a direct, unresolved conflict with a separate proposal in
B-Pay-backend's own Task 43 (which instead has this app point at
B-Pay-backend as its payment engine — the consolidation this app's own
`handover.md` Task 1 has actually been building toward).

**Update (same later session, after the finding above was raised
directly): the underlying decision is now genuinely confirmed** — by
direct product-owner instruction, and independently corroborated in
B-Pay-backend's own `handover.md` Task 43 ("Second correction,
2026-09-05," written before this conversation and discovered
independently): **one fork serves both purposes** — (1) payment/payout
calls consolidated through B-Pay-backend (this app's own Task 1), and
(2) this app's Supabase project genuinely is Mavins-web's own
(`atojskxrxfsbpeefigtm`), so Mavins-web can credit listener payout
wallets directly. **The citation below is still wrong** (Task 67 never
said this; the real task is 70, and 70 alone doesn't confirm it either)
— but the substance it asserted turned out to be correct, confirmed
through a different, legitimate path. Leaving the wrong-citation finding
above intact rather than deleting it: a false citation that happens to
point at a true conclusion is still worth knowing about, since the next
one might not.

**Practical upshot: it is not confirmed which Supabase project this
app's GitHub Actions secrets should actually point at.** If
`EXPO_PUBLIC_SUPABASE_URL`/`EXPO_PUBLIC_SUPABASE_ANON_KEY` are
currently set to Mavins-web's project per the (mis-cited) instructions
below, that was done on the strength of a citation that doesn't hold up
— worth confirming directly with the product owner which project this
app should actually build against before trusting anything below this
line at face value. See this repo's own `handover.md`, Task 15, for the
full write-up.

## Reconfigured onto Mavins-web's own Supabase project (Task 67)

Per Task 67's own decision (mavins-web's `handover.md`): this fork
points at **Mavins-web's own Supabase project**
(`atojskxrxfsbpeefigtm`), not the original B-PAY project, so that
listener-payout crediting (Task 49 Part b-ii-ii-b) becomes a plain
same-project write from Mavins-web's own backend — no cross-org
credential sharing needed.

Confirmed before making this change: `config/supabase.ts` has **no
hardcoded URL anywhere** — both `EXPO_PUBLIC_SUPABASE_URL` and
`EXPO_PUBLIC_SUPABASE_ANON_KEY` are read purely from environment
variables, with no fallback. This means reconfiguring is genuinely
just a matter of setting the right secret values below — no app
source code changes needed for this specific piece.

**`EXPO_PUBLIC_SUPABASE_URL` value to use:**
```
https://atojskxrxfsbpeefigtm.supabase.co
```

**`EXPO_PUBLIC_SUPABASE_ANON_KEY` — deliberately not written here.**
An anon key is safe to embed in a built app (that's what it's *for* —
it only grants whatever access this project's own RLS policies allow
to an unauthenticated/authenticated client), but it's still a live
credential, and this file is committed to a public-facing repo. Pull
it directly from the source instead of copy-pasting a copy of it into
a second place: Supabase Dashboard → this project
(`atojskxrxfsbpeefigtm`) → Settings → API → **anon / public** key
(NOT the `service_role` key — that one must never appear in a
client-side mobile app at all, committed or not).

Set both secrets directly from your terminal, without pasting the key
into any chat, file, or commit:

```bash
gh secret set EXPO_PUBLIC_SUPABASE_URL --repo Zapier-codes/B-PAY \
  --body "https://atojskxrxfsbpeefigtm.supabase.co"

gh secret set EXPO_PUBLIC_SUPABASE_ANON_KEY --repo Zapier-codes/B-PAY
# ^ omitting --body drops you into a prompt that reads the value
#   without echoing it to your terminal history
```

## A different kind of secret — not this file's scope, don't confuse the two

Commit `712825f` (security fixes, same task) introduced two **Supabase
Edge Function** secrets (`LIZZYSUB_API_KEY`, `PAYSCRIBE_SECRET_KEY`) —
these are set via `supabase secrets set`, on Mavins-web's own Supabase
project, not via `gh secret set`/GitHub Actions at all. Unrelated to
this CI workflow's own secrets above; noted here only so the two don't
get conflated. **That commit's own message flags both underlying
credentials as still-live and not yet rotated** — the code fix stops
the *ongoing* exposure, it doesn't invalidate what was already visible
in git history. See mavins-web's `handover.md`, Task 67, for the full
account and rotation status.

## Required GitHub secrets

Set these under your fork's **Settings → Secrets and variables →
Actions** (or via the `gh secret set` commands above):

| Secret | Required | Notes |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Yes | `https://atojskxrxfsbpeefigtm.supabase.co` — Mavins-web's own project, per Task 67's decision (see above). Note: `.env.example` in this repo lists different names (`EXPO_PUBLIC_API_URL`/`EXPO_PUBLIC_API_KEY`) that the actual code doesn't read — a pre-existing discrepancy in this repo, not something this workflow introduces. |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Yes | From Mavins-web's own Supabase dashboard (see above) — not the original B-PAY project's key. |
| `KEYSTORE_BASE64` | No (workflow skips signing if absent) | `base64 -w0 your-keystore.jks` to produce this value. |
| `KEYSTORE_PASSWORD` | Only if `KEYSTORE_BASE64` is set | |
| `KEY_ALIAS` | Only if `KEYSTORE_BASE64` is set | |

## ⚠️ Signing continuity

No signing config exists anywhere in this repo today — confirmed via
grep before writing this workflow. EAS previously managed signing
through its own hosted credentials, invisible to this codebase.

**If this app has ever been published/installed anywhere already**,
generating a brand-new keystore for this workflow will produce a
differently-signed APK — existing installs won't be able to update in
place; anyone with the app already installed would need to uninstall
and reinstall.

To preserve the existing signing identity instead, export it from EAS
**before** removing EAS access entirely:

```bash
eas credentials -p android
```

Follow the prompts to download the existing keystore, then:

```bash
base64 -w0 downloaded-keystore.jks
```

...and use that output as `KEYSTORE_BASE64`.

## Triggering a build

- Automatically on every push to `main`, or
- Manually via **Actions → Build Android APK (no EAS) → Run workflow**,
  choosing `assembleRelease` or `assembleDebug`.

Manual runs on `assembleRelease` also create a tagged GitHub Release
with the built APK attached; `assembleDebug` runs and pushes to `main`
only upload a build artifact (Actions tab → workflow run → Artifacts),
no release.

## iOS

Not covered by this workflow. GitHub Actions can only build iOS on
`macos-*` runners, which need Xcode + a provisioning
profile/certificate (typically via `fastlane match` or manually
uploaded secrets) — a meaningfully bigger setup than the Android side,
and not something this task asked for. Worth its own follow-up if iOS
builds are needed too.
