// Layout shims that let plotly.js draw 2D plots in a DOM with no layout engine (linkedom).
// plotly.js measures nodes with getBoundingClientRect / getBBox and reads getComputedStyle.
// We answer from font metrics (opentype.js) and plain SVG geometry: no CSS layout, no paint.
const opentype = require("opentype.js");

const GENERIC = { "sans-serif": "arial", serif: "times new roman", monospace: "courier new" };
const INHERITED = new Set(["font-family", "font-size", "font-weight", "font-style", "font-variant", "text-transform", "text-anchor", "fill", "white-space", "visibility"]);
// Chrome synthesizes small caps (fonts here have no smcp feature) as upper case at 70% size.
const SMALL_CAPS = 0.7;
const DEFAULTS = { display: "block", "font-size": "16px", "font-family": "sans-serif", "text-anchor": "start", position: "static" };

// fontFiles: { family: { normal, bold, italic, bolditalic } } of ArrayBuffers. Family names lower case.
// readFile(url) -> string | null serves XMLHttpRequest (geo topojson); there is no network.
// createWebGL(width, height, attrs) -> WebGL 1 context (headless-gl in Node); without it WebGL traces stay blank.
function installShim(window, fontFiles, { defaultFamily = "arial", readFile = () => null, createWebGL = null, pngDataURL = jsPngDataURL } = {}) {
  // Parse a font file on first use: parsing all of them costs ~300 ms per process in QuickJS.
  const fonts = {};
  for (const [fam, vs] of Object.entries(fontFiles)) {
    fonts[fam] = {};
    for (const [v, buf] of Object.entries(vs)) {
      let font;
      Object.defineProperty(fonts[fam], v, { enumerable: true, get: () => (font ??= opentype.parse(buf)) });
    }
  }

  function attrStyle(el, prop) {
    const m = (el.getAttribute("style") || "").match(new RegExp("(?:^|;)\\s*" + prop + "\\s*:\\s*([^;]+)"));
    return m ? m[1].trim() : el.getAttribute(prop);
  }
  function styleOf(el, prop) {
    for (; el && el.getAttribute; el = INHERITED.has(prop) ? el.parentNode : null) {
      const v = attrStyle(el, prop);
      if (v != null && v !== "") return v;
    }
    return DEFAULTS[prop];
  }
  function fontSize(el) {
    if (!el || !el.getAttribute) return 16;
    const v = attrStyle(el, "font-size");
    if (!v) return fontSize(el.parentNode);
    const n = parseFloat(v);
    if (v.endsWith("%")) return (n / 100) * fontSize(el.parentNode);
    if (v.endsWith("rem")) return n * 16;
    if (v.endsWith("em")) return n * fontSize(el.parentNode);
    if (v.endsWith("ex") || v.endsWith("ch")) return n * 0.5 * fontSize(el.parentNode); // ponytail: no x-height lookup
    return n;
  }
  function pickFont(el) {
    const bold = /bold|[6-9]00/.test(styleOf(el, "font-weight") || "");
    const italic = /italic|oblique/.test(styleOf(el, "font-style") || "");
    const variant = (bold ? "bold" : "") + (italic ? "italic" : "") || "normal";
    for (let f of (styleOf(el, "font-family") || "").split(",")) {
      f = f.trim().replace(/^['"]|['"]$/g, "").toLowerCase();
      const fam = fonts[GENERIC[f] || f];
      if (fam) return fam[variant] || fam[bold ? "bold" : "normal"] || fam.normal;
    }
    // No listed family is available and no generic was given: browsers use their standard font, Times.
    const fam = fonts["times new roman"] || fonts[defaultFamily];
    return fam[variant] || fam[bold ? "bold" : "normal"] || fam.normal;
  }
  const num = (v) => parseFloat(v) || 0;
  // An <svg> width/height; MathJax writes ex. ponytail: 1ex = 0.5em, the ratio MathJax and resvg both fall back to.
  const svgLen = (el, k) => {
    const v = el.getAttribute(k) || "";
    return /e[mx]$/.test(v) ? num(v) * (v.endsWith("ex") ? 0.5 : 1) * fontSize(el) : num(v);
  };
  // Text as drawn: text-transform applied, then split into [text, size factor] runs for small caps.
  function caseRuns(el, text) {
    const tt = styleOf(el, "text-transform");
    if (tt === "uppercase") text = text.toUpperCase();
    else if (tt === "lowercase") text = text.toLowerCase();
    else if (tt === "capitalize") text = text.replace(/(^|[^\p{L}\p{N}'])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());
    if (!/small-caps/.test(styleOf(el, "font-variant") || "")) return [[text, 1]];
    return (text.match(/\p{Ll}+|[^\p{Ll}]+/gu) || []).map((r) => (/\p{Ll}/u.test(r) ? [r.toUpperCase(), SMALL_CAPS] : [r, 1]));
  }
  const len = (v, size) => (v && v.endsWith("em") ? num(v) * size : num(v));

  // Box of a <text>: each tspan.line is its own anchored line; height uses the font's ascent and descent,
  // like a browser's glyph cell box. ponytail: ignores sub/superscript baseline shifts and letter-spacing.
  function textBox(text) {
    const anchor = styleOf(text, "text-anchor");
    const lines = [...text.childNodes].filter((n) => n.nodeType === 1 && /\bline\b/.test(n.getAttribute("class") || ""));
    const x0 = num(text.getAttribute("x"));
    const y0 = num(text.getAttribute("y")) + len(text.getAttribute("dy"), fontSize(text));
    let box = null;
    for (const line of lines.length ? lines : [text]) {
      let w = 0, asc = 0, desc = 0, any = false;
      (function walk(n) {
        for (const c of n.childNodes) {
          if (c.nodeType === 3 && c.data) {
            const el = c.parentNode, size = fontSize(el), font = pickFont(el);
            for (const [t, k] of caseRuns(el, c.data)) w += font.getAdvanceWidth(t, size * k, { kerning: true });
            asc = Math.max(asc, (font.ascender / font.unitsPerEm) * size);
            desc = Math.max(desc, (-font.descender / font.unitsPerEm) * size);
            any = true;
          } else if (c.nodeType === 1) walk(c);
        }
      })(line);
      if (!any) continue;
      const x = line === text ? x0 : num(line.getAttribute("x") ?? x0);
      const y = line === text ? y0 : (line.hasAttribute("y") ? num(line.getAttribute("y")) : y0) + len(line.getAttribute("dy"), fontSize(line));
      const left = anchor === "middle" ? x - w / 2 : anchor === "end" ? x - w : x;
      box = union(box, { x: left, y: y - asc, width: w, height: asc + desc });
    }
    return box || { x: x0, y: y0, width: 0, height: 0 };
  }

  // ponytail: control points and arc ends padded by their radius over-estimate curved paths; plotly only
  // measures text and groups for layout, so path boxes rarely matter.
  // flat: the outline as subpaths of points, Bezier curves sampled (for path length; arcs stay straight).
  function parsePath(d) {
    const t = (d || "").match(/[a-zA-Z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) || [];
    const pts = [], extra = [], flat = [];
    let i = 0, cx = 0, cy = 0, sx = 0, sy = 0, cmd = "M", sub = null, ctl = null;
    const n = () => +t[i++];
    const bez = (P) => { // sample a quadratic or cubic Bezier from the current point
      for (let s = 1; s <= 16; s++) {
        const u = s / 16, v = 1 - u;
        sub.push(P.length === 4 ? [v * v * cx + 2 * v * u * P[0] + u * u * P[2], v * v * cy + 2 * v * u * P[1] + u * u * P[3]]
          : [v ** 3 * cx + 3 * v * v * u * P[0] + 3 * v * u * u * P[2] + u ** 3 * P[4], v ** 3 * cy + 3 * v * v * u * P[1] + 3 * v * u * u * P[3] + u ** 3 * P[5]]);
      }
    };
    while (i < t.length) {
      if (/[a-z]/i.test(t[i])) cmd = t[i++];
      const C = cmd.toUpperCase(), rel = cmd !== C;
      const last = ctl; ctl = null;
      if (C === "Z") { cx = sx; cy = sy; sub?.push([cx, cy]); continue; }
      if (C === "H") cx = (rel ? cx : 0) + n();
      else if (C === "V") cy = (rel ? cy : 0) + n();
      else if (C === "A") {
        const rx = n(), ry = n(); i += 3;
        const x = (rel ? cx : 0) + n(), y = (rel ? cy : 0) + n();
        extra.push([cx - rx, cy - ry], [cx + rx, cy + ry], [x - rx, y - ry], [x + rx, y + ry]);
        cx = x; cy = y;
      } else {
        const k = { M: 2, L: 2, T: 2, C: 6, S: 4, Q: 4 }[C];
        if (!k) break;
        const bx = cx, by = cy, P = [];
        for (let j = 0; j < k; j += 2) {
          const x = (rel ? bx : 0) + n(), y = (rel ? by : 0) + n();
          if (j < k - 2) extra.push([x, y]);
          P.push(x, y);
        }
        const refl = last ? [2 * cx - last[0], 2 * cy - last[1]] : [cx, cy]; // S and T mirror the previous control point
        if (C === "M") { flat.push((sub = [[P[0], P[1]]])); sx = P[0]; sy = P[1]; cmd = rel ? "l" : "L"; }
        else if (C === "C") { bez(P); ctl = [P[2], P[3]]; }
        else if (C === "S") { bez([...refl, ...P]); ctl = [P[0], P[1]]; }
        else if (C === "Q") { bez(P); ctl = [P[0], P[1]]; }
        else if (C === "T") { bez([...refl, ...P]); ctl = refl; }
        cx = P[k - 2]; cy = P[k - 1];
      }
      if (C !== "M" && !"CSQT".includes(C)) (sub ??= (flat.push([[0, 0]]), flat[flat.length - 1])).push([cx, cy]);
      pts.push([cx, cy]);
    }
    return { pts, extra, flat };
  }
  const pathBox = (d) => { const p = parsePath(d); return ptsBox(p.pts.concat(p.extra)); };

  function ptsBox(pts) {
    if (!pts.length) return null;
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const x = Math.min(...xs), y = Math.min(...ys);
    return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
  }
  function union(a, b) {
    if (!a) return b;
    if (!b) return a;
    const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
    return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y };
  }

  const mul = (A, B) => [A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1], A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3], A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5]];
  function matrixOf(el) {
    let m = [1, 0, 0, 1, 0, 0];
    if (el.localName === "svg" && el.parentNode && el.parentNode.localName !== "div") m = [1, 0, 0, 1, num(el.getAttribute("x")), num(el.getAttribute("y"))];
    for (const [, fn, args] of (el.getAttribute("transform") || "").matchAll(/(\w+)\s*\(([^)]*)\)/g)) {
      const a = args.split(/[\s,]+/).filter(Boolean).map(Number);
      const r = ((a[0] || 0) * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
      const t = {
        translate: [1, 0, 0, 1, a[0], a[1] || 0],
        scale: [a[0], 0, 0, a[1] ?? a[0], 0, 0],
        rotate: [c, s, -s, c, (a[1] || 0) * (1 - c) + (a[2] || 0) * s, (a[2] || 0) * (1 - c) - (a[1] || 0) * s],
        matrix: a,
        skewX: [1, 0, Math.tan(r), 1, 0, 0],
        skewY: [1, Math.tan(r), 0, 1, 0, 0],
      }[fn];
      if (t) m = mul(m, t);
    }
    return m;
  }
  function mapBox(b, m) {
    if (!b) return null;
    return ptsBox([[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]].map(([x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]));
  }
  const SKIP = new Set(["defs", "clippath", "style", "title", "lineargradient", "radialgradient", "pattern", "mask", "filter", "marker", "symbol"]);

  // getBBox semantics: the box in the element's own user space, without its own transform.
  function localBox(el) {
    const a = (k) => num(el.getAttribute(k));
    switch (el.localName) {
      case "text": return textBox(el);
      case "tspan": return el.parentNode ? localBox(el.parentNode) : null; // ponytail: whole text, not the tspan
      case "rect": case "image": case "foreignObject": return { x: a("x"), y: a("y"), width: a("width"), height: a("height") };
      case "svg": if (el.hasAttribute("width")) return { x: 0, y: 0, width: svgLen(el, "width"), height: svgLen(el, "height") }; break; // nested viewport (MathJax)
      case "line": return ptsBox([[a("x1"), a("y1")], [a("x2"), a("y2")]]);
      case "circle": return { x: a("cx") - a("r"), y: a("cy") - a("r"), width: 2 * a("r"), height: 2 * a("r") };
      case "ellipse": return { x: a("cx") - a("rx"), y: a("cy") - a("ry"), width: 2 * a("rx"), height: 2 * a("ry") };
      case "path": return pathBox(el.getAttribute("d"));
      case "polygon": case "polyline": {
        const v = (el.getAttribute("points") || "").split(/[\s,]+/).filter(Boolean).map(Number);
        return ptsBox(v.flatMap((x, i) => (i % 2 ? [] : [[x, v[i + 1]]])));
      }
    }
    let box = null;
    for (const c of el.children || []) {
      if (c.namespaceURI !== el.namespaceURI || SKIP.has(c.localName.toLowerCase()) || styleOf(c, "display") === "none") continue;
      box = union(box, mapBox(localBox(c), matrixOf(c)));
    }
    return box;
  }

  const rect = (b) => ({ x: b.x, y: b.y, left: b.x, top: b.y, width: b.width, height: b.height, right: b.x + b.width, bottom: b.y + b.height, toJSON() { return this; } });
  const SVG_NS = "http://www.w3.org/2000/svg";

  // Coordinates are relative to the outermost <svg> (or to the plot div for HTML): plotly only ever
  // subtracts two rects from the same container, so the page offset cancels out.
  window.Element.prototype.getBoundingClientRect = function () {
    if (this.namespaceURI !== SVG_NS) {
      return rect({ x: 0, y: 0, width: num(styleOf(this, "width")), height: num(styleOf(this, "height")) });
    }
    let m = matrixOf(this);
    for (let p = this.parentNode; p && p.namespaceURI === SVG_NS && p.parentNode && p.parentNode.namespaceURI === SVG_NS; p = p.parentNode) {
      m = mul(matrixOf(p), m);
    }
    if (this.localName === "svg" && this.parentNode?.namespaceURI !== SVG_NS) {
      return rect({ x: 0, y: 0, width: svgLen(this, "width"), height: svgLen(this, "height") });
    }
    return rect(mapBox(localBox(this), m) || { x: 0, y: 0, width: 0, height: 0 });
  };
  // HTML boxes come from inline width/height (plotly sizes its divs in px); the 3D scene sizes its canvas this way.
  for (const k of ["width", "height"]) {
    const prop = "client" + k[0].toUpperCase() + k.slice(1);
    Object.defineProperty(window.HTMLElement.prototype, prop, { configurable: true, get() { return num(styleOf(this, k)); } });
  }
  window.Element.prototype.getBBox = function () {
    const b = localBox(this) || { x: 0, y: 0, width: 0, height: 0 };
    return { x: b.x, y: b.y, width: b.width, height: b.height };
  };
  window.Element.prototype.getComputedTextLength = function () {
    return textBox(this.localName === "text" ? this : this.closest("text")).width;
  };

  // Annotation arrows and contour labels walk their path. Moves between subpaths add no length, like in browsers.
  const segs = (el) => parsePath(el.getAttribute("d")).flat.flatMap((sp) => sp.slice(1).map((p, i) => [sp[i], p]));
  window.Element.prototype.getTotalLength = function () {
    return segs(this).reduce((s, [a, b]) => s + Math.hypot(b[0] - a[0], b[1] - a[1]), 0);
  };
  window.Element.prototype.getPointAtLength = function (l) {
    const ss = segs(this);
    for (const [[x0, y0], [x1, y1]] of ss) {
      const seg = Math.hypot(x1 - x0, y1 - y0);
      if (l <= seg && seg > 0) return { x: x0 + ((x1 - x0) * l) / seg, y: y0 + ((y1 - y0) * l) / seg };
      l -= seg;
    }
    const [x, y] = ss.length ? ss[ss.length - 1][1] : [0, 0];
    return { x, y };
  };

  window.getComputedStyle = (el) => {
    // Computed font-size is always px in browsers; plotly's unit conversion (to-px) relies on that.
    const get = (p) => (p === "font-size" ? fontSize(el) + "px" : styleOf(el, p) ?? "");
    const camel = (k) => k.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());
    return new Proxy({ getPropertyValue: get }, { get: (t, k) => (k in t ? t[k] : typeof k === "string" ? get(camel(k)) : undefined) });
  };
  // linkedom upper-cases SVG tag names; browsers keep them as written and plotly compares nodeName === "text".
  for (const k of ["nodeName", "tagName"]) Object.defineProperty(window.SVGElement.prototype, k, { get() { return this.localName; } });
  // Browsers drop a style property set to "", linkedom keeps "prop:;" and resvg then ignores the rest of the style.
  const Style = Object.getPrototypeOf(window.document.createElement("div").style);
  Style.set = function (k, v) { return v === "" ? (this.delete(k), this) : Map.prototype.set.call(this, k, v); };
  window.XMLSerializer = class XMLSerializer { serializeToString(n) { return n.outerHTML; } };
  // Geo subplots load topojson with d3.json, i.e. XMLHttpRequest. A URL readFile cannot map fails like offline.
  window.XMLHttpRequest = class XMLHttpRequest {
    onload = null; // d3 checks `"onload" in request`
    open(method, url) { this.url = url; }
    setRequestHeader() {}
    overrideMimeType() {}
    send() {
      setTimeout(() => {
        const text = readFile(this.url);
        Object.assign(this, { readyState: 4, status: text == null ? 404 : 200, responseText: text ?? "", response: text ?? "" });
        this.onload?.();
      });
    }
  };
  window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
  window.cancelAnimationFrame = (id) => clearTimeout(id);
  window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  // Heatmap and image traces paint pixels on a canvas and embed it as a PNG <image>. ponytail: only the calls
  // they make; fillStyle understands rgb()/rgba() only (not hsl image color models), drawImage of a URL is a no-op.
  // WebGL comes from createWebGL; plotly reads it back through toDataURL (2D traces) or readPixels (3D scenes).
  const CanvasProto = window.HTMLCanvasElement.prototype;
  // A headless-gl drawing buffer has a fixed size unless resized explicitly; plotly sizes canvases both through
  // the width/height properties and through setAttribute (d3 .attr).
  const glResize = (cv) => { if (cv._gl && cv.width && cv.height) cv._gl.getExtension("STACKGL_resize_drawingbuffer")?.resize(cv.width, cv.height); };
  // As in browsers, width/height reflect the attributes (linkedom keeps them apart).
  const setAttr = window.Element.prototype.setAttribute;
  for (const [k, def] of [["width", 300], ["height", 150]]) {
    Object.defineProperty(CanvasProto, k, { configurable: true, get() { const v = parseInt(this.getAttribute(k)); return v >= 0 ? v : def; }, set(v) { this.setAttribute(k, String(Math.max(0, v | 0))); } });
  }
  CanvasProto.setAttribute = function (k, v) { setAttr.call(this, k, v); if (k === "width" || k === "height") glResize(this); };
  CanvasProto.getContext = function (type, attrs) {
    if (type === "webgl" || type === "experimental-webgl") {
      if (!createWebGL) return null;
      if (!this._gl) {
        this._gl = createWebGL(this.width || 300, this.height || 150, { ...attrs, preserveDrawingBuffer: true });
        if (this._gl) Object.defineProperty(this._gl, "canvas", { value: this });
      }
      return this._gl;
    }
    if (type !== "2d") return null;
    const cv = this;
    const px = () => (cv._px && cv._px.length === 4 * cv.width * cv.height ? cv._px : (cv._px = new Uint8ClampedArray(4 * cv.width * cv.height)));
    let fill = [0, 0, 0, 255], font = "10px sans-serif";
    // Canvas font shorthand ("italic bold 20px Open Sans") as the element-like object pickFont reads.
    const ctxFont = () => {
      const m = font.match(/^(.*?)([\d.]+)px\s+(.*)$/) || [, "", 10, "sans-serif"];
      const attrs = { "font-family": m[3], "font-weight": /\b(bold|bolder|[6-9]\d\d|1000)\b/.test(m[1]) ? "bold" : "", "font-style": /italic|oblique/.test(m[1]) ? "italic" : "" };
      return { size: +m[2], font: pickFont({ getAttribute: (k) => attrs[k] ?? null }) };
    };
    return {
      set fillStyle(c) {
        const h = String(c).match(/^#([\da-f]{3}|[\da-f]{6})$/i);
        if (h) { const x = h[1].length === 3 ? [...h[1]].map((d) => d + d) : h[1].match(/../g); fill = [...x.map((d) => parseInt(d, 16)), 255]; return; }
        const m = String(c).match(/[\d.]+/g) || [];
        fill = [+m[0], +m[1], +m[2], m[3] == null ? 255 : Math.round(255 * m[3])];
      },
      get font() { return font; },
      set font(f) { if (/^[^,]*?[\d.]+px\s/.test(f)) font = f; }, // browsers ignore an invalid font (e.g. "1,100 64px")
      textAlign: "start",
      textBaseline: "alphabetic",
      // 3D scenes draw axis text on a canvas and trace its pixels into geometry (vectorize-text).
      // Canvas text drawing turns ASCII whitespace into spaces (HTML spec); opentype would draw "\n" as a box.
      measureText(t) { const { size, font: f } = ctxFont(); return { width: f.getAdvanceWidth(canvasText(t), size, { kerning: true }) }; },
      fillText(t, x, y) {
        t = canvasText(t);
        const { size, font: f } = ctxFont(), w = f.getAdvanceWidth(t, size, { kerning: true });
        const asc = (f.ascender / f.unitsPerEm) * size, desc = (-f.descender / f.unitsPerEm) * size;
        x -= { center: w / 2, right: w, end: w }[this.textAlign] || 0;
        y += { top: asc, hanging: asc, middle: (asc - desc) / 2, bottom: -desc, ideographic: -desc }[this.textBaseline] || 0;
        fillPath(px(), cv.width, cv.height, f.getPath(t, x, y, size, { kerning: true }).commands, fill);
      },
      fillRect(x, y, w, h) { // 32-bit fill per row: the 3D text canvas (8192x1024) is cleared before every label
        const d = px(), W = cv.width, u32 = new Uint32Array(d.buffer, d.byteOffset, d.length / 4);
        const c = new Uint32Array(new Uint8Array(fill).buffer)[0];
        const i0 = Math.max(0, Math.round(x)), i1 = Math.min(W, Math.round(x + w));
        for (let j = Math.max(0, Math.round(y)); j < Math.min(cv.height, Math.round(y + h)); j++) u32.fill(c, j * W + i0, j * W + i1);
      },
      createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(4 * w * h) }),
      putImageData(img, x, y) {
        const d = px();
        for (let j = 0; j < img.height && y + j < cv.height; j++) d.set(img.data.subarray(4 * img.width * j, 4 * img.width * (j + 1)), 4 * ((y + j) * cv.width + x));
      },
      getImageData(x, y, w, h) {
        const out = new Uint8ClampedArray(4 * w * h), d = px();
        for (let j = 0; j < h; j++) out.set(d.subarray(4 * ((y + j) * cv.width + x), 4 * ((y + j) * cv.width + x + w)), 4 * w * j);
        return { width: w, height: h, data: out };
      },
      drawImage() {},
    };
  };
  CanvasProto.toDataURL = function () {
    const w = this.width, h = this.height, gl = this._gl;
    if (!gl) return pngDataURL(w, h, this._px || new Uint8Array(4 * w * h), false, false);
    // GL pixels come bottom-up and premultiplied; PNG wants top-down straight alpha (as a browser's toDataURL gives).
    const raw = new Uint8Array(4 * w * h);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, raw);
    return pngDataURL(w, h, raw, true, gl.getContextAttributes().premultipliedAlpha !== false);
  };
  // The family name a rasterizer should use for a CSS font-family list: the one we measured with.
  // resvg matches names case-sensitively, so "verdana" would silently fall back to sans-serif.
  const resolveFamily = (list) => pickFont({ getAttribute: (k) => (k === "font-family" ? list : null) }).names.fontFamily.en;
  // Final SVG fixes for resvg: name the exact font we measured with, and nearest-neighbour heatmap upscaling
  // (plotly asks for "image-rendering: pixelated", which resvg does not know, so it would smooth).
  // pageCss: also apply plotly's page stylesheet rules (crisp axes, link colour), as on screen. Plotly.toImage and
  // Kaleido rasterize the bare SVG and skip them.
  // Embedded images (megabytes of base64 for WebGL canvases) stay out of the DOM pass and the regexes.
  const finishSVG = (svg, { pageCss = true } = {}) => {
    const uris = [];
    svg = svg.replace(/"data:[^"]*"/g, (u) => `"kl-uri:${uris.push(u) - 1}"`);
    return lowerCssText(svg, pageCss)
      .replace(/font-family:\s*([^;"]+)/g, (_, list) => "font-family: " + resolveFamily(list.replace(/&quot;/g, '"')))
      .replace(/image-rendering:\s*pixelated/g, "image-rendering:optimizeSpeed")
      .replace(/"kl-uri:(\d+)"/g, (_, i) => uris[i]);
  };

  // CSS that resvg ignores, rewritten as plain SVG: text-transform and small caps go into the text itself,
  // text-decoration-line becomes SVG text-decoration, text-shadow becomes a filter. Two rules of plotly's page
  // stylesheet (Chrome applies them; the exported SVG doesn't carry the sheet): crisp axis lines and link colour.
  const CSS_TEXT = /text-transform|font-variant|text-shadow|text-decoration-line|<a[\s>]|crisp/;
  function lowerCssText(svg, pageCss) {
    if (!CSS_TEXT.test(svg)) return svg;
    const doc = new window.DOMParser().parseFromString(svg, "image/svg+xml");
    const root = doc.documentElement;
    const setStyle = (el, k, v) => {
      const rest = (el.getAttribute("style") || "").split(";").filter((d) => d.trim() && d.split(":")[0].trim() !== k);
      el.setAttribute("style", (v == null ? rest : rest.concat(k + ":" + v)).join(";"));
    };
    if (pageCss) {
      for (const a of root.querySelectorAll("a")) if (!attrStyle(a, "fill")) setStyle(a, "fill", "#447adb");
      for (const el of root.querySelectorAll(".crisp")) if (!attrStyle(el, "shape-rendering")) setStyle(el, "shape-rendering", "crispEdges");
    }
    const texts = [...root.querySelectorAll("text")];
    for (const text of texts) {
      const nodes = [];
      (function walk(n) { for (const c of n.childNodes) c.nodeType === 3 ? nodes.push(c) : c.nodeType === 1 && walk(c); })(text);
      for (const c of nodes) {
        const runs = caseRuns(c.parentNode, c.data);
        if (runs.length === 1 && runs[0][0] === c.data) continue;
        const size = fontSize(c.parentNode);
        for (const [t, k] of runs) {
          let node = doc.createTextNode(t);
          if (k !== 1) { const ts = doc.createElementNS(SVG_NS, "tspan"); ts.setAttribute("style", `font-size:${size * k}px`); ts.appendChild(node); node = ts; }
          c.parentNode.insertBefore(node, c);
        }
        c.remove();
      }
    }
    let defs = null, nf = 0;
    const filters = new Map();
    for (const el of root.querySelectorAll("[style]")) {
      const deco = attrStyle(el, "text-decoration-line");
      if (deco) setStyle(el, "text-decoration", deco);
      const shadow = attrStyle(el, "text-shadow");
      if (shadow && shadow !== "none") {
        if (!filters.has(shadow)) {
          defs ??= root.insertBefore(doc.createElementNS(SVG_NS, "defs"), root.firstChild);
          const id = "kl-ts" + nf++;
          // Each shadow: blurred alpha, offset, flooded with its colour. CSS paints the first shadow on top.
          const parts = shadow.split(/,(?![^(]*\))/).map((p) => {
            const color = (p.match(/(rgba?\([^)]*\)|#[0-9a-f]+|[a-z]+)\s*$/i) || p.match(/^\s*(rgba?\([^)]*\)|#[0-9a-f]+|[a-z]+)/i) || [, "black"])[1];
            const [dx = 0, dy = 0, blur = 0] = p.replace(color, "").trim().split(/\s+/).map(parseFloat);
            return { dx, dy, blur, color };
          });
          // ponytail: region is 3x the text box, enough for one-character tick labels; an absolute margin would
          // need a per-element userSpaceOnUse filter.
          defs.insertAdjacentHTML("beforeend", `<filter id="${id}" x="-100%" y="-100%" width="300%" height="300%">` +
            parts.map((q, i) => `<feGaussianBlur in="SourceAlpha" stdDeviation="${q.blur / 2}"/><feOffset dx="${q.dx}" dy="${q.dy}" result="o${i}"/>` +
              `<feFlood flood-color="${q.color}"/><feComposite in2="o${i}" operator="in" result="s${i}"/>`).join("") +
            `<feMerge>${parts.map((_, i) => `<feMergeNode in="s${parts.length - 1 - i}"/>`).join("")}<feMergeNode in="SourceGraphic"/></feMerge></filter>`);
          filters.set(shadow, id);
        }
        el.setAttribute("filter", `url(#${filters.get(shadow)})`);
      }
      for (const k of ["text-transform", "font-variant", "text-shadow", "text-decoration-line"]) if (attrStyle(el, k)) setStyle(el, k, null);
    }
    return root.outerHTML;
  }
  return { textBox, localBox, resolveFamily, finishSVG };
}

const canvasText = (t) => String(t).replace(/[\t\n\f\r]/g, " ");

// Nonzero-winding fill of opentype.js path commands into an RGBA buffer, 4 sub-scanlines per pixel row and
// exact horizontal span coverage. ponytail: plain scanline, fine for glyph-sized paths.
function fillPath(d, W, H, cmds, color) {
  const edges = [];
  let x0 = 0, y0 = 0, sx = 0, sy = 0;
  const line = (x, y) => { if (y !== y0) edges.push([x0, y0, x, y]); x0 = x; y0 = y; };
  for (const c of cmds) {
    if (c.type === "M") { if (x0 !== sx || y0 !== sy) line(sx, sy); x0 = sx = c.x; y0 = sy = c.y; }
    else if (c.type === "L") line(c.x, c.y);
    else if (c.type === "Q" || c.type === "C") {
      const ax = x0, ay = y0;
      for (let i = 1; i <= 8; i++) {
        const u = i / 8, v = 1 - u;
        if (c.type === "Q") line(v * v * ax + 2 * v * u * c.x1 + u * u * c.x, v * v * ay + 2 * v * u * c.y1 + u * u * c.y);
        else line(v ** 3 * ax + 3 * v * v * u * c.x1 + 3 * v * u * u * c.x2 + u ** 3 * c.x, v ** 3 * ay + 3 * v * v * u * c.y1 + 3 * v * u * u * c.y2 + u ** 3 * c.y);
      }
    } else if (c.type === "Z") line(sx, sy);
  }
  if (x0 !== sx || y0 !== sy) line(sx, sy);
  if (!edges.length) return;
  const S = 4, ymin = Math.max(0, Math.floor(Math.min(...edges.map((e) => Math.min(e[1], e[3]))))), ymax = Math.min(H, Math.ceil(Math.max(...edges.map((e) => Math.max(e[1], e[3])))));
  const xmin = Math.max(0, Math.floor(Math.min(...edges.map((e) => Math.min(e[0], e[2]))))), xmax = Math.min(W, Math.ceil(Math.max(...edges.map((e) => Math.max(e[0], e[2])))));
  const cov = new Float32Array(W + 1);
  for (let j = ymin; j < ymax; j++) {
    cov.fill(0, xmin, xmax + 1);
    for (let s = 0; s < S; s++) {
      const y = j + (s + 0.5) / S, xs = [];
      for (const [ax, ay, bx, by] of edges) if ((ay <= y) !== (by <= y)) xs.push([ax + ((y - ay) * (bx - ax)) / (by - ay), by > ay ? 1 : -1]);
      xs.sort((a, b) => a[0] - b[0]);
      for (let k = 0, wind = 0; k < xs.length - 1; k++) {
        wind += xs[k][1];
        if (!wind) continue;
        const l = Math.max(0, xs[k][0]), r = Math.min(W, xs[k + 1][0]);
        for (let i = Math.floor(l); i < r; i++) cov[i] += (Math.min(r, i + 1) - Math.max(l, i)) / S;
      }
    }
    for (let i = xmin; i < xmax; i++) {
      const a = Math.min(1, cov[i]) * (color[3] / 255);
      if (!a) continue;
      const o = 4 * (j * W + i);
      for (let c = 0; c < 3; c++) d[o + c] = d[o + c] * (1 - a) + color[c] * a;
      d[o + 3] = Math.min(255, d[o + 3] + a * 255 * (1 - d[o + 3] / 255));
    }
  }
}

// Canvas pixels as a PNG data URL. flip: rows are bottom-up; unpremultiply: alpha is premultiplied (GL readback).
// QuickJS runs these loops ~30x slower than V8, so qjs-entry.js passes native/webgl.c's version instead.
function jsPngDataURL(w, h, rgba, flip, unpremultiply) {
  let px = rgba;
  if (flip || unpremultiply) {
    px = new Uint8ClampedArray(4 * w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = 4 * ((flip ? h - 1 - y : y) * w + x), o = 4 * (y * w + x), a = rgba[i + 3];
      for (let c = 0; c < 3; c++) px[o + c] = unpremultiply && a ? (rgba[i + c] * 255) / a : rgba[i + c];
      px[o + 3] = a;
    }
  }
  const bytes = png(w, h, px);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 32768) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 32768));
  return "data:image/png;base64," + btoa(bin);
}

// Minimal PNG encoder: RGBA rows in zlib "stored" blocks, so no deflate implementation is needed.
// ponytail: ~4 bytes per canvas pixel end up in the SVG; add real deflate if heatmap exports get too big.
const CRC = Array.from({ length: 256 }, (_, n) => {
  for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function png(w, h, rgba) {
  const raw = new Uint8Array((4 * w + 1) * h); // each row starts with filter byte 0
  for (let y = 0; y < h; y++) raw.set(rgba.subarray(4 * w * y, 4 * w * (y + 1)), (4 * w + 1) * y + 1);
  const nb = Math.max(1, Math.ceil(raw.length / 65535));
  const z = new Uint8Array(2 + 5 * nb + raw.length + 4);
  z[0] = 0x78; z[1] = 0x01;
  let o = 2, a = 1, b = 0;
  for (let i = 0; i < nb; i++) {
    const c = raw.subarray(i * 65535, (i + 1) * 65535), n = c.length;
    z.set([i === nb - 1 ? 1 : 0, n & 255, n >> 8, ~n & 255, (~n >> 8) & 255], o);
    z.set(c, o + 5);
    o += 5 + n;
  }
  for (let i = 0; i < raw.length; i++) { a = (a + raw[i]) % 65521; b = (b + a) % 65521; }
  z.set(be32(((b << 16) | a) >>> 0), o);
  const chunk = (type, data) => {
    const td = new Uint8Array(4 + data.length);
    td.set([...type].map((ch) => ch.charCodeAt(0)));
    td.set(data, 4);
    let c = 0xffffffff;
    for (let i = 0; i < td.length; i++) c = CRC[(c ^ td[i]) & 255] ^ (c >>> 8);
    return [be32(data.length), td, be32((c ^ 0xffffffff) >>> 0)];
  };
  const parts = [[137, 80, 78, 71, 13, 10, 26, 10], ...chunk("IHDR", [...be32(w), ...be32(h), 8, 6, 0, 0, 0]), ...chunk("IDAT", z), ...chunk("IEND", [])];
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  parts.reduce((off, p) => (out.set(p, off), off + p.length), 0);
  return out;
}
const be32 = (v) => [v >>> 24, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];

// ponytail: macOS system fonts (Chrome's fallback for plotly's default font list); a shipped binary would embed its own.
const MAC_FONTS = {
  verdana: { normal: "Verdana.ttf", bold: "Verdana Bold.ttf", italic: "Verdana Italic.ttf", bolditalic: "Verdana Bold Italic.ttf" },
  arial: { normal: "Arial.ttf", bold: "Arial Bold.ttf", italic: "Arial Italic.ttf", bolditalic: "Arial Bold Italic.ttf" },
  "courier new": { normal: "Courier New.ttf", bold: "Courier New Bold.ttf" },
  "times new roman": { normal: "Times New Roman.ttf", bold: "Times New Roman Bold.ttf" },
};

module.exports = { installShim, MAC_FONTS, png, jsPngDataURL };
