// @ts-check

const HTML_ENTITIES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

const XML_ENTITIES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
};

const RAW_HTML = Symbol("raw-html");

/**
 * Escapes HTML special characters (`&`, `<`, `>`, `"`, `'`).
 * @param {unknown} value
 * @returns {string}
 */
export function escapeHTML(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (char) => HTML_ENTITIES[/** @type {keyof typeof HTML_ENTITIES} */ (char)],
  );
}

/**
 * Escapes XML/SVG special characters (`&`, `<`, `>`, `"`), preserving apostrophes in text nodes.
 * @param {unknown} value
 * @returns {string}
 */
export function escapeXML(value) {
  return String(value ?? "").replace(
    /[&<>"]/g,
    (char) => XML_ENTITIES[/** @type {keyof typeof XML_ENTITIES} */ (char)],
  );
}

/**
 * Marks a trusted, pre-escaped HTML string so `html` will not escape it again.
 * @param {unknown} value
 * @returns {{ [RAW_HTML]: true, value: string }}
 */
export function raw(value) {
  return { [RAW_HTML]: true, value: String(value ?? "") };
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function renderValue(value) {
  if (value === null || value === undefined || value === false) return "";
  if (Array.isArray(value)) return value.map(renderValue).join("");
  if (typeof value === "object" && RAW_HTML in value) {
    return /** @type {{ value: string }} */ (/** @type {unknown} */ (value)).value;
  }
  return escapeHTML(value);
}

/**
 * Tagged template literal that HTML-escapes all interpolated values by default.
 * Wrap trusted HTML fragments with `raw(...)`.
 * @param {TemplateStringsArray} strings
 * @param {...unknown} values
 * @returns {string}
 */
export function html(strings, ...values) {
  let out = strings[0] || "";
  for (let i = 0; i < values.length; i++) {
    out += renderValue(values[i]) + (strings[i + 1] || "");
  }
  return out;
}

/**
 * Sets an element's HTML content from a string or `raw(...)` fragment.
 * @template {Element} T
 * @param {T | null | undefined} element
 * @param {string | { [RAW_HTML]: true, value: string } | null | undefined} markup
 * @returns {T | null | undefined}
 */
export function setHTML(element, markup) {
  if (!element) return element;
  element.innerHTML = markup && typeof markup === "object" && RAW_HTML in markup ? markup.value : String(markup ?? "");
  return element;
}
