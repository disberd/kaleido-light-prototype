#!/bin/bash
# No Node, no Chrome: QuickJS standalone binary (figure -> SVG) + kl-raster (SVG -> PNG, JPEG or PDF).
# Usage: ./kaleido-lite.sh fig.json out.(png|jpg|jpeg|pdf|svg) [width] [height] [scale]   (KL_BIN: another binary, e.g. the MathJax one)
set -e
DIR=$(cd "$(dirname "$0")" && pwd)
SVG="${2%.*}.svg"
"${KL_BIN:-$DIR/out/kaleido-lite-bin}" "$1" "$SVG" "${@:3}"
[ "$SVG" = "$2" ] && exit 0
FONTS=(/System/Library/Fonts/Supplemental/{Verdana,Arial,"Courier New","Times New Roman"}*.ttf)
"$DIR/bin/kl-raster" "$SVG" "$2" "${FONTS[@]}"
