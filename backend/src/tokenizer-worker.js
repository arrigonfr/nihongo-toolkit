import Tokenizer from "kuromoji/src/Tokenizer.js";
import TokenInfoDictionary from "kuromoji/src/dict/TokenInfoDictionary.js";
import UnknownDictionary from "kuromoji/src/dict/UnknownDictionary.js";
import CharacterDefinition from "kuromoji/src/dict/CharacterDefinition.js";
import ConnectionCosts from "kuromoji/src/dict/ConnectionCosts.js";
import doublearray from "doublearray";

// The default is intentionally not a degraded tokenizer. Worker callers must
// supply the asset binding; analysis errors remain visible and retryable.
export function tokenizer() { throw new Error("Tokenizer asset binding is required"); }
let loading;
export function assetTokenizer(assets) {
  loading ??= load(assets).catch((error) => { loading = undefined; throw error; });
  return loading;
}
async function load(assets) {
  async function buffer(name) {
    const response = await assets.fetch(new Request(`https://dictionary.internal/_dictionary/${name}.gz`));
    if (!response.ok) throw new Error(`Missing tokenizer asset: ${name}`);
    return new Response(response.body.pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
  }
  async function info(prefix, prototype) {
    // Avoid the upstream constructor's 20 MiB of immediately discarded buffers.
    const dictionary = Object.create(prototype);
    dictionary.loadDictionary(new Uint8Array(await buffer(prefix)));
    dictionary.loadPosVector(new Uint8Array(await buffer(`${prefix}_pos`)));
    const offsets = new Uint32Array(await buffer(`${prefix}-offsets`));
    const values = new Uint32Array(await buffer(`${prefix}-values`));
    dictionary.target_map = new Proxy(Object.create(null), {
      get(_, key) {
        const offset = offsets[Number(key)] || 0;
        return values.subarray(offset + 1, offset + 1 + values[offset]);
      }
    });
    return dictionary;
  }
  const token_info_dictionary = await info("tid", TokenInfoDictionary.prototype);
  const unknown_dictionary = await info("unk", UnknownDictionary.prototype);
  unknown_dictionary.character_definition = CharacterDefinition.load(
    new Uint8Array(await buffer("unk_char")), new Uint32Array(await buffer("unk_compat")),
    new Uint8Array(await buffer("unk_invoke")));
  const connection_costs = Object.create(ConnectionCosts.prototype);
  connection_costs.loadConnectionCosts(new Int16Array(await buffer("cc")));
  const trie = doublearray.load(new Int32Array(await buffer("base")), new Int32Array(await buffer("check")));
  return new Tokenizer({ trie, token_info_dictionary, unknown_dictionary, connection_costs });
}
