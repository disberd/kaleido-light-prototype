// node native/selftest.js: checks native/webgl.c through native/kl-qjs, with ANGLE from ../angle. A GL context
// clears and reads back, and pngDataURL decodes to the same pixels as shim.js's jsPngDataURL.
const { execFileSync } = require("child_process");
const zlib = require("zlib");
const assert = require("assert");
const { jsPngDataURL } = require("../shim.js");
const cases = [[1, 1], [3, 2], [200, 120]].flatMap(([w, h]) => [false, true].flatMap((flip) => [false, true].map((pre) => ({ w, h, flip, pre }))));
const pixels = `(w, h) => new Uint8Array(4 * w * h).map((_, i) => (i * 37 + (i >> 2) * 11) & 255)`;
const script = `import("qjs:webgl").then(({ pngDataURL, WebGLRenderingContext: W }) => {
  const gl = new W(2, 2, true, true, false, false, true, true, false, false), px = new Uint8Array(16);
  gl.clearColor(1, 0.5, 0, 1); gl.clear(0x4000); gl.readPixels(0, 0, 2, 2, 0x1908, 0x1401, px);
  const P = ${pixels};
  print(JSON.stringify({ clear: [...px], urls: ${JSON.stringify(cases)}.map((c) => pngDataURL(c.w, c.h, P(c.w, c.h), c.flip, c.pre)) }));
}, (e) => { print(e); std.exit(1); })`;
const out = JSON.parse(execFileSync(__dirname + "/kl-qjs", ["--std", "-e", script], { env: { ...process.env, KL_ANGLE_DIR: __dirname + "/../angle" } }));
assert.deepStrictEqual(out.clear, [255, 128, 0, 255, 255, 128, 0, 255, 255, 128, 0, 255, 255, 128, 0, 255], "clear/readPixels");
// RGBA8, filter 0 PNG -> pixels
const decode = (url) => {
  const b = Buffer.from(url.split(",")[1], "base64"), idat = [];
  let w = 0;
  for (let o = 8; o < b.length; o += 12 + b.readUInt32BE(o)) {
    const type = b.toString("latin1", o + 4, o + 8), data = b.subarray(o + 8, o + 8 + b.readUInt32BE(o));
    if (type === "IHDR") { w = data.readUInt32BE(0); assert.deepStrictEqual([...data.subarray(8)], [8, 6, 0, 0, 0]); }
    if (type === "IDAT") idat.push(data);
  }
  const raw = zlib.inflateSync(Buffer.concat(idat)), rows = [];
  for (let o = 0; o < raw.length; o += 4 * w + 1) { assert.strictEqual(raw[o], 0, "filter 0"); rows.push(raw.subarray(o + 1, o + 1 + 4 * w)); }
  return Buffer.concat(rows);
};
const P = eval(pixels);
cases.forEach((c, i) => assert.deepStrictEqual(decode(out.urls[i]), decode(jsPngDataURL(c.w, c.h, P(c.w, c.h), c.flip, c.pre)), JSON.stringify(c)));
console.log(`native selftest ok (${cases.length} PNG cases)`);
