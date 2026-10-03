#!/bin/bash
# The mocks listed in <dir>/sample.txt through the standalone binary (kaleido-lite.sh, one process per figure),
# to <dir>/<name>.png; prints the binary's timing and the wall time. PAGE_CSS=0 renders like Plotly.toImage.
cd "$(dirname "$0")"
TIMEFORMAT=%R
while read -r n; do
  { time ./kaleido-lite.sh "plotly-src/test/image/mocks/$n.json" "$1/$n.png" 2>&1 | grep -v Warning | sed "s|^|$n: |"; } 2>&1 | paste -sd' ' -
done < "$1/sample.txt"
