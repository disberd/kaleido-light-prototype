// QuickJS entry: figure JSON -> SVG with no Node and no browser. Bundle with bun as ESM, run with `qjs -m`.
// Usage: kaleido-lite fig.json out.svg [width] [height] [scale]
import * as std from "qjs:std";
import * as os from "qjs:os";
import { pngDataURL } from "qjs:webgl";
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
const { installShim, MAC_FONTS } = require("./shim.js");
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
const { finishSVG } = installShim(window, fonts, { createWebGL, pngDataURL, readFile });
globalThis.window = globalThis.self = window;
for (const k of ["document", "Element", "HTMLElement", "SVGElement", "Node", "DOMParser", "XMLSerializer", "XMLHttpRequest", "HTMLCanvasElement", "Image", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame", "matchMedia"]) globalThis[k] = window[k];
const t1 = Date.now();
const Plotly = require("plotly.js-dist-min");
const t2 = Date.now();

// A `qjs -c` standalone binary gets only the user arguments; `qjs script.mjs` also passes the script name.
const [figPath, out, w, h, s] = scriptArgs[0].endsWith(".mjs") ? scriptArgs.slice(1) : scriptArgs;
const fig = JSON.parse(std.loadFile(figPath));
const width = +w || 700, height = +h || 500;
const gd = document.createElement("div");
gd.setAttribute("style", `width:${width}px;height:${height}px`);
document.body.appendChild(gd);
Plotly.newPlot(gd, fig.data, { ...fig.layout, width, height }, { ...fig.config, staticPlot: true }).then(() => {
  const svg = finishSVG(Plotly.Snapshot.toSVG(gd, "svg", +s || 1), { pageCss: std.getenv("PAGE_CSS") !== "0" });
  const f = std.open(out, "w");
  f.puts(svg);
  f.close();
  std.err.puts(`setup ${t1 - t0} ms, plotly load ${t2 - t1} ms, plot+svg ${Date.now() - t2} ms -> ${out}\n`);
}, (e) => std.err.puts(e + "\n" + e.stack + "\n"));

