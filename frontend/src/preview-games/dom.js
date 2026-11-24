import { japaneseHTML, speakJapanese, study } from "../study-controls.js";
import { cancelLocalSpeech } from "../local-speech.js";
import "./games.css";

export function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
export function ja(text, reading) {
  const node = el("span");
  node.innerHTML = japaneseHTML(text, reading);
  return node;
}
export function button(text, action) {
  const node = el("button", text);
  node.type = "button";
  node.addEventListener("click", action);
  return node;
}
export function status() {
  const node = el("p");
  node.setAttribute("role", "status");
  return node;
}
export function root(container) {
  const node = el("div", undefined, "pg-round");
  node.dataset.i18nScope = "";
  container.replaceChildren(node);
  return node;
}
export function setupNote(container, description) {
  container.append(el("p", `${description} Draft content · pending Japanese review.`));
}
export function silence() {
  window.speechSynthesis?.cancel();
  cancelLocalSpeech();
}
export function playButton(text, spoken, notice) {
  return button(text, () => {
    if (!study.audio) {
      notice.textContent = "Audio is off. Turn on Audio to listen.";
      return;
    }
    silence();
    speakJapanese(spoken);
  });
}
