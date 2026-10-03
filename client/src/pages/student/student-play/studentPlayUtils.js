export function feedbackStatus(payload) {
  if (payload?.feedbackType === "almost" || (!payload?.isCorrect && Number(payload?.points || 0) > 0)) return "almost";
  return payload?.isCorrect ? "correct" : "wrong";
}

export function explanationHeading(payload) {
  const status = feedbackStatus(payload);
  return status === "correct" ? "Correct" : status === "almost" ? "Almost" : "Incorrect";
}

export function feedbackCopy(payload) {
  const status = feedbackStatus(payload);
  const timedOut = !!payload?.timeExpired;
  if (status === "correct") return {
    title: timedOut ? "Correct!" : `Correct! +${payload.points || 0} pts`,
    subtitle: timedOut ? "Time ran out, but your answer was correct." : "Nice one — keep the streak going!",
    icon: "check",
  };
  if (status === "almost") {
    const count = Number(payload?.correctCount || 0);
    const total = Number(payload?.totalCorrect || 0);
    const title = `Almost! +${payload.points || 0} pts`;
    const subtitle = total > 0 ? `${count} of ${total} correct${timedOut ? " before time ran out" : ""}` : "Some of your answers were correct.";
    return { title, subtitle, icon: "warning" };
  }
  return { title: "Incorrect", subtitle: timedOut ? "Time ran out before a correct answer was completed." : "No worries — the next question is yours.", icon: "close" };
}

export function renderAnswerPreview(answer) {
  if (!answer) return "—";
  if (typeof answer.choice === "string") return answer.choice || "—";
  if (typeof answer.text === "string") return answer.text || "—";
  if (Array.isArray(answer.pairs)) return `${answer.pairs.length} pair${answer.pairs.length === 1 ? "" : "s"} matched`;
  return "—";
}

export function fmtTime(sec) { const s = Math.max(0, Number(sec || 0)); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; }

// Gameplay sizing (bigger than the builder's 24 max / 13 min): short prompts
// start big and shrink slowly, so even 3-line prompts stay easily readable.
export function fitPromptTextSize(text, max = 32, min = 18) {
  const length = String(text || "").length;
  if (length <= 28) return max;
  if (length >= 150) return min;
  return Math.max(min, Math.round(max - (length - 28) * ((max - min) / 122)));
}

export function crosswordRejectLabel(reason) {
  switch (reason) {
    case "duplicate": return "Already found — try another";
    case "not_in_bank": return "Not on the word list";
    case "not_in_grid": return "Can't form that word in the grid";
    case "too_short": return "Word is too short";
    default: return "Not accepted — try again";
  }
}
