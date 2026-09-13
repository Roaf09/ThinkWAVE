// Shared choice helpers for live + assignment gameplay (previously duplicated
// verbatim in StudentPlay.jsx and StudentAsyncPlay.jsx).

export function trimText(v) {
  return String(v || "").trim();
}

export function normalizeChoiceOption(option, index = 0) {
  if (option && typeof option === "object") {
    return {
      id: String(option.id || `option-${index + 1}`),
      text: option.text ?? option.label ?? "",
      image: option.image ?? "",
    };
  }
  return { id: `option-${index + 1}`, text: String(option ?? ""), image: "" };
}

export function choiceValue(option) {
  return option?.id || option?.text || "";
}

function hashToIndex(value, length) {
  const s = String(value ?? "");
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return length ? h % length : 0;
}

// Per-student display order so student A sees a different choice order than B
// when shuffling is enabled. Server scores by option id, so order is display-only.
export function seededOrder(length, shouldShuffle, seedInput) {
  const arr = Array.from({ length }, (_, i) => i);
  if (!shouldShuffle || length <= 1) return arr;
  let seed = Math.max(1, hashToIndex(seedInput, 2147483646) + 1);
  const rand = () => {
    seed = (seed * 48271) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  if (arr.every((value, index) => value === index)) arr.push(arr.shift());
  return arr;
}
