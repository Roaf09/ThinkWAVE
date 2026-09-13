// Pure helpers for the Question Bank cards. Extracted verbatim from
// QuestionBankTab.jsx (no behavior change).

export function optionMatchesBankValue(option, value, index) {
  const normalizedValue = String(value ?? "").trim().toLowerCase();
  if (option && typeof option === "object") {
    return [option.id, option.value, option.text, option.label, optionLabel(option, index)].some((candidate) => String(candidate ?? "").trim().toLowerCase() === normalizedValue);
  }
  return String(option ?? "").trim().toLowerCase() === normalizedValue;
}

export function optionLabel(option, index = 0) {
  if (option && typeof option === "object") return String(option.text ?? option.label ?? option.value ?? "").trim() || (option.image ? `Image choice ${index + 1}` : `Option ${index + 1}`);
  return String(option ?? "").trim() || `Option ${index + 1}`;
}

export function getBankAnswers(tt, cfg, correct) {
  if (tt === "MCQ") {
    const options = Array.isArray(cfg.options) ? cfg.options : [];
    const values = Array.isArray(correct.choices) && correct.choices.length ? correct.choices : [correct.choice].filter(Boolean);
    return values.map((value) => {
      const found = options.find((option, index) => {
        if (option && typeof option === "object") return String(option.id ?? option.value ?? "") === String(value) || optionLabel(option, index).toLowerCase() === String(value).toLowerCase();
        return String(option).toLowerCase() === String(value).toLowerCase();
      });
      return found !== undefined ? optionLabel(found, options.indexOf(found)) : String(value);
    }).filter(Boolean);
  }
  if (tt === "TRUE_FALSE") return [correct.choice].filter(Boolean);
  if (tt === "TYPE_ANSWER" || tt === "DRAW_IT" || tt === "GRIP_GUESS" || tt === "GUESS_WORD_4PICS") return [correct.text || cfg.target, ...(Array.isArray(correct.answers) ? correct.answers : [])].filter(Boolean);
  if (tt === "THINK_SPELL") return [...(Array.isArray(correct.answers) ? correct.answers : Array.isArray(cfg.answers) ? cfg.answers : []), ...(!correct.answers?.length && correct.text ? [correct.text] : [])].filter(Boolean);
  if (tt === "MATCHING") {
    const colA = Array.isArray(cfg.colA) ? cfg.colA : [];
    const colB = Array.isArray(cfg.colB) ? cfg.colB : [];
    return colA.map((a, i) => `${optionLabel(a, i)} ↔ ${optionLabel(colB[i], i)}`);
  }
  return [correct.text, correct.choice].filter(Boolean);
}
