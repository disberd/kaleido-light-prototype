#!/bin/bash
# What git leaves out (macOS arm64): ANGLE from Chrome for Testing 148 into angle/, the resvg 0.48.1 CLI into
# bin/, plotly.js v4.1.1's test mocks into plotly-src/. native/build.sh fetches quickjs-ng itself.
set -e
cd "$(dirname "$0")"
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
mkdir -p angle bin
curl -sSfLo "$T/cft.zip" https://storage.googleapis.com/chrome-for-testing-public/148.0.7778.96/mac-arm64/chrome-headless-shell-mac-arm64.zip
unzip -oqj "$T/cft.zip" '*/libEGL.dylib' '*/libGLESv2.dylib' '*/libvk_swiftshader.dylib' '*/vk_swiftshader_icd.json' -d angle
curl -sSfLo "$T/resvg.zip" https://github.com/linebender/resvg/releases/download/v0.48.1/resvg-macos-aarch64.zip
unzip -oqj "$T/resvg.zip" -d bin
[ -d plotly-src ] || {
  git -c advice.detachedHead=false clone -q --depth 1 --branch v4.1.1 --filter=blob:none --sparse https://github.com/plotly/plotly.js plotly-src
  git -C plotly-src sparse-checkout set test/image/mocks
}
