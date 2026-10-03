// qjs:webgl, headless-gl's native layer (src/native/webgl.cc) ported to QuickJS: same method names and
// semantics, so headless-gl's JS layer (validation, objects, extensions) runs on top unchanged.
// GL comes from ANGLE (libEGL + libGLESv2), loaded at run time from the executable's directory or
// $KL_ANGLE_DIR. Backend from $KL_ANGLE: swiftshader (default, CPU, same pixels on every OS), metal, d3d11,
// vulkan, gl, default.
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include "quickjs.h"
#define GL_GLEXT_PROTOTYPES
#define EGL_NO_PLATFORM_SPECIFIC_TYPES // no X11/windows.h: only pbuffers are used
#define EGL_EGLEXT_PROTOTYPES
#include <EGL/egl.h>
#include <EGL/eglext.h>
#include <GLES2/gl2.h>
#include <GLES2/gl2ext.h>
#define STB_IMAGE_WRITE_IMPLEMENTATION
#define STB_IMAGE_WRITE_STATIC
#define STBI_WRITE_NO_STDIO
#include "stb_image_write.h"

#ifdef _WIN32
#include <windows.h>
#define LIBEGL "libEGL.dll"
#define SEP '\\'
static void *open_lib(const char *p) { return (void *)LoadLibraryA(p); }
static void *lib_sym(void *h, const char *n) { return (void *)GetProcAddress((HMODULE)h, n); }
static void exe_path(char *b, unsigned n) { GetModuleFileNameA(NULL, b, n); }
#else
#include <dlfcn.h>
#include <unistd.h>
#define SEP '/'
static void *open_lib(const char *p) { return dlopen(p, RTLD_NOW | RTLD_LOCAL); }
static void *lib_sym(void *h, const char *n) { return dlsym(h, n); }
#ifdef __APPLE__
#include <mach-o/dyld.h>
#define LIBEGL "libEGL.dylib"
static void exe_path(char *b, unsigned n) { uint32_t s = n; if (_NSGetExecutablePath(b, &s)) b[0] = 0; }
#else
#define LIBEGL "libEGL.so"
static void exe_path(char *b, unsigned n) { ssize_t k = readlink("/proc/self/exe", b, n - 1); b[k > 0 ? k : 0] = 0; }
#endif
#endif

// Every GL/EGL entry point, resolved through eglGetProcAddress (ANGLE returns core functions too).
#define GLFNS(X) X(glActiveTexture) X(glAttachShader) X(glBindAttribLocation) X(glBindBuffer) \
  X(glBindFramebuffer) X(glBindRenderbuffer) X(glBindTexture) X(glBlendColor) X(glBlendEquation) \
  X(glBlendEquationSeparate) X(glBlendFunc) X(glBlendFuncSeparate) X(glBufferData) X(glBufferSubData) \
  X(glCheckFramebufferStatus) X(glClear) X(glClearColor) X(glClearDepthf) X(glClearStencil) X(glColorMask) \
  X(glCompileShader) X(glCopyTexImage2D) X(glCopyTexSubImage2D) X(glCreateProgram) X(glCreateShader) \
  X(glCullFace) X(glDeleteBuffers) X(glDeleteFramebuffers) X(glDeleteProgram) X(glDeleteRenderbuffers) \
  X(glDeleteShader) X(glDeleteTextures) X(glDepthFunc) X(glDepthMask) X(glDepthRangef) X(glDetachShader) \
  X(glDisable) X(glDisableVertexAttribArray) X(glDrawArrays) X(glDrawElements) X(glEnable) \
  X(glEnableVertexAttribArray) X(glFinish) X(glFlush) X(glFramebufferRenderbuffer) X(glFramebufferTexture2D) \
  X(glFrontFace) X(glGenBuffers) X(glGenerateMipmap) X(glGenFramebuffers) X(glGenRenderbuffers) \
  X(glGenTextures) X(glGetActiveAttrib) X(glGetActiveUniform) X(glGetAttachedShaders) X(glGetAttribLocation) \
  X(glGetBooleanv) X(glGetBufferParameteriv) X(glGetError) X(glGetFloatv) \
  X(glGetFramebufferAttachmentParameteriv) X(glGetIntegerv) X(glGetProgramiv) X(glGetProgramInfoLog) \
  X(glGetRenderbufferParameteriv) X(glGetShaderiv) X(glGetShaderInfoLog) X(glGetShaderPrecisionFormat) \
  X(glGetShaderSource) X(glGetString) X(glGetTexParameterfv) X(glGetTexParameteriv) X(glGetUniformfv) \
  X(glGetUniformLocation) X(glGetVertexAttribfv) X(glGetVertexAttribiv) X(glGetVertexAttribPointerv) X(glHint) \
  X(glIsBuffer) X(glIsEnabled) X(glIsFramebuffer) X(glIsProgram) X(glIsRenderbuffer) X(glIsShader) \
  X(glIsTexture) X(glLineWidth) X(glLinkProgram) X(glPixelStorei) X(glPolygonOffset) X(glReadPixels) \
  X(glRenderbufferStorage) X(glSampleCoverage) X(glScissor) X(glShaderSource) X(glStencilFunc) \
  X(glStencilFuncSeparate) X(glStencilMask) X(glStencilMaskSeparate) X(glStencilOp) X(glStencilOpSeparate) \
  X(glTexImage2D) X(glTexParameterf) X(glTexParameteri) X(glTexSubImage2D) X(glUniform1f) X(glUniform1i) \
  X(glUniform2f) X(glUniform2i) X(glUniform3f) X(glUniform3i) X(glUniform4f) X(glUniform4i) \
  X(glUniformMatrix2fv) X(glUniformMatrix3fv) X(glUniformMatrix4fv) X(glUseProgram) X(glValidateProgram) \
  X(glVertexAttrib1f) X(glVertexAttrib2f) X(glVertexAttrib3f) X(glVertexAttrib4f) X(glVertexAttribPointer) \
  X(glViewport) X(glDrawArraysInstancedANGLE) X(glDrawElementsInstancedANGLE) X(glVertexAttribDivisorANGLE) \
  X(glDrawBuffersEXT) X(glBindVertexArrayOES) X(glDeleteVertexArraysOES) X(glGenVertexArraysOES) \
  X(glIsVertexArrayOES) X(glRequestExtensionANGLE) \
  X(eglGetPlatformDisplayEXT) X(eglInitialize) X(eglChooseConfig) X(eglCreateContext) \
  X(eglCreatePbufferSurface) X(eglMakeCurrent) X(eglDestroyContext) X(eglDestroySurface) X(eglGetError)
#define DECL(f) static __typeof__(&f) p_##f;
GLFNS(DECL)

static EGLDisplay dpy = EGL_NO_DISPLAY;
static EGLConfig config;
static const char *load_error;

static const char *load_angle(void) {
  char dir[4096];
  const char *env = getenv("KL_ANGLE_DIR");
  if (env && *env) snprintf(dir, sizeof dir, "%s", env);
  else {
    exe_path(dir, sizeof dir);
    char *s = strrchr(dir, SEP);
    if (s) *s = 0;
  }
  char path[4200];
  snprintf(path, sizeof path, "%s%c%s", dir, SEP, LIBEGL);
  void *h = open_lib(path);
  if (!h) return "cannot load " LIBEGL " (put ANGLE next to the executable or set KL_ANGLE_DIR)";
  __typeof__(&eglGetProcAddress) gpa = (__typeof__(&eglGetProcAddress))lib_sym(h, "eglGetProcAddress");
  if (!gpa) return "no eglGetProcAddress in " LIBEGL;
#define LOAD(f) if (!(p_##f = (__typeof__(&f))gpa(#f))) return "missing " #f;
  GLFNS(LOAD)

  const char *b = getenv("KL_ANGLE");
  b = b ? b : "swiftshader";
  EGLint type = !strcmp(b, "metal") ? EGL_PLATFORM_ANGLE_TYPE_METAL_ANGLE
              : !strcmp(b, "d3d11") ? EGL_PLATFORM_ANGLE_TYPE_D3D11_ANGLE
              : !strcmp(b, "gl") ? EGL_PLATFORM_ANGLE_TYPE_OPENGL_ANGLE
              : !strcmp(b, "default") ? EGL_PLATFORM_ANGLE_TYPE_DEFAULT_ANGLE
              : EGL_PLATFORM_ANGLE_TYPE_VULKAN_ANGLE; // vulkan, and swiftshader on top of it
  EGLint attrs[] = {EGL_PLATFORM_ANGLE_TYPE_ANGLE, type, EGL_NONE, EGL_NONE, EGL_NONE};
  if (!strcmp(b, "swiftshader")) {
    attrs[2] = EGL_PLATFORM_ANGLE_DEVICE_TYPE_ANGLE;
    attrs[3] = EGL_PLATFORM_ANGLE_DEVICE_TYPE_SWIFTSHADER_ANGLE;
  }
  dpy = p_eglGetPlatformDisplayEXT(EGL_PLATFORM_ANGLE_ANGLE, (void *)EGL_DEFAULT_DISPLAY, attrs);
  if (dpy == EGL_NO_DISPLAY || !p_eglInitialize(dpy, NULL, NULL)) return "eglInitialize failed for this KL_ANGLE backend";
  EGLint cattrs[] = {EGL_SURFACE_TYPE, EGL_PBUFFER_BIT, EGL_RED_SIZE, 8, EGL_GREEN_SIZE, 8, EGL_BLUE_SIZE, 8,
                     EGL_ALPHA_SIZE, 8, EGL_DEPTH_SIZE, 24, EGL_STENCIL_SIZE, 8, EGL_NONE};
  EGLint n = 0;
  if (!p_eglChooseConfig(dpy, cattrs, &config, 1, &n) || n != 1) return "no RGBA8/D24S8 pbuffer EGL config";
  return NULL;
}

typedef struct {
  EGLContext ctx;
  EGLSurface surf;
  int flip_y, premul, colorspace, unpack_alignment;
  GLenum last_error;
} GL;
static JSClassID gl_class_id;
static GL *active;

static GL *current(JSContext *ctx, JSValueConst this_val) {
  GL *g = JS_GetOpaque(this_val, gl_class_id);
  if (!g || !g->ctx) { JS_ThrowTypeError(ctx, "Invalid GL context"); return NULL; }
  if (g != active) {
    if (!p_eglMakeCurrent(dpy, g->surf, g->surf, g->ctx)) { JS_ThrowTypeError(ctx, "Invalid GL context"); return NULL; }
    active = g;
  }
  return g;
}

static void dispose(GL *g) {
  if (!g->ctx) return;
  if (active == g) { p_eglMakeCurrent(dpy, EGL_NO_SURFACE, EGL_NO_SURFACE, EGL_NO_CONTEXT); active = NULL; }
  p_eglDestroySurface(dpy, g->surf);
  p_eglDestroyContext(dpy, g->ctx);
  g->ctx = NULL;
}

static void gl_finalizer(JSRuntime *rt, JSValueConst val) {
  GL *g = JS_GetOpaque(val, gl_class_id);
  if (g) { dispose(g); free(g); }
}

static int32_t toi(JSContext *ctx, JSValueConst v) { int32_t r = 0; JS_ToInt32(ctx, &r, v); return r; }
static double tof(JSContext *ctx, JSValueConst v) { double r = 0; JS_ToFloat64(ctx, &r, v); return r; }

// Bytes of a typed array (or ArrayBuffer), NULL for anything else, like Nan::TypedArrayContents.
static uint8_t *bytes(JSContext *ctx, JSValueConst v, size_t *len) {
  size_t off = 0, n = 0, el = 0, sz = 0;
  *len = 0;
  if (!JS_IsObject(v)) return NULL;
  JSValue ab = JS_GetTypedArrayBuffer(ctx, v, &off, &n, &el);
  if (JS_IsException(ab)) {
    JS_FreeValue(ctx, JS_GetException(ctx));
    uint8_t *p = JS_GetArrayBuffer(ctx, &sz, v);
    if (!p) JS_FreeValue(ctx, JS_GetException(ctx));
    *len = p ? sz : 0;
    return p;
  }
  uint8_t *p = JS_GetArrayBuffer(ctx, &sz, ab);
  JS_FreeValue(ctx, ab);
  *len = p ? n : 0;
  return p ? p + off : NULL;
}

#define M(name) static JSValue m_##name(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv)
#define BOILER GL *g = current(ctx, this_val); if (!g) return JS_EXCEPTION; (void)g;
#define I(n) toi(ctx, argv[n])
#define U(n) ((GLuint)toi(ctx, argv[n]))
#define F(n) ((GLfloat)tof(ctx, argv[n]))
#define B(n) ((GLboolean)JS_ToBool(ctx, argv[n]))
#define PTR(n) ((void *)(size_t)(uint32_t)toi(ctx, argv[n]))

// name, arity, call: methods returning undefined / an int / a bool.
#define VOIDS(X) \
  X(_vertexAttribDivisor, 2, p_glVertexAttribDivisorANGLE(U(0), U(1))) \
  X(_drawArraysInstanced, 4, p_glDrawArraysInstancedANGLE(I(0), I(1), U(2), U(3))) \
  X(_drawElementsInstanced, 5, p_glDrawElementsInstancedANGLE(I(0), I(1), I(2), PTR(3), U(4))) \
  X(uniform1f, 2, p_glUniform1f(I(0), F(1))) X(uniform2f, 3, p_glUniform2f(I(0), F(1), F(2))) \
  X(uniform3f, 4, p_glUniform3f(I(0), F(1), F(2), F(3))) X(uniform4f, 5, p_glUniform4f(I(0), F(1), F(2), F(3), F(4))) \
  X(uniform1i, 2, p_glUniform1i(I(0), I(1))) X(uniform2i, 3, p_glUniform2i(I(0), I(1), I(2))) \
  X(uniform3i, 4, p_glUniform3i(I(0), I(1), I(2), I(3))) X(uniform4i, 5, p_glUniform4i(I(0), I(1), I(2), I(3), I(4))) \
  X(drawArrays, 3, p_glDrawArrays(I(0), I(1), I(2))) X(generateMipmap, 1, p_glGenerateMipmap(I(0))) \
  X(depthFunc, 1, p_glDepthFunc(I(0))) X(viewport, 4, p_glViewport(I(0), I(1), I(2), I(3))) \
  X(compileShader, 1, p_glCompileShader(I(0))) X(frontFace, 1, p_glFrontFace(I(0))) \
  X(attachShader, 2, p_glAttachShader(I(0), I(1))) X(validateProgram, 1, p_glValidateProgram(I(0))) \
  X(linkProgram, 1, p_glLinkProgram(I(0))) X(clearColor, 4, p_glClearColor(F(0), F(1), F(2), F(3))) \
  X(clearDepth, 1, p_glClearDepthf(F(0))) X(disable, 1, p_glDisable(I(0))) X(enable, 1, p_glEnable(I(0))) \
  X(bindTexture, 2, p_glBindTexture(I(0), I(1))) X(texParameteri, 3, p_glTexParameteri(I(0), I(1), I(2))) \
  X(texParameterf, 3, p_glTexParameterf(I(0), I(1), F(2))) X(clear, 1, p_glClear(I(0))) \
  X(useProgram, 1, p_glUseProgram(I(0))) X(bindBuffer, 2, p_glBindBuffer(I(0), U(1))) \
  X(bindFramebuffer, 2, p_glBindFramebuffer(I(0), I(1))) \
  X(framebufferTexture2D, 5, p_glFramebufferTexture2D(I(0), I(1), I(2), I(3), I(4))) \
  X(blendEquation, 1, p_glBlendEquation(I(0))) X(blendFunc, 2, p_glBlendFunc(I(0), I(1))) \
  X(enableVertexAttribArray, 1, p_glEnableVertexAttribArray(I(0))) \
  X(vertexAttribPointer, 6, p_glVertexAttribPointer(I(0), I(1), I(2), B(3), I(4), PTR(5))) \
  X(activeTexture, 1, p_glActiveTexture(I(0))) X(drawElements, 4, p_glDrawElements(I(0), I(1), I(2), PTR(3))) \
  X(flush, 0, p_glFlush()) X(finish, 0, p_glFinish()) \
  X(vertexAttrib1f, 2, p_glVertexAttrib1f(I(0), F(1))) X(vertexAttrib2f, 3, p_glVertexAttrib2f(I(0), F(1), F(2))) \
  X(vertexAttrib3f, 4, p_glVertexAttrib3f(I(0), F(1), F(2), F(3))) \
  X(vertexAttrib4f, 5, p_glVertexAttrib4f(I(0), F(1), F(2), F(3), F(4))) \
  X(blendColor, 4, p_glBlendColor(F(0), F(1), F(2), F(3))) \
  X(blendEquationSeparate, 2, p_glBlendEquationSeparate(I(0), I(1))) \
  X(blendFuncSeparate, 4, p_glBlendFuncSeparate(I(0), I(1), I(2), I(3))) X(clearStencil, 1, p_glClearStencil(I(0))) \
  X(colorMask, 4, p_glColorMask(B(0), B(1), B(2), B(3))) \
  X(copyTexImage2D, 8, p_glCopyTexImage2D(I(0), I(1), I(2), I(3), I(4), I(5), I(6), I(7))) \
  X(copyTexSubImage2D, 8, p_glCopyTexSubImage2D(I(0), I(1), I(2), I(3), I(4), I(5), I(6), I(7))) \
  X(cullFace, 1, p_glCullFace(I(0))) X(depthMask, 1, p_glDepthMask(B(0))) X(depthRange, 2, p_glDepthRangef(F(0), F(1))) \
  X(disableVertexAttribArray, 1, p_glDisableVertexAttribArray(I(0))) X(hint, 2, p_glHint(I(0), I(1))) \
  X(lineWidth, 1, p_glLineWidth(F(0))) X(polygonOffset, 2, p_glPolygonOffset(F(0), F(1))) \
  X(sampleCoverage, 2, p_glSampleCoverage(F(0), B(1))) X(scissor, 4, p_glScissor(I(0), I(1), I(2), I(3))) \
  X(stencilFunc, 3, p_glStencilFunc(I(0), I(1), U(2))) X(stencilFuncSeparate, 4, p_glStencilFuncSeparate(I(0), I(1), I(2), U(3))) \
  X(stencilMask, 1, p_glStencilMask(U(0))) X(stencilMaskSeparate, 2, p_glStencilMaskSeparate(I(0), U(1))) \
  X(stencilOp, 3, p_glStencilOp(I(0), I(1), I(2))) X(stencilOpSeparate, 4, p_glStencilOpSeparate(I(0), I(1), I(2), I(3))) \
  X(bindRenderbuffer, 2, p_glBindRenderbuffer(I(0), U(1))) \
  X(deleteProgram, 1, p_glDeleteProgram(U(0))) X(deleteShader, 1, p_glDeleteShader(U(0))) \
  X(detachShader, 2, p_glDetachShader(U(0), U(1))) \
  X(framebufferRenderbuffer, 4, p_glFramebufferRenderbuffer(I(0), I(1), I(2), U(3))) \
  X(renderbufferStorage, 4, p_glRenderbufferStorage(I(0), I(1), I(2), I(3))) \
  X(bindVertexArrayOES, 1, p_glBindVertexArrayOES(U(0)))
#define INTS(X) \
  X(createShader, 1, p_glCreateShader(I(0))) X(createProgram, 0, p_glCreateProgram()) \
  X(checkFramebufferStatus, 1, p_glCheckFramebufferStatus(I(0)))
#define BOOLS(X) \
  X(isEnabled, 1, p_glIsEnabled(I(0))) X(isBuffer, 1, p_glIsBuffer(U(0))) X(isFramebuffer, 1, p_glIsFramebuffer(U(0))) \
  X(isProgram, 1, p_glIsProgram(U(0))) X(isRenderbuffer, 1, p_glIsRenderbuffer(U(0))) X(isShader, 1, p_glIsShader(U(0))) \
  X(isTexture, 1, p_glIsTexture(U(0))) X(isVertexArrayOES, 1, p_glIsVertexArrayOES(U(0)))
#define DEF_V(name, n, call) M(name) { BOILER call; return JS_UNDEFINED; }
#define DEF_I(name, n, call) M(name) { BOILER return JS_NewInt32(ctx, (int32_t)(call)); }
#define DEF_B(name, n, call) M(name) { BOILER return JS_NewBool(ctx, (call) != 0); }
VOIDS(DEF_V)
INTS(DEF_I)
BOOLS(DEF_B)

// glGen* / glDelete* for one object
#define GEN(name, fn) M(name) { BOILER GLuint o = 0; p_##fn(1, &o); return JS_NewInt32(ctx, (int32_t)o); }
#define DEL(name, fn) M(name) { BOILER GLuint o = U(0); p_##fn(1, &o); return JS_UNDEFINED; }
GEN(createBuffer, glGenBuffers) GEN(createFramebuffer, glGenFramebuffers) GEN(createRenderbuffer, glGenRenderbuffers)
GEN(createTexture, glGenTextures) GEN(createVertexArrayOES, glGenVertexArraysOES)
DEL(deleteBuffer, glDeleteBuffers) DEL(deleteFramebuffer, glDeleteFramebuffers)
DEL(deleteRenderbuffer, glDeleteRenderbuffers) DEL(deleteTexture, glDeleteTextures)
DEL(deleteVertexArrayOES, glDeleteVertexArraysOES)

// (program or shader, int arg) -> int through a glGet*iv
#define GETIV(name, fn) M(name) { BOILER GLint v = 0; p_##fn(I(0), I(1), &v); return JS_NewInt32(ctx, v); }
GETIV(getShaderParameter, glGetShaderiv) GETIV(getProgramParameter, glGetProgramiv)
GETIV(getBufferParameter, glGetBufferParameteriv) GETIV(getRenderbufferParameter, glGetRenderbufferParameteriv)

static JSValue gl_ctor(JSContext *ctx, JSValueConst new_target, int argc, JSValueConst *argv) {
  JSValue proto = JS_GetPropertyStr(ctx, new_target, "prototype");
  JSValue obj = JS_NewObjectProtoClass(ctx, proto, gl_class_id);
  JS_FreeValue(ctx, proto);
  if (JS_IsException(obj)) return obj;
  GL *g = calloc(1, sizeof *g);
  g->colorspace = 0x9244;
  g->unpack_alignment = 4;
  JS_SetOpaque(obj, g);
  int w = argc > 0 ? I(0) : 0, h = argc > 1 ? I(1) : 0;
  // headless-gl's wrapContext builds an argument-less wrapper whose methods are all rebound to the real
  // context: give it no GL context at all.
  if (w <= 0 || h <= 0) return obj;
  static int tried;
  if (!tried) {
    tried = 1;
    load_error = load_angle();
    if (load_error) fprintf(stderr, "kaleido-lite: no WebGL: %s\n", load_error);
  }
  if (load_error) { JS_FreeValue(ctx, obj); return JS_ThrowTypeError(ctx, "Error creating WebGLContext: %s", load_error); }
  // A WebGL 1 context as Chrome makes it: ES 2.0 exactly, and WebGL rules in ANGLE's shader compiler
  // (plotly's shaders use non-constant global initializers, which only the WebGL spec allows).
  EGLint ca[] = {EGL_CONTEXT_MAJOR_VERSION, 2, EGL_CONTEXT_MINOR_VERSION, 0,
                 EGL_CONTEXT_OPENGL_BACKWARDS_COMPATIBLE_ANGLE, EGL_FALSE,
                 EGL_CONTEXT_WEBGL_COMPATIBILITY_ANGLE, EGL_TRUE, EGL_NONE};
  EGLint sa[] = {EGL_WIDTH, w, EGL_HEIGHT, h, EGL_NONE};
  g->ctx = p_eglCreateContext(dpy, config, EGL_NO_CONTEXT, ca);
  g->surf = p_eglCreatePbufferSurface(dpy, config, sa);
  const char *ext = NULL;
  if (g->ctx && g->surf && p_eglMakeCurrent(dpy, g->surf, g->surf, g->ctx)) {
    active = g;
    // A WebGL context starts with extensions off; headless-gl's JS layer expects them all on (like its
    // plain ES context), and only hands out the ones WebGL defines.
    const char *req = (const char *)p_glGetString(GL_REQUESTABLE_EXTENSIONS_ANGLE);
    for (char name[128]; req && *req; req += strspn(req, " ")) {
      size_t n = strcspn(req, " ");
      snprintf(name, sizeof name, "%.*s", (int)n, req);
      p_glRequestExtensionANGLE(name);
      req += n;
    }
    ext = (const char *)p_glGetString(GL_EXTENSIONS);
  }
  if (!ext || !strstr(ext, "GL_OES_packed_depth_stencil") || !strstr(ext, "GL_ANGLE_instanced_arrays")) {
    dispose(g);
    JS_FreeValue(ctx, obj);
    return JS_ThrowTypeError(ctx, "Error creating WebGLContext (EGL error 0x%x)", p_eglGetError());
  }
  return obj;
}

M(destroy) { BOILER dispose(g); return JS_UNDEFINED; }

static void set_error(GL *g, GLenum e) {
  if (e == GL_NO_ERROR || g->last_error != GL_NO_ERROR) return;
  if (p_glGetError() == GL_NO_ERROR) g->last_error = e;
}
M(setError) { BOILER set_error(g, I(0)); return JS_UNDEFINED; }
M(getError) {
  BOILER GLenum e = p_glGetError();
  if (g->last_error != GL_NO_ERROR) e = g->last_error;
  g->last_error = GL_NO_ERROR;
  return JS_NewInt32(ctx, e);
}

M(pixelStorei) {
  BOILER GLenum p = I(0);
  GLint v = I(1);
  if (p == 0x9240) g->flip_y = v != 0;
  else if (p == 0x9241) g->premul = v != 0;
  else if (p == 0x9243) g->colorspace = v;
  else {
    if (p == GL_UNPACK_ALIGNMENT) g->unpack_alignment = v;
    p_glPixelStorei(p, v);
  }
  return JS_UNDEFINED;
}

// (program, index or name string) helpers
#define STR_CALL(name, n, body) M(name) { BOILER const char *s = JS_ToCString(ctx, argv[n]); if (!s) return JS_EXCEPTION; body; }
STR_CALL(bindAttribLocation, 2, p_glBindAttribLocation(I(0), I(1), s); JS_FreeCString(ctx, s); return JS_UNDEFINED)
STR_CALL(getAttribLocation, 1, GLint r = p_glGetAttribLocation(I(0), s); JS_FreeCString(ctx, s); return JS_NewInt32(ctx, r))
STR_CALL(getUniformLocation, 1, GLint r = p_glGetUniformLocation(I(0), s); JS_FreeCString(ctx, s); return JS_NewInt32(ctx, r))

M(shaderSource) {
  BOILER size_t n;
  const char *s = JS_ToCStringLen(ctx, &n, argv[1]);
  if (!s) return JS_EXCEPTION;
  GLint len = (GLint)n;
  p_glShaderSource(I(0), 1, &s, &len);
  JS_FreeCString(ctx, s);
  return JS_UNDEFINED;
}

#define INFOLOG(name, getiv, getlog) M(name) { \
  BOILER GLint id = I(0), n = 0; p_##getiv(id, GL_INFO_LOG_LENGTH, &n); \
  char *b = calloc(n + 1, 1); p_##getlog(id, n + 1, &n, b); \
  JSValue r = JS_NewString(ctx, b); free(b); return r; }
INFOLOG(getShaderInfoLog, glGetShaderiv, glGetShaderInfoLog)
INFOLOG(getProgramInfoLog, glGetProgramiv, glGetProgramInfoLog)
M(getShaderSource) {
  BOILER GLint id = I(0), n = 0;
  p_glGetShaderiv(id, GL_SHADER_SOURCE_LENGTH, &n);
  char *b = calloc(n + 1, 1);
  p_glGetShaderSource(id, n + 1, &n, b);
  JSValue r = JS_NewString(ctx, b);
  free(b);
  return r;
}

#define UMAT(name, fn, k) M(name) { BOILER size_t n; GLfloat *d = (GLfloat *)bytes(ctx, argv[2], &n); \
  p_##fn(I(0), (GLsizei)(n / sizeof(GLfloat) / k), B(1), d); return JS_UNDEFINED; }
UMAT(uniformMatrix2fv, glUniformMatrix2fv, 4) UMAT(uniformMatrix3fv, glUniformMatrix3fv, 9)
UMAT(uniformMatrix4fv, glUniformMatrix4fv, 16)

M(bufferData) {
  BOILER size_t n;
  if (JS_IsObject(argv[1])) {
    uint8_t *d = bytes(ctx, argv[1], &n);
    p_glBufferData(I(0), (GLsizeiptr)n, d, I(2));
  } else if (JS_IsNumber(argv[1])) p_glBufferData(I(0), I(1), NULL, I(2));
  return JS_UNDEFINED;
}
M(bufferSubData) {
  BOILER size_t n;
  uint8_t *d = bytes(ctx, argv[2], &n);
  p_glBufferSubData(I(0), I(1), (GLsizeiptr)n, d);
  return JS_UNDEFINED;
}

// UNPACK_FLIP_Y_WEBGL / UNPACK_PREMULTIPLY_ALPHA_WEBGL, done on the CPU like headless-gl.
static uint8_t *unpack(GL *g, GLenum type, GLenum format, GLint w, GLint h, const uint8_t *px) {
  GLint ps = 1;
  if (type == GL_UNSIGNED_BYTE || type == GL_FLOAT) {
    if (type == GL_FLOAT) ps = 4;
    ps *= format == GL_LUMINANCE_ALPHA ? 2 : format == GL_RGB ? 3 : format == GL_RGBA ? 4 : 1;
  } else ps = 2;
  GLint stride = ps * w;
  if (stride % g->unpack_alignment) stride += g->unpack_alignment - stride % g->unpack_alignment;
  uint8_t *u = malloc((size_t)stride * h);
  if (g->flip_y) for (int i = 0, j = h - 1; j >= 0; ++i, --j) memcpy(u + (size_t)j * stride, px + (size_t)i * stride, (size_t)w * ps);
  else memcpy(u, px, (size_t)stride * h);
  if (g->premul && (format == GL_LUMINANCE_ALPHA || format == GL_RGBA)) {
    for (int r = 0; r < h; ++r)
      for (int c = 0; c < w; ++c) {
        uint8_t *p = u + (size_t)r * stride + (size_t)c * ps;
        if (format == GL_LUMINANCE_ALPHA) p[0] = (uint8_t)(p[0] * (p[1] / 255.0));
        else if (type == GL_UNSIGNED_BYTE) { float k = (float)(p[3] / 255.0); p[0] *= k; p[1] *= k; p[2] *= k; }
        // ponytail: headless-gl's 4444/5551 premultiply left out, plotly uploads only RGBA8 and float
      }
  }
  return u;
}

M(texImage2D) {
  BOILER GLenum target = I(0), ifmt = I(2), fmt = I(6), type = I(7);
  // In ANGLE only sized float formats are color-renderable (GL_CHROMIUM_color_buffer_float_rgb[a],
  // GL_EXT_color_buffer_half_float); WebGL 1 passes unsized ones, so size them like Chrome does.
  if (type == GL_FLOAT && (ifmt == GL_RGBA || ifmt == GL_RGB)) ifmt = ifmt == GL_RGBA ? GL_RGBA32F_EXT : GL_RGB32F_EXT;
  else if (type == GL_HALF_FLOAT_OES && (ifmt == GL_RGBA || ifmt == GL_RGB)) ifmt = ifmt == GL_RGBA ? GL_RGBA16F_EXT : GL_RGB16F_EXT;
  GLint level = I(1), w = I(3), h = I(4), border = I(5);
  size_t n;
  uint8_t *px = bytes(ctx, argv[8], &n);
  if (px && (g->flip_y || g->premul)) {
    uint8_t *u = unpack(g, type, fmt, w, h, px);
    p_glTexImage2D(target, level, ifmt, w, h, border, fmt, type, u);
    free(u);
  } else if (px) p_glTexImage2D(target, level, ifmt, w, h, border, fmt, type, px);
  else {
    void *z = calloc((size_t)w * h * 4 * (type == GL_FLOAT ? 4 : 1), 1);
    p_glTexImage2D(target, level, ifmt, w, h, border, fmt, type, z);
    free(z);
  }
  return JS_UNDEFINED;
}
M(texSubImage2D) {
  BOILER GLenum fmt = I(6), type = I(7);
  GLint w = I(4), h = I(5);
  size_t n;
  uint8_t *px = bytes(ctx, argv[8], &n);
  if (px && (g->flip_y || g->premul)) {
    uint8_t *u = unpack(g, type, fmt, w, h, px);
    p_glTexSubImage2D(I(0), I(1), I(2), I(3), w, h, fmt, type, u);
    free(u);
  } else p_glTexSubImage2D(I(0), I(1), I(2), I(3), w, h, fmt, type, px);
  return JS_UNDEFINED;
}
M(readPixels) {
  BOILER size_t n;
  uint8_t *px = bytes(ctx, argv[6], &n);
  p_glReadPixels(I(0), I(1), I(2), I(3), I(4), I(5), px);
  return JS_UNDEFINED;
}

M(getVertexAttribOffset) {
  BOILER void *r = NULL;
  p_glGetVertexAttribPointerv(U(0), I(1), &r);
  return JS_NewInt32(ctx, (int32_t)(size_t)r);
}
M(getTexParameter) {
  BOILER GLenum t = I(0), p = I(1);
  if (p == GL_TEXTURE_MAX_ANISOTROPY_EXT) { GLfloat v = 0; p_glGetTexParameterfv(t, p, &v); return JS_NewFloat64(ctx, v); }
  GLint v = 0;
  p_glGetTexParameteriv(t, p, &v);
  return JS_NewInt32(ctx, v);
}
M(getFramebufferAttachmentParameter) {
  BOILER GLint v = 0;
  p_glGetFramebufferAttachmentParameteriv(I(0), I(1), I(2), &v);
  return JS_NewInt32(ctx, v);
}

static JSValue active_info(JSContext *ctx, GLint size, GLenum type, const char *name) {
  JSValue o = JS_NewObject(ctx);
  JS_SetPropertyStr(ctx, o, "size", JS_NewInt32(ctx, size));
  JS_SetPropertyStr(ctx, o, "type", JS_NewInt32(ctx, type));
  JS_SetPropertyStr(ctx, o, "name", JS_NewString(ctx, name));
  return o;
}
#define ACTIVE(name, maxlen, fn) M(name) { \
  BOILER GLuint prog = U(0); GLint m = 0; p_glGetProgramiv(prog, maxlen, &m); \
  char *s = calloc(m + 1, 1); GLsizei len = 0; GLint size = 0; GLenum type = 0; \
  p_##fn(prog, U(1), m, &len, &size, &type, s); \
  JSValue r = len > 0 ? active_info(ctx, size, type, s) : JS_NULL; free(s); return r; }
ACTIVE(getActiveAttrib, GL_ACTIVE_ATTRIBUTE_MAX_LENGTH, glGetActiveAttrib)
ACTIVE(getActiveUniform, GL_ACTIVE_UNIFORM_MAX_LENGTH, glGetActiveUniform)

M(getAttachedShaders) {
  BOILER GLuint prog = U(0), sh[64];
  GLsizei n = 0;
  p_glGetAttachedShaders(prog, 64, &n, sh);
  JSValue a = JS_NewArray(ctx);
  for (int i = 0; i < n; i++) JS_SetPropertyUint32(ctx, a, i, JS_NewInt32(ctx, (int32_t)sh[i]));
  return a;
}

static JSValue farr(JSContext *ctx, const GLfloat *v, int n) {
  JSValue a = JS_NewArray(ctx);
  for (int i = 0; i < n; i++) JS_SetPropertyUint32(ctx, a, i, JS_NewFloat64(ctx, v[i]));
  return a;
}
static JSValue iarr(JSContext *ctx, const GLint *v, int n) {
  JSValue a = JS_NewArray(ctx);
  for (int i = 0; i < n; i++) JS_SetPropertyUint32(ctx, a, i, JS_NewInt32(ctx, v[i]));
  return a;
}

M(getParameter) {
  BOILER GLenum p = I(0);
  GLboolean bv[4];
  GLfloat fv[4];
  GLint iv[4];
  switch (p) {
  case 0x9240: return JS_NewBool(ctx, g->flip_y);
  case 0x9241: return JS_NewBool(ctx, g->premul);
  case 0x9243: return JS_NewInt32(ctx, g->colorspace);
  case GL_BLEND: case GL_CULL_FACE: case GL_DEPTH_TEST: case GL_DEPTH_WRITEMASK: case GL_DITHER:
  case GL_POLYGON_OFFSET_FILL: case GL_SAMPLE_COVERAGE_INVERT: case GL_SCISSOR_TEST: case GL_STENCIL_TEST:
    p_glGetBooleanv(p, bv);
    return JS_NewBool(ctx, bv[0] != 0);
  case GL_DEPTH_CLEAR_VALUE: case GL_LINE_WIDTH: case GL_POLYGON_OFFSET_FACTOR: case GL_POLYGON_OFFSET_UNITS:
  case GL_SAMPLE_COVERAGE_VALUE: case GL_MAX_TEXTURE_MAX_ANISOTROPY_EXT:
    p_glGetFloatv(p, fv);
    return JS_NewFloat64(ctx, fv[0]);
  case GL_RENDERER: case GL_SHADING_LANGUAGE_VERSION: case GL_VENDOR: case GL_VERSION: case GL_EXTENSIONS: {
    const char *s = (const char *)p_glGetString(p);
    return s ? JS_NewString(ctx, s) : JS_UNDEFINED;
  }
  case GL_MAX_VIEWPORT_DIMS: p_glGetIntegerv(p, iv); return iarr(ctx, iv, 2);
  case GL_SCISSOR_BOX: case GL_VIEWPORT: p_glGetIntegerv(p, iv); return iarr(ctx, iv, 4);
  case GL_ALIASED_LINE_WIDTH_RANGE: case GL_ALIASED_POINT_SIZE_RANGE: case GL_DEPTH_RANGE:
    p_glGetFloatv(p, fv);
    return farr(ctx, fv, 2);
  case GL_BLEND_COLOR: case GL_COLOR_CLEAR_VALUE: p_glGetFloatv(p, fv); return farr(ctx, fv, 4);
  case GL_COLOR_WRITEMASK: {
    p_glGetBooleanv(p, bv);
    JSValue a = JS_NewArray(ctx);
    for (int i = 0; i < 4; i++) JS_SetPropertyUint32(ctx, a, i, JS_NewBool(ctx, bv[i] == GL_TRUE));
    return a;
  }
  default: iv[0] = 0; p_glGetIntegerv(p, iv); return JS_NewInt32(ctx, iv[0]);
  }
}

M(getShaderPrecisionFormat) {
  BOILER GLint range[2] = {0, 0}, prec = 0;
  p_glGetShaderPrecisionFormat(I(0), I(1), range, &prec);
  JSValue o = JS_NewObject(ctx);
  JS_SetPropertyStr(ctx, o, "rangeMin", JS_NewInt32(ctx, range[0]));
  JS_SetPropertyStr(ctx, o, "rangeMax", JS_NewInt32(ctx, range[1]));
  JS_SetPropertyStr(ctx, o, "precision", JS_NewInt32(ctx, prec));
  return o;
}
M(getUniform) {
  BOILER GLfloat d[16] = {0};
  p_glGetUniformfv(I(0), I(1), d);
  return farr(ctx, d, 16);
}
M(getVertexAttrib) {
  BOILER GLint i = I(0), v = 0;
  GLenum p = I(1);
  GLfloat f[4];
  switch (p) {
  case GL_VERTEX_ATTRIB_ARRAY_ENABLED: case GL_VERTEX_ATTRIB_ARRAY_NORMALIZED:
    p_glGetVertexAttribiv(i, p, &v);
    return JS_NewBool(ctx, v != 0);
  case GL_VERTEX_ATTRIB_ARRAY_SIZE: case GL_VERTEX_ATTRIB_ARRAY_STRIDE: case GL_VERTEX_ATTRIB_ARRAY_TYPE:
  case GL_VERTEX_ATTRIB_ARRAY_BUFFER_BINDING:
    p_glGetVertexAttribiv(i, p, &v);
    return JS_NewInt32(ctx, v);
  case GL_CURRENT_VERTEX_ATTRIB: p_glGetVertexAttribfv(i, p, f); return farr(ctx, f, 4);
  default: set_error(g, GL_INVALID_ENUM); return JS_NULL;
  }
}
M(getSupportedExtensions) {
  BOILER const char *s = (const char *)p_glGetString(GL_EXTENSIONS);
  return JS_NewString(ctx, s ? s : "");
}
M(getExtension) { BOILER return JS_UNDEFINED; } // headless-gl's JS layer builds the extension objects
M(drawBuffersWEBGL) {
  BOILER int64_t n = 0;
  JS_GetLength(ctx, argv[0], &n);
  GLenum b[16];
  if (n > 16) n = 16;
  for (int i = 0; i < n; i++) { JSValue v = JS_GetPropertyUint32(ctx, argv[0], i); b[i] = (GLenum)toi(ctx, v); JS_FreeValue(ctx, v); }
  p_glDrawBuffersEXT((GLsizei)n, b);
  return JS_UNDEFINED;
}
M(extWEBGL_draw_buffers) {
  JSValue o = JS_NewObject(ctx);
  char k[40];
  for (int i = 0; i < 16; i++) {
    snprintf(k, sizeof k, "COLOR_ATTACHMENT%d_WEBGL", i);
    JS_SetPropertyStr(ctx, o, k, JS_NewInt32(ctx, GL_COLOR_ATTACHMENT0_EXT + i));
    snprintf(k, sizeof k, "DRAW_BUFFER%d_WEBGL", i);
    JS_SetPropertyStr(ctx, o, k, JS_NewInt32(ctx, GL_DRAW_BUFFER0_EXT + i));
  }
  JS_SetPropertyStr(ctx, o, "MAX_COLOR_ATTACHMENTS_WEBGL", JS_NewInt32(ctx, GL_MAX_COLOR_ATTACHMENTS_EXT));
  JS_SetPropertyStr(ctx, o, "MAX_DRAW_BUFFERS_WEBGL", JS_NewInt32(ctx, GL_MAX_DRAW_BUFFERS_EXT));
  return o;
}
static JSValue cleanup(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) { return JS_UNDEFINED; }


// shim.js's jsPngDataURL in C, deflated (stb_image_write, filter 0) where shim.js stores: a GL canvas is
// mostly empty, and plotly's string passes over the SVG crawl in QuickJS with megabytes of stored PNG.
// flip: rows are bottom-up; unpremultiply: alpha is premultiplied. Rounds like a Uint8ClampedArray store.
static uint8_t clamp8(double x) {
  if (!(x > 0)) return 0;
  if (x >= 255) return 255;
  double f = floor(x), d = x - f;
  return (uint8_t)(d > 0.5 || (d == 0.5 && fmod(f, 2) != 0) ? f + 1 : f);
}
static JSValue js_png_data_url(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  int32_t w = I(0), h = I(1);
  size_t n, stride = 4 * (size_t)w;
  const uint8_t *px = bytes(ctx, argv[2], &n);
  int flip = JS_ToBool(ctx, argv[3]), unpre = JS_ToBool(ctx, argv[4]);
  if (w <= 0 || h <= 0 || !px || n < stride * h) return JS_ThrowTypeError(ctx, "pngDataURL: need %d x %d RGBA pixels", w, h);
  uint8_t *rgba = malloc(stride * h);
  for (int32_t y = 0; y < h; y++) {
    const uint8_t *s = px + stride * (flip ? h - 1 - y : y);
    uint8_t *d = rgba + stride * y;
    if (!unpre) { memcpy(d, s, stride); continue; }
    for (int32_t x = 0; x < 4 * w; x += 4) {
      uint8_t a = s[x + 3];
      for (int c = 0; c < 3; c++) d[x + c] = a ? clamp8(s[x + c] * 255.0 / a) : s[x + c];
      d[x + 3] = a;
    }
  }
  stbi_write_force_png_filter = 0;
  int len = 0;
  uint8_t *png = stbi_write_png_to_mem(rgba, (int)stride, w, h, 4, &len);
  free(rgba);
  if (!png) return JS_ThrowOutOfMemory(ctx);
  static const char B64[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const char *pre = "data:image/png;base64,";
  size_t pl = strlen(pre), el = ((size_t)len + 2) / 3 * 4;
  char *e = malloc(pl + el), *q = e + pl;
  memcpy(e, pre, pl);
  for (size_t i = 0; i < (size_t)len; i += 3) {
    uint32_t v = png[i] << 16 | (i + 1 < (size_t)len ? png[i + 1] << 8 : 0) | (i + 2 < (size_t)len ? png[i + 2] : 0);
    *q++ = B64[v >> 18];
    *q++ = B64[(v >> 12) & 63];
    *q++ = i + 1 < (size_t)len ? B64[(v >> 6) & 63] : '=';
    *q++ = i + 2 < (size_t)len ? B64[v & 63] : '=';
  }
  JSValue r = JS_NewStringLen(ctx, e, pl + el);
  free(png);
  free(e);
  return r;
}

#define ENTRY(name, n, call) JS_CFUNC_DEF(#name, n, m_##name),
#define E(name, n) JS_CFUNC_DEF(#name, n, m_##name),
static const JSCFunctionListEntry proto_funcs[] = {
  VOIDS(ENTRY) INTS(ENTRY) BOOLS(ENTRY)
  E(createBuffer, 0) E(createFramebuffer, 0) E(createRenderbuffer, 0) E(createTexture, 0) E(createVertexArrayOES, 0)
  E(deleteBuffer, 1) E(deleteFramebuffer, 1) E(deleteRenderbuffer, 1) E(deleteTexture, 1) E(deleteVertexArrayOES, 1)
  E(getShaderParameter, 2) E(getProgramParameter, 2) E(getBufferParameter, 2) E(getRenderbufferParameter, 2)
  E(destroy, 0) E(getError, 0) E(pixelStorei, 2) E(bindAttribLocation, 3) E(getAttribLocation, 2)
  E(getUniformLocation, 2) E(shaderSource, 2) E(getShaderInfoLog, 1) E(getProgramInfoLog, 1) E(getShaderSource, 1)
  E(uniformMatrix2fv, 3) E(uniformMatrix3fv, 3) E(uniformMatrix4fv, 3) E(bufferData, 3) E(bufferSubData, 3)
  E(texImage2D, 9) E(texSubImage2D, 9) E(readPixels, 7) E(getVertexAttribOffset, 2) E(getTexParameter, 2)
  E(getFramebufferAttachmentParameter, 3) E(getActiveAttrib, 2) E(getActiveUniform, 2) E(getAttachedShaders, 1)
  E(getParameter, 1) E(getShaderPrecisionFormat, 2) E(getUniform, 2) E(getVertexAttrib, 2)
  E(getSupportedExtensions, 0) E(getExtension, 1) E(drawBuffersWEBGL, 1) E(extWEBGL_draw_buffers, 0)
};

static int webgl_init(JSContext *ctx, JSModuleDef *m) {
  JSRuntime *rt = JS_GetRuntime(ctx);
  if (!gl_class_id) JS_NewClassID(rt, &gl_class_id);
  JSClassDef def = {"WebGLRenderingContext", .finalizer = gl_finalizer};
  JS_NewClass(rt, gl_class_id, &def);
  JSValue proto = JS_NewObject(ctx);
  JS_SetPropertyFunctionList(ctx, proto, proto_funcs, sizeof proto_funcs / sizeof proto_funcs[0]);
  JSValue ctor = JS_NewCFunction2(ctx, gl_ctor, "WebGLRenderingContext", 10, JS_CFUNC_constructor, 0);
  JS_SetConstructor(ctx, ctor, proto);
  JS_SetClassProto(ctx, gl_class_id, proto);
  JS_SetModuleExport(ctx, m, "WebGLRenderingContext", ctor);
  JS_SetModuleExport(ctx, m, "setError", JS_NewCFunction(ctx, m_setError, "setError", 1));
  JS_SetModuleExport(ctx, m, "cleanup", JS_NewCFunction(ctx, cleanup, "cleanup", 0));
  JS_SetModuleExport(ctx, m, "pngDataURL", JS_NewCFunction(ctx, js_png_data_url, "pngDataURL", 5));
  return 0;
}

JSModuleDef *js_init_module_webgl(JSContext *ctx, const char *name) {
  JSModuleDef *m = JS_NewCModule(ctx, name, webgl_init);
  if (!m) return NULL;
  JS_AddModuleExport(ctx, m, "WebGLRenderingContext");
  JS_AddModuleExport(ctx, m, "setError");
  JS_AddModuleExport(ctx, m, "cleanup");
  JS_AddModuleExport(ctx, m, "pngDataURL");
  return m;
}
