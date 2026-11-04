import { parseArgs } from "node:util";
import { tokenizer } from "../src/tokenizer-node.js";
import { openEnrichment, lexicalIndex, hiragana } from "./enrichment-lib.js";

const { values } = parseArgs({ options: { db: { type: "string" } } });
const db = openEnrichment(values.db);
try {
  const index = lexicalIndex(db.prepare("SELECT id,kanji_forms,kana_forms FROM words").all());
  const segment = await tokenizer();
  const sources = [
    { host: "ja.wikinews.org", params: { generator: "random", grnnamespace: "0", grnlimit: "20" } },
    { host: "en.wikibooks.org", params: { generator: "allpages", gapnamespace: "0", gapprefix: "Japanese/Vocabulary", gaplimit: "20" } }
  ];
  for (const source of sources) {
    const url = new URL(`https://${source.host}/w/api.php`);
    url.search = new URLSearchParams({ action: "query", format: "json", prop: "revisions", rvprop: "content", rvslots: "main", ...source.params });
    const response = await fetch(url, { signal: AbortSignal.timeout(30000), headers: { "User-Agent": "NihonVocabularyResearch/1.0" } });
    if (!response.ok) throw new Error(`Discovery source ${source.host}: HTTP ${response.status}`);
    const payload = await response.json();
    if (payload.error || !payload.query?.pages) throw new Error(`Invalid discovery response from ${source.host}: ${JSON.stringify(payload.error ?? payload)}`);
    let inserted = 0, pages = 0;
    for (const page of Object.values(payload.query.pages)) {
      pages++;
      const text = page.revisions?.[0]?.slots?.main?.["*"];
      if (typeof text !== "string") throw new Error(`Missing article text: ${page.title}`);
      for (const token of segment.tokenize(text)) {
        const word = token.basic_form === "*" ? token.surface_form : token.basic_form;
        if (!/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(word)
            || word.length < 2 || index.has(word) || !["名詞", "動詞", "形容詞"].includes(token.pos)) continue;
        inserted += Number(db.prepare("INSERT OR IGNORE INTO enrichment_candidates VALUES (?,?,?)")
          .run(word, hiragana(token.reading ?? ""), `https://${source.host}/?curid=${page.pageid}`).changes);
      }
    }
    console.log(`${source.host}: ${pages} pages checked; ${inserted} unknown lexical candidates saved for dictionary validation (not published as words)`);
  }
} finally { db.close(); }
