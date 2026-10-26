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
