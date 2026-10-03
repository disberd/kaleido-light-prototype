#!/bin/sh
# Plot DOM after rendering in real headless Chrome: ./chrome-dom.sh figs/x.json > x.chrome.html
# MATHJAX=1 also loads MathJax 3 first (as chrome-toimage.sh).
FIG=$1; HTML=$(mktemp -t ref).html; PROFILE=$(mktemp -d); DOM=$(mktemp)
cat > "$HTML" <<HTML
<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;overflow:hidden"><div id="gd"></div>
${MATHJAX:+<script src="file://$PWD/node_modules/mathjax/es5/tex-svg.js"></script>}
<script src="file://${PLOTLY:-$PWD/node_modules/plotly.js-dist/plotly.js}"></script>
<script>const fig = $(cat "$FIG"); (window.MathJax?.startup?.promise || Promise.resolve()).then(() => Plotly.newPlot(gd, fig.data, {...fig.layout, width: 700, height: 500}, {...fig.config, staticPlot: true, topojsonURL: "file://$PWD/node_modules/sane-topojson/dist/"}));</script></body></html>
HTML
# MathJax keeps headless Chrome from exiting after --dump-dom: wait for the dump, then stop it.
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --user-data-dir="$PROFILE" \
  --allow-file-access-from-files --window-size=700,500 --virtual-time-budget=3000 --dump-dom "file://$HTML" > "$DOM" 2>/dev/null &
PID=$!
for _ in $(seq 60); do grep -q '</html>' "$DOM" && break; sleep 0.5; done
kill $PID 2>/dev/null; wait $PID 2>/dev/null
cat "$DOM"
rm -rf "$PROFILE" "$HTML" "$DOM"
