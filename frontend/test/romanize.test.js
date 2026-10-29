import test from "node:test";
import assert from "node:assert/strict";
import { romanizeKana } from "../src/romanize.js";

test("shared romanization covers compound readings, digraphs, sokuon and long vowels", () => {
  for (const [kana, romaji] of [
    ["ほん", "hon"], ["もとき", "motoki"], ["いっぽん", "ippon"],
    ["きゃくほん", "kyakuhon"], ["ショウホン", "shouhon"], ["コーヒー", "koohii"]
  ]) assert.equal(romanizeKana(kana), romaji);
});
