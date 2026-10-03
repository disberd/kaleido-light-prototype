// node docs/build.js [site]: the results page, from what the docs workflow leaves in out/ (renders, Chrome
// references, scores.txt from compare.js, run.log from qjs-mocks.sh). Writes <site>/index.html, images in <site>/img.
const fs = require("fs");
const { execSync } = require("child_process");
const site = process.argv[2] || "_site";
fs.rmSync(site, { recursive: true, force: true });
fs.mkdirSync(`${site}/img`, { recursive: true });

// "name: 0.47% pixels differ" / "name: missing ..." -> { name: 0.47 | NaN }; run.log -> { name: wall seconds }
const lines = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8").trim().split("\n").filter(Boolean) : []);
const scores = (dir) => Object.fromEntries(lines(`out/${dir}scores.txt`).map((l) => [l.split(": ")[0], parseFloat(l.split(": ")[1])]));
const times = (dir) => Object.fromEntries(lines(`out/${dir}run.log`).map((l) => [l.split(": ")[0], parseFloat(l.split(" ").pop())]));
const S = { "": scores(""), "mocks/": scores("mocks/"), "gl/": scores("gl/"), "mj/": scores("mj/") };
const T = { "": {}, "mocks/": times("mocks/"), "gl/": times("gl/"), "mj/": times("mj/") };

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const img = (file, alt) => {
  if (!fs.existsSync(`out/${file}`)) return `<div class="none">did not render</div>`;
  const name = file.replace(/\//g, "-");
  fs.copyFileSync(`out/${file}`, `${site}/img/${name}`);
  return `<img loading="lazy" alt="${esc(alt)}" src="img/${name}">`;
};
const chip = (p) => (Number.isNaN(p) || p == null ? `<span class="chip bad">no render</span>` : `<span class="chip ${p > 3 ? "bad" : p > 2 ? "warn" : "ok"}">${p.toFixed(2)}% px differ</span>`);
const time = (t) => (t > 0 ? `<span class="chip time">${t < 10 ? t.toFixed(1) : Math.round(t)} s</span>` : "");
const pair = (dir, n, title = n, note = "", ref = "Chrome") => `<figure class="pair"><figcaption><span class="name">${esc(title)}</span>${chip(S[dir][n])}${time(T[dir][n])}</figcaption>${note ? `<p class="note">${note}</p>` : ""}<div class="imgs"><div><span class="lab">${ref}</span>${img(`${dir}${n}.chrome.png`, `${title} rendered by Chrome`)}</div><div><span class="lab lite">kaleido-lite</span>${img(`${dir}${n}.png`, `${title} rendered by kaleido-lite`)}</div></div></figure>`;
const key = (p) => (Number.isNaN(p) ? 1e9 : p); // failed renders first
const sorted = (dir) => Object.keys(S[dir]).sort((a, b) => key(S[dir][b]) - key(S[dir][a]));

const featured = [["scatter", "Scatter"], ["bar", "Bar"], ["subplots", "Subplots"], ["geo", "Geo (local topojson)"], ["cov-heatmap", "Heatmap (canvas shim)"], ["cov-carpet", "Carpet"]];
const cssCases = {
  sankey_energy: "Small caps, white text halos and blue links (plotly's page stylesheet colours links), written into plain SVG by the CSS pass. The rest is text antialiasing.",
  date_axes_period_ticklabelindex: "Chrome draws axis lines crisp because plotly's stylesheet gives the <code>crisp</code> class <code>shape-rendering: crispEdges</code>; the CSS pass applies that rule, which helps every figure with axes.",
  contour_constraints_equal_boundary_minmax: "Underlines, capitalised text and halos from the CSS pass, and contour labels placed along curved paths. The rest is text antialiasing over 300+ labels.",
};
const glNotes = {
  gl2d_line_limit: "Hundreds of thin overlapping lines: the content matches, the moiré of their antialiasing does not.",
  gl2d_parcoords_60_dims: "Lines match; about 400 axis labels drawn lighter by resvg add up.",
  "gl3d_opacity-scaling-spikes": "Dense marker outlines: antialiasing differs between SwiftShader and Chrome's GL.",
  "gl3d_font-weight-scatter": "3D text: labels are triangulated from the glyph outlines the canvas shim draws (128 s to 6 s in QuickJS). The score did not change with it.",
  gl3d_isosurface_math: "Wireframe antialiasing differs; surfaces and colours match. Slow: plotly computes the isosurface in plain JS loops, which an interpreter runs several times slower than Node.",
  "gl3d_surface_opacity-and-opacityscale": "Transparency: SwiftShader blends slightly differently from Chrome's GPU path (<code>KL_ANGLE=metal</code> comes closer on a Mac).",
  "gl3d_volume_opacityscale-iso": "Transparency: as above.",
};
const mjNotes = {
  mathjax: "Chrome measures <code>ex</code> in the hidden helper div's font (Times) and again in the plot font; the spike assumes 0.5em. Math sizes differ a little, and the heatmap subplot next to a TeX axis title shifts.",
  table_latex_multitrace_scatter: "Fails: plotly's table reads an SVG <code>baseVal</code> that linkedom lacks.",
};

const stats = (dir) => {
  const v = Object.values(S[dir]), ok = v.filter((x) => !Number.isNaN(x)).sort((a, b) => a - b);
  const med = (a) => (a.length ? (a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2) : NaN);
  const t = Object.values(T[dir]).filter((x) => x > 0).sort((a, b) => a - b);
  return { n: v.length, ok: ok.length, median: med(ok).toFixed(2), w2: ok.filter((x) => x <= 2).length, w3: ok.filter((x) => x <= 3).length, t: med(t).toFixed(2) };
};
const mb = (...f) => (f.reduce((s, x) => s + (fs.existsSync(x) ? fs.statSync(x).size : 0), 0) / 1e6).toFixed(1) + " MB";
const sh = (c, d) => { try { return execSync(c, { encoding: "utf8" }).trim(); } catch { return d; } };
const commit = process.env.GITHUB_SHA || sh("git rev-parse HEAD", "");
const repo = "https://github.com/" + (process.env.GITHUB_REPOSITORY || "disberd/kaleido-light-prototype");

const s2 = stats("mocks/"), sg = stats("gl/"), sm = stats("mj/");
// Other releases (versions.sh, one CI job each): out/versions/<release>/{mocks,gl}/scores.txt and run.log
const semver = (v) => v.split(".").map(Number).reduce((a, x) => a * 1000 + x, 0);
const releases = (fs.existsSync("out/versions") ? fs.readdirSync("out/versions") : []).filter((d) => /^(release-)?\d+\.\d+\.\d+$/.test(d) && fs.statSync(`out/versions/${d}`).isDirectory())
  .map((d) => [d.replace(/^release-/, ""), d]).sort((a, b) => semver(b[0]) - semver(a[0]));
const cell = (st) => (st.n ? `${st.ok}/${st.n} render · median ${st.median}% · ${st.w2}/${st.n} within 2% · ${st.t} s` : "not run");
const relStats = (d) => { for (const k of ["mocks", "gl"]) { const dir = `versions/${d}/${k}/`; S[dir] = scores(dir); T[dir] = times(dir); } return [stats(`versions/${d}/mocks/`), stats(`versions/${d}/gl/`)]; };
const vars = {
  DATE: new Date().toISOString().slice(0, 10), REPO: repo, COMMIT: commit.slice(0, 7), COMMIT_URL: `${repo}/commit/${commit}`,
  SIZE_BIN: mb("out/kaleido-lite-bin"), SIZE_MJ: mb("out/kaleido-lite-mathjax-bin"), SIZE_RESVG: mb("bin/resvg"),
  SIZE_ANGLE: mb("out/libEGL.dylib", "out/libGLESv2.dylib", "out/libvk_swiftshader.dylib"),
  N: s2.n, OK: s2.ok, MEDIAN: s2.median, WITHIN2: s2.w2, WITHIN3: s2.w3, T2D: s2.t,
  GLN: sg.n, GLOK: sg.ok, GLMEDIAN: sg.median, GLWITHIN2: sg.w2, TGL: sg.t,
  MJN: sm.n, MJOK: sm.ok, MJMEDIAN: sm.median,
  FEATURED: featured.map(([n, t]) => pair("", n, t)).join("\n"),
  CSS: Object.entries(cssCases).map(([n, note]) => pair("mocks/", n, n, note)).join("\n"),
  GL: sorted("gl/").map((n) => pair("gl/", n, n, glNotes[n], "Chrome toImage")).join("\n"),
  MJ: [pair("", "mathjax", "figs/mathjax.json", "Title, axis titles and a legend entry in TeX.", "Chrome toImage")].concat(sorted("mj/").map((n) => pair("mj/", n, n, mjNotes[n], "Chrome toImage"))).join("\n"),
  MOCKS: sorted("mocks/").filter((n) => !cssCases[n]).map((n) => pair("mocks/", n)).join("\n"),
  RELEASES: [`<tr><td>4.1.1 (built in)</td><td>${cell(s2)}</td><td>${cell(sg)}</td></tr>`]
    .concat(releases.map(([v, d]) => { const [a, b] = relStats(d); return `<tr><td>${v}</td><td>${cell(a)}</td><td>${cell(b)}</td></tr>`; })).join("\n"),
};
const html = fs.readFileSync(`${__dirname}/page.tpl.html`, "utf8").replace(/\{\{([A-Z0-9_]+)\}\}/g, (m, k) => (k in vars ? vars[k] : m));
fs.writeFileSync(`${site}/index.html`, html);
const left = html.match(/\{\{[A-Z0-9_]+\}\}/g);
console.log(`${site}/index.html: ${(html.length / 1e3).toFixed(0)} kB, ${fs.readdirSync(`${site}/img`).length} images, 2D ${s2.ok}/${s2.n} median ${s2.median}%, GL ${sg.ok}/${sg.n} median ${sg.median}%, MathJax ${sm.ok}/${sm.n}`);
if (left) throw new Error("unfilled: " + left.join(" "));
