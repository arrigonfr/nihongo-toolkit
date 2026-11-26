CREATE INDEX IF NOT EXISTS vocabulary_romaji ON vocabulary(romaji);

CREATE TABLE IF NOT EXISTS kanji_readings (
  reading TEXT NOT NULL,
  kanji_id INTEGER NOT NULL REFERENCES kanjis(id) ON DELETE CASCADE,
  PRIMARY KEY (reading, kanji_id)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS kanji_readings_kanji_id ON kanji_readings(kanji_id);

CREATE TRIGGER IF NOT EXISTS kanji_readings_insert AFTER INSERT ON kanjis BEGIN
  INSERT OR IGNORE INTO kanji_readings
    SELECT replace(replace(value, '.', ''), '-', ''), new.id FROM json_each(new.on_readings);
  INSERT OR IGNORE INTO kanji_readings
    SELECT replace(replace(value, '.', ''), '-', ''), new.id FROM json_each(new.kun_readings);
END;
CREATE TRIGGER IF NOT EXISTS kanji_readings_update AFTER UPDATE OF on_readings, kun_readings ON kanjis BEGIN
  DELETE FROM kanji_readings WHERE kanji_id = old.id;
  INSERT OR IGNORE INTO kanji_readings
    SELECT replace(replace(value, '.', ''), '-', ''), new.id FROM json_each(new.on_readings);
  INSERT OR IGNORE INTO kanji_readings
    SELECT replace(replace(value, '.', ''), '-', ''), new.id FROM json_each(new.kun_readings);
END;
CREATE TRIGGER IF NOT EXISTS kanji_readings_delete AFTER DELETE ON kanjis BEGIN
  DELETE FROM kanji_readings WHERE kanji_id = old.id;
END;

INSERT OR IGNORE INTO kanji_readings
  SELECT replace(replace(value, '.', ''), '-', ''), k.id FROM kanjis k, json_each(k.on_readings)
  WHERE NOT EXISTS (SELECT 1 FROM metadata WHERE key = 'kanji_readings_version' AND value = '1');
INSERT OR IGNORE INTO kanji_readings
  SELECT replace(replace(value, '.', ''), '-', ''), k.id FROM kanjis k, json_each(k.kun_readings)
  WHERE NOT EXISTS (SELECT 1 FROM metadata WHERE key = 'kanji_readings_version' AND value = '1');
INSERT OR REPLACE INTO metadata(key, value) VALUES ('kanji_readings_version', '1');

CREATE VIRTUAL TABLE IF NOT EXISTS words_meanings_fts USING fts5(
  meanings,
  content='words',
  content_rowid='id',
  tokenize='trigram'
);
CREATE TRIGGER IF NOT EXISTS words_meanings_fts_insert AFTER INSERT ON words BEGIN
  INSERT INTO words_meanings_fts(rowid, meanings) VALUES (new.id, new.meanings);
END;
CREATE TRIGGER IF NOT EXISTS words_meanings_fts_delete AFTER DELETE ON words BEGIN
  INSERT INTO words_meanings_fts(words_meanings_fts, rowid, meanings) VALUES ('delete', old.id, old.meanings);
END;
CREATE TRIGGER IF NOT EXISTS words_meanings_fts_update AFTER UPDATE OF meanings ON words BEGIN
  INSERT INTO words_meanings_fts(words_meanings_fts, rowid, meanings) VALUES ('delete', old.id, old.meanings);
  INSERT INTO words_meanings_fts(rowid, meanings) VALUES (new.id, new.meanings);
END;
INSERT INTO words_meanings_fts(words_meanings_fts)
  SELECT 'rebuild' WHERE NOT EXISTS (SELECT 1 FROM metadata WHERE key = 'words_meanings_fts_version' AND value = '2');
INSERT OR REPLACE INTO metadata(key, value) VALUES ('words_meanings_fts_version', '2');

CREATE VIRTUAL TABLE IF NOT EXISTS kanji_meanings_fts USING fts5(
  meanings,
  content='kanjis',
  content_rowid='id',
  tokenize='trigram'
);
CREATE TRIGGER IF NOT EXISTS kanji_meanings_fts_insert AFTER INSERT ON kanjis BEGIN
  INSERT INTO kanji_meanings_fts(rowid, meanings) VALUES (new.id, new.meanings);
END;
CREATE TRIGGER IF NOT EXISTS kanji_meanings_fts_delete AFTER DELETE ON kanjis BEGIN
  INSERT INTO kanji_meanings_fts(kanji_meanings_fts, rowid, meanings) VALUES ('delete', old.id, old.meanings);
END;
CREATE TRIGGER IF NOT EXISTS kanji_meanings_fts_update AFTER UPDATE OF meanings ON kanjis BEGIN
  INSERT INTO kanji_meanings_fts(kanji_meanings_fts, rowid, meanings) VALUES ('delete', old.id, old.meanings);
  INSERT INTO kanji_meanings_fts(rowid, meanings) VALUES (new.id, new.meanings);
END;
INSERT INTO kanji_meanings_fts(kanji_meanings_fts)
  SELECT 'rebuild' WHERE NOT EXISTS (SELECT 1 FROM metadata WHERE key = 'kanji_meanings_fts_version' AND value = '2');
INSERT OR REPLACE INTO metadata(key, value) VALUES ('kanji_meanings_fts_version', '2');
