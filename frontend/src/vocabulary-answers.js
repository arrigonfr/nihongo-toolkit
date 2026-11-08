export function meaningAnswers(meanings) {
  const answers = new Set();
  for (const meaning of meanings) {
    if (typeof meaning !== "string" || !meaning.trim()) continue;
    answers.add(meaning.trim());
    let depth = 0, part = "";
    const add = () => {
      const text = part.trim();
      if (text) {
        answers.add(text);
        answers.add(text.replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim());
        answers.add(text.replace(/[()]/g, "").replace(/\s+/g, " ").trim());
      }
      part = "";
    };
    for (const character of meaning) {
      if (character === "(") depth++;
      if (character === ")") depth = Math.max(0, depth - 1);
      if (!depth && /[;,/]/.test(character)) add();
      else part += character;
    }
    add();
  }
  answers.delete("");
  return [...answers];
}
