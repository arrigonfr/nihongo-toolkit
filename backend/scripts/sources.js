export const dictionaryRelease = "3.6.2+20261019180022";
export const openJlptRevision = "0d1d3410bec90bd4098a7c72de820543cb4f707c";
export const kanjiVgRevision = "70a0b7ae0c18ceb5cb358274b029cce0234a43bc";
export const dictionaryUrl = (name) =>
  `https://github.com/scriptin/jmdict-simplified/releases/download/${encodeURIComponent(dictionaryRelease)}/${name}-${encodeURIComponent(dictionaryRelease)}.json.tgz`;
export const openJlptUrl = (kind, level) =>
  `https://raw.githubusercontent.com/evanclan/OpenJLPT/${openJlptRevision}/data/json/${kind}/n${level}.json`;
export const kanjiVgUrl = `https://codeload.github.com/KanjiVG/kanjivg/tar.gz/${kanjiVgRevision}`;
