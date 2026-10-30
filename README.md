# OpenCode Mobile

## About this fork

This is **[niteria/opencode-mobile](https://github.com/niteria/opencode-mobile)**,
a fork of [dzianisv/opencode-mobile](https://github.com/dzianisv/opencode-mobile).
The default branch, **`master`**, combines the rebased
[PR #182](https://github.com/dzianisv/opencode-mobile/pull/182) with
[PR #216](https://github.com/dzianisv/opencode-mobile/pull/216),
[PR #218](https://github.com/dzianisv/opencode-mobile/pull/218), and the integration work below.

- **PR #182's fixes** for chat scrolling, SSE recovery and startup, stale
  transcripts, text copying/selection, and session listing.
- **OpenCode 1.x and 2 compatibility:** authenticated protocol detection,
  PermissionV2 requests, session-scoped replies, forms, and foreground/SSE recovery.
- **Draft and prompt preservation:** encrypted per-session drafts, restoration
  after process recreation, and exact long prompts without the old 10k limit.
- **Session navigation:** title search across projects, a remembered project-grouping
  toggle (flat by default), and newest-message-first ordering with live updates.
  Search reveals matches inside collapsed groups. Recency uses message creation/
  completion timestamps rather than rename time; empty sessions use creation time.
  Initial indexing fetches only the latest message, four sessions at a time, with
  an in-memory cache for unchanged sessions. The list stays usable while indexing.
  Fresh launches open the list, and every chat has a Sessions button to return to it.
- **Expanded tool output:** vertical swipes stay inside overflowing output, including
  at its edges. Only the tool header toggles expansion; long output remains scrollable
  past the previous line limits. Nested diff horizontal scrolling is preserved.
- **Optional fork crash reporting:** opt-in Sentry reports go to the fork's own project,
  with build-specific releases and source maps/native symbols. Settings includes a
  non-crashing test-report action. See [Sentry setup and verification](docs/fork-sentry.md).
- **Native Android keyboard handling:** Android 15+ reserves IME space at the
  activity root. Older Android retains the header-aware fallback. Emulator
  checks cover multiline input, reopening, both navigation modes, password
  fields, and draft restoration.
- **Side-by-side Android builds:** the app installs as **OpenCode PR 182**
  (`cc.agentlabs.opencode.pr182`), with a persistent fork signing key for updates.
- **Nix builds:** a pinned development toolchain, incremental local builds, and
  a sandboxed APK build with locked npm and Gradle dependencies.

**Download this fork:** open a successful
[Build PR 182 APK run](https://github.com/niteria/opencode-mobile/actions/workflows/pr-182-apk.yml)
and download `opencode-pr-182-arm64.apk` from its artifacts.
See the [fork build instructions](distribution/pr-182-build.md) for installation,
Nix commands, and signing details.

### Provenance

Original commits from #218 (including #216) are retained through a merge.
The table distinguishes those imports from adaptations made in this fork.

| Source | Imported revision / attribution | Contribution |
| --- | --- | --- |
| [#182](https://github.com/dzianisv/opencode-mobile/pull/182) — @omgoshjosh | `1181372`, rebased as 14 commits ending at `ef373f3` on upstream `f30c59f` | Streaming auto-scroll, global session pagination, native horizontal scrolling, copy/selection, SSE recovery and chat fixes. |
| [#210](https://github.com/dzianisv/opencode-mobile/pull/210) — @xtiang7c0 | `42113c0`, carried by #216 as `6df85de` | Native Android 15+ IME root insets and an Expo prebuild plugin. |
| [#216](https://github.com/dzianisv/opencode-mobile/pull/216) — @meramsey | `6b153be`, included in #218 | PermissionV2 event normalization and connection-screen keyboard handling. |
| [#209](https://github.com/dzianisv/opencode-mobile/pull/209) — @bluetoe-99 | Carried by #218 in `4bf0380` | v1/v2 transports, event normalization, and message-selection UI. |
| [#211](https://github.com/dzianisv/opencode-mobile/pull/211) — @Dre4my26 | Carried by #218 as `83da1ac` | Missing-credential versus rejected-credential diagnostics. |
| [#191](https://github.com/dzianisv/opencode-mobile/pull/191) — @chliny | Draft-preservation work adapted by #218 | Per-session unsent drafts. |
| [#218](https://github.com/dzianisv/opencode-mobile/pull/218) — @meramsey | Merged at `edc7aad` | Lifecycle/state reconciliation, encrypted drafts, long prompts, v2 compatibility and execution-error display. |
| This fork | Follow-up work on `master`; initial Nix build in `8a364c4` | Side-by-side identity/signing, Nix builds, regression coverage, and the reconciliation below. |

**Integration decisions and fixes:**

- #216's native IME handler owns spacing on Android 15+; the additional
  keyboard-controller dependency from #218 is omitted. The `react-native-screens`
  4.19 header fix remains for older Android's fallback.
- #182's paginated lists, streaming auto-scroll, native `WideScroll`, dark-mode
  contrast and speech cleanup are retained. #218's explicit Select/Edit buttons
  and full-message text sheet extend the copy UI.
- API detection requires a JSON identity; an authentication challenge cannot
  establish a protocol version. Saved connections are rechecked so upgrading a
  server at the same URL works, with the saved protocol as an offline fallback.
  Connection diagnostics share that detection, including preview health routes.
- PermissionV2 requests on 1.x servers use their v2 reply endpoints. v2 lists
  follow `cursor.next`, and session creation carries the selected location.
- Live-preview testing added `/api/health`, rename, form-cancel and revert-clear
  fallbacks, status-route compatibility, and `sessionID`/partial-session event
  handling that preserves existing session metadata.
- Android version code **48** is aligned across native/Expo metadata and changelogs;
  the existing `cc.agentlabs.opencode.pr182` app ID and signing key support updates.

**Verification:** the SDK was checked against a live 1.18.30 server and an isolated
official OpenCode 2 preview (`0.0.0-beta-19271`). The v2 check covered 205 created,
paged and deleted sessions, 205 live creation events, selected locations,
authentication, renaming, status, providers/agents, permission replies, and form
replies/cancellation. Native Android 16 emulator checks cover keyboard geometry
and encrypted draft restoration. See [compatibility and test details](docs/compatibility-and-lifecycle.md).

## Upstream project

The following describes the upstream project and its distribution channels.

**The open-source Android client for the [opencode](https://github.com/sst/opencode) AI coding agent.**
AI-assisted coding from your phone — Android, via Google Play, F-Droid, or a direct APK.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![F-Droid repo](https://img.shields.io/badge/F--Droid-add_our_repo-1976D2?logo=f-droid)](https://dzianisv.github.io/opencode-mobile/fdroid/repo)
[![Download APK](https://img.shields.io/badge/Download-APK-green?logo=android)](https://github.com/dzianisv/opencode-mobile/releases/latest)
[![Google Play](https://img.shields.io/badge/Google_Play-Available-4CAF50?logo=google-play)](https://play.google.com/store/apps/details?id=cc.agentlabs.opencode)

> **Not affiliated with opencode.** OpenCode Mobile is an independent, community-built client and is
> not made by, endorsed by, or affiliated with the opencode / Anomaly team. It talks to an opencode
> server you run yourself, using opencode's open HTTP API.

---

**New: tap "Try a Demo" in the app to see the agent fix a real bug — reasoning, a grep, a diff, a permission prompt — in about 30 seconds, no server needed.**

---

## Install (Android)

There are **three working ways** to install OpenCode Mobile today, all for Android:

1. **Google Play** — **https://play.google.com/store/apps/details?id=cc.agentlabs.opencode**

2. **F-Droid (self-hosted repo)** — add our self-hosted repo to any F-Droid client, then install/update from there:
   ```
   https://dzianisv.github.io/opencode-mobile/fdroid/repo
   ```
   In the F-Droid app: **Settings → Repositories → + (add)** and paste the URL above. Current version: **v0.4.7**.

3. **Direct signed APK** — download the latest release and install it manually:
   **https://github.com/dzianisv/opencode-mobile/releases/latest**

> iOS is not available (see [Roadmap](#roadmap)). IzzyOnDroid submission is pending.

---

OpenCode Mobile is a React Native / Expo app that brings the power of the [opencode](https://github.com/sst/opencode) AI coding agent to your phone. Connect to your own self-hosted opencode server over your local network, a Cloudflare Tunnel, ngrok, or Tailscale — and write, review, and ship code from anywhere. The mobile client is **free and open-source** under the MIT license. There is no feature gate, no telemetry you did not opt into, and no ad network.

---

<p align="center">
  <img src="distribution/demo.gif" width="240" alt="OpenCode Mobile demo — connect to your server, browse sessions, and watch the AI agent stream a reply" />
</p>

<sub>Real on-device capture: add a connection, browse sessions, and watch the agent stream a response. Verified end-to-end on an Android emulator against a live opencode server (build cc.agentlabs.opencode).</sub>

---

## Features

- **Offline demo mode** — tap "Try a Demo" to see a full bug-fix walkthrough (reasoning → grep → diff → permission prompt) with zero setup, right from the empty state
- **Multi-connection** — manage multiple opencode servers (local network, Cloudflare Tunnel, ngrok, or Tailscale)
- **Biometric unlock** — Face ID, Touch ID, or Android fingerprint protects the app and individual message sends
- **Streaming chat** — token-by-token streaming responses directly from your opencode server
- **Diff viewer** — inline side-by-side diffs of every file change the agent makes
- **Tool call approval** — review and approve (or reject) tool calls before the agent executes them
- **Secure credential storage** — server credentials stored in the Android Keystore via `expo-secure-store`
- **Session management** — browse, create, and resume coding sessions

---

## Get OpenCode Mobile

Package: `cc.agentlabs.opencode` · Android only · current version v0.4.7

| Channel | Status | How |
|---|---|---|
| **Google Play** | **Live** | [play.google.com/store/apps/details?id=cc.agentlabs.opencode](https://play.google.com/store/apps/details?id=cc.agentlabs.opencode) |
| **F-Droid (self-hosted repo)** | **Live** | Add [`https://dzianisv.github.io/opencode-mobile/fdroid/repo`](https://dzianisv.github.io/opencode-mobile/fdroid/repo) in your F-Droid client |
| **Direct APK** | **Live** | [github.com/dzianisv/opencode-mobile/releases/latest](https://github.com/dzianisv/opencode-mobile/releases/latest) |
| IzzyOnDroid | Submission pending | Not live yet |
| Apple App Store / iOS | Not available | See [Roadmap](#roadmap) |

> The three live, supported install channels are **Google Play**, the **F-Droid self-hosted repo**, and the **direct signed APK**, all Android. IzzyOnDroid is pending, and there is no iOS build.

---

## Quick Start

**Don't have a server yet?** Install the app and tap **Try a Demo** on the Sessions screen first — no setup required. It plays back a scripted bug-fix session through the app's real chat, diff, and permission-approval UI, offline, in about 30 seconds.

**Step 1 — Start opencode on your machine**

```bash
# Install opencode (if you haven't already)
npm install -g opencode-ai

# Run opencode in server mode
OPENCODE_SERVER_PASSWORD=yourpassword opencode serve --hostname 0.0.0.0 --port 4096
```

**Step 2 — Install OpenCode Mobile** via [Google Play, F-Droid, or a direct APK](#install-android) (or build from source — see [CONTRIBUTING.md](CONTRIBUTING.md)).

**Step 3 — Add a connection in the app**

Open the app, tap **Add Connection**, and choose your connection type:

- **Local network** — your machine's LAN IP, e.g. `http://192.168.1.100:4096`
- **Tunnel** — a Cloudflare Tunnel or ngrok URL, e.g. `https://my-opencode.trycloudflare.com`
- **Tailscale** — your machine's Tailscale IP, e.g. `http://100.x.x.x:4096`
- **opencode Cloud** *(planned — not yet shipped)* — one-tap managed hosting, no server to run

Enter the password you set in Step 1, tap **Connect**, and you're in.

---

## How It Works

OpenCode Mobile is a thin client. It speaks the opencode HTTP + SSE API: listing sessions, sending messages, streaming responses, and subscribing to file-change events. All AI model calls are handled by your opencode server — you bring your own API keys (OpenAI, Anthropic, etc.) and the app never touches them. The app never proxies your code or conversation through our servers.

```
┌─────────────────────────────────────┐
│         OpenCode Mobile             │
│  (React Native / Expo, this repo)   │
└──────────────┬──────────────────────┘
               │  HTTP + SSE
               │  (local network / tunnel)
               ▼
┌─────────────────────────────────────┐
│       opencode server               │
│  (github.com/sst/opencode, MIT)     │
│  Running on your laptop / VPS       │
└──────────────┬──────────────────────┘
               │  API calls
               ▼
┌─────────────────────────────────────┐
│   Your AI provider                  │
│  (OpenAI / Anthropic / Gemini / …)  │
│  Your keys, your bill               │
└─────────────────────────────────────┘
```

---

## Project Status

**Current version: v0.4.7**

| Feature | Status |
|---|---|
| Offline demo mode | Stable |
| First-run onboarding clarity | Stable |
| Multi-connection management | Stable |
| Session list + creation | Stable |
| Streaming chat | Stable |
| Diff viewer | Stable |
| Biometric unlock | Stable |
| Tool call approval UI | Stable |
| Sentry crash reporting (opt-in) | Stable |
| Cloudflare / ngrok tunnel wizard | Beta |
| opencode Cloud one-tap connect | Planned |
| iPad / tablet layout | Planned |
| Offline session history | Planned |

---

## Supporters and Sponsors

OpenCode Mobile is built and maintained by [VIBE TECHNOLOGIES, LLC](https://agentlabs.cc/opencode). GitHub Sponsors help cover Sentry, EAS Build, and CI costs (~$60/month). The opencode Cloud hosted backend (planned, $10/mo) is the long-term revenue model.

If OpenCode Mobile saves you time, consider sponsoring:

**[github.com/sponsors/VibeTechnologies](https://github.com/sponsors/VibeTechnologies)**

| Tier | Price | Perk |
|---|---|---|
| Supporter | $5/mo | Your name in `SUPPORTERS.md` |
| Backer | $15/mo | Name + early access to opencode Cloud beta |
| Business | $50/mo | Logo on [agentlabs.cc/opencode](https://agentlabs.cc/opencode) + quarterly support call |

Questions or private support: [support@agentlabs.cc](mailto:support@agentlabs.cc)

---

## Roadmap

Tracked on the [GitHub Projects board](https://github.com/dzianisv/opencode-mobile/projects) and in the [open milestones](https://github.com/dzianisv/opencode-mobile/milestones).

Near-term priorities:
- opencode Cloud one-tap connect + managed hosting
- F-Droid mainline acceptance (FCM audit + reproducible build verification)
- Tunnel setup wizard (Cloudflare / ngrok / Tailscale)
- iPad / tablet layout
- Offline session history cache

---

## Contributing

We welcome bug reports, feature requests, and pull requests. See [CONTRIBUTING.md](CONTRIBUTING.md) for how to set up a dev environment and the contribution process.

---

## Privacy

OpenCode Mobile does not collect personal data. Optional Sentry crash reporting (opt-in, off by default) sends anonymised crash traces to Sentry. No analytics SDKs are bundled. Credentials are stored exclusively on-device in the OS keystore.

Full privacy policy: [dzianisv.github.io/opencode-mobile/privacy](https://dzianisv.github.io/opencode-mobile/privacy/)

---

## License

MIT — see [LICENSE](LICENSE).

Copyright (c) 2026 VIBE TECHNOLOGIES, LLC

---

## Acknowledgments

- [sst/opencode](https://github.com/sst/opencode) — the AI coding agent this app connects to (MIT)
- [Expo](https://expo.dev) — the React Native toolchain powering the app
- Every contributor who filed a bug, opened a PR, or starred the repo
