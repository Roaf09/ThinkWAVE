const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function targetLetterSlots(target) {
  return String(target || "").toUpperCase().split("");
}

export function countAnswerLetters(target) {
  return targetLetterSlots(target).filter((ch) => /[A-Z0-9]/.test(ch)).length;
}

/** Build shuffled tap tiles: all letters from the answer plus random distractors. */
export function buildLetterBank(target, dummyCount = 6) {
  const letters = targetLetterSlots(target).filter((ch) => /[A-Z0-9]/.test(ch));
  const pool = [...letters];
  const inWord = new Set(letters);

  const extras = Math.max(0, Number(dummyCount) || 0);
  for (let i = 0; i < extras; i += 1) {
    let ch = ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    for (let tryN = 0; tryN < 12 && inWord.has(ch); tryN += 1) {
      ch = ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    }
    pool.push(ch);
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
