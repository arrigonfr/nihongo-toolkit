import assert from "node:assert/strict";
import test from "node:test";
import { SHEETS, buildSheet, cellText, toKatakana } from "../src/cheatsheet-data.js";
import { buildPdf, fileName, toCSV, toHTML, toMarkdown, toSVG, toText } from "../src/cheatsheet-export.js";
import { PAGE, layoutSheet, textWidth, wrapText } from "../src/cheatsheet-layout.js";

const find = (sheet, tableId) => sheet.tables.find((table) => table.id === tableId);
const rowText = (row) => row.map((item) => (item ? cellText(item) : ""));

test("katakana is derived from hiragana by code point", () => {
  assert.equal(toKatakana("きゃ しゅ ぱ を ん"), "キャ シュ パ ヲ ン");
});

test("kana sheet has complete charts for both scripts", () => {
  const sheet = buildSheet("kana");
  assert.equal(sheet.tables.length, 6);
  const basic = find(sheet, "hiragana-basic");
  assert.deepEqual(basic.columns, ["a", "i", "u", "e", "o"]);
  assert.equal(basic.rows.length, 11);
  assert.deepEqual(rowText(basic.rows[2]), ["さ", "し", "す", "せ", "そ"]);
  assert.deepEqual(rowText(basic.rows[7]), ["や", "", "ゆ", "", "よ"]);
  assert.deepEqual(rowText(basic.rows[9]), ["わ", "", "", "", "を"]);
  assert.equal(basic.rows[2][1].sub, "shi");
  assert.equal(basic.rows[3][2].sub, "tsu");
  const count = (table) => table.rows.flat().filter(Boolean).length;
  assert.equal(count(basic), 46);
  assert.equal(count(find(sheet, "katakana-basic")), 46);
  assert.equal(count(find(sheet, "hiragana-voiced")), 25);
  assert.equal(count(find(sheet, "hiragana-combo")), 33);
  assert.deepEqual(rowText(find(sheet, "katakana-voiced").rows[4]), ["パ", "ピ", "プ", "ペ", "ポ"]);
  assert.deepEqual(rowText(find(sheet, "katakana-combo").rows[8]), ["ジャ", "ジュ", "ジョ"]);
  const romaji = find(sheet, "hiragana-combo").rows.flat().map((item) => item.sub);
  assert.equal(new Set(romaji).size, romaji.length);
});

test("kana grids contain every kana exactly once", () => {
  const sheet = buildSheet("kana");
  const all = ["hiragana-basic", "hiragana-voiced"].flatMap((id) => find(sheet, id).rows.flat()).filter(Boolean).map(cellText);
  assert.equal(new Set(all).size, all.length);
  assert.equal(all.length, 46 + 25);
});

test("verb table covers the main forms for each verb group", () => {
  const forms = find(buildSheet("verb"), "verb-forms");
  const byName = Object.fromEntries(forms.rows.map((row) => [cellText(row[0]), row.slice(2).map(cellText)]));
  assert.deepEqual(byName["Dictionary"], ["書く", "食べる", "する", "来る"]);
  assert.deepEqual(byName["Plain negative"], ["書かない", "食べない", "しない", "来ない"]);
  assert.deepEqual(byName["Plain past"], ["書いた", "食べた", "した", "来た"]);
  assert.deepEqual(byName["Te-form"], ["書いて", "食べて", "して", "来て"]);
  assert.deepEqual(byName["Potential"], ["書ける", "食べられる", "できる", "来られる"]);
  assert.deepEqual(byName["Passive"], ["書かれる", "食べられる", "される", "来られる"]);
  assert.deepEqual(byName["Causative"], ["書かせる", "食べさせる", "させる", "来させる"]);
  assert.deepEqual(byName["Causative-passive"], ["書かされる", "食べさせられる", "させられる", "来させられる"]);
  assert.deepEqual(byName["Volitional"], ["書こう", "食べよう", "しよう", "来よう"]);
  assert.deepEqual(byName["Imperative"], ["書け", "食べろ", "しろ", "来い"]);
  assert.deepEqual(byName["Conditional ば"], ["書けば", "食べれば", "すれば", "来れば"]);
  assert.deepEqual(byName["Conditional たら"], ["書いたら", "食べたら", "したら", "来たら"]);
  assert.equal(forms.rows.at(-1).length, forms.columns.length);
});

test("godan ending table follows the sound-change rules", () => {
  const table = find(buildSheet("verb"), "verb-godan");
  assert.equal(table.rows.length, 9);
  const row = (ending) => rowText(table.rows.find((item) => cellText(item[0]) === ending));
  assert.deepEqual(row("う").slice(1), ["買う", "買います", "買わない", "買って", "買った", "買える", "買おう"]);
  assert.deepEqual(row("ぐ").slice(4, 6), ["泳いで", "泳いだ"]);
  assert.deepEqual(row("す").slice(4, 6), ["話して", "話した"]);
  assert.deepEqual(row("ぬ").slice(4, 6), ["死んで", "死んだ"]);
  assert.deepEqual(row("る").slice(3, 5), ["帰らない", "帰って"]);
});

test("adjective table covers i, na and いい", () => {
  const forms = find(buildSheet("adjective"), "adjective-forms");
  const byName = Object.fromEntries(forms.rows.map((row) => [cellText(row[0]), row.slice(2).map(cellText)]));
  assert.deepEqual(byName["Plain present"], ["高い", "静かだ", "いい"]);
  assert.deepEqual(byName["Plain negative"], ["高くない", "静かではない", "よくない"]);
  assert.deepEqual(byName["Plain past"], ["高かった", "静かだった", "よかった"]);
  assert.deepEqual(byName["Polite past"], ["高かったです", "静かでした", "よかったです"]);
  assert.deepEqual(byName["Te-form"], ["高くて", "静かで", "よくて"]);
  assert.deepEqual(byName["Adverb"], ["高く", "静かに", "よく"]);
  assert.deepEqual(byName["Conditional ば"], ["高ければ", "静かなら(ば)", "よければ"]);
  assert.deepEqual(byName["Looks like そう"], ["高そう", "静かそう", "よさそう"]);
});

test("every sheet exports to all text formats", () => {
  for (const { id } of SHEETS) {
    const sheet = buildSheet(id);
    const svg = toSVG(sheet);
    assert.match(svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 794 1123"/);
    assert.ok(svg.includes(sheet.title.replace("&", "&amp;")));
    assert.doesNotMatch(toSVG(sheet, { standalone: false }), /xmlns=/);
    const html = toHTML(sheet);
    assert.match(html, /^<!doctype html>/);
    assert.match(html, /@page \{ size: A4/);
    assert.doesNotMatch(html, /<script|https?:\/\//);
    assert.match(toMarkdown(sheet), new RegExp(`^# ${sheet.title.replace("&", "&")}`));
    const markdown = toMarkdown(sheet);
    assert.ok(markdown.split("\n").filter((line) => line.startsWith("| ---")).length === sheet.tables.length);
    assert.ok(toText(sheet).includes(sheet.tables[0].title));
    assert.match(fileName(sheet, "pdf"), /^nihon-.+-cheatsheet\.pdf$/);
  }
});

test("csv and markdown carry the cell content", () => {
  const verb = buildSheet("verb");
  const csv = toCSV(verb);
  assert.ok(csv.startsWith("\ufefftable,row,column,value\r\n"));
  assert.match(csv, /Forms of the three verb groups,Te-form \(て形\),Godan 書く,書いて/);
  assert.match(toMarkdown(verb), /\| Te-form \(て形\) \|/);
  const kanaCsv = toCSV(buildSheet("kana"));
  assert.match(kanaCsv, /Hiragana · ひらがな gojūon,s,i,し shi/);
  assert.match(toText(buildSheet("kana")), /し shi/);
});

test("layout keeps everything inside one A4 page", () => {
  for (const { id } of SHEETS) {
    const { prims, width, height } = layoutSheet(buildSheet(id));
    assert.equal(width, PAGE.w);
    assert.equal(height, PAGE.h);
    for (const p of prims) {
      if (p.k === "r") {
        assert.ok(p.x >= 0 && p.y >= 0 && p.x + p.w <= PAGE.w + 0.01 && p.y + p.h <= PAGE.h + 0.01, `${id} rect ${JSON.stringify(p)}`);
      } else {
        const full = p.runs.map((run) => run.t).join("");
        const w = textWidth(full, p.size);
        const left = p.anchor === "middle" ? p.x - w / 2 : p.anchor === "end" ? p.x - w : p.x;
        assert.ok(left >= 0 && left + w <= PAGE.w + 1 && p.y <= PAGE.h, `${id} text ${full}`);
      }
    }
  }
});

test("wrapText breaks at spaces and between Japanese characters", () => {
  assert.deepEqual(wrapText("aaa bbb ccc", 10, 30), ["aaa", "bbb", "ccc"]);
  assert.ok(wrapText("あいうえおかきくけこ", 10, 50).length === 2);
});

test("pdf writer produces a valid single-page structure", () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  const pdf = buildPdf(jpeg, 100, 200, "Test (sheet)");
  const text = new TextDecoder("latin1").decode(pdf);
  assert.ok(text.startsWith("%PDF-1.4"));
  assert.match(text, /\/Filter \/DCTDecode \/Length 4/);
  assert.match(text, /\/Count 1/);
  assert.ok(text.trimEnd().endsWith("%%EOF"));
  const xref = Number(text.match(/startxref\n(\d+)/)[1]);
  assert.ok(text.slice(xref).startsWith("xref"));
  const offsets = [...text.matchAll(/(\d{10}) 00000 n/g)].map((m) => Number(m[1]));
  offsets.forEach((offset, index) => assert.ok(text.slice(offset).startsWith(`${index + 1} 0 obj`), `object ${index + 1}`));
});
