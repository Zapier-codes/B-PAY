# CI setup notes — `build-android.yml` (Task 67 Part a)

This workflow replaces `eas build` entirely. No Expo cloud build
service is used anywhere in it — everything runs on GitHub's own
runners via `expo prebuild` + a direct Gradle build, the same shape
Velune's own `.github/workflows/build-tenant.yml` already uses
successfully for a similar Android build.

## Required GitHub secrets

Set these under your fork's **Settings → Secrets and variables →
Actions**:

| Secret | Required | Notes |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Yes | Read directly by `config/supabase.ts` at build time. Note: `.env.example` in this repo lists different names (`EXPO_PUBLIC_API_URL`/`EXPO_PUBLIC_API_KEY`) that the actual code doesn't read — a pre-existing discrepancy in this repo, not something this workflow introduces. Use the real names above. |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Yes | Same as above. |
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
