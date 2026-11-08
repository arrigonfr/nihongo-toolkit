export function createSessionView({ settings, play, results, start, setup = [], keepResults = [], footer = false }) {
  const startLine = document.createElement("div");
  startLine.className = "start-line";
  let setupPanel = settings;
  if (footer) {
    setupPanel = document.createElement("section");
    setupPanel.className = "session-setup";
    settings.before(setupPanel);
    setupPanel.append(settings, startLine);
  } else settings.after(startLine);
  startLine.append(start);
  const setupElements = [setupPanel, startLine, ...setup];
  function show(stage) {
    for (const element of setupElements) element.hidden = stage !== "setup";
    for (const element of play) element.hidden = stage !== "play";
    for (const element of keepResults) element.hidden = stage === "setup";
    results.hidden = stage !== "results";
    if (stage === "setup") settings.open = true;
  }
  show("setup");
  return {
    start() { show("play"); },
    setup() { show("setup"); },
    finish() {
      show("results");
      results.querySelector(".replay-actions")?.remove();
      const actions = document.createElement("div");
      actions.className = "replay-actions";
      const again = document.createElement("button");
      again.type = "button";
      again.className = start.className;
      again.dataset.playAgain = "";
      again.textContent = "Practice again";
      again.addEventListener("click", () => { show("setup"); start.focus(); });
      actions.append(again);
      results.append(actions);
    }
  };
}