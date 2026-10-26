#!/usr/bin/env bash
# Run with: nix develop -c bash scripts/build-android-local.sh [arm64-v8a|x86_64]
set -euo pipefail

abi="${1:-arm64-v8a}"
case "$abi" in
  arm64-v8a|x86_64) ;;
  *) printf 'Unsupported ABI: %s\n' "$abi" >&2; exit 1 ;;
esac

lock="$(sha256sum package.json package-lock.json)"
if [[ ! -f node_modules/.opencode-lock || "$(< node_modules/.opencode-lock)" != "$lock" ]]; then
  npm ci --legacy-peer-deps
  printf '%s\n' "$lock" > node_modules/.opencode-lock
fi

gradle -p android --no-daemon --max-workers="${GRADLE_WORKERS:-4}" \
  -PreactNativeArchitectures="$abi" -PopencodeUnsigned=true :app:assembleRelease

output="artifacts/opencode-pr-182-$abi.apk"
bash scripts/sign-android-apk.sh android/app/build/outputs/apk/release/app-release-unsigned.apk "$output"
