import test from "node:test";
import assert from "node:assert/strict";
import { alignFuriganaRuby, formatFurigana } from "../src/furigana.js";

test("furigana aligns kanji runs without annotating okurigana", () => {
  assert.equal(alignFuriganaRuby("食べる", "たべる"), "<ruby>食<rt>た</rt></ruby>べる");
  assert.equal(alignFuriganaRuby("受け取る", "うけとる"), "<ruby>受<rt>う</rt></ruby>け<ruby>取<rt>と</rt></ruby>る");
  assert.equal(alignFuriganaRuby("お前", "おまえ"), "お<ruby>前<rt>まえ</rt></ruby>");
  assert.equal(alignFuriganaRuby("日本", "ニホン"), "<ruby>日本<rt>にほん</rt></ruby>");
  assert.equal(alignFuriganaRuby("食べました", "たべる", "食べる"), "<ruby>食<rt>た</rt></ruby>べました");
  assert.equal(alignFuriganaRuby("食べる", "にほん"), "食べる");
  assert.equal(alignFuriganaRuby("かな", "かな"), "かな");
});

test("sentence markup aligns readings and escapes HTML", () => {
  assert.equal(formatFurigana("{食べる|たべる}<script>"), "<ruby>食<rt>た</rt></ruby>べる&lt;script&gt;");
});
