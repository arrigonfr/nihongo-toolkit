import kuromoji from "kuromoji";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
let loading;
export function tokenizer() {
  loading ??= new Promise((resolve, reject) => {
    kuromoji.builder({ dicPath: join(dirname(require.resolve("kuromoji/package.json")), "dict") })
      .build((error, result) => error ? reject(error) : resolve(result));
  }).catch((error) => { loading = undefined; throw error; });
  return loading;
}
