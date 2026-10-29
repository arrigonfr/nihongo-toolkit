const hiragana = (text) => text.normalize("NFKC").replace(/[\u30a1-\u30f6]/gu,
  (character) => String.fromCodePoint(character.codePointAt(0) - 0x60));

// JMdict gives whole-word readings, not a kanji-to-syllable alignment. This
// diversifies candidates without claiming that a substring proves that alignment.
export function selectCompounds(rows, kanji, limit) {
  const candidates = rows.map((row) => {
    const forms = JSON.parse(row.kanji_forms).filter((form) => form.text.includes(kanji.character));
    const readings = JSON.parse(row.kana_forms);
    const pairs = forms.flatMap((form) => readings.filter((reading) =>
      reading.appliesToKanji.includes("*") || reading.appliesToKanji.includes(form.text))
      .map((reading) => ({ word: form.text, reading: hiragana(reading.text) })));
    return { row, pairs };
  }).filter((candidate) => candidate.pairs.length);
  const readings = [...new Set([...JSON.parse(kanji.on_readings), ...JSON.parse(kanji.kun_readings)]
    .map((reading) => hiragana(reading).replace(/-/g, "").split(".")[0]).filter(Boolean))];
  const matches = (candidate, reading) => candidate.pairs.some((pair) => {
    if ([...pair.word].length < 2) return false;
    if (pair.word.startsWith(kanji.character)) return pair.reading.startsWith(reading);
    if (pair.word.endsWith(kanji.character)) return pair.reading.endsWith(reading);
    return pair.reading.includes(reading);
  });
  const selected = [];
  for (const reading of readings) {
    if (selected.length >= limit) break;
    if (selected.some((candidate) => matches(candidate, reading))) continue;
    const candidate = candidates.find((item) => !selected.includes(item) && matches(item, reading));
    if (candidate) selected.push(candidate);
  }
  for (const candidate of candidates) {
    if (selected.length >= limit) break;
    if (!selected.includes(candidate)) selected.push(candidate);
  }
  return selected.map(({ row }) => row);
}
