import test from "node:test";
import assert from "node:assert/strict";
import { parseWranglerResult } from "../scripts/wrangler-result.js";

test("parses plain local and remote command JSON, including empty query rows", () => {
  assert.deepEqual(parseWranglerResult('[{"success":true,"results":[{"n":500}]}]'), [{ n: 500 }]);
  assert.deepEqual(parseWranglerResult('[{"success":true,"results":[]}]'), []);
});

test("parses remote file JSON after ANSI spinner and upload progress", () => {
  const output = '\u001b[32m├ Checking if file needs uploading\u001b[0m\n'
    + '├ [upload] Uploading complete.\n'
    + JSON.stringify([{ success: true, results: [{ "Total queries executed": 500 }], meta: { rows_written: 3004 } }], null, 2);
  assert.deepEqual(parseWranglerResult(output), [{ "Total queries executed": 500 }]);
});

test("refuses missing, truncated, malformed and unsuccessful results", () => {
  for (const output of [
    "├ Checking if file needs uploading", '[{"success":true',
    "[]", '[{"results":[]}]', '[{"success":true,"results":null}]',
    '[{"success":false,"results":[]}]',
    '[{"success":true,"results":[]},{"success":false,"results":[]}]',
    '[{"success":true,"results":[]}]\nunexpected trailing output'
  ]) {
    assert.throws(() => parseWranglerResult(output), /No import checkpoint was recorded/);
  }
});
