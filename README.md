# kaleido-lite prototype

Static export of plotly.js figures without a browser: plotly.js runs in a light DOM (linkedom), a
shim answers the few layout questions plotly asks, plotly serializes its own SVG, and resvg
rasterizes it. WebGL traces draw through ANGLE (headless-gl in Node, `native/webgl.c` in the QuickJS binary). MathJax works
in a spike build of the QuickJS binary.

Throwaway prototype for a Kaleido replacement in [PlotlyBaseExtras.jl](https://github.com/disberd/PlotlyBaseExtras.jl).
Each "Results" section below is one iteration. Current renders against Chrome:
https://disberd.github.io/kaleido-light-prototype/ (built by `.github/workflows/docs.yml`).

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
  `kaleido-lite fig.json out.svg [w] [h] [scale] [--plotly <file | version>]`: the binary embeds plotly.js 4.1.1
  (`plotly.js-dist-min`); `--plotly` loads another release at run time, from a file (any `plotly.js` bundle,
  minified or not) or by version number (fetched from cdn.plot.ly once with curl, cached in `$KL_CACHE`, else
  `%LOCALAPPDATA%\kaleido-lite` or `~/.cache/kaleido-lite`). `shim.js`'s `patchPlotly` hooks either.
- `versions.sh 1.58.5 2.35.2 ...`: the 2D and WebGL samples with `--plotly <release>` against Chrome
  references made with the same release (`PLOTLY=/abs/plotly.js` for the `chrome-*.sh` scripts), in
  `out/versions/`.
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
- `.github/workflows/angle-linux.yml`: builds ANGLE with SwiftShader for Linux x64 without X11 (the commit
  Chromium 148 ships), reports the time and disk it takes, and runs `native/selftest.js` in a Debian container
  without X libraries, with that build and with Chrome for Testing's (which must fail there).
- MathJax (spike): `bun build-qjs.js --mathjax` builds `out/kaleido-lite-mathjax-bin`, which loads MathJax 3
  through `mathjax-setup.js` before plotly; `KL_BIN=out/kaleido-lite-mathjax-bin ./kaleido-lite.sh ...` uses it.
  `MATHJAX=1 ./chrome-toimage.sh` makes references with MathJax loaded in Chrome. Mocks with TeX: `out/mj/sample.txt`.
- `docs/`: `build.js` makes the results page from `out/` (renders, references, `scores.txt`, `run.log`) with
  `page.tpl.html`. `.github/workflows/docs.yml` renders everything on a macOS runner with the standalone
  binaries, takes the Chrome references there, and deploys the page to GitHub Pages.
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
  of plotly.js v4.1.1), `selftest.js` (asserts for path length, the CSS pass, 3D text outlines and the plotly patch).

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

## Results, Linux ANGLE without X11 in CI (2026-10-03, night)

- GitHub's 4-core runner: `gclient sync` 3.4 to 3.7 min (with `.gclient` written by hand: ANGLE's
  `bootstrap.py` adds `target_os = ['android']` on Linux, which pulls the Android SDK and NDK), then
  `autoninja libEGL libGLESv2` 5.2 min without SwiftShader, 8.0 min with it (1054 steps; on x64 SwiftShader
  uses Subzero, not LLVM). Disk use is in the run summary.
- `libEGL.so` 0.4 MB, `libGLESv2.so` 8.5 MB, `libvk_swiftshader.so` 6.5 MB, `libvulkan.so.1` 0.9 MB, all
  needing only libc, libm, libdl, libpthread and libgcc_s.
- `native/selftest.js` passes in `debian:bookworm-slim` with no X libraries (SwiftShader Device (Subzero)).
  Chrome for Testing's files fail there: `libX11.so.6 => not found`.
- Without `angle_enable_swiftshader`, ANGLE rejects the SwiftShader device (`eglInitialize` fails), so
  SwiftShader has to come from the same build.

## Results, MathJax spike (2026-10-03, night)

- MathJax 3.2.2 (`es5/tex-svg.js`) runs on linkedom, in Node and in the QuickJS binary: 166 ms to load in
  QuickJS, +2.1 MB of binary (the source is embedded as text and compiled at start). Needed: a
  `navigator.platform` for MathJax's menu, assistive MathML off, the global `MathJax` pointed at the loaded one.
- Shim: `<svg>` width/height in `ex`/`em` (MathJax writes ex; 1ex = 0.5em, MathJax's and resvg's fallback) and
  nested `<svg>` viewports in bounding boxes. The 80 2D mocks score exactly as before.
- Against `Plotly.toImage` in Chrome with MathJax: `figs/mathjax.json` 0.83%, `ternary-mathjax` 1.35%,
  `ternary-mathjax-title-place-subtitle` 1.45%, `legend_mathjax_title_and_items` 3.15%, `mathjax-font-size` 3.21%,
  `mathjax` 3.56%. The rest is math size and position: Chrome measures ex in the hidden div's font (Times) and
  again in the plot font, the spike assumes 0.5em everywhere. Tables with TeX (`table_latex_multitrace_scatter`,
  `table_wrapped_birds`, `table_plain_birds`) fail: linkedom lacks an SVG `baseVal` plotly's table reads.

## Results, WebGL speed (2026-10-03, night)

- Where the time went (timers around plotly's functions in a QuickJS build): not the GL backend
  (`KL_ANGLE=metal` saves at most 0.6 s; SwiftShader's drawing, seen in `readPixels`, takes 0.1-0.7 s), but 3D
  text. vectorize-text took 80% of `gl3d_text-weirdness`, 35% of `gl3d_bunny-hull` and 22% of
  `gl3d_isosurface_math`; two thirds of that in `cleanPSLG`, exact rational arithmetic on bn.js. 2D WebGL
  figures spend little in GL; their time is plotly's ordinary JS, about Node's total.
- Fix: the canvas shim keeps the glyph outlines it draws, and the bundled vectorize-text (patched in
  `build-qjs.js`, which now bundles the unminified `plotly.js-dist`) triangulates those per glyph with cdt2d
  instead of tracing pixels. A glyph whose contours cross (accented letters built from parts, Å Ç ę; ASCII has
  none in the shim's fonts) falls back to tracing. Curves are flattened to 0.25 px, the tolerance
  vectorize-text simplifies to: with 8 chords per curve gl-scatter3d's marker glyphs had 4x the triangles and
  the last markers of `gl3d_opacity-scaling-spikes` went undrawn. The shim's rasterizer also keeps an active
  edge list.
- 3D snapshots were not deterministic once rendering got faster: turntable mode eases the camera's up vector
  over 500 ms and a frame draws the camera of 32 ms earlier, so a snapshot within ~530 ms of creating the scene
  caught it mid-ease (`gl3d_line_rectangle_render` differed on every run). The patched `toImage` drops all
  but the camera's last keyframe first, so the snapshot shows it settled, as Chrome's do. Faking
  `performance.now` instead moved other figures' axes (d3-timer, regl and the camera's earlier frames read it).
- WebGL mocks: median 2.72 s -> 1.82 s, total 228 s -> 80 s; `gl3d_font-weight-scatter` 128 s -> 5.9 s
  (Node 4.0 s), `gl3d_text-weirdness` 6.2 s -> 1.8 s, `gl3d_contour-lines` 4.8 s -> 2.3 s. Scores: median
  0.83% -> 0.81%, the same or better on every mock. 2D and MathJax unchanged.
- Left: `gl3d_isosurface_math` 16.5 s (Node 3.0 s) and `gl3d_volume_opacityscale-iso` 6.9 s are plotly's
  isosurface maths, plain JS loops that only a JIT engine runs fast.

## Results, any plotly.js release (2026-10-04, night)

- `--plotly <file | version>` loads another release at run time. The CDN builds of 1.58.5, 2.35.2, 2.35.3,
  3.0.1, 3.3.1, 3.7.0 and 4.1.1 all load once the shim has three stubs: `Blob` and `URL.createObjectURL`
  (mapbox-gl, bundled up to 3.x, makes a Blob URL for its worker at load), a `URL` constructor and `location`
  (2.x builds asset URLs with `new URL(asset, base)`, webpack's base coming from `location`).
- Compiling a release takes 0.5-0.6 s per process. Its bytecode (5.3 MB, source stripped) is cached per file and
  binary and loads in about 45 ms: the 2D median with a cached `--plotly` release is 0.33 s, as with the built-in
  one.
- One source patch for every release: a hook at the top of vectorize-text's `processPixels`, found by the shape
  of its body (it matches exactly once in each build above, minified, and in the unminified bundle); the outline
  triangulation itself is in `shim.js` (`vectorizeOutlines`, with vectorize-text's positioning, unchanged since
  1.x, and npm `cdt2d`). The 3D camera is settled from outside through `_fullLayout[scene]._scene`, which every
  release has. A build where the hook does not match still renders, with 3D text traced from pixels.
- Scores, the 80 2D and 28 WebGL mocks against Chrome running the same release (`versions.sh`, local):

  | plotly.js | 2D: render, median, within 2% | WebGL: render, median, within 2% |
  |---|---|---|
  | 4.1.1 | 80/80, 0.65%, 74 | 28/28, 0.81%, 20 |
  | 3.3.1 | 80/80, 0.65%, 74 | 28/28, 0.81%, 20 |
  | 3.0.1 | 80/80, 0.65%, 74 | 28/28, 0.81%, 20 |
  | 2.35.2 | 80/80, 0.65%, 74 | 28/28, 0.82%, 20 |
  | 1.58.5 | 80/80, 0.60%, 75 | 28/28, 0.95%, 20 |

  The mocks come from plotly.js 4.1.1's test suite; an older release ignores the attributes it does not know,
  in Chrome as here. The results page gets a row per release from CI (1.58.5, 2.35.3, 3.7.0).
- The Chrome reference pages had no charset, and Chrome read the raw UTF-8 in 2.x's webpack build as
  Windows-1252 (tick label `−4` drawn as `â^'4`), which made 2.35 look ten times worse on 3D than it is. 3.x and
  4.x builds escape non-ASCII. The `chrome-*.sh` pages now declare UTF-8.

## Known gaps

- Text antialiasing: resvg draws text lighter than Chrome; with hundreds of labels this dominates the
  remaining differences.
- Text shadow filter region is 3x the text box (fine for labels, too small for a huge blur).
- Map subplots (MapLibre) need WebGL 2.
- Figures only render on macOS arm64: `qjs-entry.js` and `render.js` read macOS system fonts. On Linux x64
  only the native layer is tested (CI selftest); Windows is not built at all.
- Isosurface and volume maths in QuickJS: 7-17 s (see WebGL speed).
- `--plotly` compiles the file at every start (0.5-0.6 s in QuickJS); a bytecode cache per file, or one process
  rendering many figures, would remove that.
- headless-gl's GL antialiasing differs from Chrome's on dense lines and wireframes.
- MathJax is a spike (see above), `drawImage` of a URL (image trace `source`), hsl image color models.
- opentype.js has no shaping: no ligatures or complex scripts, no per-glyph font fallback.
- `listeners.js` waits a fixed 100 ms for listeners to settle.
