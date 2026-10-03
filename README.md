# kaleido-lite prototype

Static export of plotly.js figures without a browser: plotly.js runs in a light DOM (linkedom), a
shim answers the few layout questions plotly asks, plotly serializes its own SVG, and resvg
rasterizes it. WebGL traces draw through ANGLE (headless-gl in Node, `native/webgl.c` in the QuickJS binary). No MathJax.

Throwaway prototype for a Kaleido replacement in [PlotlyBaseExtras.jl](https://github.com/disberd/PlotlyBaseExtras.jl).
Each "Results" section below is one iteration.

## Setup (macOS arm64)

`./fetch-deps.sh` (ANGLE, resvg, plotly.js mocks), `npm install --ignore-scripts`, headless-gl as below (Node
WebGL only), then `native/build.sh` and `bun build-qjs.js` for the standalone binary. `listeners.js` reads
PlotlyBaseExtras' `lib/*.js` from `../../lib`, so it needs this repo at `PlotlyBaseExtras/.scratch/kaleido-lite`.
Chrome references (`out/**/*.chrome.png`) are not in git: regenerate them with the `chrome-*.sh` scripts.

## Files

- `shim.js`: the layout shims. `getBoundingClientRect` / `getBBox` from font metrics (opentype.js)
  and SVG geometry, `getComputedStyle`, path length, a pixel-only canvas 2D with a PNG encoder
  (heatmap and image traces), `XMLHttpRequest` served from local files (geo topojson), and two
  linkedom fixes (SVG `nodeName` case, empty style values).
- `render.js`: Node driver and CLI. `node render.js fig.json out.png|out.svg [w] [h] [scale]`.
- `qjs-entry.js`: the same pipeline for QuickJS (SVG out), WebGL included. Build: `native/build.sh` (once), then
  `bun build-qjs.js`: bundles `out/kaleido-lite.mjs` and compiles it into `out/kaleido-lite-bin`, with ANGLE
  (`angle/`) and the geo topojson files copied next to it.
- `native/`: `webgl.c` is the `qjs:webgl` module, headless-gl's native layer ported to the QuickJS C API (same
  131 methods), on ANGLE loaded at run time from the binary's directory (`KL_ANGLE_DIR` overrides). It also
  encodes canvas PNGs (`pngDataURL`, deflated with the vendored `stb_image_write.h`). `build.sh` builds `kl-qjs`,
  quickjs-ng 0.17.0's `qjs` with that module built in. `include/` holds the Khronos/ANGLE headers.
  `gl-constants.json` holds the GL constants dumped from headless-gl's Node build. `node native/selftest.js`
  checks a clear/readback and the PNG encoder against shim.js's.
- `gl-native-qjs.js`: headless-gl's `native-gl.js` for QuickJS; `build-qjs.js` swaps it in, so headless-gl's JS
  layer (validation, objects, extensions) runs unchanged on `qjs:webgl`.
- `KL_ANGLE`: ANGLE backend, `swiftshader` (default: CPU Vulkan, no GPU, same code on every OS), `metal`,
  `d3d11`, `vulkan`, `gl`, `default`.
- `kaleido-lite.sh`: no Node, no Chrome: `out/kaleido-lite-bin` (figure to SVG) plus `bin/resvg`.
  `qjs-mocks.sh dir` runs the mocks of `dir/sample.txt` through it, one process per figure.
- `listeners.js`: runs the package's own `lib/*.js` core unmodified with a plotly listener and a
  `push_script!` snippet, then snapshots the live plot.
- WebGL in Node: `render.js` loads headless-gl (npm `gl`) when installed and the shim hands its WebGL 1
  context to plotly; plotly reads it back into the SVG as `<image>`s (2D traces through `toDataURL`, 3D scenes
  through `readPixels`). 3D axis text needs canvas `fillText`, which the shim rasterizes from opentype outlines.
- `render(fig, { pageCss })`: `true` (default) also applies the two rules of plotly's page stylesheet that change
  pixels (`.crisp` axis lines, link colour), like the plot on screen. `false` matches `Plotly.toImage` and Kaleido,
  which rasterize the bare SVG. `PAGE_CSS=0 node mocks.js dir` does the same for a mock run.
- Checks: `chrome-ref.sh` (screenshot of the plot in headless Chrome), `chrome-toimage.sh` (`Plotly.toImage`
  PNG from headless Chrome with GPU WebGL; use it for WebGL figures, the screenshot misses 3D scenes),
  `chrome-dom.sh` (Chrome's plot DOM, to compare coordinates), `compare.js` (side by side image and share of
  differing pixels), `diffmap.js` and `zoom.js` (where two renders differ), `coverage.js` (one figure per trace
  type), `mocks.js [dir]` (plotly.js test mocks listed in `dir/sample.txt`, from `plotly-src/`, a sparse clone
  of plotly.js v4.1.1), `selftest.js` (asserts for path length and the CSS pass).

### Building headless-gl on Node 26

No prebuilt binary exists for Node 26 and the build needs `python` and C++20:
`npm i gl --ignore-scripts`, set `'CLANG_CXX_LANGUAGE_STANDARD':'c++20'` in `node_modules/gl/binding.gyp`, then
`PATH=<dir with python -> python3>:$PATH npx node-gyp rebuild` inside `node_modules/gl` (about 10 minutes, ANGLE
from source). The result, `webgl.node`, is 2.4 MB with ANGLE linked in.

`angle/` holds ANGLE from Chromium 148 (Chrome for Testing's chrome-headless-shell, macOS arm64): `libEGL.dylib`,
`libGLESv2.dylib`, `libvk_swiftshader.dylib`, `vk_swiftshader_icd.json`.

`bin/` holds the resvg 0.48.1 CLI (the 2D-only binary of the first iteration used quickjs-ng 0.17.0's release `qjs`).
Fonts are the macOS system fonts in `/System/Library/Fonts/Supplemental/`.

## Results (2026-10-03, macOS arm64, plotly.js 4.1.1)

- Fidelity against headless Chrome with the same plotly.js file and fonts: layout matches; 0.4 to
  1.9% of pixels differ on the hand-made figures (text antialiasing, resvg against Skia).
- plotly.js test mocks: 80 of the 859 mocks without WebGL, map or MathJax, evenly spaced. All 80
  render. Median 0.89% differing pixels, 77/80 within 3%. Outliers come from CSS-only text
  features that resvg ignores: `text-transform`, `text-decoration-line`, `text-shadow`,
  `font-variant: small-caps` (plotly `font.textcase`, `lineposition`, `shadow`, `variant`).
- Trace types: the 2D ones render, including heatmap/image (canvas shim) and geo (local topojson).
  WebGL traces (scattergl, parcoords, splom, 3D, map subplots) do not.
- Size: `out/kaleido-lite-bin` 7.7 MB + `bin/resvg` 4.6 MB. Kaleido 0.2.1 artifact: 256 MB.
- Time: cold process, figure to PNG, 0.25 to 0.35 s (QuickJS + resvg). Kaleido 0.2.1: 4.3 s
  start, then ~37 ms per render. Warm Node process: ~30 ms per render.

## Results, CSS pass and WebGL (2026-10-03, later the same day)

- CSS pass in `finishSVG`: `text-transform` and small caps are written into the text (and measured that way),
  `text-decoration-line` becomes SVG `text-decoration`, `text-shadow` becomes a filter; with `pageCss`, `.crisp`
  gets `shape-rendering: crispEdges` and links get plotly's `#447adb`. Also fixed: path length now follows
  curves (contour labels sat at the wrong spot along their line).
- 2D mocks, same 80: median 0.88% -> 0.69% differing pixels, within 2%: 66 -> 74, within 3%: 77 -> 78. None got
  worse. sankey_energy 13.8% -> 5.3%. The crisp rule helps every figure with axes.
- WebGL: 28 mocks (every 9th gl2d/gl3d/splom/parcoords mock), compared with `Plotly.toImage` in Chrome
  (GPU, ANGLE on Metal) with `pageCss: false`. All 28 render. Median 0.91%, 21/28 within 2%. The rest is
  antialiasing of dense lines and wireframes (gl2d_line_limit 11.7%, parcoords 60 dims 10.6%) and 3D text.
- Shim fixes WebGL needed: canvas `width`/`height` reflect their attributes (plotly sizes GL canvases with
  `setAttribute`), the drawing buffer follows them, computed `font-size` is in px (to-px recursed forever),
  `clientWidth`/`clientHeight` from inline style (3D canvas size), canvas `font`/`measureText`/`fillText`
  (invalid font strings ignored like browsers, whitespace drawn as spaces), unmatched font family falls back
  to Times like Chrome, `texture` renamed in shaders (headless-gl's old ANGLE passes it to desktop GLSL).
- Time: 2D WebGL figures 0.1-0.7 s, most 3D 0.2-0.8 s, but 3D figures with much text take 2-4 s: plotly traces
  every 3D label's canvas pixels into geometry (bignum maths in vectorize-text).

## Results, WebGL in the standalone binary (2026-10-03, evening)

- `out/kaleido-lite-bin` now draws WebGL: headless-gl's JS layer on `qjs:webgl` on ANGLE (Chromium 148),
  SwiftShader backend. 28/28 WebGL mocks render, median 0.83% differing pixels against Chrome's
  `Plotly.toImage` (Node with headless-gl: 0.91%), 20/28 within 2% (Node: 21). The 2D sample still renders 80/80:
  median 0.65% (Node 0.69%), 74/80 within 2% (same as Node).
- Two transparency figures score lower on SwiftShader than in Node (`surface_opacity-and-opacityscale` 1.94% vs
  1.49%, `volume_opacityscale-iso` 2.08% vs 1.75%). The references come from Chrome on Metal: `KL_ANGLE=metal`
  gives 1.43% and 1.58% for these two.
- Fixes this needed, all in `native/webgl.c`: a WebGL compatibility context (`EGL_CONTEXT_WEBGL_COMPATIBILITY_ANGLE`,
  as Chrome; current ANGLE rejects plotly's non-constant global initializers in plain ES 2.0) with every
  requestable extension on, exactly ES 2.0, and unsized float textures sized (`RGBA`/`FLOAT` to `RGBA32F`), the
  only kind ANGLE can render to (gl-plot3d's transparency pass). headless-gl's `texture` rename is not needed.
  `qjs-entry.js` also gained `console.trace` (`Plotly.Lib.warn` used it and threw) and local topojson (geo used
  to fail).
- Time, cold process, figure to PNG: 2D median 0.34 s (p90 0.61 s); WebGL median 2.7 s, p90 6.2 s. Plotly's JS is
  3 to 30 times slower in QuickJS than in Node: `gl3d_font-weight-scatter` 128 s (Node 4.0 s),
  `gl3d_isosurface_math` 21 s (2.1 s), `gl3d_text-weirdness` 6.2 s (0.4 s). 3D text is the worst: plotly traces
  every label's canvas pixels into geometry with rational arithmetic (vectorize-text).
- Canvas PNGs are deflated in C: `gl2d_10`'s SVG went from 15 MB to 155 KB, and plotly's and `finishSVG`'s string
  passes over it from 1.3 s to 0.15 s. `finishSVG` also keeps `data:` URIs out of its DOM pass.
- Dependencies of the ANGLE files (Chromium 148, Chrome for Testing): macOS, only system frameworks; Windows,
  only system DLLs (kernel32, user32, gdi32, dxgi, advapi32, cfgmgr32); Linux, `libGLESv2.so` needs `libX11`,
  `libXext` and `libxcb` (EGL, SwiftShader and the Vulkan loader need only libc). A Linux build that runs without
  X needs ANGLE built with `angle_use_x11=false`. Size next to the 7.7 MB binary: macOS 23.4 MB (SwiftShader is
  16.5 MB there), Linux 11.7 MB, Windows 14.7 MB.

## Known gaps

- Text antialiasing: resvg draws text lighter than Chrome; with hundreds of labels this dominates the
  remaining differences.
- Text shadow filter region is 3x the text box (fine for labels, too small for a huge blur).
- Map subplots (MapLibre) need WebGL 2.
- Only tested on macOS arm64. The ANGLE files from Chrome for Testing for Linux need X11 libraries;
  `webgl.c` has the Windows and Linux loading code, but nothing has been built or run there yet.
- 3D text in QuickJS (see the timings above).
- headless-gl's GL antialiasing differs from Chrome's on dense lines and wireframes.
- MathJax, `drawImage` of a URL (image trace `source`), hsl image color models.
- opentype.js has no shaping: no ligatures or complex scripts, no per-glyph font fallback.
- `listeners.js` waits a fixed 100 ms for listeners to settle.
