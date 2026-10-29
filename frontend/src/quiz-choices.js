function shuffled(items, random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function meaningChoices(current, words, previous = [], random = Math.random) {
  const candidates = [...new Set(words.filter((item) => item.word !== current.word
    && item.meaning !== current.meaning).map((item) => item.meaning))];
  const lastSeen = new Map(previous.map((meaning, index) => [meaning, index]));
  const distractors = shuffled(candidates, random)
    .sort((a, b) => (lastSeen.get(a) ?? -1) - (lastSeen.get(b) ?? -1))
    .slice(0, 3);
  return { distractors, choices: shuffled([current.meaning, ...distractors], random) };
}
