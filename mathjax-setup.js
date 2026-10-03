// Spike: MathJax 3 (npm mathjax, es5/tex-svg.js source text) on the linkedom window, for plotly's TeX strings.
// Plotly 4 converts through MathJax's internal API on the page document, so MathJax runs on linkedom itself.
// MathJax's menu reads navigator.platform at load (linkedom's navigator has none and ignores assignment) and
// localStorage; the assistive MathML step fails on linkedom and a static export does not need it.
module.exports = function loadMathJax(window, src) {
  globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
  window.MathJax = {
    startup: { typeset: false },
    svg: { fontCache: "local" },
    options: { enableMenu: false, enableAssistiveMml: false, menuOptions: { settings: { assistiveMml: false } } },
  };
  const navigator = { platform: "", userAgent: "", language: "en" };
  new Function("window", src)(new Proxy(window, { get: (t, k) => (k === "navigator" ? navigator : t[k]) }));
  globalThis.MathJax = window.MathJax; // plotly reads the global
  return globalThis.MathJax.startup.promise;
};
