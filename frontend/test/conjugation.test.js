import test from "node:test";
import assert from "node:assert/strict";
import { conjugate, filterForms, copyTable } from "../src/conjugation.js";
const entry = (word, reading, type, tag) => ({ word, reading, type, tag, meanings: ["to eat"] });
const forms = (word, reading, type, tag) => Object.fromEntries(conjugate(entry(word, reading, type, tag)).map((row) => [row.id, row]));
test("ichidan produces complete affirmative, negative, plain and polite voice paradigms", () => {
  const rows = forms("食べる", "たべる", "ichidan");
  for (const [id, expected] of Object.entries({
    "basic-plain": "食べる", "basic-polite": "食べます", "basic-negative-plain": "食べない",
    "basic-past-negative-polite": "食べませんでした", te: "食べて", ta: "食べた",
    "potential-plain": "食べられる", "potential-negative-polite": "食べられません",
    "passive-past-plain": "食べられた", "causative-plain": "食べさせる",
    "causativePassive-past-negative-polite": "食べさせられませんでした",
    "progressive-past-plain": "食べていた", "desire-pastNegative-polite": "食べたくなかったです",
    "volitional-plain": "食べよう", imperative: "食べろ", ba: "食べれば",
    "tara-plain": "食べたら", tari: "食べたり", "honor-0": "召し上がる"
  })) assert.equal(rows[id]?.word, expected, id);
  assert.equal(rows["potential-plain"].reading, "たべられる");
  assert.notEqual(rows["potential-plain"].gloss, rows["passive-plain"].gloss);
  assert.equal(rows["potential-negative-plain"].gloss, "cannot eat");
  assert.equal(rows["passive-past-plain"].gloss, "was eaten");
  assert.equal(rows["causativePassive-past-negative-plain"].gloss, "was not made to eat");
});
test("all godan endings use the correct te/ta, negative and polite stems", () => {
  for (const [word, reading, te, ta, negative, polite] of [
    ["買う", "かう", "買って", "買った", "買わない", "買います"],
    ["書く", "かく", "書いて", "書いた", "書かない", "書きます"],
    ["泳ぐ", "およぐ", "泳いで", "泳いだ", "泳がない", "泳ぎます"],
    ["話す", "はなす", "話して", "話した", "話さない", "話します"],
    ["待つ", "まつ", "待って", "待った", "待たない", "待ちます"],
    ["死ぬ", "しぬ", "死んで", "死んだ", "死なない", "死にます"],
    ["遊ぶ", "あそぶ", "遊んで", "遊んだ", "遊ばない", "遊びます"],
    ["読む", "よむ", "読んで", "読んだ", "読まない", "読みます"],
    ["帰る", "かえる", "帰って", "帰った", "帰らない", "帰ります"]
  ]) {
    const result = forms(word, reading, "godan");
    assert.deepEqual([result.te.word, result.ta.word, result.nai.word, result["basic-polite"].word], [te, ta, negative, polite]);
  }
  assert.equal(forms("話す", "はなす", "godan")["contracted-causative-passive"], undefined);
  assert.equal(forms("書く", "かく", "godan")["contracted-causative-passive"].word, "書かされる");
});
test("irregular verbs retain distinct written and spoken stems", () => {
  const kuru = forms("来る", "くる", "kuru");
  for (const [id, word, reading] of [
    ["te", "来て", "きて"], ["nai", "来ない", "こない"], ["potential-plain", "来られる", "こられる"],
    ["imperative", "来い", "こい"], ["ba", "来れば", "くれば"], ["basic-polite", "来ます", "きます"]
  ]) assert.deepEqual([kuru[id].word, kuru[id].reading], [word, reading]);
  assert.equal(forms("連れて来る", "つれてくる", "kuru").te.reading, "つれてきて");
  assert.equal(forms("する", "する", "suru")["potential-plain"].word, "できる");
  assert.equal(forms("為る", "する", "suru")["potential-plain"].word, "できる");
  assert.equal(forms("馬九行駆", "うまくいく", "godan", "v5k-s").te.word, "うまくいって");
  assert.equal(forms("キツイ", "きつい", "i-adjective")["negative-plain"].word, "きつくない");
  assert.equal(forms("勉強する", "べんきょうする", "suru")["passive-plain"].word, "勉強される");
  assert.equal(forms("信ずる", "しんずる", "zuru").te.word, "信じて");
  assert.equal(forms("行く", "いく", "godan", "v5k-s").te.word, "行って");
  assert.equal(forms("問う", "とう", "godan", "v5u-s").ta.word, "問うた");
  assert.equal(forms("有る", "ある", "godan", "v5r-i").nai.word, "ない");
  assert.equal(forms("ある", "ある", "godan")["basic-past-negative-plain"].word, "なかった");
  assert.equal(forms("有る", "ある", "godan", "v5r-i")["potential-plain"], undefined);
  assert.equal(forms("出来る", "できる", "ichidan")["potential-plain"], undefined);
  assert.equal(forms("くださる", "くださる", "godan", "v5aru")["basic-polite"].word, "くださいます");
  assert.equal(forms("くれる", "くれる", "ichidan", "v1-s").imperative.word, "くれ");
  assert.equal(forms("愛する", "あいする", "suru", "vs-s")["potential-plain"].word, "愛せる");
});
test("i and na adjectives have distinct complete paradigms, including いい", () => {
  const i = forms("高い", "たかい", "i-adjective");
  assert.equal(i["negative-polite"].word, "高くないです");
  assert.equal(i["pastNegative-plain"].word, "高くなかった");
  assert.equal(i.ba.word, "高ければ");
  assert.equal(i.adverb.word, "高く");
  assert.equal(i.too.word, "高すぎる");
  const na = forms("静か", "しずか", "na-adjective");
  assert.equal(na["present-plain"].word, "静かだ");
  assert.equal(na["present-polite"].word, "静かです");
  assert.equal(na["pastNegative-polite"].word, "静かではありませんでした");
  assert.equal(na.adverb.word, "静かに");
  assert.equal(na.te.word, "静かで");
  assert.equal(na.attributive.word, "静かな");
  assert.equal(forms("いい", "いい", "i-adjective", "adj-ix")["past-plain"].word, "よかった");
  assert.equal(forms("良い", "いい", "i-adjective", "adj-ix")["past-plain"].reading, "よかった");
  assert.equal(forms("だ", "だ", "copula")["past-polite"].word, "でした");
});
test("filters preserve neutral connectors and copy only the selected output shape", () => {
  const rows = conjugate(entry("食べる", "たべる", "ichidan"));
  const filtered = filterForms(rows, { politeness: "polite", polarity: "negative", tense: "past", groups: ["basic"] });
  assert.deepEqual(filtered.map((row) => row.word), ["食べませんでした"]);
  assert.deepEqual(copyTable(filtered, { script: "kana", compact: true }).split("\n")[1].split("\t").slice(-1), ["たべませんでした"]);
  assert.ok(copyTable(filtered, { script: "both", romaji: true }, () => "test").includes("\ttest\t"));
  assert.equal(filterForms(rows, { groups: [] }).length, 0);
  assert.ok(filterForms(rows, { politeness: "polite", tense: "past", groups: ["te"] }).some((row) => row.id === "te"));
});
test("invalid classifications fail explicitly and every row has a unique ID and kana reading", () => {
  assert.throws(() => conjugate(entry("猫", "ねこ", "godan")), /u-verb/);
  assert.throws(() => conjugate(entry("食べる", "", "ichidan")), /reading/);
  assert.throws(() => conjugate(entry("かわいい", "かわいい", "ichidan")), /る/);
  for (const data of [entry("食べる", "たべる", "ichidan"), entry("する", "する", "suru"), entry("来る", "くる", "kuru"), entry("静か", "しずか", "na-adjective")]) {
    const rows = conjugate(data);
    assert.equal(new Set(rows.map((row) => row.id)).size, rows.length);
    for (const row of rows) { assert.match(row.reading, /^[ぁ-ゖー]+$/); assert.ok(row.note); }
  }
});

test("basic rules explain the actual word's ending and requested tense and register", () => {
  const ru = forms("食べる", "たべる", "ichidan");
  assert.match(ru["basic-plain"].note, /keep the dictionary form/);
  assert.doesNotMatch(ru["basic-plain"].note, /remove/);
  assert.match(ru["basic-polite"].note, /remove the final る.*Add ます/);
  assert.match(ru["basic-negative-plain"].note, /remove the final る and add ない/);
  assert.match(ru["basic-past-negative-polite"].note, /remove the final る.*Add ませんでした/);
  for (const [word, reading, ending, stem, negative, past] of [
    ["買う", "かう", "う", "い", "わない", "った"],
    ["書く", "かく", "く", "き", "かない", "いた"],
    ["泳ぐ", "およぐ", "ぐ", "ぎ", "がない", "いだ"],
    ["話す", "はなす", "す", "し", "さない", "した"],
    ["待つ", "まつ", "つ", "ち", "たない", "った"],
    ["死ぬ", "しぬ", "ぬ", "に", "なない", "んだ"],
    ["結ぶ", "むすぶ", "ぶ", "び", "ばない", "んだ"],
    ["読む", "よむ", "む", "み", "まない", "んだ"],
    ["帰る", "かえる", "る", "り", "らない", "った"]
  ]) {
    const rows = forms(word, reading, "godan");
    assert.ok(rows["basic-polite"].note.includes(`replace the final ${ending} with ${stem}`));
    assert.ok(rows["basic-negative-plain"].note.includes(`replace the final ${ending} with ${negative}`));
    assert.ok(rows["basic-past-plain"].note.includes(`replace the final ${ending} with ${past}`));
    assert.match(rows["basic-past-negative-plain"].note, /ない with なかった/);
    assert.match(rows["basic-past-negative-polite"].note, /Add ませんでした/);
    assert.doesNotMatch(rows["basic-polite"].note, /Te\/ta|drop る|Drop る/);
  }
});

test("irregular rules mention only the exception relevant to that form", () => {
  const iku = forms("行く", "いく", "godan", "v5k-s");
  assert.match(iku.te.note, /く with って.*exceptional/);
  assert.match(iku.ta.note, /く with った.*exceptional/);
  assert.doesNotMatch(iku["basic-polite"].note, /exceptional|行って/);
  const aru = forms("ある", "ある", "godan", "v5r-i");
  assert.match(aru.nai.note, /ある with ない.*not あらない/);
  assert.doesNotMatch(aru.te.note, /あらない/);
  assert.match(forms("来る", "くる", "kuru")["basic-polite"].note, /くる with き.*Add ます.*来ます \(きます\)/);
  assert.match(forms("する", "する", "suru")["potential-plain"].note, /Irregular する.*する with できる/);
  assert.match(forms("信ずる", "しんずる", "zuru").te.note, /ずる with じて/);
  assert.match(forms("問う", "とう", "godan", "v5u-s").ta.note, /retains う before た/);
  assert.match(forms("くださる", "くださる", "godan", "v5aru")["basic-polite"].note, /uses い, not り/);
  assert.match(forms("くれる", "くれる", "ichidan", "v1-s").imperative.note, /くれ, without ろ/);
  assert.match(forms("愛する", "あいする", "suru", "vs-s")["potential-plain"].note, /せる rather than できる/);
});

test("adjective and derived-form explanations follow each actual transformation", () => {
  const i = forms("美味しい", "おいしい", "i-adjective");
  assert.match(i["present-plain"].note, /keep the dictionary form/);
  assert.match(i["present-polite"].note, /keep the final い and add です/);
  assert.match(i["pastNegative-polite"].note, /remove the final い.*Add くなかったです/);
  assert.match(i.te.note, /Add くて/);
  assert.match(i.ba.note, /Add ければ/);
  assert.doesNotMatch(i["past-plain"].note, /いい|よい/);
  assert.match(forms("いい", "いい", "i-adjective")["past-plain"].note, /final いい with よ.*Add かった/);
  const na = forms("静か", "しずか", "na-adjective");
  assert.match(na["present-polite"].note, /keep 静か and add です/);
  assert.match(na["pastNegative-polite"].note, /keep 静か and add ではありませんでした/);
  assert.match(na["polite-tara-plain"].note, /add でしたら/);
  assert.equal(i["polite-tara-plain"], undefined);
  assert.equal(i["polite-negative-tara"], undefined);
  assert.ok(Object.values(i).every((row) => !row.word.includes("ですら")));
  const verb = forms("書く", "かく", "godan");
  assert.match(verb["potential-past-negative-polite"].note, /く with ける.*resulting 書ける.*Add ませんでした/);
  assert.match(verb["progressive-past-plain"].note, /く with いて.*Add いる.*remove the final る and add た/);
  assert.match(verb["desire-pastNegative-polite"].note, /く with き.*Add たい.*Add くなかったです/);
  assert.match(verb["volitional-polite"].note, /く with き.*Add ましょう/);
  assert.match(verb["volitional-plain"].note, /く with こう/);
  assert.match(verb["tara-polite"].note, /Add ました.*Add ら/);
});
test("comma-list filters allow several values and still keep neutral connectors", () => {
  const rows = conjugate(entry("食べる", "たべる", "ichidan"));
  const both = filterForms(rows, { politeness: "plain,polite", polarity: "negative", tense: "past,non-past", groups: ["basic"] });
  assert.deepEqual(both.map((row) => row.word).sort(), ["食べない", "食べなかった", "食べません", "食べませんでした"].sort());
  assert.ok(filterForms(rows, { politeness: "polite", tense: "past", groups: ["te"] }).some((row) => row.id === "te"));
});
