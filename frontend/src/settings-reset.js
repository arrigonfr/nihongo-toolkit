import { confirmAction } from "./confirm-dialog.js";

const KEY = /^nihon:.*(settings|controls)/;
const used = new Set();
const store = globalThis.localStorage;
if (store) {
  const { getItem, setItem } = Storage.prototype;
  const track = (key) => { if (KEY.test(String(key))) used.add(String(key)); };
  Storage.prototype.getItem = function (key) { if (this === store) track(key); return getItem.call(this, key); };
  Storage.prototype.setItem = function (key, value) { if (this === store) track(key); return setItem.call(this, key, value); };
}

async function reset() {
  if (!(await confirmAction("Reset every setting on this page to its default value?", { confirmLabel: "Reset" }))) return;
  for (const key of used) store.removeItem(key);
  location.reload();
}

function attach(panel) {
  if (panel.querySelector(".reset-defaults")) return;
  const slot = panel.querySelector("[data-reset-slot]");
  if (slot) {
    const inline = document.createElement("button");
    inline.type = "button"; inline.className = "button reset-defaults reset-defaults-button reset-defaults-inline"; inline.textContent = "Reset to defaults";
    inline.addEventListener("click", reset);
    slot.append(inline);
    return;
  }
  const row = document.createElement("div");
  row.className = "reset-defaults";
  const button = document.createElement("button");
  button.type = "button"; button.className = "button reset-defaults-button"; button.textContent = "Reset to defaults";
  button.addEventListener("click", reset);
  row.append(button);
  panel.append(row);
}

const scan = () => document.querySelectorAll("details#settingsPanel, details#settingsDrawer").forEach(attach);
new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });
scan();
