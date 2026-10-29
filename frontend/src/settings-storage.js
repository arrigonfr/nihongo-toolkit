function controlValue(control) {
  if (control.type === "checkbox") return control.checked;
  if (control.type === "number") return control.valueAsNumber;
  return control.value;
}

function validValue(control, value) {
  if (control.type === "checkbox") return typeof value === "boolean";
  if (control.tagName === "SELECT") {
    return typeof value === "string" && [...control.options].some((option) => option.value === value);
  }
  if (control.type === "number") {
    return Number.isInteger(value)
      && (control.min === "" || value >= Number(control.min))
      && (control.max === "" || value <= Number(control.max));
  }
  throw new Error(`Unsupported settings control: ${control.id}`);
}

export function rememberControls(key, ids, onError) {
  const controls = ids.map((id) => document.getElementById(id)).filter(Boolean);
  const report = (message, error) => {
    console.warn(`${message} (${key})`, error);
    onError(message);
  };
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(key) || "{}");
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) throw new Error("Invalid saved preferences.");
  } catch (error) {
    saved = {};
    report("Saved settings could not be restored. Defaults are in use.", error);
  }
  const values = {};
  for (const control of controls) {
    if (Object.hasOwn(saved, control.id)) {
      if (validValue(control, saved[control.id])) {
        if (control.type === "checkbox") control.checked = saved[control.id];
        else control.value = String(saved[control.id]);
      } else report("Some saved settings were invalid. Defaults are in use for those settings.", new Error(control.id));
    }
    values[control.id] = controlValue(control);
  }
  function save() {
    for (const control of controls) {
      const value = controlValue(control);
      if (validValue(control, value)) values[control.id] = value;
    }
    try { localStorage.setItem(key, JSON.stringify(values)); }
    catch (error) { report("Your browser could not save these settings. They may be lost when you leave.", error); }
  }
  for (const control of controls) {
    control.addEventListener("change", () => {
      if (!validValue(control, controlValue(control))) {
        onError("Enter a valid value to save this setting.");
        return;
      }
      save();
    });
    if (control.type === "number") control.addEventListener("input", () => {
      if (validValue(control, controlValue(control))) save();
    });
  }
  return { save };
}
