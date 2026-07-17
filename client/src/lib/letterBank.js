const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DECOY_WORDS = ["CAT", "DOG", "SUN", "MAP", "TREE", "BOOK", "STAR", "MOON", "FISH", "BIRD", "RAIN", "WIND", "PLAY", "GAME", "WORD", "NOTE", "BALL", "HOME", "BLUE", "GREEN"];

export function targetLetterSlots(target) {
  return String(target || "").toUpperCase().split("");
}

export function countAnswerLetters(target) {
  return targetLetterSlots(target).filter((ch) => /[A-Z0-9]/.test(ch)).length;
}

/** Build shuffled tap tiles using the answer plus letters borrowed from real decoy words. */
export function buildLetterBank(target, dummyCount = 6) {
  const letters = targetLetterSlots(target).filter((ch) => /[A-Z0-9]/.test(ch));
  const answerKey = letters.join("");
  const pool = [...letters];
  const extras = Math.max(0, Number(dummyCount) || 0);
  const candidates = DECOY_WORDS.filter((word) => word !== answerKey && word.length <= Math.max(5, extras));

  let decoyLetters = [];
  while (decoyLetters.length < extras && candidates.length) {
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    decoyLetters.push(...pick.split(""));
  }
  if (!decoyLetters.length) decoyLetters = "GAMEWORDPLAY".split("");
  pool.push(...decoyLetters.slice(0, extras));

  // Keep a vowel/consonant balance when the requested amount exceeds the selected words.
  const vowels = "AEIOU";
  while (pool.length < letters.length + extras) {
    const source = pool.length % 3 === 0 ? vowels : ALPHABET;
    pool.push(source[Math.floor(Math.random() * source.length)]);
  }

  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.map((ch, id) => ({ id, ch }));
}

export function normalizeBuiltWord(text) {
  return String(text ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}
