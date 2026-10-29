-- Additive tables created by `npm run seed:vocab`. Existing tables are untouched.
CREATE TABLE IF NOT EXISTS vocabulary_words (
  id INTEGER PRIMARY KEY,
  word_id INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  word TEXT NOT NULL,
  reading TEXT NOT NULL,
  meaning TEXT NOT NULL,
  meanings TEXT NOT NULL CHECK(json_valid(meanings)),
  jlpt INTEGER CHECK(jlpt BETWEEN 1 AND 5),
  parts_of_speech TEXT NOT NULL CHECK(json_valid(parts_of_speech)),
  tags TEXT NOT NULL CHECK(json_valid(tags)),
  is_common INTEGER NOT NULL CHECK(is_common IN (0,1)),
  source TEXT NOT NULL,
  license TEXT NOT NULL,
  UNIQUE (word_id, word, reading)
);
CREATE INDEX IF NOT EXISTS vocabulary_words_jlpt ON vocabulary_words(jlpt);
CREATE INDEX IF NOT EXISTS vocabulary_words_common ON vocabulary_words(is_common);
CREATE TABLE IF NOT EXISTS sentences (
  id TEXT PRIMARY KEY,
  ja TEXT NOT NULL,
  en TEXT NOT NULL,
  source TEXT NOT NULL,
  source_id TEXT,
  license TEXT NOT NULL,
  attribution TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sentences_source ON sentences(source, source_id);
CREATE TABLE IF NOT EXISTS word_sentences (
  word_id INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  sentence_id TEXT NOT NULL REFERENCES sentences(id) ON DELETE CASCADE,
  matched_text TEXT NOT NULL,
  PRIMARY KEY (word_id, sentence_id)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS word_sentences_sentence ON word_sentences(sentence_id);
CREATE TABLE IF NOT EXISTS seed_runs (
  id INTEGER PRIMARY KEY,
  step TEXT NOT NULL,
  source_url TEXT NOT NULL,
  sha256 TEXT,
  status TEXT NOT NULL CHECK(status IN ('done','failed')),
  rows_seen INTEGER NOT NULL DEFAULT 0,
  rows_inserted INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS seed_runs_step ON seed_runs(step, sha256);
