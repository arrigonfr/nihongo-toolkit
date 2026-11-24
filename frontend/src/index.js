import { initializeAppearance, mountAppearance } from "./appearance.js";
import "./study-controls.css";
import { createSupportButton } from "./support.js";
import { legacyRoutes, navigationPage, pageFile } from "./routes.js";
import { initializeInterfaceLocalization } from "./interface-i18n.js";
import { mountHomepageShowcase } from "./homepage.js";

initializeAppearance();
initializeInterfaceLocalization();
const siteHeader = document.querySelector("[data-site-header]");
if (siteHeader) mountAppearance(siteHeader, siteHeader.querySelector("#themeButton"));
for (const link of document.querySelectorAll(".helper-link, .dashboard-link")) {
  const name = link.querySelector(".helper-name");
  const icon = link.querySelector(".helper-icon");
  if (!name || !icon) continue;
  const title = name.firstChild.textContent.replace(/\s*·\s*$/, "").trim();
  link.prepend(icon);
  name.textContent = title;
}
mountHomepageShowcase();
document.querySelector("[data-site-support], .dashboard")?.prepend(createSupportButton());
const menuButton = document.getElementById("menuButton");
const helperMenu = document.getElementById("helperMenu");
const helperFrame = document.getElementById("helperFrame");
const helperLinks = [...document.querySelectorAll(".helper-link")];
const helpers = new Map(helperLinks.map((link) => [link.dataset.file, link]));
const lastHelperKey = "nihon:last-helper";
const recentToolKey = "nihon:recent-tool";
const recentTool = document.getElementById("homeRecent");

function showRecentTool() {
  if (!recentTool) return;
  recentTool.hidden = true;
  try {
    const file = localStorage.getItem(recentToolKey) || localStorage.getItem(lastHelperKey);
    const link = helpers.get(legacyRoutes[file] || file);
    if (!link || link.closest('[aria-label="Support"]') || link.hasAttribute("data-unavailable")) return;
    recentTool.href = link.href;
    recentTool.textContent = `Continue with ${link.querySelector(".helper-name").textContent} →`;
    recentTool.hidden = false;
  } catch (error) {
    console.warn("Could not read the recent tool from local storage.", error);
  }
}

function setMenuOpen(open) {
  helperMenu.hidden = !open;
  menuButton.setAttribute("aria-expanded", String(open));
  menuButton.setAttribute("aria-label", open ? "Close helper menu" : "Open helper menu");
}

function currentHelper() {
  try {
    return pageFile(helperFrame.contentWindow.location.pathname);
  } catch {
    return null;
  }
}

function loadHelper(filename, navigate = true) {
  const link = helpers.get(filename);
  if (!link) return;
  if (helperFrame && navigate && currentHelper() !== link.dataset.file) {
    helperFrame.src = link.dataset.file;
  }
  if (helperFrame) helperFrame.title = `${link.querySelector(".helper-name").textContent} helper`;
  try {
    localStorage.setItem(lastHelperKey, link.dataset.file);
    if (!link.closest('[aria-label="Support"]') && !link.hasAttribute("data-unavailable")) {
      localStorage.setItem(recentToolKey, link.dataset.file);
    }
  } catch (error) {
    console.warn("Could not remember the last helper in local storage.", error);
  }
  helperLinks.forEach((item) => {
    if (item === link) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  });
}

helperFrame?.addEventListener("load", () => {
  const filename = currentHelper();
  if (helpers.has(filename)) loadHelper(filename, false);
});

window.addEventListener("message", (event) => {
  if (!helperFrame || event.origin !== location.origin || event.source !== helperFrame.contentWindow) return;
  if (event.data?.type === "nihon:open-helper") {
    loadHelper(event.data.filename);
    setMenuOpen(false);
  } else if (event.data?.type === "nihon:close-menu") setMenuOpen(false);
});

menuButton.addEventListener("click", () => setMenuOpen(helperMenu.hidden));
document.getElementById("homeBrowse")?.addEventListener("click", () => {
  setMenuOpen(true);
  menuButton.focus();
});
helperMenu.addEventListener("click", (event) => {
  const link = event.target.closest(".helper-link");
  if (!link) return;
  if (!helperFrame || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  loadHelper(link.dataset.file);
  setMenuOpen(false);
});
function dismissOutsideMenu(event) {
  if (!helperMenu.hidden && !helperMenu.contains(event.target) && !menuButton.contains(event.target)) {
    setMenuOpen(false);
  }
  if (window.parent !== window) window.parent.postMessage({ type: "nihon:close-menu" }, location.origin);
}
document.addEventListener("pointerdown", dismissOutsideMenu, true);
document.addEventListener("click", dismissOutsideMenu, true);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !helperMenu.hidden) {
    setMenuOpen(false);
    menuButton.focus();
  }
});

let requestedHelper = null;
if (location.hash.startsWith("#helper=")) {
  try {
    requestedHelper = decodeURIComponent(location.hash.slice("#helper=".length));
    requestedHelper = legacyRoutes[requestedHelper] || requestedHelper;
    if (!helperFrame && helpers.has(requestedHelper)) location.replace(new URL(requestedHelper, location.href));
  } catch (error) {
    console.warn("Could not read the requested helper.", error);
  }
}
if (location.hash.startsWith("#helper=") || location.pathname.endsWith("/index.html")) {
  try {
    history.replaceState(null, "", `${location.pathname.replace(/index\.html$/, "")}${location.search}`);
  } catch (error) {
    console.warn("Could not remove the previous helper URL fragment.", error);
    location.hash = "";
  }
}
let storedHelper = null;
try {
  storedHelper = localStorage.getItem(lastHelperKey);
  if (storedHelper === "文字.html") storedHelper = "kana.html";
} catch (error) {
  console.warn("Could not read the last helper from local storage.", error);
}
loadHelper(helperFrame
  ? helpers.has(requestedHelper) ? requestedHelper : helpers.has(storedHelper) ? storedHelper : helperLinks[0].dataset.file
  : navigationPage(location.pathname));
showRecentTool();
window.addEventListener("storage", (event) => {
  if (event.key === recentToolKey || event.key === lastHelperKey || event.key === null) showRecentTool();
});
