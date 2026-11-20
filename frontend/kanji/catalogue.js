const listing = document.getElementById("catalogue-list");
if (listing) {
  const search = document.getElementById("catalogue-search");
  const grouping = document.getElementById("catalogue-group");
  const status = document.getElementById("catalogue-results");
  const radicals = JSON.parse(document.getElementById("catalogue-radicals").textContent);
  const normalize = (text) => text.normalize("NFC").toLowerCase()
    .replace(/[ァ-ヶ]/g, (kana) => String.fromCharCode(kana.charCodeAt(0) - 0x60)).replaceAll(".", "");
  const records = [...listing.querySelectorAll(".characters a")].map((link) => ({
    link: link.parentElement,
    text: normalize(`${link.textContent} ${link.dataset.search}`),
    groups: link.dataset
  }));
  const labels = {
    strokes: (count) => `${count} ${count === 1 ? "stroke" : "strokes"}`,
    jlpt: (level) => level === Infinity ? "No JLPT estimate" : `N${level}`,
    radical: (id) => id === Infinity ? "No dictionary radical" : `${id}. ${radicals[id - 1]}`
  };
  function display() {
    const groups = new Map();
    const field = grouping.value;
    const terms = normalize(search.value).trim().split(/\s+/).filter(Boolean);
    let count = 0;
    for (const entry of records) {
      if (!terms.every((term) => entry.text.includes(term))) continue;
      const key = Number(entry.groups[field]) || Infinity;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(entry.link);
      count++;
    }
    listing.replaceChildren(...[...groups].sort(([a], [b]) => a - b).map(([key, entries]) => {
      const details = document.createElement("details");
      details.open = terms.length > 0;
      const summary = document.createElement("summary");
      summary.textContent = `${labels[field](key)} (${entries.length})`;
      const list = document.createElement("ul");
      list.className = "characters";
      list.append(...entries);
      details.append(summary, list);
      return details;
    }));
    status.textContent = count ? `${count.toLocaleString("en")} characters` : "No matching kanji";
  }
  grouping.addEventListener("change", display);
  search.addEventListener("input", display);
  document.querySelector(".catalogue-controls").hidden = false;
}
