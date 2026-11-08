import test from "node:test";
import assert from "node:assert/strict";
import { meaningAnswers } from "../src/vocabulary-answers.js";

test("meanings accept dictionary alternatives and optional parentheticals, not arbitrary substrings", () => {
  const answers = meaningAnswers(["swimming pool", "(swimming) pool", "pool (cue sport)", "pooling (money, resources, etc.)", "to wear; to put on"]);
  for (const answer of ["pool", "swimming pool", "pooling", "to wear", "to put on"]) assert.ok(answers.includes(answer), answer);
  for (const answer of ["swimming", "sport", "resources", "etc.)", "money", ""]) assert.ok(!answers.includes(answer), answer);
  assert.deepEqual(meaningAnswers(["cat", "cat"]), ["cat"]);
});
