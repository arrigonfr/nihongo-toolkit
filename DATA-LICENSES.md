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
| [KanjiVG](https://kanjivg.tagaini.net/) | Ulrich Apel and contributors, [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) | Original SVGs in `strokes`; worksheet data adapts their paths and stroke-number positions for colored, adjustable diagrams |
| [Kanji alive](https://kanjialive.com/214-traditional-kanji-radicals/) | Kanji alive team, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | Traditional radical names, meanings, stroke counts and variant names; adapted from the [2026-09 dataset](https://github.com/kanjialive/kanji-data-media/tree/e67d274123011c85325f369a1376289414f4552d/language-data), normalized and regrouped for the cheatsheet |
| [Kanji Stroke Orders](https://www.nihilist.org.uk/) | Ulrich Apel, the AAAA project and the Wadoku project, BSD 3-clause; notice below | Numbered stroke-order font used by the handwriting worksheet |
| [Kuromoji.js](https://github.com/takuyaa/kuromoji.js) / MeCab IPADIC | Kuromoji.js contributors, Apache-2.0; IPADIC copyright 2000-2003 Nara Institute of Science and Technology, with ICOT conditions | Node uses the installed dictionary. Cloudflare serves a losslessly compacted copy (padding removed, typed lookup maps) with the upstream `LICENSE-2.0.txt` and `NOTICE.md` at `/_dictionary/kuromoji-license.txt` and `/_dictionary/kuromoji-notice.txt` |
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

## Kanji Stroke Orders font license

Copyright (C) 2004-2020 Ulrich Apel, the AAAA project and the Wadoku project
All rights reserved.

Redistribution and use in source and binary forms, with or without modification,
are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
3. Neither the name of the author may be used to endorse or promote products derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE AUTHOR ``AS IS'' AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
