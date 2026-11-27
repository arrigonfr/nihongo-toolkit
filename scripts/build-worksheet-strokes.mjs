import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { XMLParser } from "fast-xml-parser";
import { kanjiVgUrl } from "../backend/scripts/sources.js";

const CHUNK_SIZE = 350;

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
  const kana = [..."あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをんがぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽアイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲンガギグゲゴザジズゼゾダヂヅデドバビブベボパピプペポ"];
  const levels = JSON.parse(readFileSync(new URL("../frontend/src/worksheet-kanji.json", import.meta.url), "utf8"));
  const pick = (chars) => Object.fromEntries(chars.filter((ch) => result[ch]).map((ch) => [ch, result[ch]]));
  const rated = new Set(Object.values(levels).flatMap((chars) => [...chars]));
  const unrated = Object.keys(result).filter((ch) => /^\p{Script=Han}$/u.test(ch) && /^\p{Ideographic}$/u.test(ch) && !rated.has(ch));
  writeFileSync(new URL("../frontend/src/worksheet-unrated.json", import.meta.url), JSON.stringify(unrated.join("")));
  const outDir = fileURLToPath(new URL("../frontend/src/worksheet-strokes", import.meta.url));
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  let chunkCount = 0;
  const writeGroup = (name, chars) => {
    if (chars.length <= 400) {
      writeFileSync(join(outDir, `${name}.json`), JSON.stringify(pick(chars)));
      chunkCount++;
      return;
    }
    for (let i = 0, part = 0; i < chars.length; i += CHUNK_SIZE, part++) {
      writeFileSync(join(outDir, `${name}-${part}.json`), JSON.stringify(pick(chars.slice(i, i + CHUNK_SIZE))));
      chunkCount++;
    }
  };
  writeGroup("kana", kana);
  for (const level of [5, 4, 3, 2, 1]) writeGroup(`n${level}`, [...levels[level]]);
  writeGroup("unrated", unrated);
  console.log(`Generated stroke data for ${Object.keys(result).length} characters across ${chunkCount} split chunks.`);
} finally {
  rmSync(directory, { recursive: true, force: true });
}