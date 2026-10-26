#!/usr/bin/env bash
# The private key stays outside both the checkout and the Nix store.
set -euo pipefail

input="${1:-result/opencode-mobile-unsigned.apk}"
output="${2:-artifacts/opencode-pr-182-arm64-v8a.apk}"
keystore="${OPENCODE_KEYSTORE:-$HOME/.local/share/opencode-mobile/pr-182.keystore}"
test -f "$input"
if [[ ! -f "$keystore" ]]; then
  printf 'Signing key not found: %s\nSet OPENCODE_KEYSTORE to the existing fork keystore.\n' "$keystore" >&2
  exit 1
fi
mkdir -p "$(dirname "$output")"
"$ANDROID_HOME/build-tools/36.0.0/apksigner" sign \
  --ks "$keystore" --ks-key-alias pr182 --ks-pass pass:android --key-pass pass:android \
  --out "$output" "$input"
"$ANDROID_HOME/build-tools/36.0.0/apksigner" verify --verbose --print-certs "$output"
sha256sum "$output"
