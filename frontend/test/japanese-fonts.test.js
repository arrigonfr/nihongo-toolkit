import test from "node:test";
import assert from "node:assert/strict";
import { JAPANESE_FONTS, FONT_FAMILIES, fontList, encodeFonts, isFontSetting } from "../src/japanese-fonts.js";
import { defaults, cleanSettings } from "../src/conjugation-practice-engine.js";
import { DEFAULTS as memoryDefaults, validateSettings as memorySettings, effectiveSettings, generateDeck, createRound, restoreDaily } from "../src/memory-engine.js";
import { DEFAULTS as searchDefaults, validateSettings as searchSettings } from "../src/word-search-engine.js";

test("Japanese fonts validate and old profiles retain their defaults", () => {
  for (const font of Object.keys(JAPANESE_FONTS)) {
    assert.equal(cleanSettings({ font }).font, font === "default" ? "Noto Sans JP" : font);
    assert.equal(memorySettings({ ...memoryDefaults, font }).font, font);
    assert.equal(searchSettings({ ...searchDefaults, font }).font, font);
  }
  for (const [settings, validate] of [[memoryDefaults, memorySettings], [searchDefaults, searchSettings]]) {
    const legacy = { ...settings };
    delete legacy.font;
    assert.equal(validate(legacy).font, "Noto Sans JP");
    assert.throws(() => validate({ ...legacy, font: "unknown" }), /font/);
  }
  assert.equal(cleanSettings({ font: "unknown" }).font, defaults.font);
});

test("adding a font preference does not invalidate an existing daily memory board", () => {
  const day = "2026-10-24";
  const rules = effectiveSettings({ ...memoryDefaults, mode: "daily" });
  const game = createRound(generateDeck([], rules, { seed: `memory-v1:${day}` }), rules, 1000);
  delete game.rules.font;
  const restored = restoreDaily({ day, game }, day);
  assert.deepEqual(restored.deck, game.deck);
  assert.equal(restored.rules.font, "Noto Sans JP");
  assert.equal(restored.started, 1000);
});

test("font settings decode and encode every supported shape", () => {
  assert.equal(FONT_FAMILIES.length, 4);
  assert.deepEqual(fontList("random"), FONT_FAMILIES);
  assert.deepEqual(fontList("default"), [FONT_FAMILIES[0]]);
  assert.deepEqual(fontList(`${FONT_FAMILIES[2]},${FONT_FAMILIES[0]}`), [FONT_FAMILIES[0], FONT_FAMILIES[2]]);
  assert.equal(encodeFonts(FONT_FAMILIES), "random");
  assert.equal(encodeFonts([]), "random");
  assert.equal(encodeFonts([FONT_FAMILIES[3], FONT_FAMILIES[1]]), `${FONT_FAMILIES[1]},${FONT_FAMILIES[3]}`);
  assert.equal(isFontSetting(`${FONT_FAMILIES[0]},${FONT_FAMILIES[1]}`), true);
  assert.equal(isFontSetting(`${FONT_FAMILIES[0]},${FONT_FAMILIES[0]}`), false);
  assert.equal(isFontSetting("Comic Sans"), false);
});
