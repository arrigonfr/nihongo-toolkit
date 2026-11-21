-- Additive Spanish/Portuguese study-content translations. English source tables are unchanged.
-- item_id: kanji character, `${jmdict_id}:${sense index}`, or sentences.id.
-- source_hash identifies the English source a translation was made from, so stale rows are detectable.
CREATE TABLE IF NOT EXISTS content_translations (
  kind TEXT NOT NULL CHECK(kind IN ('kanji','sense','sentence')),
  item_id TEXT NOT NULL,
  lang TEXT NOT NULL CHECK(lang IN ('es','pt')),
  value TEXT NOT NULL CHECK(json_valid(value) AND json_type(value) = 'array' AND json_array_length(value) > 0),
  method TEXT NOT NULL CHECK(method IN ('human','machine')),
  source TEXT NOT NULL,
  license TEXT NOT NULL,
  attribution TEXT NOT NULL CHECK(json_valid(attribution)),
  source_hash TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (kind, item_id, lang)
) WITHOUT ROWID;
