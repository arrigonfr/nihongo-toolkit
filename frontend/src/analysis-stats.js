const LEVELS = ["N5", "N4", "N3", "N2", "N1", "Unrated"];
function levelOf(value) {
  const levels = (Array.isArray(value) ? value : [value]).map((entry) => {
    const match = String(entry ?? "").match(/^(?:jlpt-n|n)?([1-5])$/i);
    return match ? Number(match[1]) : 0;
  }).filter(Boolean);
  return levels.length ? `N${Math.max(...levels)}` : "Unrated";
}
function distribution(identities) {
  const total = identities.size;
  const counts = LEVELS.map((level) => [...identities.values()].filter((value) => value === level).length);
  // Largest remainder allocation makes displayed tenths exhaustive (exactly 100%).
  const exact = counts.map((count) => total ? count * 1000 / total : 0);
  const tenths = exact.map(Math.floor);
  const order = exact.map((value, index) => ({ index, remainder: value - tenths[index] }))
    .sort((a, b) => b.remainder - a.remainder);
  for (let i = 0, remaining = total ? 1000 - tenths.reduce((a, b) => a + b, 0) : 0; i < remaining; i++) tenths[order[i].index]++;
  return { total, levels: LEVELS.map((level, i) => ({ level, count: counts[i], percentage: tenths[i] / 10 })) };
}
export function analysisStats(tokens, kanji = []) {
  const words = new Map();
  const characters = new Map();
  const known = new Map(kanji.map((entry) => [entry.character || entry.kanji, levelOf(entry.jlpt)]));
  for (const token of tokens) {
    for (const char of String(token.text || "").normalize("NFC")) {
      if (/\p{Script=Han}/u.test(char)) characters.set(char, known.get(char) || "Unrated");
    }
    if (!["word", "particle"].includes(token.type)) continue;
    const result = token.result;
    const key = result?.id != null ? `id:${result.id}` : `base:${String(token.base || token.text).normalize("NFC")}`;
    const level = levelOf(result?.jlpt);
    if (!words.has(key) || words.get(key) === "Unrated") words.set(key, level);
  }
  return { words: distribution(words), kanji: distribution(characters) };
}

export function renderAnalysisStats(container, tokens, kanji) {
  const stats = analysisStats(tokens, kanji);
  container.hidden = !tokens.length;
  container.innerHTML = Object.entries(stats).map(([kind, data]) => `
    <section aria-label="Distinct ${kind} JLPT distribution">
      <h3>${data.total} distinct ${kind}</h3>
      <div class="jlpt-donuts">${data.levels.map(({ level, count, percentage }) => `
        <div class="jlpt-stat" aria-label="${level}: ${count} of ${data.total}, ${percentage}%">
          <span class="jlpt-donut" style="--percentage:${percentage}%" aria-hidden="true"><span>${percentage}%</span></span>
          <strong>${level}</strong><small>${count}</small>
        </div>`).join("")}</div>
    </section>`).join("") + `<p class="small-note">Distinct dictionary entries (including particles), not occurrences; unmatched words use their base form. Kanji count characters in the source. Multiple word levels use the easiest listed level. JLPT ratings are estimates; missing ratings are Unrated. Grammar distribution is deferred: morphological tokens do not reliably identify JLPT grammar patterns.</p>`;
}
