export const PAGE_PATHS = Object.freeze([
  "/", "/data-sources.html", "/eawase.html", "/fumitoki.html", "/goi.html",
  "/imi.html", "/kana.html", "/kanji-chizucho.html", "/kanji-kuizu.html",
  "/katsuyo-renshuu.html", "/katsuyo.html", "/kotoba-sagashi.html",
  "/kotoba.html", "/pazuru.html", "/shiritori.html", "/shiryo.html", "/yomi.html"
]);

export function canonicalPage(path) {
  if (path === "/index.html") return "/";
  const candidate = path.endsWith(".html") || path === "/" ? path : `${path}.html`;
  return PAGE_PATHS.includes(candidate) ? candidate : null;
}
