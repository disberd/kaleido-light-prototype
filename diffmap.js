// Diff map: Chrome image greyed out, differing pixels in red. Usage: node diffmap.js name -> out/<name>.diff.png
const fs = require("fs");
const { Resvg } = require("@resvg/resvg-js");
const { png } = require("./shim.js");
const px = (f) => new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="700" height="500"><image width="700" height="500" href="data:image/png;base64,${fs.readFileSync(f).toString("base64")}"/></svg>`).render().pixels;
const n = process.argv[2], a = px(`out/${n}.chrome.png`), b = px(`out/${n}.png`), o = new Uint8ClampedArray(a.length);
for (let i = 0; i < a.length; i += 4) {
  const d = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 60;
  const g = 200 + (a[i] + a[i + 1] + a[i + 2]) / 15;
  o.set(d ? [220, 0, 0, 255] : [g, g, g, 255], i);
}
fs.writeFileSync(`out/${n}.diff.png`, png(700, 500, o));
