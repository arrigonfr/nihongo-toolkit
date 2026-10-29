// Legacy flows accept confirmations; dedicated dialog tests exercise each choice.
export async function acceptStudyDialogs(page) {
  await page.addInitScript(() => {
    new MutationObserver(() => {
      document.querySelectorAll(".study-confirm-dialog[open]").forEach((dialog) => {
        dialog.querySelector(".study-pills button:nth-child(2)")?.click();
      });
    }).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ["open"] });
  });
}

// Keep tool assertions scoped to the launcher frame while browser controls stay on the page.
export function toolPage(page) {
  let embedded = false;
  const frameMethods = new Set(["check", "click", "evaluate", "fill", "frameLocator", "getAttribute",
    "inputValue", "locator", "press", "selectOption", "setInputFiles", "textContent", "title",
    "uncheck", "waitForFunction", "waitForSelector", "waitForURL"]);
  const frame = () => embedded ? page.frames().find((item) => item.parentFrame() === page.mainFrame()) : page.mainFrame();
  async function ready() {
    if (embedded) await page.frameLocator("#helperFrame").locator("#colorThemeSelect").waitFor();
  }
  return new Proxy(page, {
    get(target, property) {
      if (property === "goto") return async (address, options) => {
        const url = new URL(address);
        const file = decodeURIComponent(url.pathname.split("/").pop());
        embedded = file.endsWith(".html") && !["index.html", "data-sources.html"].includes(file);
        if (!embedded) return page.goto(address, options);
        const selected = file === "文字.html" ? "仮名.html" : file;
        await page.goto(new URL("./", url).href, options);
        await page.locator("#menuButton").click();
        await page.locator(`.helper-link[data-file="${selected}"]`).click();
        await page.waitForFunction((name) => document.querySelector("#helperFrame").getAttribute("src") === name, selected);
        await page.frameLocator("#helperFrame").locator("body").waitFor();
        await frame().waitForURL((address) => decodeURIComponent(address.pathname).endsWith(`/${selected}`));
        await ready();
      };
      if (property === "reload") return async (...args) => {
        await page.reload(...args);
        await ready();
      };
      const scope = frame();
      if (frameMethods.has(property)) return scope[property].bind(scope);
      const value = target[property];
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
}
