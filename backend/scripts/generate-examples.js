import { parseArgs } from "node:util";
import { openEnrichment, missingWords, coverage, transaction, validateGeneratedExamples, queueGenerated, exampleGenerationPrompt } from "./enrichment-lib.js";

const { values } = parseArgs({ options: {
  db: { type: "string" }, model: { type: "string", default: "llama3.2:latest" },
  minutes: { type: "string", default: "10" }, limit: { type: "string", default: "100" },
  "retry-failed": { type: "boolean" }
} });
const minutes = Number(values.minutes), limit = Number(values.limit);
if (!(minutes > 0) || !Number.isFinite(minutes) || !Number.isSafeInteger(limit) || limit < 1) {
  throw new Error("--minutes must be positive and --limit must be a positive integer");
}
const db = openEnrichment(values.db);
const deadline = Date.now() + minutes * 60000;
const provider = `ollama:${values.model}`;
const response = await fetch("http://127.0.0.1:11434/api/tags", { signal: AbortSignal.timeout(5000) });
if (!response.ok) throw new Error(`Ollama model discovery: HTTP ${response.status}`);
const model = (await response.json()).models.find((model) => model.name === values.model);
if (!model) throw new Error(`Ollama model not installed: ${values.model}`);
let attempted = 0, inserted = 0, rejected = 0;
try {
  const words = missingWords(db).filter((word) => values["retry-failed"] || !db.prepare(
    "SELECT 1 FROM enrichment_attempts WHERE word_id=? AND provider=?").get(word.id, provider));
  for (const word of words) {
    if (Date.now() >= deadline || attempted >= limit) break;
    const pending = db.prepare("SELECT ja FROM enrichment_generated WHERE word_id=? AND status='pending'").all(word.id);
    const needed = 3 - word.example_count - pending.length;
    if (needed <= 0) continue;
    attempted++;
    const prompt = exampleGenerationPrompt(word, needed);
    const result = await fetch("http://127.0.0.1:11434/api/chat", {
      method: "POST", headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(120000),
      body: JSON.stringify({ model: values.model, stream: false, format: "json",
        options: { temperature: 0.3, num_predict: 1500 },
        messages: prompt.messages })
    });
    if (!result.ok) throw new Error(`Ollama generation: HTTP ${result.status}`);
    const payload = await result.json();
    let examples;
    try { examples = JSON.parse(payload.message.content).examples; }
    catch (error) { console.error(`Invalid generation for word ${word.id}:`, error.message); examples = []; }
    const existing = new Set(db.prepare(`SELECT s.ja FROM sentences s JOIN word_sentences ws ON ws.sentence_id=s.id
      WHERE ws.word_id=?`).all(word.id).map((row) => row.ja));
    for (const row of pending) existing.add(row.ja);
    const accepted = validateGeneratedExamples(examples, word.word, needed, existing);
    transaction(db, () => {
      for (const example of accepted) inserted += queueGenerated(db, word.id, example, {
        model: model.name, digest: model.digest, generatedAt: new Date().toISOString(),
        reviewed: false, wordId: word.id, target: prompt.target
      });
      db.prepare("INSERT OR REPLACE INTO enrichment_attempts VALUES (?,?,?,?,?)")
        .run(word.id, provider, new Date().toISOString(), accepted.length === needed ? "done" : "incomplete",
          `${accepted.length}/${needed} structurally valid examples; not linguistically verified`);
    });
    if (accepted.length < needed) { rejected++; console.warn(`Word ${word.id}: only ${accepted.length}/${needed} usable examples`); }
    console.log(`Generated: ${attempted} words attempted, ${inserted} candidates quarantined for review, ${rejected} incomplete`);
  }
  console.log("Coverage:", coverage(db));
} finally {
  db.close();
}
