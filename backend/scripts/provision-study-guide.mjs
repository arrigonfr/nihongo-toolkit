import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { collect, fingerprint } from "./preview-guide-inventory.mjs";
import { normalize } from "../../frontend/src/preview-guide/classification.js";
import { romanizeKana } from "../../frontend/src/romanize.js";

const unique = xs => [...new Set(xs)];

function romajiTokens(forms) {
  const out = [];
  for (const f of forms) {
    if (!f || !/[ぁ-ゖァ-ヶ]/.test(f) || /[\u3400-\u9fff]/.test(f)) continue;
    const r = romanizeKana(f);
    if (!r) continue;
    out.push(r);
    if (r.includes("cch")) out.push(r.replaceAll("cch", "tch"));
    if (r.includes("oo")) out.push(r.replaceAll("oo", "ou"));
  }
  return unique(out);
}

const curatedSceneMap = {
  "Rain": "Weather & nature",
  "Wind": "Weather & nature",
  "Food texture": "Food & texture",
  "Footsteps": "Impacts & sounds",
  "Voices": "Voices & speech",
  "Impacts": "Impacts & sounds",
  "Movement": "Movement & speed",
  "Appearance": "Appearance & light",
  "Bodily sensations": "Body & sensations",
  "Emotions": "Emotions & mind"
};

const sceneRules = [
  ["Weather & nature", /\b(rain|raindrop|drizzle|downpour|wind|breeze|gust|thunder|lightning|snow|storm|hail|shower|pouring|blowing|water|wave|splash|drip|trickl|flow|stream|river|fire|flame|blaze|burn|sizzl|spark|frost|sun|moon|cloud|fog|weather|chill|freezing|humid|sultry)\b/i],
  ["Food & texture", /\b(chew|chewy|crisp|crispy|crunch|crunchy|bite|eat|eating|drink|drinking|gulp|slurp|sip|munch|gobble|nibble|soft|fluffy|sticky|slimy|gooey|slippery|smooth|rough|tender|juicy|moist|dry|soggy|greasy|oily|spicy|boiling|simmer|melt|dough|bread|noodle|rice|taste|flavor|flavour|sweet|sour|bitter|salty|mouthful|hungry|full|delicious)\b/i],
  ["Voices & speech", /\b(whisper|mutter|mumble|chatter|babble|gossip|talk|talking|speak|speaking|speech|voice|shout|yell|scream|cry|crying|weep|sob|laugh|giggle|chuckle|snicker|grin|smile|sigh|groan|moan|grumble|complain|stutter|stammer|fluent|eloquent|bark|meow|chirp|tweet|roar|growl|howl|hum|buzz|sing|whine|squeak|snore|cough|sneeze|hiccup|chattering|prattle)\b/i],
  ["Impacts & sounds", /\b(bang|thud|crash|boom|slam|clatter|rattle|ring|chime|clink|clank|clang|creak|snap|crack|pop|click|tick|tock|tap|knock|thump|bump|smack|slap|hit|strike|beat|drum|whistle|hiss|whoosh|swish|rustle|scratch|scrape|grind|rumble|echo|noise|noisy|loud|sound|footstep|step|tread|tramp|stomp|quiet|silent|silence)\b/i],
  ["Body & sensations", /\b(pain|ache|throb|tingle|itch|numb|dizzy|faint|sweat|sweaty|shiver|tremble|shudder|chills|fever|tired|exhausted|sleepy|drowsy|doze|dozing|nodding off|awake|stomach|heart|pulse|breath|pant|gasp|blush|flush|skin|hair|eye|blink|stare|glare|wink|tear|stiff|sore|nausea|vomit|itchy|tickl|fatigue|weary)\b/i],
  ["Emotions & mind", /\b(nervous|anxious|worry|worried|excited|thrill|happy|happily|joy|joyous|joyful|glad|cheerful|cheerfully|angry|furious|irritated|annoyed|frustrated|fed up|sad|depressed|gloomy|lonely|bored|disappointed|shocked|surprised|startled|scared|afraid|fear|terrified|calm|relaxed|relieved|refreshed|shy|embarrassed|timid|proud|smug|jealous|envious|confused|puzzled|hesitat|indecisive|impatient|eager|keen|reluctant|stubborn|carefree|absent-minded|daze|blank|dreamy|restless|uneasy|tense|lovey|affection|mood|spirit|enthusiast)\b/i],
  ["Appearance & light", /\b(sparkle|sparkling|glitter|shine|shining|glow|flash|twinkle|gleam|dazzle|bright|dim|dark|blur|hazy|clear|vivid|neat|tidy|clean|messy|untidy|shabby|ragged|worn|wrinkled|crumpled|puffy|plump|chubby|thin|slim|slender|skinny|tall|tiny|round|flat|pointed|sharp|glossy|shiny|transparent|striped|spotted|bushy|shaggy|bald|orderly|scattered|crowded|swarm|cluster)\b/i],
  ["Movement & speed", /\b(walk|wander|stroll|stride|march|run|dash|rush|hurry|haste|scurry|creep|crawl|sneak|tiptoe|hop|jump|bounce|leap|skip|roll|spin|twirl|whirl|sway|swing|rock|wobble|totter|stagger|stumble|slip|slide|glide|float|drift|flutter|flap|fly|soar|fall|drop|plunge|tumble|scatter|spread|stretch|shrink|squirm|wriggle|wiggle|fidget|twitch|shake|vibrate|winding|meander|zigzag|fast|quick|rapid|swift|slow|slowly|sluggish|sudden|abrupt|gradual|smoothly|steadily|lightly|briskly)\b/i]
];

function inferScene(glossText) {
  for (const [name, re] of sceneRules) {
    if (re.test(glossText)) return name;
  }
  return "Manner & state";
}

function extractUsage(senses) {
  const tags = new Set();
  for (const s of senses) {
    for (const p of s.partOfSpeech || []) {
      if (p === "adv" || p === "adv-to") tags.add("adv");
      else if (p === "vs" || p === "vs-i" || p === "vs-s") tags.add("vs");
      else if (p === "adj-na" || p === "adj-no" || p === "adj-f" || p === "adj-t") tags.add("adj");
      else if (p === "n") tags.add("n");
      else if (p === "int" || p === "exp") tags.add("int");
    }
  }
  return [...tags];
}

function pickTatoebaExample(db, wordId) {
  const rows = db.prepare(`
    SELECT s.id, s.ja, s.en, s.source, s.license, s.attribution
    FROM word_sentences ws
    JOIN sentences s ON s.id = ws.sentence_id
    WHERE ws.word_id = ? AND s.ja IS NOT NULL AND s.en IS NOT NULL
    ORDER BY
      CASE WHEN length(s.ja) BETWEEN 6 AND 45 THEN 0 ELSE 1 END,
      abs(length(s.ja) - 20),
      s.id
    LIMIT 1
  `).all(wordId);
  if (!rows.length) return null;
  const row = rows[0];
  let attribution = null;
  try { attribution = row.attribution ? JSON.parse(row.attribution) : null; } catch {}
  return {
    markup: row.ja,
    translation: row.en,
    exampleSource: row.source === "tatoeba" ? "Tatoeba" : row.source,
    exampleLicense: row.license || "CC BY 2.0 FR",
    exampleOwner: attribution?.owner || null,
    exampleUrl: attribution?.sourceUrl || null
  };
}

function buildDictionaryRecords(db, curatedCards, existingEntries) {
  const hasWords = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='words'").get();
  if (!hasWords) {
    return {
      mappedCurated: curatedCards.map(c => ({
        ...c,
        subscene: c.scene,
        scene: curatedSceneMap[c.scene] || c.scene || "Manner & state",
        usage: c.usage || ["adv"]
      })),
      extraCards: [],
      extraEntries: []
    };
  }
  const hasEnrichment = Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='enrichment_word_sources'").get());
  const hasWordForms = Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='word_forms'").get());
  const hasSentences = Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='word_sentences'").get());

  const curatedEntries = new Set(curatedCards.map(c => c.entry));
  const entrySet = new Set(existingEntries.map(e => e.entry));
  const usageByEntry = new Map();
  const formQuery = hasWordForms ? db.prepare("SELECT form FROM word_forms WHERE word_id=? ORDER BY form") : null;
  const query = db.prepare(`
    SELECT w.id, w.jmdict_id, w.word, w.reading, w.is_common, w.kana_forms, w.kanji_forms, w.senses
    ${hasSentences ? ", EXISTS(SELECT 1 FROM word_sentences ws WHERE ws.word_id=w.id) AS has_sentence" : ", 0 AS has_sentence"}
    FROM words w
    WHERE EXISTS(SELECT 1 FROM json_each(w.senses) s, json_each(s.value,'$.misc') m WHERE m.value='on-mim')
    ${hasEnrichment ? "AND NOT EXISTS(SELECT 1 FROM enrichment_word_sources e WHERE e.word_id=w.id)" : ""}
    ORDER BY w.is_common DESC, has_sentence DESC, length(w.reading), w.jmdict_id
  `);

  const extraCards = [];
  const extraEntries = [];

  for (const w of query.iterate()) {
    const senses = JSON.parse(w.senses);
    const kanaForms = JSON.parse(w.kana_forms);
    const kanjiForms = JSON.parse(w.kanji_forms);
    const onMimSenses = senses.filter(s => s.misc.includes("on-mim"));
    const usage = extractUsage(onMimSenses.length ? onMimSenses : senses);
    usageByEntry.set(w.jmdict_id, usage);

    const forms = formQuery
      ? unique(formQuery.all(w.id).map(f => f.form))
      : unique([w.word, w.reading, ...kanaForms.map(k => k.text), ...kanjiForms.map(k => k.text)].filter(Boolean));

    if (!entrySet.has(w.jmdict_id)) {
      entrySet.add(w.jmdict_id);
      extraEntries.push({
        entry: w.jmdict_id,
        form: w.word,
        reading: w.reading,
        forms,
        senses: senses.map(s => ({
          fingerprint: fingerprint(s),
          meanings: s.gloss.filter(g => g.lang === "eng").map(g => g.text),
          appliesToKana: s.appliesToKana,
          appliesToKanji: s.appliesToKanji,
          umbrellaTag: s.misc.includes("on-mim")
        }))
      });
    }

    if (curatedEntries.has(w.jmdict_id)) continue;

    const meanings = unique(
      onMimSenses
        .flatMap(s => s.gloss.filter(g => g.lang === "eng").map(g => g.text))
        .filter(Boolean)
    );
    if (!meanings.length) continue;

    const primaryForm = w.reading || kanaForms[0]?.text || w.word;
    const aliases = unique(forms.filter(f => f !== primaryForm));
    const example = hasSentences && w.has_sentence ? pickTatoebaExample(db, w.id) : null;
    const scene = inferScene(meanings.join("; "));

    extraCards.push({
      id: `jmdict-${w.jmdict_id}`,
      entry: w.jmdict_id,
      fingerprint: fingerprint(onMimSenses[0]),
      form: primaryForm,
      canonical: w.word,
      reading: w.reading,
      common: Boolean(w.is_common),
      aliases,
      scene,
      type: "unclassified",
      register: "",
      usage,
      meaning: meanings.slice(0, 4).join("; "),
      markup: example?.markup || "",
      translation: example?.translation || "",
      exampleSource: example?.exampleSource || null,
      exampleLicense: example?.exampleLicense || null,
      exampleOwner: example?.exampleOwner || null,
      exampleUrl: example?.exampleUrl || null,
      status: "dictionary",
      source: "jmdict"
    });
  }

  const mappedCurated = curatedCards.map(c => ({
    ...c,
    subscene: c.scene,
    scene: curatedSceneMap[c.scene] || c.scene || "Manner & state",
    usage: usageByEntry.get(c.entry) || ["adv"]
  }));

  return { mappedCurated, extraCards, extraEntries };
}

export function provision(db, { cards, dictionary, contrasts, manifest }) {
  const { mappedCurated, extraCards, extraEntries } = buildDictionaryRecords(db, cards, dictionary);
  const allCards = [...mappedCurated, ...extraCards];
  const allEntries = [...dictionary, ...extraEntries];

  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(`DROP TABLE IF EXISTS study_guide_cards;
      CREATE TABLE study_guide_cards(
        id TEXT PRIMARY KEY,
        entry TEXT NOT NULL,
        status TEXT NOT NULL,
        scene TEXT NOT NULL,
        type TEXT NOT NULL,
        register TEXT NOT NULL,
        usage TEXT NOT NULL,
        common INTEGER NOT NULL,
        has_example INTEGER NOT NULL,
        sort_order INTEGER NOT NULL,
        search TEXT NOT NULL,
        data TEXT NOT NULL
      );
      CREATE INDEX study_guide_cards_entry ON study_guide_cards(entry);
      CREATE INDEX study_guide_cards_browse ON study_guide_cards(status, sort_order);
      CREATE INDEX study_guide_cards_scene ON study_guide_cards(scene, sort_order);
      CREATE INDEX study_guide_cards_type ON study_guide_cards(type, sort_order);
      CREATE INDEX study_guide_cards_register ON study_guide_cards(register, sort_order);
      CREATE INDEX study_guide_cards_common ON study_guide_cards(common, sort_order);
      CREATE INDEX study_guide_cards_example ON study_guide_cards(has_example, sort_order);
      CREATE TABLE IF NOT EXISTS study_guide_entries(entry TEXT PRIMARY KEY, data TEXT);
      CREATE TABLE IF NOT EXISTS study_guide_info(id INTEGER PRIMARY KEY, data TEXT);
      CREATE TABLE IF NOT EXISTS study_guide_pairs(a TEXT,b TEXT,note TEXT,PRIMARY KEY(a,b));
      DELETE FROM study_guide_entries;
      DELETE FROM study_guide_pairs; DELETE FROM study_guide_info;`);
    const card = db.prepare("INSERT INTO study_guide_cards VALUES(?,?,?,?,?,?,?,?,?,?,?,?)");
    for (const [index, c] of allCards.entries()) {
      const forms = [c.form, c.reading, ...(c.aliases || [])].filter(Boolean);
      const searchText = [...forms, ...romajiTokens(forms), c.scene, c.subscene, c.meaning, c.translation]
        .filter(Boolean)
        .map(normalize)
        .join(" ");
      const usageList = c.usage || [];
      const usageStr = usageList.length ? `,${usageList.join(",")},` : "";
      card.run(
        c.id,
        c.entry,
        c.status || "draft",
        c.scene || "",
        c.type || "unclassified",
        c.register || "",
        usageStr,
        c.common ? 1 : 0,
        c.markup ? 1 : 0,
        index,
        searchText,
        JSON.stringify(c)
      );
    }
    const entry = db.prepare("INSERT INTO study_guide_entries VALUES(?,?)");
    for (const e of allEntries) entry.run(e.entry, JSON.stringify(e));
    const pair = db.prepare("INSERT INTO study_guide_pairs VALUES(?,?,?)");
    for (const n of contrasts) pair.run(...n.ids, n.note);
    const countBy = key => {
      const counts = {};
      for (const c of allCards) {
        if (c[key]) counts[c[key]] = (counts[c[key]] || 0) + 1;
      }
      return counts;
    };
    const sceneCounts = countBy("scene");
    const scenes = Object.keys(sceneCounts).sort((a, b) => sceneCounts[b] - sceneCounts[a]);
    const registerCounts = countBy("register");
    const registers = Object.keys(registerCounts);
    const usageCounts = {};
    for (const c of allCards) {
      for (const u of c.usage || []) usageCounts[u] = (usageCounts[u] || 0) + 1;
    }
    const commonCount = allCards.filter(c => Boolean(c.common)).length;
    db.prepare("INSERT INTO study_guide_info VALUES(1,?)").run(JSON.stringify({
      manifest,
      scene: scenes,
      register: registers,
      sceneCounts,
      registerCounts,
      usageCounts,
      frequencyCounts: {
        marked: commonCount,
        unmarked: allCards.length - commonCount
      },
      counts: {
        all: allCards.length,
        draft: mappedCurated.length,
        dictionary: extraCards.length,
        examples: allCards.filter(c => Boolean(c.markup)).length
      }
    }));
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const db = new DatabaseSync(process.argv[2] || "backend/data/nihon.sqlite");
  try { provision(db, collect(db).catalog); } finally { db.close(); }
}
