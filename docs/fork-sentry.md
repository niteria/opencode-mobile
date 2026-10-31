# Fork crash reporting

The fork's project is `opencode-mobile-fork/opencode-mobile` on Sentry SaaS.
It is separate from the upstream publisher's organization. GitHub's DSN and upload
token secrets and organization/project variables are configured.

## GitHub configuration

Create a free Sentry account and a React Native project. In this repository's
Settings → Secrets and variables → Actions, add:

| Kind | Name | Value |
| --- | --- | --- |
| Secret | `EXPO_PUBLIC_SENTRY_DSN` | Project DSN from Sentry client keys |
| Secret | `SENTRY_AUTH_TOKEN` | Sentry build/upload authentication token |
| Variable | `SENTRY_ORG` | Your organization slug |
| Variable | `SENTRY_PROJECT` | Your project slug |

The DSN is embedded in the app; it is an ingestion endpoint, not an account or
administration credential. The upload token stays in the build environment and
must never be added to `app.json`, an `EXPO_PUBLIC_*` variable, or the Nix store.

`Build PR 182 APK` validates this configuration, uploads the Hermes source map
through the existing Sentry Gradle integration, and uploads the merged native
libraries before Android's stripping step. Availability of native line numbers
depends on the debug information included by each dependency.

Runtime events and uploads use the native release identity, for example
`cc.agentlabs.opencode.pr182@0.4.15+47`, with distribution `47`. Bump versionCode
for a new installable build so different APKs don't share a release identity.

If no DSN is supplied, reporting and uploads remain disabled. If a DSN is set
without the organization, project, or upload token, CI fails before building
rather than producing a reporting-enabled APK without its source maps.

## Device behavior and verification

Reporting requires the existing explicit telemetry consent. Performance tracing
is disabled. No PostHog key is configured by this workflow, so enabling crash
reporting does not enable usage analytics.

Settings offers **Send test crash report** after opting in. It queues a handled
exception without closing the app. The confirmation displays its event ID;
queuing alone is not proof of server receipt.

The owner confirmed the initial test email. A separate read token now permits
event inspection: build 48's application frames resolved to `src/lib/sentry.ts`
and `app/(tabs)/settings.tsx`. Build 49's test event
`240fcb95798d482daaf7f9dd6a32a345` also has readable app frames and a verified
`mobile_memory` context. The build/upload token itself remains upload-only.

With reporting enabled, memory sampling runs every ten seconds in the foreground
and around transcript loads. Reports include Java heap usage/limit, native heap
usage, native view count, loaded message/part/tool counts, character counts and
requested history limit. No transcript text, commands, session titles or paths
are added by these diagnostics. Sampling stops when consent is revoked.

The local build configuration is stored privately outside the checkout at
`~/.local/share/opencode-mobile/sentry.json` (mode 0600). It is not a flake input.

The sandboxed Nix build and emulator CI job remain unconfigured/offline. The
private upload token is not needed to build or use those APKs.
