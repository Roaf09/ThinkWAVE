const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const VOWELS = "AEIOU";

export function normalizeThinkWord(value) {
  return String(value ?? "").trim().toUpperCase().replace(/[^A-Z]/g, "");
}

export function normalizeThinkWordKey(value) {
  return normalizeThinkWord(value).toLowerCase();
}

export function hashSeed(input) {
  const s = String(input ?? "");
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function createSeededRandom(seed) {
  let state = (Number(seed) >>> 0) || 1;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const GRID_DIRS = [
  { dr: 0, dc: 1 },
  { dr: 1, dc: 0 },
  { dr: 0, dc: -1 },
  { dr: -1, dc: 0 },
  { dr: 1, dc: 1 },
  { dr: 1, dc: -1 },
  { dr: -1, dc: 1 },
  { dr: -1, dc: -1 },
];

function randomLetter(rand, vowelBias = 0.45) {
  if (rand() < vowelBias) {
    return VOWELS[Math.floor(rand() * VOWELS.length)];
  }
  return ALPHABET[Math.floor(rand() * ALPHABET.length)];
}

function fitsAt(word, gridSize, startRow, startCol, dr, dc) {
  for (let i = 0; i < word.length; i += 1) {
    const r = startRow + dr * i;
    const c = startCol + dc * i;
    if (r < 0 || c < 0 || r >= gridSize || c >= gridSize) return false;
  }
  return true;
}

export function buildThinkSpellGrid({ gridSize, words, seed }) {
  const size = Math.min(12, Math.max(5, Number(gridSize) || 8));
  const rand = createSeededRandom(seed);
  const cleaned = Array.from(new Set((words || []).map(normalizeThinkWord).filter(Boolean)))
    .sort((a, b) => b.length - a.length);

  const attempts = 240;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const grid = new Array(size * size).fill(null);
    let ok = true;

    for (const word of cleaned) {
      let placed = false;
      const dirs = [...GRID_DIRS].sort(() => rand() - 0.5);
      for (const dir of dirs) {
        for (let t = 0; t < 50 && !placed; t += 1) {
          const startRow = Math.floor(rand() * size);
          const startCol = Math.floor(rand() * size);
          if (!fitsAt(word, size, startRow, startCol, dir.dr, dir.dc)) continue;

          let canPlace = true;
          for (let i = 0; i < word.length; i += 1) {
            const r = startRow + dir.dr * i;
            const c = startCol + dir.dc * i;
            const idx = r * size + c;
            if (grid[idx] !== null && grid[idx] !== word[i]) {
              canPlace = false;
              break;
            }
          }
          if (!canPlace) continue;

          for (let i = 0; i < word.length; i += 1) {
            const r = startRow + dir.dr * i;
            const c = startCol + dir.dc * i;
            grid[r * size + c] = word[i];
          }
          placed = true;
        }
      }
      if (!placed) {
        ok = false;
        break;
      }
    }

    if (!ok) continue;

    for (let i = 0; i < grid.length; i += 1) {
      if (grid[i] === null) grid[i] = randomLetter(rand);
    }
    return { grid, gridSize: size };
  }

  const fallback = new Array(size * size);
  for (let i = 0; i < fallback.length; i += 1) fallback[i] = randomLetter(rand);
  return { grid: fallback, gridSize: size };
}

export function canFormWordInGrid({ grid, gridSize, word }) {
  const w = normalizeThinkWord(word);
  if (!w.length) return false;
  const n = Number(gridSize) || 0;
  if (!n || !Array.isArray(grid) || grid.length !== n * n) return false;

  function dfs(idx, pos, used) {
    if (pos === w.length) return true;
    if (normalizeThinkWord(grid[idx]) !== w[pos]) return false;

    const r = Math.floor(idx / n);
    const c = idx % n;
    for (let dr = -1; dr <= 1; dr += 1) {
      for (let dc = -1; dc <= 1; dc += 1) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 0 || nc < 0 || nr >= n || nc >= n) continue;
        const ni = nr * n + nc;
        if (used.has(ni)) continue;
        used.add(ni);
        if (dfs(ni, pos + 1, used)) return true;
        used.delete(ni);
      }
    }
    return false;
  }

  for (let start = 0; start < grid.length; start += 1) {
    if (normalizeThinkWord(grid[start]) !== w[0]) continue;
    if (dfs(start, 0, new Set([start]))) return true;
  }
  return false;
}

export function buildThinkSpellSignature({ questionId, gridSize, words }) {
  const cleaned = (words || []).map(normalizeThinkWordKey).filter(Boolean).sort();
  return JSON.stringify({ questionId: Number(questionId) || 0, gridSize, words: cleaned });
}

export function buildThinkSpellSeed(signature) {
  return hashSeed(signature);
}

export function parseThinkSpellAnswerList(raw) {
  if (Array.isArray(raw)) return raw.map((w) => String(w ?? "").trim()).filter(Boolean);
  if (typeof raw !== "string") return [];
  const text = raw.trim();
  if (!text) return [];
  const parts = text.includes(",") || text.includes(";")
    ? text.split(/[,;\n]+/)
    : text.split(/\s+/);
  return parts.map((w) => w.trim()).filter(Boolean);
}

export function letterMultiset(word) {
  return normalizeThinkWord(word).split("").sort().join("");
}

export function isAnagramOf(candidate, teacherWord) {
  const left = letterMultiset(candidate);
  const right = letterMultiset(teacherWord);
  return left.length > 0 && left === right;
}

export function normalizeWordBank(words) {
  const seen = new Set();
  const out = [];
  for (const raw of words || []) {
    const key = normalizeThinkWordKey(raw);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(normalizeThinkWord(raw));
  }
  return out;
}

export function resolveThinkSpellWordBank({ config = {}, correct = {} }) {
  const cfgAnswers = parseThinkSpellAnswerList(config?.answers);
  const corAnswers = parseThinkSpellAnswerList(correct?.answers);
  const fallback = [correct?.text, correct?.horizontal, correct?.vertical, correct?.diagonal, config?.target].filter(Boolean);
  return normalizeWordBank([...cfgAnswers, ...corAnswers, ...fallback]);
}

export function matchThinkSpellWord(candidate, wordBank) {
  const attempt = normalizeThinkWordKey(candidate);
  if (!attempt) return null;
  for (const teacherWord of wordBank || []) {
    const canonical = normalizeThinkWordKey(teacherWord);
    if (!canonical) continue;
    if (attempt === canonical || isAnagramOf(attempt, canonical)) return canonical;
  }
  return null;
}

export function isThinkSpellRoundComplete({ foundWords = [], wordBank = [] }) {
  const bank = normalizeWordBank(wordBank);
  const found = new Set((foundWords || []).map(normalizeThinkWordKey).filter(Boolean));
  return bank.length > 0 && bank.every((w) => found.has(normalizeThinkWordKey(w)));
}

export function isAdjacentSelection(prevIdx, nextIdx, gridSize) {
  const n = Number(gridSize) || 0;
  if (prevIdx === nextIdx) return false;
  const pr = Math.floor(prevIdx / n);
  const pc = prevIdx % n;
  const nr = Math.floor(nextIdx / n);
  const nc = nextIdx % n;
  return Math.abs(pr - nr) <= 1 && Math.abs(pc - nc) <= 1;
}

export function isStraightLinePath(path, gridSize) {
  // Revision 2: Think & Spell selections must stay horizontal, vertical, or diagonal.
  const n = Number(gridSize) || 0;
  if (!Array.isArray(path) || !n) return false;
  if (path.length <= 1) return true;
  const first = Number(path[0]);
  const second = Number(path[1]);
  const dr = Math.sign(Math.floor(second / n) - Math.floor(first / n));
  const dc = Math.sign((second % n) - (first % n));
  if (dr === 0 && dc === 0) return false;
  if (Math.abs(dr) > 1 || Math.abs(dc) > 1) return false;
  for (let i = 1; i < path.length; i += 1) {
    const prev = Number(path[i - 1]);
    const expected = prev + dr * n + dc;
    if (Number(path[i]) !== expected) return false;
  }
  return true;
}

export function validatePathSpellsWord({ grid, gridSize, path, word }) {
  const w = normalizeThinkWord(word);
  if (!w.length || !Array.isArray(path) || path.length !== w.length) return false;
  const n = Number(gridSize) || 0;
  if (!n || !Array.isArray(grid) || grid.length !== n * n) return false;

  for (let i = 0; i < path.length; i += 1) {
    const idx = Number(path[i]);
    if (!Number.isInteger(idx) || idx < 0 || idx >= grid.length) return false;
    if (normalizeThinkWord(grid[idx]) !== w[i]) return false;
    if (i > 0 && !isAdjacentSelection(path[i - 1], path[i], n)) return false;
  }
  if (!isStraightLinePath(path, n)) return false;
  return true;
}

export function removeTilesAndRefill(grid, gridSize, usedIndices, refillSeed) {
  const n = Number(gridSize) || 0;
  if (!n || !Array.isArray(grid) || grid.length !== n * n) return [...grid];
  const used = new Set((usedIndices || []).map((i) => Number(i)).filter((i) => Number.isInteger(i)));
  const next = grid.map((ch, idx) => (used.has(idx) ? null : ch));

  for (let c = 0; c < n; c += 1) {
    const column = [];
    for (let r = 0; r < n; r += 1) {
      const letter = next[r * n + c];
      if (letter !== null && letter !== undefined && letter !== "") column.push(letter);
    }
    const empties = n - column.length;
    const rand = createSeededRandom((Number(refillSeed) || 1) + c * 7919);
    const fillers = Array.from({ length: empties }, () => randomLetter(rand));
    const merged = [...fillers, ...column];
    for (let r = 0; r < n; r += 1) {
      next[r * n + c] = merged[r];
    }
  }
  return next;
}

export function computeThinkSpellPoints(wordLength, config = {}, basePoints = 1, streak = 1) {
  const minLen = Math.min(8, Math.max(2, Number(config?.minWordLength ?? 3) || 3));
  const len = Number(wordLength) || 0;
  if (len < minLen) return 0;

  const perWord = Math.max(1, Number(config?.pointsPerWord ?? basePoints ?? 1) || 1);
  const lengthBonus = Math.max(0, len - minLen) * Math.max(0, Number(config?.lengthBonusPerLetter ?? 1) || 1);
  const base = perWord + lengthBonus;

  const s = Math.max(1, Number(streak) || 1);
  const comboBonus = s >= 2 ? Math.min(2, (s - 1) * 0.15) : 0;
  return Math.max(1, Math.round(base * (1 + comboBonus)));
}

export function loadThinkSpellGridState({ config, correct, questionId, priorPayload }) {
  const wordBank = resolveThinkSpellWordBank({ config, correct });
  const gridSize = Math.min(12, Math.max(5, Number(config?.gridSize ?? 8) || 8));
  const prior = priorPayload || {};

  if (Array.isArray(prior.grid) && prior.grid.length === gridSize * gridSize) {
    return {
      grid: prior.grid.map((ch) => normalizeThinkWord(ch) || ch),
      gridSize,
      wordBank,
      refillCounter: Number(prior.refillCounter || 0),
      streak: Number(prior.streak || 0),
    };
  }

  const signature = buildThinkSpellSignature({ questionId, gridSize, words: wordBank });
  const seed = buildThinkSpellSeed(signature);
  const built = buildThinkSpellGrid({ gridSize, words: wordBank, seed });
  return {
    grid: built.grid,
    gridSize: built.gridSize,
    wordBank,
    refillCounter: 0,
    streak: 0,
  };
}
