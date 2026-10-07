// QuickJS entry: figure JSON -> SVG with no Node and no browser. Bundle with bun as ESM, run with `qjs -m`.
// Usage: kaleido-lite fig.json out.svg [width] [height] [scale] [--plotly <plotly.js file | version>]
import * as std from "qjs:std";
import * as os from "qjs:os";
import * as bjson from "qjs:bjson";
import { pngDataURL, fixPixels } from "qjs:webgl";
globalThis.setTimeout ??= os.setTimeout;
globalThis.clearTimeout ??= os.clearTimeout;
// Plotly.Lib.warn logs through console.trace, which QuickJS lacks.
console.trace ??= (...a) => std.err.puts(a.join(" ") + "\n");
// Built at plotly load time (map/WebGL deps); only UTF-8 is ever asked for.
globalThis.TextDecoder ??= class TextDecoder {
  decode(b = new Uint8Array()) {
    const u = ArrayBuffer.isView(b) ? new Uint8Array(b.buffer, b.byteOffset, b.byteLength) : new Uint8Array(b);
    let s = "";
    for (let i = 0; i < u.length; ) {
      let c = u[i++];
      if (c > 127) {
        const n = c >= 240 ? 3 : c >= 224 ? 2 : 1;
        c &= 63 >> n;
        for (let j = 0; j < n; j++) c = (c << 6) | (u[i++] & 63);
      }
      s += String.fromCodePoint(c);
    }
    return s;
  }
};
const t0 = Date.now();
const { parseHTML } = require("linkedom");
const { installShim, MAC_FONTS, patchPlotly, settle3D, exportOpts } = require("./shim.js");
const SUP = "/System/Library/Fonts/Supplemental/";
function readBin(p) {
  const f = std.open(p, "rb");
  f.seek(0, std.SEEK_END);
  const b = new ArrayBuffer(f.tell());
  f.seek(0, std.SEEK_SET);
  f.read(b, 0, b.byteLength);
  f.close();
  return b;
}
const fonts = Object.fromEntries(Object.entries(MAC_FONTS).map(([fam, vs]) => [fam, Object.fromEntries(Object.entries(vs).map(([k, f]) => [k, readBin(SUP + f)]))]));
const { window, document } = parseHTML("<!doctype html><html><head></head><body></body></html>");
// WebGL: headless-gl's JS layer on the built-in qjs:webgl module (ANGLE next to the binary), which also
// encodes canvas PNGs.
const createWebGL = require("gl/src/javascript/node-index.js");
// Geo topojson from topojson/ next to the binary, by file name (plotly's default topojsonURL is a CDN).
const exeDir = os.exePath().replace(/[\\/][^\\/]*$/, "");
const readFile = (url) => std.loadFile(`${exeDir}/topojson/${url.split("/").pop()}`);
const { finishSVG } = installShim(window, fonts, { createWebGL, pngDataURL, fixPixels, readFile });
globalThis.window = globalThis.self = window;
for (const k of ["document", "Element", "HTMLElement", "SVGElement", "Node", "DOMParser", "XMLSerializer", "XMLHttpRequest", "HTMLCanvasElement", "Image", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame", "matchMedia"]) globalThis[k] = window[k];

// A `qjs -c` standalone binary gets only the user arguments; `qjs script.mjs` also passes the script name.
const args = scriptArgs[0].endsWith(".mjs") ? scriptArgs.slice(1) : scriptArgs.slice();
const pi = args.indexOf("--plotly"), plotlyArg = pi >= 0 ? args.splice(pi, 2)[1] : null;
const [figPath, out, w, h, s] = args;

// --plotly: a plotly.js bundle (any release, minified or not) instead of the built-in one, patched like it
// (patchPlotly). A version number is fetched from cdn.plot.ly once (curl, which macOS, Windows 10+ and most Linux
// have). Compiling takes ~0.5 s in QuickJS, so the compiled bytecode is cached per file and binary (~45 ms to
// load). Cache: $KL_CACHE, else %LOCALAPPDATA%\kaleido-lite or $XDG_CACHE_HOME (~/.cache)/kaleido-lite.
// ponytail: stale bytecode of older binaries stays in the cache.
function cacheDir() {
  const env = std.getenv, dir = env("KL_CACHE") || (env("LOCALAPPDATA") ? `${env("LOCALAPPDATA")}/kaleido-lite` : `${env("XDG_CACHE_HOME") || `${env("HOME")}/.cache`}/kaleido-lite`);
  for (let i = 1; i <= dir.length; i++) if (i === dir.length || "/\\".includes(dir[i])) os.mkdir(dir.slice(0, i));
  return dir;
}
function loadPlotly(arg) {
  try { return loadRelease(arg); } catch (e) { std.err.puts(`kaleido-lite: --plotly ${arg}: ${e.message}\n`); std.exit(1); }
}
function loadRelease(arg) {
  let file = arg;
  if (/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(arg) && os.stat(arg)[1]) {
    file = `${cacheDir()}/plotly-${arg}.min.js`;
    if (os.stat(file)[1]) {
      const p = std.popen(`curl -sfL -o "${file}.part" "https://cdn.plot.ly/plotly-${arg}.min.js"`, "r");
      p.readAsString();
      p.close();
      if (std.loadFile(`${file}.part`) == null) throw new Error("download from cdn.plot.ly failed");
      os.rename(`${file}.part`, file);
    }
  }
  const [st, err] = os.stat(file);
  if (err) throw new Error(`cannot read ${file}`);
  const ex = os.stat(os.exePath())[0], id = (s) => `${s.size}-${Math.round(s.mtime)}`;
  const bc = `${cacheDir()}/${file.split(/[\\/]/).pop()}-${id(st)}-${id(ex)}.qbc`;
  let fn = null;
  const f = std.open(bc, "rb");
  if (f) try { const b = new ArrayBuffer(os.stat(bc)[0].size); f.read(b, 0, b.byteLength); fn = bjson.read(b, 0, b.byteLength, bjson.READ_OBJ_BYTECODE); } catch { fn = null; } finally { f.close(); }
  if (!fn) {
    const r = patchPlotly(std.loadFile(file));
    if (!r.patched) std.err.puts(`kaleido-lite: ${file}: vectorize-text not found, 3D text is traced from pixels (slow)\n`);
    fn = std.evalScript(r.src, { compile_only: true });
    const out = std.open(`${bc}.part`, "wb");
    if (out) { const b = bjson.write(fn, bjson.WRITE_OBJ_BYTECODE | bjson.WRITE_OBJ_STRIP_SOURCE); out.write(b, 0, b.byteLength); out.close(); os.rename(`${bc}.part`, bc); }
  }
  std.evalScript(fn, { eval_function: true });
  const P = globalThis.Plotly || window.Plotly; // 4.x sets only window.Plotly
  if (!P?.newPlot) throw new Error(`${file} did not define Plotly`);
  return P;
}

const t1 = Date.now();
const Plotly = plotlyArg ? loadPlotly(plotlyArg) : require("plotly.js-dist-min");
const t2 = Date.now();
const fig = JSON.parse(std.loadFile(figPath));
const { width, height, scale, config } = exportOpts(fig, { width: w, height: h, scale: s });
const gd = document.createElement("div");
gd.setAttribute("style", `width:${width}px;height:${height}px`);
document.body.appendChild(gd);
Plotly.newPlot(gd, fig.data, { ...fig.layout, width, height }, config).then(() => {
  settle3D(gd);
  const svg = finishSVG(Plotly.Snapshot.toSVG(gd, "svg", scale), { pageCss: std.getenv("PAGE_CSS") === "1" });
  const f = std.open(out, "w");
  f.puts(svg);
  f.close();
  std.err.puts(`setup ${t1 - t0} ms, plotly load ${t2 - t1} ms, plot+svg ${Date.now() - t2} ms -> ${out}\n`);
}).catch((e) => {
  std.err.puts(e + "\n" + e.stack + "\n");
  std.exit(1);
});

