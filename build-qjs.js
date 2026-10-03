// bun build-qjs.js: QuickJS bundle out/kaleido-lite.mjs, with headless-gl's JS layer on top of qjs:webgl,
// then the standalone out/kaleido-lite-bin (native/kl-qjs, see native/build.sh) with ANGLE and topojson/ next to it.
import { $ } from "bun";
const r = await Bun.build({
  entrypoints: ["qjs-entry.js"], outdir: "out", naming: "kaleido-lite.mjs", format: "esm", target: "browser",
  minify: true, external: ["canvas", "qjs:*"],
  plugins: [{ name: "qjs-webgl", setup(b) { b.onResolve({ filter: /\/native-gl$/ }, () => ({ path: import.meta.dir + "/gl-native-qjs.js" })); } }],
});
if (!r.success) throw new AggregateError(r.logs, "bun build failed");
await $`native/kl-qjs -c out/kaleido-lite.mjs -o out/kaleido-lite-bin && cp angle/* out/ && mkdir -p out/topojson && cp node_modules/sane-topojson/dist/*.json out/topojson/`;
