"""Translate exported sentence JSONL chunks offline with an Argos Translate (OpenNMT/CTranslate2) package.

Usage: python translate-argos.py --model-dir DIR CHUNK.jsonl...
DIR is an unzipped .argosmodel package containing model/ and sentencepiece.model.
Writes CHUNK.results.jsonl next to each chunk for `npm run db:translations -- apply`.
Requires: pip install ctranslate2 sentencepiece
"""
import argparse
import json
import pathlib

import ctranslate2
import sentencepiece


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-dir", required=True)
    parser.add_argument("--device", default="cpu")
    parser.add_argument("files", nargs="+")
    args = parser.parse_args()
    model_dir = pathlib.Path(args.model_dir)
    translator = ctranslate2.Translator(str(model_dir / "model"), device=args.device, compute_type="int8")
    pieces = sentencepiece.SentencePieceProcessor(model_file=str(model_dir / "sentencepiece.model"))
    for file in map(pathlib.Path, args.files):
        rows = [json.loads(line) for line in file.read_text("utf8").splitlines() if line.strip()]
        if any(row["kind"] != "sentence" for row in rows):
            raise SystemExit(f"{file}: Argos is only used for sentences; glosses need context-aware translation")
        results = translator.translate_batch(pieces.encode([row["english"][0] for row in rows], out_type=str),
                                             beam_size=4, max_batch_size=64, max_decoding_length=256)
        out = file.with_name(file.name.replace(".jsonl", ".results.jsonl"))
        with out.open("w", encoding="utf8") as handle:
            for row, result in zip(rows, results):
                # Some packages emit raw pieces on decode; join them manually so "▁" never leaks into text.
                text = "".join(result.hypotheses[0]).replace("\u2581", " ").strip()
                handle.write(json.dumps({**row, "value": [text]}, ensure_ascii=False) + "\n")
        print(f"{out}: {len(rows)} sentences")


if __name__ == "__main__":
    main()
