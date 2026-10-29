import kuromoji from "kuromoji";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
let loading;
function tokenizer() {
  loading ??= new Promise((resolve, reject) => {
    kuromoji.builder({ dicPath: join(dirname(require.resolve("kuromoji/package.json")), "dict") })
      .build((error, result) => error ? reject(error) : resolve(result));
  }).catch((error) => {
    loading = undefined;
    throw error;
  });
  return loading;
}
const hiragana = (text) => text.replace(/[ァ-ヶ]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60));

export async function segmentText(text) {
  const analyzer = await tokenizer();
  const raw = analyzer.tokenize(text);
  const tokens = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    let surface = item.surface_form;
    let reading = item.reading || (/^[ぁ-ゖァ-ヶー]+$/u.test(surface) ? surface : "");
    if (item.pos === "名詞") {
      while (raw[i + 1]?.pos === "名詞" && raw[i + 1].pos_detail_1 === "接尾") {
        const suffix = raw[++i];
        surface += suffix.surface_form;
        reading = reading && suffix.reading ? reading + suffix.reading : "";
      }
    }
    const inflected = ["動詞", "形容詞"].includes(item.pos);
    if (inflected) {
      while (i + 1 < raw.length) {
        const next = raw[i + 1];
        const ending = next.pos === "助動詞";
        const te = next.pos === "助詞" && next.pos_detail_1 === "接続助詞" && /^[てで]$/.test(next.surface_form);
        const auxiliary = next.pos === "動詞" && next.pos_detail_1 === "非自立" && /[てで]$/.test(surface);
        if (!ending && !te && !auxiliary) break;
        surface += next.surface_form;
        reading = reading && next.reading ? reading + next.reading : "";
        i++;
      }
    }
    tokens.push({
      text: surface,
      type: /^\s+$/u.test(surface) ? "space" : item.pos === "記号" ? "punctuation"
        : item.pos === "助詞" ? "particle" : "word",
      base: item.pos === "名詞" ? surface : item.basic_form && item.basic_form !== "*" ? item.basic_form : surface,
      reading: hiragana(reading)
    });
  }
  if (tokens.map((token) => token.text).join("") !== text) {
    throw new Error("Sentence analysis did not preserve the original text.");
  }
  return tokens;
}
