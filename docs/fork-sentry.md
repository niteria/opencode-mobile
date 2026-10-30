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

Build 47 passed the emulator opt-in/opt-out UI checks and sent test exceptions;
the owner confirmed receiving Sentry's email. Hermes artifact bundle processing
and native debug-file processing succeeded. The setup token is upload-only, so
reading back the event's symbolicated stack returned HTTP 403. Dashboard
confirmation of readable source frames remains outstanding.

The local build configuration is stored privately outside the checkout at
`~/.local/share/opencode-mobile/sentry.json` (mode 0600). It is not a flake input.

The sandboxed Nix build and emulator CI job remain unconfigured/offline. The
private upload token is not needed to build or use those APKs.
