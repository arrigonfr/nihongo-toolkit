import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { gunzipSync, gzipSync } from "node:zlib";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";

const require = createRequire(import.meta.url);
const root = dirname(require.resolve("kuromoji/package.json"));
const output = resolve("frontend/dist/_dictionary");
await mkdir(output, { recursive: true });
const read = async (name) => gunzipSync(await readFile(join(root, "dict", `${name}.dat.gz`)));
const save = async (name, data) => writeFile(join(output, `${name}.gz`), gzipSync(data));
// Kuromoji's distributed arrays include unused capacity. Keep all records,
// but omit padding and replace hundreds of thousands of JS arrays with offsets.
for (const prefix of ["tid", "unk"]) {
  const map = await read(`${prefix}_map`);
  const entries = [];
  let cursor = 4;
  let maxKey = 0;
  let maxToken = 0;
  for (let i = 0; i < map.readUInt32LE(0); i++) {
    const key = map.readUInt32LE(cursor);
    const count = map.readUInt32LE(cursor + 4);
    cursor += 8;
    const ids = [];
    for (let j = 0; j < count; j++, cursor += 4) {
      const id = map.readUInt32LE(cursor);
      ids.push(id);
      maxToken = Math.max(maxToken, id);
    }
    entries.push([key, ids]);
    maxKey = Math.max(maxKey, key);
  }
  const offsets = new Uint32Array(maxKey + 1);
  const values = [0];
  for (const [key, ids] of entries) {
    offsets[key] = values.length;
    values.push(ids.length, ...ids);
  }
  await save(`${prefix}-offsets`, offsets);
  await save(`${prefix}-values`, new Uint32Array(values));
  await save(prefix, (await read(prefix)).subarray(0, maxToken + 10));
  const pos = await read(`${prefix}_pos`);
  let end = pos.length - 1;
  while (end > 0 && pos[end] === 0) end--;
  await save(`${prefix}_pos`, pos.subarray(0, end + 2));
}
for (const name of ["base", "check", "cc", "unk_char", "unk_compat", "unk_invoke"]) {
  await save(name, await read(name));
}
await copyFile(join(root, "LICENSE-2.0.txt"), join(output, "kuromoji-license.txt"));
await copyFile(join(root, "NOTICE.md"), join(output, "kuromoji-notice.txt"));
console.log(`Prepared compact, lossless Kuromoji dictionary assets: ${output}`);
