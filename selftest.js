// Self-check for the shim's path length, CSS text lowering and 3D text outlines: node selftest.js
const assert = require("assert");
const { document, finishSVG } = require("./render.js");
const path = (d) => { const p = document.createElementNS("http://www.w3.org/2000/svg", "path"); p.setAttribute("d", d); return p; };
assert.strictEqual(path("M0 0 L3 4 M10 10 L10 20").getTotalLength(), 15); // moves add no length
const quarter = path("M0 0 C 0 55.23 44.77 100 100 100").getTotalLength(); // ~quarter circle, r=100
assert(Math.abs(quarter - (Math.PI * 100) / 2) < 0.5, quarter);
assert.deepStrictEqual(path("M0 0 Q 50 0 100 0").getPointAtLength(25), { x: 25, y: 0 });

const out = finishSVG(`<svg xmlns="http://www.w3.org/2000/svg"><g class="crisp"></g>` +
  `<text style="font-size:10px;text-transform:capitalize;font-variant:small-caps;text-shadow:1px 1px 1px white;text-decoration-line:underline">foo bar</text></svg>`, { pageCss: true });
assert(!finishSVG(`<svg xmlns="http://www.w3.org/2000/svg"><g class="crisp"></g></svg>`).includes("crispEdges")); // off by default, as Kaleido
assert(out.includes(">F</tspan>") === false && out.includes("F<tspan") && out.includes('style="font-size:7px">OO</tspan>'), out);
assert(out.includes("text-decoration:underline") && /filter="url\(#kl-ts0\)"/.test(out) && out.includes("<feOffset dx=\"1\" dy=\"1\""), out);
assert(out.includes("shape-rendering:crispEdges") && !/text-transform|font-variant|text-shadow/.test(out), out);
// 3D text: the canvas keeps glyph outlines since the last full clear; a glyph whose contours cross (Arial's Å) drops them
const cv = document.createElement("canvas"), ctx = cv.getContext("2d");
const drawn = (t) => { ctx.fillRect(0, 0, cv.width, cv.height); ctx.font = "64px Arial"; ctx.fillText(t, 10, 100); return ctx.getImageData(0, 0, cv.width, cv.height).data.glyphs; };
const ab = drawn("Ab");
assert(ab.length === 2 && ab[0].length === 2 && ab[1].length === 2 && ab.flat(2).every(([x, y]) => x > 5 && x < 90 && y > 50 && y < 102), JSON.stringify(ab));
assert.strictEqual(drawn("Å"), null);
// patchPlotly finds vectorize-text's processPixels by shape, minified (1.x to 4.x) or not
const { patchPlotly } = require("./shim.js");
for (const src of ["function h(t,e,r){try{return f(t,e,r,!0)}catch(t){}try{return f(t,e,r,!1)}catch(t){}}",
  "function processPixels(pixels, options, size) {\n  try {\n    return processPixelsImpl(pixels, options, size, true);\n  } catch (e) {\n  }\n  try {\n    return processPixelsImpl(pixels, options, size, false);\n  } catch (e) {}\n}"]) {
  const r = patchPlotly(src), args = src.match(/\(([^)]*)\)/)[1].replace(/\s/g, "");
  assert(r.patched && r.src.includes(`globalThis.__klText(${args});if(__kl)return __kl;`), r.src);
}
assert(!patchPlotly("function h(t,e,r){return 1}").patched);
// GL readback loops: jsFixPixels matches plotly's flipPixels + correctRGB byte for byte, and the patch finds them
// in both shapes (named, as 3.x+ minified; inline, as 1.x-2.x) and leaves other code between alone.
const { jsFixPixels } = require("./shim.js");
const flip = "function F(t,e,r){for(var n=0,i=r-1;n<i;++n,--i)for(var a=0;a<e;++a)for(var o=0;o<4;++o){var s=4*(e*n+a)+o,l=4*(e*i+a)+o,c=t[s];t[s]=t[l],t[l]=c}}";
const corr = "function C(t,e,r){for(var n=0;n<r;++n)for(var i=0;i<e;++i){var a=4*(e*n+i),o=t[a+3];if(o>0)for(var s=255/o,l=0;l<3;++l)t[a+l]=Math.min(s*t[a+l],255)}}";
const [F, C] = new Function(`${flip}${corr}return [F, C]`)();
for (const [w, h] of [[1, 1], [3, 2], [7, 5]]) {
  const a = new Uint8Array(4 * w * h).map((_, i) => (i * 37 + (i >> 2) * 11) & 255), b = a.slice();
  F(a, w, h), C(a, w, h), jsFixPixels(b, w, h, true);
  assert.deepStrictEqual(b, a, `${w}x${h}`);
}
const rp = (tail) => `x.readPixels(0,0,w,h,x.RGBA,x.UNSIGNED_BYTE,p)${tail};var c=document.createElement("canvas")`;
assert(patchPlotly(flip + corr + rp(",F(p,w,h),C(p,w,h)")).src.includes(";globalThis.__klPixels(p,w,h,true);"));
assert(patchPlotly(rp(`,${flip.replace("function F", "function")}(p,w,h)`)).src.includes(";globalThis.__klPixels(p,w,h,false);"));
assert(!patchPlotly(flip + rp(",F(p,w,h),G(p)")).src.includes("__klPixels")); // something else in between
console.log("selftest ok");
