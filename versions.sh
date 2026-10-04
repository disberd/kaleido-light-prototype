#!/bin/bash
# Release matrix: the 2D and WebGL mock samples (out/mocks, out/gl) through the binary with --plotly <release>, and
# Chrome references made with that same release file; scores in out/versions/<release>/{mocks,gl}/scores.txt.
# Usage: ./versions.sh 1.58.5 2.35.2 3.3.1 4.1.1   (plotly-<release>.min.js from cdn.plot.ly, kept in out/versions)
cd "$(dirname "$0")"
M=plotly-src/test/image/mocks
for v in "$@"; do
  f=$PWD/out/versions/plotly-$v.min.js
  mkdir -p out/versions && { [ -s "$f" ] || curl -sfLo "$f" "https://cdn.plot.ly/plotly-$v.min.js"; } || { echo "$v: download failed"; continue; }
  for d in mocks gl; do
    o=out/versions/$v/$d; mkdir -p "$o"; cp "out/$d/sample.txt" "$o/"
    if [ $d = gl ]; then
      ./qjs-mocks.sh "$o" --plotly "$f" > "$o/run.log"
      while read -r n; do PLOTLY=$f ./chrome-toimage.sh "$M/$n.json" "$o/$n.chrome.png" || true; done < "$o/sample.txt"
    else
      PAGE_CSS=1 ./qjs-mocks.sh "$o" --plotly "$f" > "$o/run.log"
      while read -r n; do PLOTLY=$f ./chrome-ref.sh "$M/$n.json" "$o/$n.chrome.png"; done < "$o/sample.txt"
    fi
    OUT=$o xargs node compare.js < "$o/sample.txt" > "$o/scores.txt"
    echo "$v $d: $(node -e 'const v=require("fs").readFileSync(process.argv[1],"utf8").trim().split("\n").map(l=>parseFloat(l.split(": ")[1])),ok=v.filter(x=>!isNaN(x)).sort((a,b)=>a-b);console.log(`${ok.length}/${v.length} rendered, median ${ok[ok.length>>1]?.toFixed(2)}%, within 2%: ${ok.filter(x=>x<=2).length}`)' "$o/scores.txt")"
  done
done
