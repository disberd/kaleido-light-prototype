// headless-gl's src/javascript/native-gl.js for QuickJS: the native layer is the built-in qjs:webgl module
// (native/webgl.c). headless-gl's C++ also puts the GL constants on the prototype; here they come from
// native/gl-constants.json, dumped from the Node build.
import * as NativeWebGL from "qjs:webgl";
import constants from "./native/gl-constants.json";
const { WebGLRenderingContext: NativeWebGLRenderingContext } = NativeWebGL;
const gl = NativeWebGLRenderingContext.prototype;
Object.assign(gl, constants);
export { gl, NativeWebGL, NativeWebGLRenderingContext };
