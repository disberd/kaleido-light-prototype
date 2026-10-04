// Kaleido-lite prototype: plotly figure JSON -> SVG/PNG without a browser.
// Usage: node render.js fig.json out.(svg|png) [width] [height] [scale]
// fig.json: { data, layout, config?, plotly_listeners?, js_listeners?, scripts? }; listeners are JS function source.
const fs = require("fs");
const path = require("path");
const { parseHTML } = require("linkedom");
const { Resvg } = require("@resvg/resvg-js");
const { installShim, MAC_FONTS, patchPlotly, settle3D, exportOpts } = require("./shim.js");

const SUP = "/System/Library/Fonts/Supplemental/";
const FONT_FILES = MAC_FONTS;
const fontPaths = Object.values(FONT_FILES).flatMap((v) => Object.values(v).map((f) => SUP + f));
const fontBuffers = Object.fromEntries(
  Object.entries(FONT_FILES).map(([fam, vs]) => [fam, Object.fromEntries(Object.entries(vs).map(([k, f]) => {
    const b = fs.readFileSync(SUP + f);
    return [k, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)];
  }))])
);

const { window, document } = parseHTML("<!doctype html><html><head></head><body></body></html>");
// ponytail: map every URL to a bundled topojson file by name (plotly's default topojsonURL points at a CDN).
const TOPO = path.join(__dirname, "node_modules/sane-topojson/dist/");
const readFile = (url) => (fs.existsSync(TOPO + path.basename(url)) ? fs.readFileSync(TOPO + path.basename(url), "utf8") : null);
// WebGL traces need headless-gl (npm "gl", native ANGLE build); without it they render blank.
// The ANGLE bundled with headless-gl hands user names straight to desktop GLSL, where `texture` is a built-in
// function, so gl-mesh3d's `uniform sampler2D texture` fails to compile. GLSL ES 1.0 has no `texture`: rename it.
let createWebGL = null;
try {
  const createGL = require("gl");
  createWebGL = (w, h, attrs) => {
    const gl = createGL(w, h, attrs);
    const shaderSource = gl?.shaderSource.bind(gl);
    if (gl) gl.shaderSource = (sh, src) => shaderSource(sh, src.replace(/\btexture\b/g, "kl_texture"));
    return gl;
  };
} catch {}
const { finishSVG } = installShim(window, fontBuffers, { readFile, createWebGL });
globalThis.window = globalThis.self = window;
for (const k of ["document", "Element", "HTMLElement", "SVGElement", "Node", "DOMParser", "XMLSerializer", "HTMLCanvasElement", "Image", "XMLHttpRequest", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame", "matchMedia"]) {
  globalThis[k] = window[k];
}
let t0 = performance.now();
// With the QuickJS binary's patch (shim.js patchPlotly: 3D text from glyph outlines).
const Plotly = (() => {
  const m = { exports: {} };
  new Function("module", "exports", patchPlotly(fs.readFileSync(require.resolve("plotly.js-dist"), "utf8")).src)(m, m.exports);
  return m.exports;
})();
const tLoad = performance.now() - t0;

async function render(fig, { pageCss = false, ...opts } = {}) {
  const { width, height, scale, config } = exportOpts(fig, opts);
  const gd = document.createElement("div");
  gd.setAttribute("style", `width:${width}px;height:${height}px`);
  document.body.appendChild(gd);
  const layout = { ...fig.layout, width, height };
  await Plotly.newPlot(gd, fig.data, layout, config);
  // Listeners get PLOT and Plotly in scope, like in the package's plain adapter (lib/container.js).
  const fn = (src) => new Function("PLOT", "Plotly", "return (" + src + ")")(gd, Plotly);
  for (const [ev, srcs] of Object.entries(fig.plotly_listeners || {})) for (const s of srcs) gd.on(ev, fn(s));
  for (const [ev, srcs] of Object.entries(fig.js_listeners || {})) for (const s of srcs) gd.addEventListener(ev, fn(s));
  for (const s of fig.scripts || []) await new Function("PLOT", "Plotly", s)(gd, Plotly);
  await new Promise((r) => setTimeout(r, 0)); // let listener promises and timers settle
  // Snapshot the live div (not Plotly.toImage, which replots a clone) so DOM edits by listeners survive.
  const svg = snapshot(gd, scale, pageCss);
  Plotly.purge(gd);
  gd.remove();
  return svg;
}

const snapshot = (gd, scale = 1, pageCss = false) => (settle3D(gd), finishSVG(Plotly.Snapshot.toSVG(gd, "svg", scale), { pageCss }));
const toPng = (svg) => new Resvg(svg, { font: { fontFiles: fontPaths, loadSystemFonts: false, defaultFontFamily: "Arial" } }).render().asPng();

async function main() {
  const [figPath, out, w, h, s] = process.argv.slice(2);
  const fig = JSON.parse(fs.readFileSync(figPath, "utf8"));
  const opts = { width: w, height: h, scale: s, pageCss: process.env.PAGE_CSS === "1" };
  t0 = performance.now();
  const svg = await render(fig, opts);
  const tPlot = performance.now() - t0;
  if (out.endsWith(".svg")) fs.writeFileSync(out, svg);
  else {
    t0 = performance.now();
    fs.writeFileSync(out, toPng(svg));
    console.error(`raster ${(performance.now() - t0).toFixed(0)} ms`);
  }
  console.error(`plotly load ${tLoad.toFixed(0)} ms, plot+svg ${tPlot.toFixed(0)} ms -> ${path.basename(out)}`);
}

module.exports = { render, snapshot, toPng, finishSVG, Plotly, window, document };
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
