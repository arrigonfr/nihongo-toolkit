import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { XMLParser } from "fast-xml-parser";
import { kanjiVgUrl } from "../backend/scripts/sources.js";

const directory = mkdtempSync(join(tmpdir(), "nihon-strokes-"));
try {
  const archive = join(directory, "source.tar.gz");
  execFileSync("curl", ["-fsSL", kanjiVgUrl, "-o", archive]);
  execFileSync("tar", ["-xzf", archive, "-C", directory]);
  const source = join(directory, readdirSync(directory).find((name) => name.startsWith("kanjivg-")), "kanji");
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "", preserveOrder: true, processEntities: false });
  const result = {};
  for (const filename of readdirSync(source).filter((name) => /^[0-9a-f]{5}\.svg$/.test(name))) {
    const character = String.fromCodePoint(parseInt(filename.slice(0, 5), 16));
    const paths = [], numbers = [];
    const visit = (nodes) => {
      for (const node of nodes || []) {
        const attrs = node[":@"] || {};
        if (node.path && /-s\d+$/.test(attrs.id || "") && attrs.d) paths.push(attrs.d);
        if (node.text && attrs.transform) {
          const matrix = attrs.transform.match(/^matrix\(1[ ,]+0[ ,]+0[ ,]+1[ ,]+([-\d.]+)[ ,]+([-\d.]+)\)$/);
          const value = node.text.find((part) => part["#text"] != null)?.["#text"];
          if (matrix && /^\d+$/.test(String(value))) numbers.push([Number(matrix[1]), Number(matrix[2]), Number(value)]);
        }
        for (const [key, children] of Object.entries(node)) if (key !== ":@" && Array.isArray(children)) visit(children);
      }
    };
    visit(parser.parse(readFileSync(join(source, filename), "utf8")));
    if (paths.length && numbers.length === paths.length) result[character] = [paths, numbers];
  }
  if (!result["あ"] || !result["大"]) throw new Error("Stroke data is incomplete");
  writeFileSync(new URL("../frontend/src/worksheet-strokes.json", import.meta.url), JSON.stringify(result));
  const kana = [..."あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをんがぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽアイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲンガギグゲゴザジズゼゾダヂヅデドバビブベボパピプペポ"];
  const levels = JSON.parse(readFileSync(new URL("../frontend/src/worksheet-kanji.json", import.meta.url), "utf8"));
  const pick = (chars) => Object.fromEntries(chars.filter((ch) => result[ch]).map((ch) => [ch, result[ch]]));
  const rated = new Set(Object.values(levels).flatMap((chars) => [...chars]));
  const unrated = Object.keys(result).filter((ch) => /^\p{Script=Han}$/u.test(ch) && /^\p{Ideographic}$/u.test(ch) && !rated.has(ch));
  const chunks = {
    "worksheet-unrated.json": unrated.join(""),
    "worksheet-strokes-kana.json": pick(kana),
    "worksheet-strokes-n5.json": pick([...levels[5]]),
    "worksheet-strokes-n4.json": pick([...levels[4]]),
    "worksheet-strokes-n3.json": pick([...levels[3]]),
    "worksheet-strokes-n2.json": pick([...levels[2]]),
    "worksheet-strokes-n1.json": pick([...levels[1]]),
    "worksheet-strokes-unrated.json": pick(unrated)
  };
  for (const [name, data] of Object.entries(chunks)) {
    writeFileSync(new URL(`../frontend/src/${name}`, import.meta.url), JSON.stringify(data));
  }
  console.log(`Generated stroke data for ${Object.keys(result).length} characters and ${Object.keys(chunks).length} split chunks.`);
} finally {
  rmSync(directory, { recursive: true, force: true });
}