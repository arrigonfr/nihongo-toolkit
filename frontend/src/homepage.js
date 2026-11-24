import { mountSectionLinks } from "./section-links.js";

const introductions = {
  "kana.html": ["Learn to recognize hiragana and katakana one character at a time. Choose the practice that suits your level and build confidence with the sounds of Japanese.", "Which sound does this character make?", "あ", ["a", "i", "u", "e"]],
  "yomi.html": ["Practice reading kanji and become more comfortable recognizing how characters are pronounced. Focus your study and take a few readings at a time.", "Kanji reading", "日", ["Practice the reading"]],
  "imi.html": ["Connect kanji with their meanings through focused practice. A little recognition work can make unfamiliar characters feel less intimidating.", "Kanji meaning", "山", ["What does it mean?"]],
  "goi.html": ["Build your Japanese vocabulary with practice organized around JLPT levels. Revisit words and make room for new ones at your own pace.", "Vocabulary practice", "食べる", ["Practice a word"]],
  "katsuyo-renshuu.html": ["Practice Japanese verb and adjective conjugations in a focused session. Work with the forms you want to get more comfortable using.", "Conjugation practice", "食べる", ["Choose a form", "Practice"]],
  "kotoba.html": ["Look up Japanese words when curiosity strikes. Explore dictionary results, readings, and meanings as you work through something you are learning.", "Dictionary", "日本語", ["Search for a word"]],
  "kanji-chizucho.html": ["Explore kanji and the compounds connected to them. Follow relationships between characters and discover more about the words they help form.", "Explore connections", "漢字", ["Kanji", "Compounds"]],
  "kanji/": ["Browse the kanji catalogue when you want to look up a character or explore the collection. Open an entry to take a closer look.", "Kanji catalogue", "字", ["Browse characters"]],
  "kanji-of-the-day.html": ["Spend a moment with a common kanji each day. It is a small, approachable way to encounter a character and return to it later.", "Kanji of the day", "日", ["A daily character"]],
  "katsuyo.html": ["Explore how Japanese verbs and adjectives change form. Use the conjugator when you want to look up a form rather than start a practice session.", "Conjugator", "食べる", ["Explore forms"]],
  "fumitoki.html": ["Take a closer look at a Japanese sentence by breaking it down into parts. Use it when you want help exploring the words in something you are reading.", "Sentence breakdown", "日本語を読む", ["Explore the sentence"]],
  "shiryo.html": ["Find printable Japanese study sheets for reference away from the screen. Browse the available sheets and choose what is useful for your study.", "Study sheets", "あ　い　う", ["Browse sheets"]],
  "kanji-kuizu.html": ["Put your kanji recognition to the test by spotting the matching character. A quick round gives you a playful way to pay attention to the details.", "Find the matching kanji", "木", ["木", "本", "未"]],
  "eawase.html": ["Turn vocabulary and kana practice into a memory game. Look for matching pairs as you uncover the board, one turn at a time.", "Memory matching", "あ　　あ", ["Find a pair"]],
  "kotoba-sagashi.html": ["Look for Japanese words hidden in a word-search grid. Take your time finding each one and give familiar vocabulary another moment of attention.", "Word search", "こ　と　ば", ["Find the words"]],
  "pazuru.html": ["Work through a Japanese vocabulary crossword. Use the clues to fill the grid and enjoy a different way to spend time with words.", "Vocabulary crossword", "□　□　□", ["Read clues", "Fill the grid"]],
  "shiritori.html": ["Play the Japanese word-chain game: each word begins with the sound that ended the previous one. Keep the chain going and see what words come to mind.", "Word chain", "ことば →", ["Continue the chain"]]
};

const purposes = {
  "kana.html": "Recognize kana",
  "yomi.html": "Read kanji",
  "imi.html": "Recognize kanji meanings",
  "goi.html": "Practice vocabulary",
  "katsuyo-renshuu.html": "Practice conjugations",
  "kotoba.html": "Look up words",
  "kanji-chizucho.html": "Explore kanji connections",
  "kanji/": "Browse kanji",
  "kanji-of-the-day.html": "Discover a daily kanji",
  "katsuyo.html": "Look up conjugations",
  "fumitoki.html": "Break down sentences",
  "shiryo.html": "Find printable study sheets",
  "kanji-kuizu.html": "Match kanji",
  "eawase.html": "Match pairs",
  "kotoba-sagashi.html": "Find hidden words",
  "pazuru.html": "Solve a crossword",
  "shiritori.html": "Build a word chain"
};

const previewPairs = {
  "yomi.html": ["日", "にち"],
  "imi.html": ["山", "mountain"],
  "goi.html": ["食べる", "to eat"],
  "kotoba.html": ["日本語", "Japanese"],
  "kanji/": ["字", "character"],
  "fumitoki.html": ["日本語を読む", "日本語 / を / 読む"],
  "katsuyo-renshuu.html": ["食べる", "食べます"],
  "katsuyo.html": ["食べる", "食べます"],
  "shiritori.html": ["ことば", "ばなな"]
};

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

export function mountHomepageShowcase() {
  const showcase = document.querySelector(".home-showcase");
  if (!showcase) return;
  const index = document.querySelector(".home-tool-index-groups");
  mountSectionLinks(document.querySelectorAll(".home-primary, .home-group-nav a"));
  for (const group of document.querySelectorAll('.menu-group:not([aria-label="Support"])')) {
    const category = group.getAttribute("aria-label");
    const section = element("section", "home-tool-group");
    section.id = `${category.toLowerCase()}-tools`;
    section.append(element("h3", "", category));
    const indexGroup = element("div", "home-tool-index-group");
    indexGroup.dataset.category = section.id;
    indexGroup.append(element("h3", "", category));
    const indexLinks = element("ul", "home-tool-index-links");
    for (const tool of group.querySelectorAll(".helper-link[data-file]")) {
      const purpose = tool.dataset.purpose || purposes[tool.dataset.file];
      const details = introductions[tool.dataset.file] || (tool.dataset.description &&
        [tool.dataset.description, purpose, tool.dataset.example, ["Editorial preview"]]);
      if (!details) {
        console.warn(`No homepage introduction for ${tool.dataset.file}.`);
        continue;
      }
      const [description, prompt, example, hints] = details;
      const name = tool.querySelector(".helper-name").textContent;
      const article = element("article", "home-tool");
      article.dataset.file = tool.dataset.file;
      article.id = `tool-${tool.dataset.file.replace(/[^a-z0-9]+/gi, "-").replace(/-$/, "")}`;
      const indexLink = element("a", "");
      indexLink.href = tool.href;
      const icon = tool.querySelector(".helper-icon");
      if (icon) indexLink.append(icon.cloneNode(true));
      indexLink.append(element("span", "", name));
      const indexItem = element("li", "");
      indexItem.append(indexLink, element("span", "home-index-purpose", purpose));
      indexLinks.append(indexItem);
      const copy = element("div", "home-tool-copy");
      const heading = element("h4", "", name);
      const badge = tool.querySelector(".tool-preview-badge");
      if (badge) {
        indexLink.append(badge.cloneNode(true));
        heading.append(badge.cloneNode(true));
      }
      if (icon) heading.prepend(icon.cloneNode(true));
      const link = element("a", "", `Open ${name} →`);
      link.href = tool.href;
      copy.append(heading, element("p", "home-tool-purpose", purpose), element("p", "", description), link);
      const figure = element("figure", "home-tool-figure");
      const preview = element("div", "home-tool-preview");
      preview.setAttribute("aria-hidden", "true");
      const label = element("div", "home-preview-label");
      label.append(element("span", "", name), element("span", "", "Example"));
      const sample = element("div", "home-preview-sample");
      const pair = previewPairs[tool.dataset.file];
      if (pair) {
        sample.classList.add("home-preview-pair");
        const first = element("span", "", pair[0]);
        first.lang = "ja";
        const second = element("span", "", pair[1]);
        if (!["imi.html", "goi.html", "kotoba.html", "kanji/"].includes(tool.dataset.file)) second.lang = "ja";
        sample.append(first, element("span", "home-preview-arrow", "→"), second);
      } else {
        sample.textContent = example;
        sample.lang = "ja";
      }
      const options = element("div", "home-preview-options");
      for (const hint of hints) options.append(element("span", "", hint));
      preview.append(label, sample, element("p", "home-preview-prompt", prompt), options);
      figure.append(preview, element("figcaption", "", "Illustrative preview"));
      article.append(copy, figure);
      section.append(article);
    }
    indexGroup.append(indexLinks);
    index.append(indexGroup);
    showcase.append(section);
  }
}
