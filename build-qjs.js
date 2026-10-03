// bun build-qjs.js: QuickJS bundle out/kaleido-lite.mjs, with headless-gl's JS layer on top of qjs:webgl,
// then the standalone out/kaleido-lite-bin (native/kl-qjs, see native/build.sh) with ANGLE and topojson/ next to it.
// --mathjax: out/kaleido-lite-mathjax-bin instead, which loads MathJax 3 before plotly (spike, mathjax-setup.js).
import { $ } from "bun";
const mathjax = process.argv.includes("--mathjax");
const name = mathjax ? "kaleido-lite-mathjax" : "kaleido-lite";
// 3D text: vectorize-text triangulates the glyph outlines shim.js recorded while drawing the label, instead of
// tracing its pixels and cleaning the contour with exact rational arithmetic (most of a 3D scene's time in QuickJS).
// Triangles per glyph (cdt2d), or the outline edges (gl-scatter3d asks for both). Falls back to tracing for
// polygons, when there are no outlines (a crossing glyph) or when the triangulation throws.
const VT = "function processPixelsImpl(pixels, options, size, simplify2) {";
const outlines = `${VT}
  const g = pixels.data.glyphs;
  if (g && !(options.polygons || options.polygon || options.polyline)) try {
    const positions = transformPositions(g.flat(2).map(([x, y]) => [x - 0.5, y - 0.5]), options, size), cells = [], edges = [];
    const tri = options.triangles || options.triangulate || options.triangle;
    let o = 0;
    for (const cs of g) {
      const n0 = o, local = [];
      for (const c of cs) { for (let i = 0; i < c.length; i++) local.push([o - n0 + i, o - n0 + ((i + 1) % c.length)]); o += c.length; }
      if (tri) for (const t of cdt2d(positions.slice(n0, o), local, { delaunay: false, exterior: false, interior: true })) cells.push(t.map((i) => i + n0));
      else for (const [a, b] of local) edges.push([a + n0, b + n0]);
    }
    return tri ? { cells, positions } : { edges, positions };
  } catch {}`;
// 3D snapshot: turntable mode (plotly's default) eases the camera's up vector over 500 ms, and a frame shows the
// camera as it was 32 ms earlier, so a snapshot within ~530 ms of creating the scene caught it mid-ease, differently
// on every run. Chrome's snapshots show it settled: drop all but the camera's last keyframe before the snapshot.
const SNAP = "if (scene.staticMode) scene.container.appendChild(STATIC_CANVAS);\n        scene.glplot.redraw();";
const plugins = [{ name: "qjs-webgl", setup(b) {
  b.onResolve({ filter: /\/native-gl$/ }, () => ({ path: import.meta.dir + "/gl-native-qjs.js" }));
  b.onLoad({ filter: /plotly\.js-dist\/plotly\.js$/ }, async (a) => {
    const s = await Bun.file(a.path).text();
    if (!s.includes(VT) || !s.includes(SNAP)) throw new Error("plotly patch: anchor not found");
    return { loader: "js", contents: s.replace(VT, outlines).replace(SNAP, SNAP.replace("scene.glplot.redraw();", "scene.glplot.camera.view.flush(Infinity);\n        $&")) };
  });
} }];
if (mathjax) plugins.push({ name: "mathjax", setup(b) {
  b.onLoad({ filter: /qjs-entry\.js$/ }, async (a) => ({ loader: "js", contents: (await Bun.file(a.path).text()).replace(
    'const Plotly = require("plotly.js-dist");',
    'import mjSrc from "mathjax/es5/tex-svg.js" with { type: "text" };\nawait require("./mathjax-setup.js")(window, mjSrc);\n$&') }));
} });
const r = await Bun.build({
  entrypoints: ["qjs-entry.js"], outdir: "out", naming: `${name}.mjs`, format: "esm", target: "browser",
  minify: true, external: ["canvas", "qjs:*"], plugins,
});
if (!r.success) throw new AggregateError(r.logs, "bun build failed");
await $`native/kl-qjs -c out/${name}.mjs -o out/${name}-bin && cp angle/* out/ && mkdir -p out/topojson && cp node_modules/sane-topojson/dist/*.json out/topojson/`;
