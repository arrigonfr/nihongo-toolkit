# Data attribution and redistribution

The imported dictionary tables are a derived dataset distributed under
[Creative Commons Attribution-ShareAlike 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
Code licensing is separate; this notice does not relicense application code.

| Source | Attribution / license | Use |
| --- | --- | --- |
| [KANJIDIC2](https://www.edrdg.org/wiki/KANJIDIC_Project.html) | Electronic Dictionary Research and Development Group (EDRDG), CC BY-SA 4.0 | Kanji records |
| [JMdict](https://www.edrdg.org/jmdict/j_jmdict.html) | EDRDG, project started by Jim Breen, CC BY-SA 4.0 | Words, forms, senses and tags |
| [jmdict-simplified](https://github.com/scriptin/jmdict-simplified) | JSON conversion by scriptin and contributors; derived files retain upstream licenses | Downloadable KANJIDIC2/JMdict JSON snapshots |
| [OpenJLPT](https://github.com/evanclan/OpenJLPT) | OpenJLPT contributors, CC BY-SA 4.0; [per-field notice](https://github.com/evanclan/OpenJLPT/blob/main/NOTICE.md) | Study records, romaji, modern JLPT estimates and examples |
| [JLPT resources](https://www.tanos.co.uk/jlpt/) | Jonathan Waller, CC BY, via OpenJLPT | Community JLPT lists |
| [Tatoeba](https://tatoeba.org) / Tanaka Corpus | Sentence contributors, [CC BY 2.0 FR](https://creativecommons.org/licenses/by/2.0/fr/) or the license returned per sentence | Example sentences via OpenJLPT and optional live API fallback; sentence IDs, authors, translation IDs/authors and links retained when supplied |
| [KanjiVG](https://kanjivg.tagaini.net/) | Ulrich Apel and contributors, [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) | Unchanged SVG files, original notices retained; stored separately in `strokes` |
| [Kuromoji.js](https://github.com/takuyaa/kuromoji.js) / MeCab IPADIC | Kuromoji.js contributors, Apache-2.0; IPADIC copyright 2000-2003 Nara Institute of Science and Technology, with ICOT conditions | Local morphological analysis; the installed package's `LICENSE-2.0.txt` and `NOTICE.md` are retained in deployment alongside the dictionary |
| [Jisho](https://jisho.org) | Dictionary service using EDRDG data; retain EDRDG attribution and upstream dictionary licenses | Optional exact-word fallback for Shiritori when SQLite has no match; source is identified in the word notebook |
| [WanaKana](https://wanakana.com) | WanaKana contributors, MIT | Local romaji-to-kana input conversion for Shiritori, the conjugator and conjugation practice |

EDRDG files are used in conformance with the
[EDRDG license](https://www.edrdg.org/edrdg/licence.html).
SKIP codes are copyright Jack Halpern and the Kanji Dictionary Publishing Society
and licensed under CC BY-SA 4.0.

The conjugation practice word bank and teaching-sentence templates in
`frontend/src/conjugation-practice-data.js` and
`frontend/src/conjugation-practice-engine.js` are original application content,
not imported Tatoeba quotations. Their JLPT labels are approximate study
assignments. Kanji and compound details shown in the trainer retain the
dictionary attributions above.

Changes made by Nihon: JSON-to-SQLite conversion, flattened searchable fields,
derived kanji/word relations across spellings, category classification, and joins
to form-specific JLPT records. Original sense restrictions and reading/meaning
groups are retained. Source versions, URLs, download checksums, and import dates
are recorded in the `metadata` table.

When distributing the generated database, retain these credits and license links,
identify modifications, and provide derivative dictionary data under CC BY-SA 4.0.
KanjiVG SVGs retain their separate CC BY-SA 3.0 license. Keep source snapshots
reasonably current. The original root `kanjidb.sqlite` is not part of this derived
dataset and is not used because its provenance was not provided.
