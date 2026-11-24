import { bind, toHiragana } from "wanakana";
import { romanizeKana } from "../romanize.js";

export const draft = { source: "NihongoToolkit original practice material", license: "Unpublished draft", reviewStatus: "awaiting Japanese review", contentVersion: "draft-1" };
export const kana = value => toHiragana(String(value).normalize("NFKC").replace(/\s+/gu, ""), { passRomaji: true });
export function el(parent, tag, text, attrs = {}) {
  const node = parent.ownerDocument.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  if (text != null) node.textContent = text;
  parent.append(node);
  return node;
}
export function select(parent, id, title, options) {
  const label = el(parent, "label", null,{class:"preview-practice-field"});
  el(label,"span",title);
  const field = el(label, "select", null, { id, name: id, "data-setting": id });
  for (const [value, text] of options) el(field, "option", text, { value });
  return field;
}
export const setting = (c, id, fallback) => c.querySelector(`#${id}`)?.value || fallback;
export function button(c, text, click, attrs = {}) {
  const b = el(c, "button", text, { type: "button", ...attrs });
  b.addEventListener("click", click);
  return b;
}
export function answers(c, choices, label, submit) {
  let done = false;
  const send = value => {
    if (!done && value.trim()) { done = true; submit(value.trim()); }
  };
  if (choices) {
    const group = el(c, "div", null, { class: "answer-actions preview-practice-options", role: "group", "aria-label": label });
    for (const choice of choices) button(group, choice, () => send(choice), { lang: "ja" });
  } else {
    const form = el(c, "form",null,{class:"preview-practice-answer"}), field = el(el(form, "label", label,{class:"preview-practice-field"}), "input", null, {
      lang: "ja", required: "", maxlength: "40", autocomplete: "off", autocapitalize: "off", spellcheck: "false"
    });
    bind(field, { IMEMode: "toHiragana" });
    field.placeholder = "Romaji converts to kana";
    el(form, "button", "Check answer", { type: "submit", class: "primary" });
    let composing = false;
    field.oncompositionstart = () => { composing = true; };
    field.oncompositionend = () => { composing = false; };
    form.onsubmit = event => { event.preventDefault(); if (!composing) send(toHiragana(field.value)); };
  }
}
export function reading(c, text) {
  el(c, "span", text, { lang: "ja" });
  el(c, "span", ` ${romanizeKana(text)} `, { class: "study-romaji" });
  el(c, "button", "Listen", { type: "button", class: "study-audio", "data-study-speak": text, "aria-label": `Listen: ${text}` });
}
