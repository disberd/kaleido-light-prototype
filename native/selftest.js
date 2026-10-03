// node native/selftest.js: checks native/webgl.c through native/kl-qjs, with ANGLE from ../angle. A GL context
// clears and reads back, compiles a shader only WebGL rules accept (plotly's), renders to an RGBA/FLOAT texture
// (gl-plot3d's transparency pass), and pngDataURL decodes to the same pixels as shim.js's jsPngDataURL.
const { execFileSync } = require("child_process");
const zlib = require("zlib");
const assert = require("assert");
const { jsPngDataURL } = require("../shim.js");
const cases = [[1, 1], [3, 2], [200, 120]].flatMap(([w, h]) => [false, true].flatMap((flip) => [false, true].map((pre) => ({ w, h, flip, pre }))));
const pixels = `(w, h) => new Uint8Array(4 * w * h).map((_, i) => (i * 37 + (i >> 2) * 11) & 255)`;
const script = `import("qjs:webgl").then(({ pngDataURL, WebGLRenderingContext: W }) => {
  const gl = new W(2, 2, true, true, false, false, true, true, false, false), px = new Uint8Array(16);
  gl.clearColor(1, 0.5, 0, 1); gl.clear(0x4000); gl.readPixels(0, 0, 2, 2, 0x1908, 0x1401, px);
  const sh = gl.createShader(0x8B31); // a global initialized from a uniform: an error in plain GLSL ES 1.00
  gl.shaderSource(sh, "attribute vec4 p; uniform float u; float k = 2.0 * u; void main() { gl_Position = k * p; }");
  gl.compileShader(sh);
  const tex = gl.createTexture();
  gl.bindTexture(0x0DE1, tex); gl.texImage2D(0x0DE1, 0, 0x1908, 4, 4, 0, 0x1908, 0x1406, null);
  gl.bindFramebuffer(0x8D40, gl.createFramebuffer()); gl.framebufferTexture2D(0x8D40, 0x8CE0, 0x0DE1, tex, 0);
  const P = ${pixels};
  print(JSON.stringify({ renderer: gl.getParameter(0x1F01), clear: [...px], shader: gl.getShaderParameter(sh, 0x8B81),
    floatFbo: gl.checkFramebufferStatus(0x8D40), urls: ${JSON.stringify(cases)}.map((c) => pngDataURL(c.w, c.h, P(c.w, c.h), c.flip, c.pre)) }));
}, (e) => { print(e); std.exit(1); })`;
const out = JSON.parse(execFileSync(__dirname + "/kl-qjs", ["--std", "-e", script], { env: { ...process.env, KL_ANGLE_DIR: __dirname + "/../angle" } }));
assert.deepStrictEqual(out.clear, [255, 128, 0, 255, 255, 128, 0, 255, 255, 128, 0, 255, 255, 128, 0, 255], "clear/readPixels");
assert.strictEqual(out.shader, 1, "WebGL shader rules (EGL_CONTEXT_WEBGL_COMPATIBILITY_ANGLE)");
assert.strictEqual(out.floatFbo, 0x8cd5, "RGBA/FLOAT texture is color-renderable");
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
console.log(`native selftest ok (${cases.length} PNG cases) on ${out.renderer}`);
