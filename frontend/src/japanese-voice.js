// @ts-check

/**
 * @param {SpeechSynthesisVoice[]} voices
 * @returns {SpeechSynthesisVoice | undefined}
 */
export function japaneseVoice(voices) {
  /** @param {{ name: string, localService?: boolean, default?: boolean }} voice */
  const score = (voice) =>
    (/premium|enhanced|natural|neural|siri/i.test(voice.name) ? 8 : 0) +
    (/google|microsoft/i.test(voice.name) ? 4 : 0) +
    (voice.localService ? 2 : 0) +
    (voice.default ? 1 : 0);
  return voices.filter((voice) => /^ja(?:[-_]|$)/i.test(voice.lang)).sort((a, b) => score(b) - score(a))[0];
}
