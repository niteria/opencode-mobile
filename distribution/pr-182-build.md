# Personal PR #182 Android build

Branch: `build/pr-182` in `niteria/opencode-mobile`.

The 14 commits from [upstream PR #182](https://github.com/dzianisv/opencode-mobile/pull/182)
at `1181372fea345cccc13969386f5a85554db67794` were rebased onto upstream `main`
at `f30c59fce8d7d7871c76cacdf86d636784a591b8`. All 14 patches are unchanged
according to `git range-diff`; the rebased tip is `ef373f3`.

## Install

In the fork's **Actions → Build PR 182 APK**, open a successful run and download
`opencode-pr-182-arm64.apk`. The artifact is the APK itself, without an outer ZIP.
Open it on an ARM64 Android phone to install **OpenCode PR 182**.

The application ID is `cc.agentlabs.opencode.pr182` and its URL scheme is
`opencode-pr182`. It installs alongside the official app. Add server connections
in this separate copy; HTTP connections are supported.

## Rebuild

Push to `build/pr-182`, or choose **Re-run all jobs** on an existing workflow run.
The workflow checks version metadata, TypeScript, and unit tests before building
a standalone release-mode APK from the committed Android project. It verifies
the signature, application ID, label, ARM64 ABI, HTTP support, and URL scheme.

The fork's `PR182_KEYSTORE_BASE64` Actions secret holds a persistent signing key,
so later builds can update this app without uninstalling it. Its alias is
`pr182`; store/key passwords are `android`. The private keystore is kept outside
the checkout at `~/.local/share/opencode-mobile/pr-182.keystore`. Sentry uploads
are disabled for this personal build; Expo credentials are not required.

## Keyboard follow-up

The session uses the native-stack header's actual height, including the top
safe area, to align React Native's parent-relative layout with keyboard screen
coordinates. `react-native-screens` is pinned to 4.19.0, which fixes Android's
header-height pixel/DP mismatch ([upstream #3402](https://github.com/software-mansion/react-native-screens/pull/3402))
and supports this app's React Native 0.81/Fabric stack. It is excluded from
Expo's version alignment so `expo install --fix` cannot silently downgrade it
to the affected 4.16 release. Keyboard avoidance is disabled while Android's
keyboard is hidden so its hide-event coordinates cannot leave a bottom gap.

The Actions keyboard job checks actual input/send-button and IME bounds on an
Android 16 emulator, with the original PR layout as a negative control. It
covers multiline input, dismissal/reopening, and gesture/three-button navigation;
screenshots and measurements are in the `keyboard-regression` artifact.
