#!/bin/sh
# Plot DOM after rendering in real headless Chrome: ./chrome-dom.sh figs/x.json > x.chrome.html
FIG=$1; HTML=$(mktemp -t ref).html; PROFILE=$(mktemp -d)
cat > "$HTML" <<HTML
<!doctype html><html><body style="margin:0;overflow:hidden"><div id="gd"></div>
<script src="file://$PWD/node_modules/plotly.js-dist/plotly.js"></script>
<script>const fig = $(cat "$FIG"); Plotly.newPlot(gd, fig.data, {...fig.layout, width: 700, height: 500}, {...fig.config, staticPlot: true, topojsonURL: "file://$PWD/node_modules/sane-topojson/dist/"});</script></body></html>
HTML
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --user-data-dir="$PROFILE" \
  --allow-file-access-from-files --window-size=700,500 --virtual-time-budget=3000 --dump-dom "file://$HTML" 2>/dev/null
rm -rf "$PROFILE" "$HTML"
