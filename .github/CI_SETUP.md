# CI setup notes — `build-android.yml` (Task 67 Part a)

This workflow replaces `eas build` entirely. No Expo cloud build
service is used anywhere in it — everything runs on GitHub's own
runners via `expo prebuild` + a direct Gradle build, the same shape
Velune's own `.github/workflows/build-tenant.yml` already uses
successfully for a similar Android build.

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
