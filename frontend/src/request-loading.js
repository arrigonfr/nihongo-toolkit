import "./request-loading.css";

const owners = new WeakMap();
export const RESULT_COOLDOWN_MS = 500;
export function beginLoading(buttons, panel, message = "Preparing your results…", { captureTrigger = true } = {}) {
  const token = {};
  const trigger = captureTrigger && document.activeElement?.matches("button") ? document.activeElement : null;
  const elements = [...new Set([...(Array.isArray(buttons) ? buttons : [buttons]), trigger, panel].filter(Boolean))];
  const status = document.createElement("span");
  status.className = "request-loading-status";
  status.setAttribute("role", "status");
  status.textContent = message;
  panel?.before(status);
  for (const element of elements) {
    const previous = owners.get(element);
    const owner = previous || { disabled: element.disabled, busy: element.getAttribute("aria-busy") };
    owner.token = token;
    owners.set(element, owner);
    element.setAttribute("aria-busy", "true");
    if (element === panel) element.classList.add("request-loading-panel");
    else {
      // Preserve render-time busy rules while keeping the native button locked.
      if (!previous) {
        const native = Object.getOwnPropertyDescriptor(HTMLButtonElement.prototype, "disabled");
        owner.native = native;
        Object.defineProperty(element, "disabled", {
          configurable: true,
          get: () => native.get.call(element),
          set: (value) => { owner.disabled = Boolean(value); native.set.call(element, true); }
        });
        native.set.call(element, true);
      }
      element.classList.add("request-loading-button");
    }
  }
  return async () => {
    await new Promise((resolve) => setTimeout(resolve, RESULT_COOLDOWN_MS));
    status.remove();
    for (const element of elements) {
      const owner = owners.get(element);
      if (owner?.token !== token) continue;
      owners.delete(element);
      if (owner.busy === null) element.removeAttribute("aria-busy");
      else element.setAttribute("aria-busy", owner.busy);
      element.classList.remove("request-loading-panel", "request-loading-button");
      if (element !== panel) {
        delete element.disabled;
        owner.native.set.call(element, owner.disabled);
      }
    }
  };
}
