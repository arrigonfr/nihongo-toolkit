CREATE TABLE IF NOT EXISTS word_forms (
  kind INTEGER NOT NULL,
  form TEXT NOT NULL,
  word_id INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  PRIMARY KEY (kind, form, word_id)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS word_forms_word_id ON word_forms(word_id);
CREATE INDEX IF NOT EXISTS words_common_id ON words(is_common DESC, id);

CREATE TRIGGER IF NOT EXISTS words_forms_insert AFTER INSERT ON words BEGIN
  INSERT OR IGNORE INTO word_forms
    SELECT 0, json_extract(value, '$.text'), new.id FROM json_each(new.kanji_forms);
  INSERT OR IGNORE INTO word_forms
    SELECT 1, json_extract(value, '$.text'), new.id FROM json_each(new.kana_forms);
END;
CREATE TRIGGER IF NOT EXISTS words_forms_update AFTER UPDATE OF kanji_forms, kana_forms ON words BEGIN
  DELETE FROM word_forms WHERE word_id = old.id;
  INSERT OR IGNORE INTO word_forms
    SELECT 0, json_extract(value, '$.text'), new.id FROM json_each(new.kanji_forms);
  INSERT OR IGNORE INTO word_forms
    SELECT 1, json_extract(value, '$.text'), new.id FROM json_each(new.kana_forms);
END;
CREATE TRIGGER IF NOT EXISTS words_forms_delete AFTER DELETE ON words BEGIN
  DELETE FROM word_forms WHERE word_id = old.id;
END;

INSERT OR IGNORE INTO word_forms
  SELECT 0, json_extract(f.value, '$.text'), w.id FROM words w, json_each(w.kanji_forms) f
  WHERE NOT EXISTS (SELECT 1 FROM metadata WHERE key = 'word_forms_version' AND value = '1');
INSERT OR IGNORE INTO word_forms
  SELECT 1, json_extract(f.value, '$.text'), w.id FROM words w, json_each(w.kana_forms) f
  WHERE NOT EXISTS (SELECT 1 FROM metadata WHERE key = 'word_forms_version' AND value = '1');
INSERT OR REPLACE INTO metadata(key, value) VALUES ('word_forms_version', '1');
