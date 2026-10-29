// Controls without a tooltip. The shared tool-help binds a tooltip to every <label> of a
// select / checkbox / number input, so these fields use a plain element labelled by aria-labelledby.
const escapeHTML = (text) => String(text ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const attrs = (extra) => Object.entries(extra).map(([name, value]) => ` ${name}="${escapeHTML(value)}"`).join("");

export function plainSelect(id, label, entries, extra = {}) {
  return `<div class="setting plain-field" id="field-${id}"><span class="field-label" id="label-${id}">${escapeHTML(label)}</span>`
    + `<select id="setting-${id}" data-setting="${id}" aria-labelledby="label-${id}"${attrs(extra)}>${entries.map(([value, name]) => `<option value="${escapeHTML(value)}">${escapeHTML(name)}</option>`).join("")}</select></div>`;
}

export function plainNumber(id, label, min, max) {
  return `<div class="setting plain-field" id="field-${id}"><span class="field-label" id="label-${id}">${escapeHTML(label)}</span>`
    + `<input id="setting-${id}" data-setting="${id}" type="number" min="${min}" max="${max}" step="1" required aria-labelledby="label-${id}"></div>`;
}

export function plainCheck(id, label) {
  return `<div class="setting check check-label plain-check" id="field-${id}"><input id="setting-${id}" type="checkbox" data-setting="${id}" aria-labelledby="label-${id}">`
    + `<span id="label-${id}">${escapeHTML(label)}</span></div>`;
}

// Clicking the text of a plain checkbox toggles it, like a real label would.
document.addEventListener("click", (event) => {
  const text = event.target.closest?.(".plain-check > span");
  if (!text) return;
  const input = text.parentElement.querySelector("input");
  if (input && !input.disabled) input.click();
});

// Replace the <label> title of a mounted chip group with a plain span so no tooltip is attached.
export function removeChipsTooltip(select) {
  const title = select?.closest(".chips-field")?.querySelector(":scope > label.chips-title");
  if (!title) return;
  const span = document.createElement("span");
  span.className = title.className;
  if (title.id) span.id = title.id;
  span.textContent = title.textContent;
  title.replaceWith(span);
}
