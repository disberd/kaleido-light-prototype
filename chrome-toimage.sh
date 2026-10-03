#!/bin/sh
# Reference PNG from Plotly.toImage inside real headless Chrome (GPU WebGL): ./chrome-toimage.sh figs/x.json out/x.chrome.png
FIG=$1; OUT=$2; HTML=$(mktemp -t ref).html; PROFILE=$(mktemp -d); DOM=$(mktemp)
cat > "$HTML" <<HTML
<!doctype html><html><body style="margin:0"><div id="gd"></div>
<script src="file://$PWD/node_modules/plotly.js-dist/plotly.js"></script>
<script>const fig = $(cat "$FIG");
Plotly.newPlot(gd, fig.data, {...fig.layout, width: 700, height: 500}, {...fig.config, topojsonURL: "file://$PWD/node_modules/sane-topojson/dist/"})
  .then(() => Plotly.toImage(gd, {format: "png", width: 700, height: 500}))
  .then((u) => { const p = document.createElement("pre"); p.id = "png"; p.textContent = u; document.body.append(p); })
  .catch((e) => { const p = document.createElement("pre"); p.id = "err"; p.textContent = String(e); document.body.append(p); });</script></body></html>
HTML
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --enable-gpu --ignore-gpu-blocklist --user-data-dir="$PROFILE" \
  --allow-file-access-from-files --window-size=700,500 --virtual-time-budget=10000 --dump-dom "file://$HTML" > "$DOM" 2>/dev/null &
PID=$!
for _ in $(seq 60); do grep -q '</html>' "$DOM" && break; sleep 0.5; done
kill $PID 2>/dev/null; wait $PID 2>/dev/null
node -e 'const s=require("fs").readFileSync(process.argv[1],"utf8");const m=s.match(/<pre id="png">data:image\/png;base64,([^<]*)/);
if(!m){console.error("no png: "+(s.match(/<pre id="err">([^<]*)/)||[,"timeout"])[1]);process.exit(1)}require("fs").writeFileSync(process.argv[2],Buffer.from(m[1],"base64"))' "$DOM" "$OUT"
rm -rf "$PROFILE" "$HTML" "$DOM"
