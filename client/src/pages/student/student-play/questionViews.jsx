import { GameMcq } from "../../../components/game/GameMcq";
import { GameMatching } from "../../../components/game/GameMatching";
import { GameTrueFalse } from "../../../components/game/GameTrueFalse";
import { GameTypeAnswer } from "../../../components/game/GameTypeAnswer";
import { GameCrossword } from "../../../components/game/GameCrossword";
import { GameGuessWord } from "../../../components/game/GameGuessWord";

export function MatchingTemplate({ disabled, q, cfg, matchingMap, setMatchingMap, participantSeed = 0 }) {
  const perStudentKey = `${q?.id || q?.prompt || "matching"}:p${participantSeed || 0}`;
  return (
    <GameMatching
      config={cfg}
      pairs={Object.keys(matchingMap).map((k) => ({ aIndex: Number(k), bIndex: Number(matchingMap[k]) }))}
      onPairs={(pairs) => {
        const next = {};
        pairs.forEach((p) => { next[p.aIndex] = p.bIndex; });
        setMatchingMap(next);
      }}
      disabled={disabled}
      shuffleKey={perStudentKey}
      participantSeed={participantSeed}
    />
  );
}

export function GuessWord4PicsTemplate({ disabled, cfg, spell, setSpell, onSubmit, submitDisabled = false }) {
  return (
    <GameGuessWord
      images={cfg.images}
      target={String(cfg.target ?? "")}
      dummyLetters={cfg.dummyLetters}
      value={{ mode: spell.mode, target: spell.target, text: spell.built, bank: spell.bank }}
      onChange={(next) => setSpell((s) => ({ ...s, built: next.text ?? s.built, bank: next.bank ?? s.bank, mode: next.mode ?? s.mode, target: next.target ?? s.target }))}
      disabled={disabled}
      onSubmit={onSubmit}
      submitDisabled={submitDisabled}
    />
  );
}

export function TemplateBody({
  disabled,
  templateType,
  q,
  selectedChoice,
  setSelectedChoice,
  answerText,
  setAnswerText,
  matchingMap,
  setMatchingMap,
  spell,
  setSpell,
  thinkSpellTimeUp = false,
  shuffleChoices = false,
  participantSeed = 0,
  onSubmitGuess,
  guessSubmitDisabled = false,
}) {
  const cfg = q?.config_json || {};
  const cor = q?.correct_json || {};

  if (templateType === "MCQ") {
    return (
      <GameMcq
        options={cfg.options}
        mcqMode={cfg.mcqMode}
        answerMode={cfg.answerMode}
        value={Array.isArray(selectedChoice) ? { choices: selectedChoice } : { choice: selectedChoice }}
        onChange={(next) => {
          if (Array.isArray(next?.choices)) setSelectedChoice(next.choices);
          else setSelectedChoice(next?.choice);
        }}
        disabled={disabled}
        lock="dim-unselected"
        shuffleSeed={shuffleChoices ? `${participantSeed}:${q?.id || "mcq"}:choices` : null}
      />
    );
  }

  if (templateType === "TRUE_FALSE") {
    return (
      <GameTrueFalse
        options={cfg.options}
        value={{ choice: selectedChoice }}
        onChange={(next) => setSelectedChoice(next?.choice)}
        disabled={disabled}
        lock="dim-unselected"
      />
    );
  }

  if (templateType === "MATCHING") return <MatchingTemplate disabled={disabled} q={q} cfg={cfg} matchingMap={matchingMap} setMatchingMap={setMatchingMap} participantSeed={participantSeed} />;
  if (templateType === "GUESS_WORD_4PICS") return <GuessWord4PicsTemplate disabled={disabled} cfg={cfg} spell={spell} setSpell={setSpell} onSubmit={onSubmitGuess} submitDisabled={guessSubmitDisabled} />;
  if (templateType === "THINK_SPELL") {
    return (
      <GameCrossword
        config={cfg}
        correct={cor}
        store={spell}
        onStore={setSpell}
        disabled={disabled}
        questionId={q?.id}
        timeUp={thinkSpellTimeUp}
        initExtra={{ totalPoints: 0 }}
        summaryHint="Wait for the teacher to continue."
        totalPoints={Number(spell.totalPoints || 0)}
      />
    );
  }
  return <GameTypeAnswer value={answerText} onChange={setAnswerText} disabled={disabled} />;
}
