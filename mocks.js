// Renders plotly.js test mocks (one process, shared plotly) to <dir>/<name>.png; logs failures and timing.
// Usage: node mocks.js [dir]   (dir holds sample.txt, one mock name per line; default out/mocks)
// PAGE_CSS=0 renders like Plotly.toImage (no page stylesheet rules), to compare with chrome-toimage.sh references.
const fs = require("fs");
const { render, toPng } = require("./render.js");
const dir = process.argv[2] || "out/mocks";
const names = fs.readFileSync(`${dir}/sample.txt`, "utf8").trim().split("\n");
let current = "";
process.on("uncaughtException", (e) => console.log(`${current}: async error ${String(e.message).slice(0, 100)}`));
(async () => {
  for (const n of names) {
    current = n;
    const fig = JSON.parse(fs.readFileSync(`plotly-src/test/image/mocks/${n}.json`, "utf8"));
    const t0 = performance.now();
    try {
      const svg = await Promise.race([render(fig, { pageCss: process.env.PAGE_CSS !== "0" }), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout 60s")), 60000))]);
      fs.writeFileSync(`${dir}/${n}.png`, toPng(svg));
      console.log(`${n}: ok ${Math.round(performance.now() - t0)} ms`);
    } catch (e) {
      console.log(`${n}: FAIL ${String(e.message).slice(0, 100)}`);
    }
  }
})();
