PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS kanjis (
  id INTEGER PRIMARY KEY,
  character TEXT NOT NULL UNIQUE,
  unicode TEXT NOT NULL UNIQUE,
  codepoint INTEGER NOT NULL UNIQUE,
  on_readings TEXT NOT NULL CHECK(json_valid(on_readings)),
  kun_readings TEXT NOT NULL CHECK(json_valid(kun_readings)),
  nanori TEXT NOT NULL CHECK(json_valid(nanori)),
  meanings TEXT NOT NULL CHECK(json_valid(meanings)),
  meanings_by_language TEXT NOT NULL CHECK(json_valid(meanings_by_language)),
  stroke_count INTEGER NOT NULL CHECK(stroke_count > 0),
  stroke_counts TEXT NOT NULL CHECK(json_valid(stroke_counts)),
  jlpt INTEGER CHECK(jlpt BETWEEN 1 AND 5),
  jlpt_source TEXT,
  jlpt_old INTEGER CHECK(jlpt_old BETWEEN 1 AND 4),
  grade INTEGER,
  categories TEXT NOT NULL CHECK(json_valid(categories)),
  is_kokuji INTEGER CHECK(is_kokuji IN (0,1)),
  frequency INTEGER,
  radicals TEXT NOT NULL CHECK(json_valid(radicals)),
  radical_names TEXT NOT NULL CHECK(json_valid(radical_names)),
  variants TEXT NOT NULL CHECK(json_valid(variants)),
  dictionary_references TEXT NOT NULL CHECK(json_valid(dictionary_references)),
  query_codes TEXT NOT NULL CHECK(json_valid(query_codes)),
  reading_meaning TEXT NOT NULL CHECK(json_valid(reading_meaning)),
  codepoints TEXT NOT NULL CHECK(json_valid(codepoints))
);
CREATE INDEX IF NOT EXISTS kanjis_jlpt ON kanjis(jlpt);
CREATE TABLE IF NOT EXISTS words (
  id INTEGER PRIMARY KEY,
  jmdict_id TEXT NOT NULL UNIQUE,
  word TEXT NOT NULL,
  reading TEXT NOT NULL,
  meanings TEXT NOT NULL CHECK(json_valid(meanings)),
  is_common INTEGER NOT NULL CHECK(is_common IN (0,1)),
  kanji_forms TEXT NOT NULL CHECK(json_valid(kanji_forms)),
  kana_forms TEXT NOT NULL CHECK(json_valid(kana_forms)),
  senses TEXT NOT NULL CHECK(json_valid(senses))
);
CREATE INDEX IF NOT EXISTS words_spelling ON words(word);
CREATE INDEX IF NOT EXISTS words_reading ON words(reading);
CREATE TABLE IF NOT EXISTS kanji_words (
  kanji_id INTEGER NOT NULL REFERENCES kanjis(id) ON DELETE CASCADE,
  word_id INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  PRIMARY KEY (kanji_id, word_id)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS kanji_words_word ON kanji_words(word_id);
-- A JLPT list assigns a level to a particular spelling/reading, not every sense
-- or alternate reading of its JMdict entry.
CREATE TABLE IF NOT EXISTS vocabulary (
  id TEXT PRIMARY KEY,
  word_id INTEGER REFERENCES words(id),
  word TEXT NOT NULL,
  reading TEXT NOT NULL,
  romaji TEXT NOT NULL,
  meanings TEXT NOT NULL CHECK(json_valid(meanings)),
  jlpt INTEGER NOT NULL CHECK(jlpt BETWEEN 1 AND 5),
  parts_of_speech TEXT NOT NULL CHECK(json_valid(parts_of_speech)),
  examples TEXT NOT NULL CHECK(json_valid(examples)),
  other_forms TEXT NOT NULL CHECK(json_valid(other_forms)),
  other_readings TEXT NOT NULL CHECK(json_valid(other_readings))
);
CREATE INDEX IF NOT EXISTS vocabulary_jlpt ON vocabulary(jlpt);
CREATE INDEX IF NOT EXISTS vocabulary_word_id ON vocabulary(word_id);
CREATE TABLE IF NOT EXISTS strokes (
  character TEXT PRIMARY KEY REFERENCES kanjis(character),
  svg TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
PRAGMA user_version = 1;
