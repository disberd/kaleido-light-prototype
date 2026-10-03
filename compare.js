// Side-by-side (Chrome | lite) image + share of differing pixels. Usage: node compare.js name...
const fs = require("fs");
const { Resvg } = require("@resvg/resvg-js");
const img = (f, x = 0) => `<image x="${x}" width="700" height="500" href="data:image/png;base64,${fs.readFileSync(f).toString("base64")}"/>`;
const px = (f) => new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="700" height="500">${img(f)}</svg>`).render().pixels;
for (const n of process.argv.slice(2)) {
  const missing = [".chrome.png", ".png"].find((x) => !fs.existsSync(`${process.env.OUT || "out"}/${n}${x}`));
  if (missing) { console.log(`${n}: missing ${n}${missing}`); continue; }
  const [a, b] = [px(`${process.env.OUT || "out"}/${n}.chrome.png`), px(`${process.env.OUT || "out"}/${n}.png`)];
  let diff = 0;
  for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 60) diff++;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1410" height="500"><rect width="1410" height="500" fill="#c00"/>${img(`${process.env.OUT || "out"}/${n}.chrome.png`)}${img(`${process.env.OUT || "out"}/${n}.png`, 710)}</svg>`;
  fs.writeFileSync(`${process.env.OUT || "out"}/${n}.cmp.png`, new Resvg(svg).render().asPng());
  console.log(`${n}: ${((100 * diff) / (a.length / 4)).toFixed(2)}% pixels differ`);
}
