#!/bin/bash
# No Node, no Chrome: QuickJS standalone binary (figure -> SVG) + resvg CLI (SVG -> PNG).
# Usage: ./kaleido-lite.sh fig.json out.png [width] [height] [scale]
set -e
DIR=$(cd "$(dirname "$0")" && pwd)
SVG="${2%.*}.svg"
"$DIR/out/kaleido-lite-bin" "$1" "$SVG" "${@:3}"
FONTS=()
for f in /System/Library/Fonts/Supplemental/{Verdana,Arial,"Courier New","Times New Roman"}*.ttf; do FONTS+=(--use-font-file "$f"); done
"$DIR/bin/resvg" --skip-system-fonts "${FONTS[@]}" "$SVG" "$2"
