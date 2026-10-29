document.addEventListener("click", (event) => {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const link = event.target.closest("a[href]");
  if (!link || link.hasAttribute("download") || window.parent === window) return;
  const url = new URL(link.href);
  if (url.origin !== location.origin) return;
  const filename = decodeURIComponent(url.hash.startsWith("#helper=")
    ? url.hash.slice("#helper=".length) : url.pathname.split("/").pop());
  if (!filename.endsWith(".html") || ["index.html", "data-sources.html"].includes(filename)) return;
  event.preventDefault();
  window.parent.postMessage({ type: "nihon:open-helper", filename }, location.origin);
});
