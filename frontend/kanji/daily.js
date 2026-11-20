import "./daily.css";

const card = document.querySelector("[data-daily-kanji]");
if (card) {
  const entries = JSON.parse(card.querySelector("script[type='application/json']").textContent);
  const details = card.querySelector(".daily-kanji-details");
  const date = card.querySelector("time");
  const dayLength = 86_400_000;
  const formatDate = new Intl.DateTimeFormat("en", { dateStyle: "long", timeZone: "UTC" });
  let timer;

  function showToday() {
    clearTimeout(timer);
    const now = Date.now();
    const day = Math.floor(now / dayLength);
    const entry = entries[day % entries.length];
    date.dateTime = new Date(now).toISOString().slice(0, 10);
    date.textContent = formatDate.format(now);
    card.querySelector(".daily-glyph").textContent = entry.character;
    card.querySelector(".daily-readings").textContent = entry.readings.join(" / ");
    card.querySelector(".daily-meanings").textContent = entry.meanings.join("; ");
    card.querySelector(".daily-entry-link").href = entry.path;
    details.hidden = false;
    timer = setTimeout(showToday, (day + 1) * dayLength - now);
  }

  showToday();
  document.addEventListener("visibilitychange", () => { if (!document.hidden) showToday(); });
}

const copy = document.getElementById("copy-daily-embed");
if (copy) {
  const code = document.getElementById("daily-embed-code");
  const status = document.getElementById("daily-copy-status");
  const src = new URL(code.dataset.path, location.origin).href;
  code.value = `<iframe src="${src}" title="Kanji of the day from Nihongo Toolkit" width="360" height="280" style="max-width:100%;border:0" loading="lazy" referrerpolicy="no-referrer"></iframe>`;
  copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(code.value);
      status.textContent = "Embed code copied.";
    } catch (error) {
      console.warn("Could not copy the kanji widget embed code.", error);
      code.focus();
      code.select();
      status.textContent = "Automatic copying is unavailable. Use your browser’s copy command.";
    }
  });
  document.getElementById("daily-embed-controls").hidden = false;
}
