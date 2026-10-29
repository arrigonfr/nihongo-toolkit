
// One configurable chip group used for level filters, font pickers, mode pills and any other
// small choice list. The source of truth stays a hidden <select> (or any value holder), so
// persistence, tests and page logic keep working with the same ids and change events.
//
// options:
// The source can also be a checkbox: it then offers "yes" / "no" (checked = yes), e.g. as a radio group.
//   options        [{ value, label, labelHTML, preview (HTML), description, disabled }]; default: the select's options
//   multiple       several chips may be active; the value is a comma-joined list in option order
//   presentation   "checkbox" | "radio" | "button"  (default: checkbox when multiple, button otherwise)
//   orientation    "horizontal" (wraps) | "vertical"
//   variant        "chip" | "card" (preview above the label)
//   exclusive      value of a special chip that deselects the rest and stands for all of them (Both / Random)
//   allValue       value stored when every regular chip is active (default: the exclusive value, if any)
//   emptyValue     value stored when nothing is active; enables an empty selection (levels use "none")
//   descriptions   { value: "tooltip text" } shown on hover / focus
//   actions        [{ label, run: "all" | "clear" | (api) => void, attrs, description }]
//   actionsPlacement  "inline" (right after the last chip) | "below"
//   title          group title; default: the existing label text
//   wrap           replace the original label with a titled field (default true)
//   groupClass / optionClass / fieldClass  extra hook classes
//   decode(value, api) / encode(values, api)  custom value codecs; both work with option values
let counter = 0;

export function chipCodec(config) {
  const regular = config.options.filter((option) => option.value !== config.exclusive).map((option) => option.value);
  const all = config.allValue ?? config.exclusive ?? null;
  return {
    regular,
    decode(value) {
      if (!config.multiple) return [value];
      if (config.emptyValue != null && value === config.emptyValue) return [];
      if (config.exclusive != null && value === config.exclusive) return [config.exclusive];
      if (all != null && value === all) return config.exclusive != null ? [config.exclusive] : [...regular];
      return String(value).split(",").filter((item) => regular.includes(item));
    },
    encode(selected) {
      if (!config.multiple) return selected[0];
      if (config.exclusive != null && selected.includes(config.exclusive)) return config.exclusive;
      const list = regular.filter((value) => selected.includes(value));
      if (!list.length) return config.emptyValue ?? null;
      if (all != null && list.length === regular.length) return all;
      return list.join(",");
    }
  };
}

// Make sure the hidden select can hold every value the chips may produce.
function ensureOptions(select, config, codec) {
  if (!select.options) return;
  const known = new Set([...select.options].map((option) => option.value));
  const add = (value) => { if (value != null && !known.has(value)) { select.add(new Option(value, value)); known.add(value); } };
  if (!config.multiple) { for (const option of config.options) add(option.value); return; }
  const { regular } = codec;
  if (regular.length <= 8) {
    for (let mask = 1; mask < 2 ** regular.length; mask++) add(codec.encode(regular.filter((_, i) => mask & (1 << i))));
  }
  add(config.emptyValue);
  add(config.exclusive);
  add(config.allValue);
}

function optionsFromSelect(select, config) {
  if (select.type === "checkbox") return [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }];
  const hidden = new Set([config.allValue, config.emptyValue].filter((value) => value != null && value !== config.exclusive));
  return [...select.options].filter((option) => !hidden.has(option.value) && !option.hidden && !(config.multiple && option.value.includes(",")))
    .map((option) => ({ value: option.value, label: option.textContent.trim(), disabled: option.disabled }));
}

const escapeHTML = (text) => String(text ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function wrapField(select, config) {
  const label = select.closest("label");
  let host = select.parentElement;
  let titleText = config.title;
  let description = config.titleDescription;
  if (label) {
    const container = document.createElement("div");
    for (const attr of label.attributes) if (attr.name !== "for") container.setAttribute(attr.name, attr.value);
    container.append(...label.childNodes);
    label.replaceWith(container);
    host = container;
    const parts = [];
    for (const node of [...container.childNodes]) {
      if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) parts.push(node);
      else if (node.nodeType === Node.ELEMENT_NODE && node.matches("span:not(.setting-availability):not(.font-preview)") && node.textContent.trim()) parts.push(node);
    }
    if (titleText === undefined) titleText = parts.map((node) => node.textContent.trim()).join(" ");
    for (const node of parts) node.remove();
    container.querySelector(":scope > .font-preview")?.remove();
    description ??= container.dataset.settingDescription;
  } else {
    const oldTitle = host.querySelector(":scope > .setting-title");
    if (oldTitle) {
      if (titleText === undefined) titleText = oldTitle.textContent.trim();
      description ??= oldTitle.querySelector("[data-setting-description]")?.dataset.settingDescription;
      oldTitle.remove();
    }
  }
  host.classList.add("chips-field");
  if (config.fieldClass) host.classList.add(...config.fieldClass.split(" "));
  if (titleText) {
    const title = document.createElement("label");
    title.className = "chips-title";
    title.htmlFor = select.id;
    title.textContent = titleText;
    if (description) title.dataset.settingDescription = description;
    host.prepend(title);
    return { host, title };
  }
  return { host, title: null };
}

export function mountChips(select, config = {}) {
  if (select.dataset.chips) return select.chipsApi;
  select.dataset.chips = "true";
  config = { presentation: config.multiple ? "checkbox" : "button", orientation: "horizontal", variant: "chip", actionsPlacement: "inline", wrap: true, ...config };
  config.options ||= optionsFromSelect(select, config);
  if (config.exclusive != null && !config.options.some((option) => option.value === config.exclusive)) {
    config.options.push({ value: config.exclusive, label: config.exclusiveLabel || "Random" });
  }
  const codec = { ...chipCodec(config) };
  if (config.decode) codec.decode = (value) => config.decode(value, codec);
  if (config.encode) codec.encode = (values) => config.encode(values, codec);
  ensureOptions(select, config, codec);
  const isCheckbox = select.type === "checkbox";
  const read = () => isCheckbox ? (select.checked ? "yes" : "no") : select.value;
  const write = (value) => { if (isCheckbox) select.checked = value === "yes"; else select.value = value; };

  const { host } = config.wrap ? wrapField(select, config) : { host: select.parentElement };
  select.hidden = true;
  const id = `chips-${++counter}`;
  const group = document.createElement("div");
  group.className = ["chips", `chips-${config.orientation}`, `chips-${config.variant}`, `chips-${config.presentation}`, config.groupClass].filter(Boolean).join(" ");
  group.setAttribute("role", config.presentation === "radio" ? "radiogroup" : "group");
  const titleNode = config.wrap && host.querySelector(":scope > .chips-title");
  if (titleNode) { titleNode.id ||= `${id}-title`; group.setAttribute("aria-labelledby", titleNode.id); }
  else group.setAttribute("aria-label", config.label || select.labels?.[0]?.textContent.trim().split("\n")[0] || "Options");

  const items = new Map();
  for (const option of config.options) {
    const button = config.presentation === "button";
    const element = document.createElement(button ? "button" : "label");
    element.className = ["chip-option", config.optionClass, option.value === config.exclusive ? "chip-exclusive" : ""].filter(Boolean).join(" ");
    element.dataset.value = option.value;
    let input = null;
    if (button) { element.type = "button"; element.setAttribute("aria-pressed", "false"); }
    else {
      input = document.createElement("input");
      input.type = config.presentation === "radio" && !config.multiple ? "radio" : "checkbox";
      input.value = option.value;
      if (input.type === "radio") input.name = id;
      element.append(input);
    }
    const description = option.description ?? config.descriptions?.[option.value];
    if (description) element.dataset.settingDescription = description;
    const content = document.createElement("span");
    content.className = "chip-body";
    content.innerHTML = `${option.preview ? `<span class="chip-preview" aria-hidden="true">${option.preview}</span>` : ""}<span class="chip-label">${option.labelHTML ?? escapeHTML(option.label ?? option.value)}</span>`;
    element.append(content);
    items.set(option.value, { element, input, option });
    group.append(element);
  }

  const api = { group, select, config, codec };
  const actionBox = config.actions?.length ? document.createElement("div") : null;
  if (actionBox) {
    actionBox.className = "chip-actions";
    for (const action of config.actions) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "chip-action";
      button.textContent = action.label;
      for (const [name, value] of Object.entries(action.attrs || {})) button.setAttribute(name, value);
      if (action.description) button.dataset.settingDescription = action.description;
      button.addEventListener("click", () => {
        if (typeof action.run === "function") return action.run(api);
        commit(action.run === "all" ? (config.exclusive != null && config.allValue === config.exclusive ? [config.exclusive] : codec.regular) : []);
      });
      actionBox.append(button);
    }
    if (config.actionsPlacement === "below") group.dataset.actions = "below";
  }
  if (actionBox && config.actionsPlacement !== "below") group.append(actionBox);
  select.after(group);
  if (actionBox && config.actionsPlacement === "below") group.after(actionBox);

  function current() {
    try { return codec.decode(read()); } catch { return []; }
  }
  function commit(selected) {
    const value = codec.encode(selected);
    if (value == null || read() === value) { sync(); return; }
    if (select.options && ![...select.options].some((option) => option.value === value)) select.add(new Option(value, value));
    write(value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
    sync();
  }
  function choose(value) {
    if (!config.multiple) return commit([value]);
    const selected = current();
    if (value === config.exclusive) return commit(selected.includes(value) && config.emptyValue != null ? [] : [value]);
    const next = selected.filter((item) => item !== config.exclusive);
    const index = next.indexOf(value);
    if (index >= 0) next.splice(index, 1); else next.push(value);
    commit(next.length || config.emptyValue != null ? next : [value]);
  }
  function sync() {
    const selected = current();
    const blocked = select.disabled;
    for (const [value, { element, input, option }] of items) {
      const on = selected.includes(value);
      const native = select.options && [...select.options].find((item) => item.value === value);
      const off = blocked || Boolean(option.disabled || native?.disabled);
      element.classList.toggle("is-active", on);
      element.classList.toggle("is-disabled", off);
      if (input) { input.checked = on; input.disabled = off; }
      else { element.setAttribute("aria-pressed", String(on)); element.disabled = off; }
    }
    for (const button of group.querySelectorAll(".chip-action")) button.disabled = blocked;
    actionBox?.classList.toggle("is-disabled", blocked);
    group.classList.toggle("is-disabled", blocked);
    group.toggleAttribute("aria-disabled", blocked);
  }
  group.addEventListener("click", (event) => {
    const element = event.target.closest("button.chip-option");
    if (element && group.contains(element)) choose(element.dataset.value);
  });
  group.addEventListener("change", (event) => {
    event.stopPropagation();
    const input = event.target.closest("input");
    if (!input) return;
    const selectedBefore = current();
    // Radios and checkboxes report their new state; route everything through choose() so rules stay in one place.
    if (config.multiple || !selectedBefore.includes(input.value)) choose(input.value);
    else sync();
  });
  select.addEventListener("change", sync);
  new MutationObserver(sync).observe(select, { attributes: true, attributeFilter: ["disabled"], childList: true, subtree: true });
  queueMicrotask(sync);
  sync();
  api.sync = sync;
  api.choose = choose;
  api.commit = commit;
  api.current = current;
  select.chipsApi = api;
  return api;
}
