#!/bin/bash
# kl-qjs: quickjs-ng 0.17.0's qjs plus the built-in qjs:webgl module (webgl.c). ANGLE is loaded at run time.
# `kl-qjs -c bundle.mjs -o exe` then makes a standalone binary with the module in it.
set -e
cd "$(dirname "$0")"
Q=quickjs
[ -d $Q ] || git clone -q --depth 1 --branch v0.17.0 https://github.com/quickjs-ng/quickjs.git $Q
# ponytail: one sed hook into qjs.c instead of a separate host program
sed -e 's|#include "quickjs-libc.h"|&\nJSModuleDef *js_init_module_webgl(JSContext *ctx, const char *name);|' \
    -e 's|js_init_module_bjson(ctx, "qjs:bjson");|&\n    js_init_module_webgl(ctx, "qjs:webgl");|' $Q/qjs.c > kl-qjs.c
grep -q js_init_module_webgl kl-qjs.c
${CC:-clang} -O2 -funsigned-char -D_GNU_SOURCE -w -I$Q -Iinclude \
  kl-qjs.c webgl.c $Q/quickjs.c $Q/libregexp.c $Q/libunicode.c $Q/dtoa.c $Q/quickjs-libc.c \
  $Q/gen/repl.c $Q/gen/standalone.c -lm -lpthread -o kl-qjs
