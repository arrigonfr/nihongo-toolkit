import { editorialIdentity, editorialTools } from "./editorial-tools.js";

const escapeAttr = (value) => String(value).replace(/[&<>"']/g, (ch) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

export const NAVIGATION_GROUPS = [
  {
    label: "Practice",
    items: [
      { file: "kana.html", name: "Kana", icon: "kana", japanese: "仮名", description: "Hiragana and katakana practice" },
      { file: "yomi.html", name: "Yomi", icon: "yomi", japanese: "読み", description: "Kanji reading practice" },
      { file: "imi.html", name: "Imi", icon: "imi", japanese: "意味", description: "Kanji meaning practice" },
      { file: "goi.html", name: "Goi", icon: "goi", japanese: "語彙", description: "JLPT vocabulary practice" },
      { file: "katsuyo-renshuu.html", name: "Katsuyō Renshuū", icon: "katsuyo-renshuu", japanese: "活用練習", description: "Focused Japanese conjugation practice" }
    ]
  },
  {
    label: "Reference",
    items: [
      { file: "kotoba.html", name: "Kotoba", icon: "kotoba", japanese: "言葉", description: "Japanese dictionary" },
      { file: "kanji-chizucho.html", name: "Kanji Chizuchō", icon: "kanji-chizucho", japanese: "漢字地図帳", description: "Explore kanji and compounds" },
      { file: "kanji/", href: "/kanji/", name: "Kanji catalogue", icon: "kanji-catalogue", description: "Browse and look up kanji", separateIcon: true },
      { file: "kanji-of-the-day.html", href: "/kanji-of-the-day", name: "Kanji of the Day", icon: "kanji-of-the-day", description: "Learn one common kanji every day", separateIcon: true },
      { file: "katsuyo.html", name: "Katsuyō", icon: "katsuyo", japanese: "活用", description: "Japanese verb and adjective conjugator" },
      { file: "fumitoki.html", name: "Fumitoki", icon: "fumitoki", japanese: "文解き", description: "Japanese sentence breakdown" },
      { file: "shiryo.html", name: "Shiryō", icon: "shiryo", japanese: "資料", description: "Printable Japanese cheatsheets" }
    ]
  },
  {
    label: "Games",
    items: [
      { file: "kanji-kuizu.html", name: "Kanji Kuizu", icon: "kanji-kuizu", japanese: "漢字クイズ", description: "Spot the matching kanji" },
      { file: "eawase.html", name: "Eawase", icon: "eawase", japanese: "絵合わせ", description: "Japanese word and kana memory matching" },
      { file: "kotoba-sagashi.html", name: "Kotoba Sagashi", icon: "kotoba-sagashi", japanese: "言葉探し", description: "Japanese vocabulary word search" },
      { file: "pazuru.html", name: "Pazuru", icon: "pazuru", japanese: "パズル", description: "Japanese vocabulary crossword" },
      { file: "shiritori.html", name: "Shiritori", icon: "shiritori", japanese: "しりとり", description: "Japanese word-chain game" }
    ]
  },
  {
    label: "Support",
    items: [
      { file: "faq.html", name: "FAQ", icon: "faq", description: "Help and common questions" },
      { file: "contact.html", name: "Contact", icon: "contact", description: "Feedback, requests and bug reports" }
    ]
  }
];

function renderItem(item, disabled) {
  const unavailable = disabled.has(item.file) ? " data-unavailable" : "";
  const href = item.href || `./${item.file}`;
  const icon = `<span class="helper-icon" aria-hidden="true"><img src="/tool-icons/${escapeAttr(item.icon)}.webp" alt="" width="26" height="26"></span>`;
  const extraAttrs = item.purpose
    ? ` data-purpose="${escapeAttr(item.purpose)}" data-description="${escapeAttr(item.descriptionAttr)}" data-example="${escapeAttr(item.example)}"`
    : "";
  const labelMarkup = item.separateIcon
    ? `<span class="helper-name">${escapeAttr(item.name)}</span>${icon}`
    : `<span class="helper-name">${escapeAttr(item.name)} · ${icon}${item.japanese ? ` · ${item.editorial ? `<span lang="ja">${escapeAttr(item.japanese)}</span>` : escapeAttr(item.japanese)}` : ""}</span>`;
  return `<a class="helper-link" data-file="${escapeAttr(item.file)}"${unavailable} href="${escapeAttr(href)}" target="_top"${extraAttrs}>${labelMarkup}<span class="helper-description">${escapeAttr(item.description)}</span></a>`;
}

export function renderNavigationMenu({ editorial = false, disabled = new Set() } = {}) {
  const editorialByGroup = new Map();
  if (editorial) {
    for (const [slug, [name, group, purpose, description, example]] of Object.entries(editorialTools)) {
      const [japanese] = editorialIdentity[slug];
      if (!editorialByGroup.has(group)) editorialByGroup.set(group, []);
      editorialByGroup.get(group).push({
        file: `${slug}.html`,
        name,
        icon: slug,
        japanese,
        description: purpose,
        purpose,
        descriptionAttr: description,
        example,
        editorial: true
      });
    }
  }
  const sections = NAVIGATION_GROUPS.map(({ label, items }) => {
    const allItems = [...items, ...(editorialByGroup.get(label) || [])];
    return `<section class="menu-group" aria-label="${escapeAttr(label)}"><h2>${escapeAttr(label)}</h2>${allItems.map((item) => renderItem(item, disabled)).join("")}</section>`;
  }).join("");
  return `<nav class="navigation" aria-label="Helper navigation"><button class="menu-button" id="menuButton" type="button" aria-label="Open helper menu" aria-expanded="false" aria-controls="helperMenu"><span class="menu-icon" aria-hidden="true"><span></span><span></span><span></span></span></button><div class="menu" id="helperMenu" hidden><a class="helper-link home-link" href="./" target="_top"><span class="helper-icon" aria-hidden="true"><img src="/logo-mark.webp" alt="" width="26" height="26"></span><span class="helper-name">Home</span></a>${sections}</div></nav>`;
}

export function findNavigationName(file, { editorial = false } = {}) {
  for (const group of NAVIGATION_GROUPS) {
    const match = group.items.find((item) => item.file === file);
    if (match) return match.name;
  }
  if (editorial) {
    const slug = file.replace(/\.html$/, "");
    if (editorialTools[slug]) return editorialTools[slug][0];
  }
  return "";
}
