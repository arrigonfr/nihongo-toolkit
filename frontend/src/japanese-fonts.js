import { mountChips } from "./chips.js";

export const JAPANESE_FONTS = {
  default: "System default",
  random: "Rotate fonts",
  "Noto Sans JP": "Noto Sans JP · sans",
  "Sawarabi Mincho": "Sawarabi Mincho · serif",
  "M PLUS Rounded 1c": "M PLUS Rounded 1c · rounded",
  "Zen Kurenaido": "Zen Kurenaido · handwritten"
};
export const FONT_FAMILIES = Object.keys(JAPANESE_FONTS).filter((key) => !["default", "random"].includes(key));

// A font setting is "default", "random" (every font), or a comma-separated list of font names.
export function fontList(value) {
  if (value === "random") return [...FONT_FAMILIES];
  if (value === "default" || value == null) return [FONT_FAMILIES[0]];
  const list = String(value).split(",");
  return FONT_FAMILIES.filter((font) => list.includes(font));
}
export function isFontSetting(value) {
  if (typeof value !== "string") return false;
  if (value === "default" || value === "random") return true;
  const list = value.split(",");
  return list.length > 0 && list.every((font) => FONT_FAMILIES.includes(font)) && new Set(list).size === list.length;
}
export function encodeFonts(fonts) {
  const list = FONT_FAMILIES.filter((font) => fonts.includes(font));
  return list.length === FONT_FAMILIES.length || !list.length ? "random" : list.join(",");
}

let rotationKey, rotatedFont, rotationValue;
export function applyJapaneseFont(font = "default", key = "settings") {
  if (!isFontSetting(font)) throw new Error("Choose an available Japanese font.");
  const fonts = fontList(font);
  if (fonts.length > 1) {
    if (rotationKey !== key || rotationValue !== font || !rotatedFont) {
      rotatedFont = fonts[Math.floor(Math.random() * fonts.length)];
      rotationKey = key;
      rotationValue = font;
    }
    font = rotatedFont;
  } else font = fonts[0];
  const root = document.documentElement;
  root.dataset.japaneseFont = font;
  root.style.setProperty("--study-jp-font", `"${font}"`);
}

export function mountFontControls() {
  for (const select of document.querySelectorAll("#setting-font, #fontChoice")) {
    if (select.dataset.fontPicker) continue;
    select.dataset.fontPicker = "true";
    if (!isFontSetting(select.value)) select.value = "random";
    if (![...select.options].some((option) => option.value === "default")) select.add(new Option("default", "default"));
    const sample = (font) => `<span lang="ja" style="font-family:'${font}',sans-serif">あア漢字</span>`;
    mountChips(select, {
      multiple: true,
      options: FONT_FAMILIES.map((font) => ({ value: font, label: JAPANESE_FONTS[font].replace(/ · .*/, ""), preview: sample(font) })),
      allValue: "random",
      title: "Japanese fonts",
      fieldClass: "font-field",
      groupClass: "font-picker",
      optionClass: "font-chip",
      label: "Japanese fonts",
      decode: (value) => fontList(value),
      encode: (values) => encodeFonts(values)
    });
  }
}
