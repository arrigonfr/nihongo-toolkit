import { writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { enrichRadicals, kanjiKind } from "../backend/src/radicals.js";

const database = new DatabaseSync(process.argv[2] || new URL("../backend/data/nihon.sqlite", import.meta.url), { readOnly: true });
try {
  const metadata = database.prepare("SELECT value FROM metadata WHERE key = 'revisions'").get();
  const kanji = database.prepare(`SELECT id, character, meanings, on_readings, kun_readings, nanori,
    stroke_count, jlpt, jlpt_source, frequency, radicals FROM kanjis ORDER BY codepoint`).all();
  if (!metadata || !kanji.length) throw new Error("Import the dictionary before exporting the kanji catalogue.");

  const words = database.prepare(`SELECT kw.kanji_id, w.kanji_forms, w.kana_forms, w.senses
    FROM kanji_words kw JOIN words w ON w.id = kw.word_id
    WHERE w.is_common = 1 ORDER BY kw.kanji_id, length(w.word), w.word, w.jmdict_id`);
  const entries = new Map(kanji.map((row) => [row.id, { row, compounds: new Map() }]));
  const applies = (list, form) => list.includes("*") || list.includes(form);
  for (const word of words.iterate()) {
    const { row, compounds } = entries.get(word.kanji_id);
    if (compounds.size >= 3) continue;
    const forms = JSON.parse(word.kanji_forms);
    const readings = JSON.parse(word.kana_forms);
    const senses = JSON.parse(word.senses);
    for (const form of forms) {
      if (!form.common || [...form.text].length < 2 || !form.text.includes(row.character) || compounds.has(form.text)) continue;
      for (const reading of readings) {
        if (!applies(reading.appliesToKanji, form.text)) continue;
        const gloss = senses.filter((sense) =>
          applies(sense.appliesToKanji, form.text) && applies(sense.appliesToKana, reading.text))
          .flatMap((sense) => sense.gloss).find((item) => item.lang === "eng");
        if (!gloss) continue;
        compounds.set(form.text, [form.text, reading.text, gloss.text]);
        break;
      }
      if (compounds.size >= 3) break;
    }
  }
  const snapshot = [...entries.values()].map(({ row, compounds }) => ({
    character: row.character,
    kind: kanjiKind(row.character),
    meanings: JSON.parse(row.meanings),
    on: JSON.parse(row.on_readings),
    kun: JSON.parse(row.kun_readings),
    names: JSON.parse(row.nanori),
    strokes: row.stroke_count,
    radical: enrichRadicals(JSON.parse(row.radicals)).find((item) => item.type === "classical")?.value ?? null,
    ...(row.jlpt && { jlpt: row.jlpt, jlptSource: row.jlpt_source }),
    ...(row.frequency && { frequency: row.frequency }),
    ...(compounds.size && { compounds: [...compounds.values()] })
  }));
  const source = JSON.parse(metadata.value);
  writeFileSync(new URL("../frontend/kanji/catalogue.jsonl", import.meta.url),
    `${[source, ...snapshot].map((row) => JSON.stringify(row)).join("\n")}\n`);
  console.log(`Exported ${snapshot.length} kanji.`);
} finally {
  database.close();
}
