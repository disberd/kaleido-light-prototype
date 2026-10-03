// Renders one tiny figure per trace type and reports errors and whether trace marks reached the SVG.
const fs = require("fs");
const { render, toPng } = require("./render.js");
const z = [[1, 2, 3], [3, 1, 2], [2, 3, 1]];
const T = {
  scatter: { x: [1, 2, 3], y: [1, 3, 2] }, bar: { x: [1, 2, 3], y: [1, 3, 2] }, box: { y: [1, 2, 3, 4, 8] }, violin: { y: [1, 2, 3, 4, 8] },
  histogram2dcontour: { x: [1, 2, 2, 3, 3, 3], y: [1, 1, 2, 2, 3, 3] }, contour: { z }, heatmap: { z }, image: { z: [[[255, 0, 0], [0, 255, 0]]] },
  pie: { values: [1, 2] }, sunburst: { labels: ["a", "b", "c"], parents: ["", "a", "a"] }, treemap: { labels: ["a", "b", "c"], parents: ["", "a", "a"] },
  funnel: { x: [3, 2, 1] }, waterfall: { y: [1, -2, 3] }, candlestick: { x: [1, 2], open: [1, 2], high: [3, 4], low: [0, 1], close: [2, 3] },
  scatterpolar: { r: [1, 2, 3], theta: [0, 90, 180] }, barpolar: { r: [1, 2, 3] }, scatterternary: { a: [1, 2], b: [2, 1], c: [1, 1] },
  sankey: { node: { label: ["a", "b"] }, link: { source: [0], target: [1], value: [1] } }, table: { header: { values: ["A", "B"] }, cells: { values: [[1, 2], [3, 4]] } },
  indicator: { mode: "number+gauge", value: 42 }, carpet: { a: [1, 2], b: [1, 2], y: [1, 2, 3, 4] },
  scattergeo: { lon: [0, 10], lat: [0, 10] }, scattergl: { x: [1, 2, 3], y: [1, 3, 2] }, scatter3d: { x: [1, 2], y: [1, 2], z: [1, 2] },
  parcoords: { dimensions: [{ values: [1, 2] }, { values: [2, 1] }] }, scattermap: { lon: [0], lat: [0] },
};
process.on("uncaughtException", (e) => console.log("  async error:", String(e.message).slice(0, 90)));
(async () => {
  for (const [type, t] of Object.entries(T)) {
    const t0 = performance.now();
    try {
      const svg = await render({ data: [{ type, ...t }], layout: { title: { text: type } } }, { width: 400, height: 300 });
      const marks = (svg.match(/class="(point|js-line|bars?|surface|slice|box|violins?|contourlevel|hm|im|cell|sankey-link|bg-arc|trace[^"]*)"/g) || []).length;
      const images = (svg.match(/<image/g) || []).length;
      fs.writeFileSync(`out/cov-${type}.png`, toPng(svg));
      console.log(`${type.padEnd(19)} ok   ${String(Math.round(performance.now() - t0)).padStart(4)} ms  marks=${marks} images=${images} svg=${svg.length}`);
    } catch (e) {
      console.log(`${type.padEnd(19)} FAIL ${String(e.message).slice(0, 90)}`);
    }
  }
})();
