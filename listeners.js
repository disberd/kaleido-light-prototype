// Runs the package's own JS core (lib/*.js, unmodified) headless with user listeners, then snapshots.
// The adapter below is what a "HeadlessHost" would add next to plain_adapter.js.
const fs = require("fs");
const { snapshot, toPng, Plotly, window, document } = require("./render.js");
const lib = (f) => fs.readFileSync(`${__dirname}/../../lib/${f}`, "utf8");
window.ResizeObserver = globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };

const plot_obj = { data: [{ type: "bar", x: ["a", "b", "c"], y: [3, 1, 2] }], layout: { width: 600, height: 400, title: { text: "Original title" } }, config: {} };
// Same shape as write_listeners in src/show.jl: function source pasted into an object literal.
const plotly_listeners = `{"plotly_afterplot": [function(e) {
  PLOT.querySelectorAll(".xtick text").forEach((t) => (t.style.fill = "red"));
}]}`;
const js_listeners = `{"mousedown": [function(e) { console.log("never fires headless") }]}`;
const user_script = `setTimeout(() => Plotly.relayout(PLOT, { "title.text": "Retitled by push_script!", "plot_bgcolor": "#eef" }))`;
const headless_adapter = `
const { container: CONTAINER } = renderPlot({ plot_obj, Plotly, css, plotly_listeners, js_listeners });
const PLOT = CONTAINER.PLOT;
document.body.appendChild(CONTAINER);`;

const src = [
  `const plot_obj = ${JSON.stringify(plot_obj)}`,
  `const plotly_listeners = ${plotly_listeners}`,
  `const js_listeners = ${js_listeners}`,
  lib("html.js"), lib("container.js"), lib("clipboard.js"), lib("resizer.js"),
  "const css = `" + lib("container.css") + "`",
  headless_adapter,
  user_script,
  "return CONTAINER",
].join("\n;\n");

(async () => {
  const CONTAINER = new Function("Plotly", "document", "window", src)(Plotly, document, window);
  await new Promise((r) => setTimeout(r, 100)); // ponytail: fixed settle time; a real host would await a "ready" signal
  const svg = snapshot(CONTAINER.PLOT);
  fs.writeFileSync("out/listeners.png", toPng(svg));
  console.log("title:", svg.match(/class="gtitle"[^>]*>([^<]*)/)?.[1], "| red ticks:", (svg.match(/fill:\s*red/g) || []).length);
})().catch((e) => { console.error(e); process.exit(1); });
