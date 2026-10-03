// bun build-qjs.js: QuickJS bundle out/kaleido-lite.mjs, with headless-gl's JS layer on top of qjs:webgl,
// then the standalone out/kaleido-lite-bin (native/kl-qjs, see native/build.sh) with ANGLE and topojson/ next to it.
// --mathjax: out/kaleido-lite-mathjax-bin instead, which loads MathJax 3 before plotly (spike, mathjax-setup.js).
// The binary embeds plotly.js-dist-min; `--plotly <file|version>` loads another release at run time (qjs-entry.js).
import { $ } from "bun";
import { patchPlotly } from "./shim.js";
const mathjax = process.argv.includes("--mathjax");
const name = mathjax ? "kaleido-lite-mathjax" : "kaleido-lite";
// The built-in plotly gets the same patch as a --plotly file (shim.js patchPlotly: 3D text from glyph outlines).
const plugins = [{ name: "qjs-webgl", setup(b) {
  b.onResolve({ filter: /\/native-gl$/ }, () => ({ path: import.meta.dir + "/gl-native-qjs.js" }));
  b.onLoad({ filter: /plotly\.js-dist-min\/plotly\.min\.js$/ }, async (a) => {
    const r = patchPlotly(await Bun.file(a.path).text());
    if (!r.patched) throw new Error("plotly patch: vectorize-text's processPixels not found");
    return { loader: "js", contents: r.src };
  });
} }];
if (mathjax) plugins.push({ name: "mathjax", setup(b) {
  b.onLoad({ filter: /qjs-entry\.js$/ }, async (a) => ({ loader: "js", contents: (await Bun.file(a.path).text()).replace(
    'const Plotly = plotlyArg ? loadPlotly(plotlyArg) : require("plotly.js-dist-min");',
    'import mjSrc from "mathjax/es5/tex-svg.js" with { type: "text" };\nawait require("./mathjax-setup.js")(window, mjSrc);\n$&') }));
} });
const r = await Bun.build({
  entrypoints: ["qjs-entry.js"], outdir: "out", naming: `${name}.mjs`, format: "esm", target: "browser",
  minify: true, external: ["canvas", "qjs:*"], plugins,
});
if (!r.success) throw new AggregateError(r.logs, "bun build failed");
await $`native/kl-qjs -c out/${name}.mjs -o out/${name}-bin && cp angle/* out/ && mkdir -p out/topojson && cp node_modules/sane-topojson/dist/*.json out/topojson/`;
