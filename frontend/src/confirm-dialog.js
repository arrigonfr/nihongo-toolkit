import "./settings-panel.css";

let pending = null;
export function confirmAction(message, { review = false, confirmLabel = "Continue" } = {}) {
  if (pending) return Promise.resolve(null);
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    pending = dialog;
    dialog.className = "study-confirm-dialog";
    dialog.setAttribute("aria-labelledby", "confirmTitle");
    const title = document.createElement("h2");
    title.id = "confirmTitle"; title.textContent = "Before you continue";
    const text = document.createElement("p"); text.textContent = message;
    const actions = document.createElement("div"); actions.className = "study-pills";
    const options = [["cancel", "Cancel"], ...(review ? [["save", "Save & continue"], ["discard", "Discard & continue"]] : [["discard", confirmLabel]])];
    for (const [value, label] of options) {
      const button = document.createElement("button");
      button.type = "button"; button.textContent = label;
      button.onclick = () => dialog.close(value);
      actions.append(button);
    }
    dialog.append(title, text);
    if (review) {
      const note = document.createElement("p");
      note.textContent = "Save unfinished items for review, or continue without adding them. Previously saved review history is kept.";
      dialog.append(note);
    }
    dialog.append(actions); document.body.append(dialog);
    dialog.addEventListener("click", (event) => {
      const rect = dialog.getBoundingClientRect();
      if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close("cancel");
    });
    dialog.addEventListener("close", () => {
      const result = dialog.returnValue;
      pending = null; dialog.remove();
      resolve(["save", "discard"].includes(result) ? result : null);
    }, { once: true });
    dialog.showModal();
    actions.firstElementChild.focus();
  });
}
