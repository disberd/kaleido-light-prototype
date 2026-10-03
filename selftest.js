// Self-check for the shim's path length and CSS text lowering: node selftest.js
const assert = require("assert");
const { document, finishSVG } = require("./render.js");
const path = (d) => { const p = document.createElementNS("http://www.w3.org/2000/svg", "path"); p.setAttribute("d", d); return p; };
assert.strictEqual(path("M0 0 L3 4 M10 10 L10 20").getTotalLength(), 15); // moves add no length
const quarter = path("M0 0 C 0 55.23 44.77 100 100 100").getTotalLength(); // ~quarter circle, r=100
assert(Math.abs(quarter - (Math.PI * 100) / 2) < 0.5, quarter);
assert.deepStrictEqual(path("M0 0 Q 50 0 100 0").getPointAtLength(25), { x: 25, y: 0 });

const out = finishSVG(`<svg xmlns="http://www.w3.org/2000/svg"><g class="crisp"></g>` +
  `<text style="font-size:10px;text-transform:capitalize;font-variant:small-caps;text-shadow:1px 1px 1px white;text-decoration-line:underline">foo bar</text></svg>`);
assert(out.includes(">F</tspan>") === false && out.includes("F<tspan") && out.includes('style="font-size:7px">OO</tspan>'), out);
assert(out.includes("text-decoration:underline") && /filter="url\(#kl-ts0\)"/.test(out) && out.includes("<feOffset dx=\"1\" dy=\"1\""), out);
assert(out.includes("shape-rendering:crispEdges") && !/text-transform|font-variant|text-shadow/.test(out), out);
console.log("selftest ok");
