import "./settings-panel.css";
import "./settings-reset.js";

export function groupSettings(container, groups) {
  container.classList.add("settings-sections");
  for (const [title, ids] of groups) {
    const section = document.createElement("fieldset");
    section.className = "settings-section";
    const legend = document.createElement("legend");
    legend.textContent = title;
    const grid = document.createElement("div");
    grid.className = "settings-section-grid";
    section.append(legend, grid);
    for (const id of ids) {
      const control = document.getElementById(id);
      grid.append(control.closest("label") || control);
    }
    container.append(section);
  }
}

export function setSettingAvailability(control, reason = "") {
  control.disabled = Boolean(reason);
  const label = control.closest("label") || control.closest(".setting") || ((control.dataset.levelChoices || control.dataset.chips) ? control.parentElement : null);
  if (!label) return;
  label.classList.toggle("setting-unavailable", Boolean(reason));
  let note = label.querySelector(".setting-availability");
  if (!note && reason) {
    note = document.createElement("small");
    note.className = "setting-availability";
    note.id = `${control.id}-availability`;
    label.append(note);
    const description = control.getAttribute("aria-describedby");
    control.setAttribute("aria-describedby", [description, note.id].filter(Boolean).join(" "));
  }
  if (note) {
    note.textContent = reason;
    note.hidden = !reason;
  }
}
