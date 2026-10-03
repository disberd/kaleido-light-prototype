#!/bin/sh
# Reference render in real headless Chrome: ./chrome-ref.sh figs/x.json out/x.chrome.png
FIG=$1; OUT=$2; HTML=$(mktemp -t ref).html; PROFILE=$(mktemp -d)
cat > "$HTML" <<HTML
<!doctype html><html><body style="margin:0;overflow:hidden"><div id="gd"></div>
<script src="file://$PWD/node_modules/plotly.js-dist/plotly.js"></script>
<script>const fig = $(cat "$FIG"); Plotly.newPlot(gd, fig.data, {...fig.layout, width: 700, height: 500}, {...fig.config, staticPlot: true, topojsonURL: "file://$PWD/node_modules/sane-topojson/dist/"});</script></body></html>
HTML
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new ${GL_FLAGS:---disable-gpu} --hide-scrollbars --force-device-scale-factor=1 \
  --user-data-dir="$PROFILE" --allow-file-access-from-files --window-size=700,500 --virtual-time-budget=3000 --screenshot="$PWD/$OUT" "file://$HTML" 2>/dev/null &
PID=$!; rm -f "$OUT"
# headless Chrome on macOS may not exit after --screenshot: wait for the file, then kill it.
for _ in $(seq 40); do [ -s "$OUT" ] && sleep 0.5 && break; sleep 0.5; done
kill $PID 2>/dev/null; wait $PID 2>/dev/null
rm -rf "$PROFILE" "$HTML"
