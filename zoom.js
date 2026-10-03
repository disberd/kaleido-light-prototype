// Zoomed crop of Chrome (top) and lite (bottom). Usage: node zoom.js name x y w h [k] -> out/<name>.zoom.png
const fs = require("fs");
const { Resvg } = require("@resvg/resvg-js");
const [n, x, y, w, h, k = 4] = process.argv.slice(2).map((v, i) => (i ? +v : v));
const im = (f, dy) => `<image x="${-x * k}" y="${-y * k + dy}" width="${700 * k}" height="${500 * k}" style="image-rendering:optimizeSpeed" href="data:image/png;base64,${fs.readFileSync(f).toString("base64")}"/>`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w * k}" height="${2 * h * k + 4}"><svg width="${w * k}" height="${h * k}">${im(`out/${n}.chrome.png`, 0)}</svg><rect y="${h * k}" width="${w * k}" height="4" fill="#c00"/><svg y="${h * k + 4}" width="${w * k}" height="${h * k}">${im(`out/${n}.png`, 0)}</svg></svg>`;
fs.writeFileSync(`out/${n}.zoom.png`, new Resvg(svg).render().asPng());
