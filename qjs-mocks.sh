#!/bin/bash
# The mocks listed in <dir>/sample.txt through the standalone binary (kaleido-lite.sh, one process per figure),
# to <dir>/<name>.png; prints the binary's timing and the wall time. PAGE_CSS=1 adds the page stylesheet rules (screenshot references).
# 700x500 like the Chrome references (the binary would use the mock's layout size). Further arguments go to the binary: ./qjs-mocks.sh out/mocks --plotly 2.35.2
cd "$(dirname "$0")"
TIMEFORMAT=%R
while read -r n; do
  { time ./kaleido-lite.sh "plotly-src/test/image/mocks/$n.json" "$1/$n.png" 700 500 "${@:2}" 2>&1 | grep -v Warning | sed "s|^|$n: |"; } 2>&1 | paste -sd' ' -
done < "$1/sample.txt"
