import ThinkBotTutorial from "../../../components/ThinkBotTutorial";
import { normalizeTemplateType } from "../../../lib/templateTypes";
import { templateAccent } from "../../../lib/templatePalette";
import { trimText } from "./quizBuilderUtils";

export function BuilderTutorials({
  guestMode,
  modifiedTutorialOpen,
  setModifiedTutorialOpen,
  builderTutorialStage,
  setBuilderTutorialStage,
  quiz,
  questions,
  qIndex,
  followupTemplateTutorial,
  finishFollowupTemplateTutorial,
  skipFollowupTemplateTutorial,
  startFollowupTemplateTutorial,
  mcqTipVisible,
  isBatchTemplate,
  modal,
  isMobile = false,
  qMenuOpen = false,
  overflowOpen = false,
}) {
  return (
    <>
      {!guestMode && !modifiedTutorialOpen && builderTutorialStage === "template_prompt" && (
        <ThinkBotTutorial accentColor={quiz ? templateAccent(quiz.template_type) : undefined} placement="center" dialogWidth={430} clickAnywhere onClickAnywhere={startFollowupTemplateTutorial} secondaryLabel="Skip" onSecondary={skipFollowupTemplateTutorial} className="tw-tutorial-template-optin">
          <p>Would you like to see the tutorial for this template?</p>
        </ThinkBotTutorial>
      )}
      {!guestMode && !modifiedTutorialOpen && builderTutorialStage === "intro" && (
        <ThinkBotTutorial accentColor={quiz ? templateAccent(quiz.template_type) : undefined} placement="center" dialogWidth={430} clickAnywhere onClickAnywhere={() => setBuilderTutorialStage("question")}>
          <p>Every template has its own builder tools, so this walkthrough is just for <strong>{quiz ? ({ MCQ: "Multiple Choice", TRUE_FALSE: "True or False", TYPE_ANSWER: "Identification", MATCHING: "Matching", GUESS_WORD_4PICS: "Guess Word", THINK_SPELL: "Crossword" }[quiz.template_type] || quiz.template_type) : "this template"}</strong>.</p>
        </ThinkBotTutorial>
      )}
      {!guestMode && !modifiedTutorialOpen && ["question", "question_done"].includes(builderTutorialStage) && (
        <ThinkBotTutorial accentColor={quiz ? templateAccent(quiz.template_type) : undefined}
          target='[data-tutorial="builder-question"]'
          placement={isMobile ? "below" : "right"}
          square
          dialogWidth={isMobile ? 300 : 350}
          dragKey="builder-question-dialog"
          allowTargetInteraction={true}
          className="tw-tutorial-done-avatar-clear"
          clickAnywhere={builderTutorialStage === "question_done"}
          onClickAnywhere={() => {
            window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
            setBuilderTutorialStage("specific");
          }}
        >
          <p>Start here by entering your question.</p>
        </ThinkBotTutorial>
      )}
      {!guestMode && !modifiedTutorialOpen && builderTutorialStage === "specific" && normalizeTemplateType(quiz?.template_type) === "MCQ" && (
        <ThinkBotTutorial accentColor={quiz ? templateAccent(quiz.template_type) : undefined} target='[data-tutorial="builder-mcq-options"]' placement={isMobile ? "above" : "screen-left"} square dialogWidth={isMobile ? 300 : 360} dragKey="builder-mcq-dialog" highlightMode="target">
          <p>Next, add the possible answers.</p>
        </ThinkBotTutorial>
      )}
      {!guestMode && !modifiedTutorialOpen && builderTutorialStage === "mcq_correct" && (
        <ThinkBotTutorial accentColor={quiz ? templateAccent(quiz.template_type) : undefined} target='[data-tutorial="builder-mcq-options"]' placement={isMobile ? "above" : "screen-left"} square dialogWidth={isMobile ? 300 : 360} dragKey="builder-mcq-dialog" highlight={false} hint={mcqTipVisible ? <span>You may also add or delete choices.</span> : null}>
          <p>Next, add the possible answers.</p>
          <p className="tw-tutorial-fade-line">Now click the small circle beside the correct answer.</p>
        </ThinkBotTutorial>
      )}
      {!guestMode && !modifiedTutorialOpen && builderTutorialStage === "specific" && normalizeTemplateType(quiz?.template_type) === "TRUE_FALSE" && <ThinkBotTutorial accentColor={quiz ? templateAccent(quiz.template_type) : undefined} target='[data-tutorial="builder-tf-answers"]' placement="screen-right" square dialogWidth={360}><p>Next, select either <strong>True</strong> or <strong>False</strong> to set it as the correct answer.</p></ThinkBotTutorial>}
      {!guestMode && !modifiedTutorialOpen && ["specific", "identification_done"].includes(builderTutorialStage) && normalizeTemplateType(quiz?.template_type) === "TYPE_ANSWER" && <ThinkBotTutorial accentColor={quiz ? templateAccent(quiz.template_type) : undefined} target='[data-tutorial="builder-identification-answer"]' placement="screen-right" square dialogWidth={350} dragKey="builder-identification-dialog" allowTargetInteraction={true} className="tw-tutorial-done-avatar-clear" clickAnywhere={builderTutorialStage === "identification_done"} onClickAnywhere={() => { document.activeElement?.blur?.(); if (followupTemplateTutorial) finishFollowupTemplateTutorial(); else setBuilderTutorialStage("answer_explanation"); }}><p>Next, type in the correct answer.</p></ThinkBotTutorial>}
      {!guestMode && !modifiedTutorialOpen && builderTutorialStage === "specific" && normalizeTemplateType(quiz?.template_type) === "MATCHING" && (
        <>
          <ThinkBotTutorial accentColor={quiz ? templateAccent(quiz.template_type) : undefined}
            target='[data-tutorial="builder-matching-pairs"]'
            placement="screen-right"
            square
            dialogWidth={370}
            dragKey="builder-matching-dialog"
            clickAnywhere
            onClickAnywhere={() => setBuilderTutorialStage("matching_dummy")}
          >
            <p>Next, fill in both columns A and B.</p>
            <p className="tw-tutorial-fade-line">You can also click <strong>Add Image</strong> to upload an image for a pair.</p>
          </ThinkBotTutorial>
          <ThinkBotTutorial accentColor={quiz ? templateAccent(quiz.template_type) : undefined}
            target='[data-tutorial="builder-matching-pairs"]'
            placement="screen-left"
            square
            dialogWidth={330}
            dragKey="builder-matching-tip-dialog"
            highlight={false}
            blockInteraction={false}
            className="tw-tutorial-matching-tip"
          >
            <p><strong>TIP:</strong> text only, image only, and combined are allowed.</p>
          </ThinkBotTutorial>
        </>
      )}
      {!guestMode && !modifiedTutorialOpen && builderTutorialStage === "matching_dummy" && normalizeTemplateType(quiz?.template_type) === "MATCHING" && (() => {
        const q = questions[qIndex] || questions[0];
        const cfg = q?.config || {};
        const colA = Array.isArray(cfg.colA) ? cfg.colA : [];
        const allB = Array.isArray(cfg.colB) ? cfg.colB : [];
        const dummies = Array.isArray(cfg.dummyB) && cfg.dummyB.length ? cfg.dummyB : allB.slice(colA.length);
        const dummyReady = dummies.some((row) => trimText(row?.text) || trimText(row?.image));
        return <ThinkBotTutorial accentColor={quiz ? templateAccent(quiz.template_type) : undefined}
          target='[data-tutorial="builder-matching-dummy"]' placement="screen-right" square dialogWidth={350}
          allowTargetInteraction={true} clickAnywhere={dummyReady}
          onClickAnywhere={() => setBuilderTutorialStage("matching_add_pair")}>
          <p>Add a distractor, then fill it in.</p>
        </ThinkBotTutorial>;
      })()}
      {!guestMode && !modifiedTutorialOpen && builderTutorialStage === "matching_add_pair" && normalizeTemplateType(quiz?.template_type) === "MATCHING" && <ThinkBotTutorial
        accentColor={quiz ? templateAccent(quiz.template_type) : undefined}
        target='[data-tutorial="builder-matching-add-pair"]' placement="above" square dialogWidth={330}
        highlightMode="target" allowTargetInteraction={true}><p>Add another pair.</p></ThinkBotTutorial>}
      {!guestMode && !modifiedTutorialOpen && builderTutorialStage === "matching_new_pair" && normalizeTemplateType(quiz?.template_type) === "MATCHING" && (() => {
        const q = questions[qIndex] || questions[0];
        const cfg = q?.config || {};
        const colA = Array.isArray(cfg.colA) ? cfg.colA : [];
        const colB = Array.isArray(cfg.colB) ? cfg.colB : [];
        const index = Math.max(0, colA.length - 1);
        const a = colA[index] || {};
        const b = colB[index] || {};
        const pairReady = (trimText(a?.text) || trimText(a?.image)) && (trimText(b?.text) || trimText(b?.image));
        return <ThinkBotTutorial accentColor={quiz ? templateAccent(quiz.template_type) : undefined}
          target='[data-tutorial="builder-matching-active-pair"]' placement="screen-right" square dialogWidth={350}
          allowTargetInteraction={true} clickAnywhere={pairReady}
          onClickAnywhere={() => { if (followupTemplateTutorial) finishFollowupTemplateTutorial(); else setBuilderTutorialStage("add_delay"); }}>
          <p>Fill in the new pair, then click Done.</p>
        </ThinkBotTutorial>;
      })()}
      {!guestMode && !modifiedTutorialOpen && ["specific", "guess_images_done"].includes(builderTutorialStage) && normalizeTemplateType(quiz?.template_type) === "GUESS_WORD_4PICS" && <ThinkBotTutorial
        accentColor={quiz ? templateAccent(quiz.template_type) : undefined} target='[data-tutorial="builder-guess-images"]' placement="screen-right" square dialogWidth={350}
        dragKey="builder-guess-images-dialog" clickAnywhere={builderTutorialStage === "guess_images_done"}
        onClickAnywhere={() => setBuilderTutorialStage("guess_word_fields")}><p>Next, upload the four images you want to use.</p></ThinkBotTutorial>}
      {!guestMode && !modifiedTutorialOpen && builderTutorialStage === "guess_word_fields" && normalizeTemplateType(quiz?.template_type) === "GUESS_WORD_4PICS" && (() => {
        const q = questions[qIndex] || questions[0];
        const cor = q?.correct || {};
        return <ThinkBotTutorial accentColor={quiz ? templateAccent(quiz.template_type) : undefined}
          target='[data-tutorial="builder-guess-word-fields"]' placement="screen-right" square dialogWidth={370}
          allowTargetInteraction={true} clickAnywhere={!!trimText(cor.text)}
          onClickAnywhere={() => { if (followupTemplateTutorial) finishFollowupTemplateTutorial(); else setBuilderTutorialStage("answer_explanation"); }}>
          <p>Enter the <strong>correct word</strong>.</p>
          <p>Now set the number of <strong>distractor letters</strong>.</p>
        </ThinkBotTutorial>;
      })()}
      {!guestMode && !modifiedTutorialOpen && builderTutorialStage === "specific" && normalizeTemplateType(quiz?.template_type) === "THINK_SPELL" &&         <ThinkBotTutorial accentColor={quiz ? templateAccent(quiz.template_type) : undefined} target='[data-tutorial="builder-crossword-words"]' placement="screen-right" square dialogWidth={350} clickAnywhere={(() => { const q = questions[qIndex] || questions[0]; const cfg = q?.config || {}; const cor = q?.correct || {}; const words = Array.isArray(cor.answers) && cor.answers.length ? cor.answers : (Array.isArray(cfg.answers) ? cfg.answers : []); return words.filter((word) => trimText(word)).length >= 4; })()} onClickAnywhere={() => setBuilderTutorialStage("crossword_word_controls")}><p>Next, type in the words you would like to use.</p></ThinkBotTutorial>}
      {!guestMode && !modifiedTutorialOpen && builderTutorialStage === "crossword_word_controls" && normalizeTemplateType(quiz?.template_type) === "THINK_SPELL" && <ThinkBotTutorial
        accentColor={quiz ? templateAccent(quiz.template_type) : undefined} target='[data-tutorial="builder-crossword-word-editor"]' placement="screen-right" square dialogWidth={370}
        allowTargetInteraction={true} clickAnywhere onClickAnywhere={() => setBuilderTutorialStage("crossword_fill")}><p>You may add or delete the number of correct words.</p></ThinkBotTutorial>}
      {!guestMode && !modifiedTutorialOpen && builderTutorialStage === "crossword_fill" && <ThinkBotTutorial accentColor={quiz ? templateAccent(quiz.template_type) : undefined} target='[data-tutorial="builder-crossword-fill"]' placement="above" square dialogWidth={350} highlightMode="target" className="tw-tutorial-bob-down"><p>Click <strong>Fill It Up!</strong> to complete the grid.</p></ThinkBotTutorial>}
      {!guestMode && !modifiedTutorialOpen && builderTutorialStage === "crossword_shuffle" && (() => {
        const q = questions[qIndex] || questions[0];
        const cfg = q?.config || {};
        return <ThinkBotTutorial accentColor={quiz ? templateAccent(quiz.template_type) : undefined}
          target='[data-tutorial="builder-crossword-shuffle"]' placement="screen-right" square dialogWidth={350} highlightMode="target"
          allowTargetInteraction={true} clickAnywhere={cfg.gridFilled}
          onClickAnywhere={() => { if (followupTemplateTutorial) finishFollowupTemplateTutorial(); else setBuilderTutorialStage("add_delay"); }}>
          <p>You may also shuffle the arrangement of the letters.</p>
        </ThinkBotTutorial>;
      })()}
      {!guestMode && !modifiedTutorialOpen && ["answer_explanation", "answer_explanation_done"].includes(builderTutorialStage) && <ThinkBotTutorial accentColor={quiz ? templateAccent(quiz.template_type) : undefined} target='[data-tutorial="builder-answer-explanation"]' placement={isMobile ? "above" : "right"} square dialogWidth={isMobile ? 300 : 350} className="tw-tutorial-answer-explanation tw-tutorial-done-avatar-clear" allowTargetInteraction={true} clickAnywhere onClickAnywhere={() => setBuilderTutorialStage("add_delay")}><p>Add a short explanation of why the answer is correct (optional).</p></ThinkBotTutorial>}
      {!guestMode && !modifiedTutorialOpen && ["add_delay", "save_delay"].includes(builderTutorialStage) && <ThinkBotTutorial accentColor={quiz ? templateAccent(quiz.template_type) : undefined} />}
      {!guestMode && !modifiedTutorialOpen && builderTutorialStage === "meta" && <ThinkBotTutorial accentColor={quiz ? templateAccent(quiz.template_type) : undefined} target='[data-tutorial="builder-meta-grid"]' placement={isMobile ? "below" : "right"} square dialogWidth={isMobile ? 300 : 370} className="tw-tutorial-meta-lower tw-tutorial-meta-points-side" clickAnywhere onClickAnywhere={() => setBuilderTutorialStage("bank")}><p>You can set the time limit and points depending on the question.</p></ThinkBotTutorial>}
      {!guestMode && !modifiedTutorialOpen && builderTutorialStage === "bank" && modal !== "confirmBank" && (isMobile ? (!qMenuOpen ? <ThinkBotTutorial accentColor={quiz ? templateAccent(quiz.template_type) : undefined} target='[data-tutorial="builder-qmenu-toggle"]' placement="below" dialogWidth={300} highlightMode="target"><p>You can also save this specific {isBatchTemplate ? "batch" : "question"} along with its choices in case you need it in the future.</p></ThinkBotTutorial> : null) : <ThinkBotTutorial accentColor={quiz ? templateAccent(quiz.template_type) : undefined} target='[data-tutorial="builder-save-bank"]' placement="below" dialogWidth={390} highlightMode="target"><p>You can also save this specific {isBatchTemplate ? "batch" : "question"} along with its choices in case you need it in the future.</p></ThinkBotTutorial>)}
      {!guestMode && !modifiedTutorialOpen && isMobile && builderTutorialStage === "bank_menu" && qMenuOpen && modal !== "confirmBank" && <ThinkBotTutorial accentColor={quiz ? templateAccent(quiz.template_type) : undefined} target='[data-tutorial="builder-save-bank"]' placement="below" dialogWidth={300} highlightMode="target"><p>You can also save this specific {isBatchTemplate ? "batch" : "question"} along with its choices in case you need it in the future.</p></ThinkBotTutorial>}
      {!guestMode && !modifiedTutorialOpen && builderTutorialStage === "add" && !modal && (
        <ThinkBotTutorial accentColor={quiz ? templateAccent(quiz.template_type) : undefined} target='[data-tutorial="builder-add-question"]' placement="below" square dialogWidth={360} highlightMode="target" className="tw-tutorial-add-question-close">
          <p>Need another one? Use <strong>{isBatchTemplate ? "Add Batch" : "Add Question"}</strong> whenever you want to expand your activity.</p>
        </ThinkBotTutorial>
      )}
      {!guestMode && !modifiedTutorialOpen && ["repeat", "repeat_done"].includes(builderTutorialStage) && (
        <ThinkBotTutorial accentColor={quiz ? templateAccent(quiz.template_type) : undefined}
          target='[data-tutorial="builder-editor-shell"]'
          placement="screen-right"
          square
          dialogWidth={isMobile ? 300 : 370}
          dragKey="builder-repeat-dialog"
          highlightPadding={10}
          allowTargetInteraction={true}
          className="tw-tutorial-done-avatar-clear tw-tutorial-repeat-top"
          clickAnywhere={builderTutorialStage === "repeat_done"}
          onClickAnywhere={() => {
            window.scrollTo({ top: 0, behavior: "smooth" });
            setBuilderTutorialStage("save");
          }}
        >
          <p>Now let’s try doing it again for a different question!</p>
        </ThinkBotTutorial>
      )}
      {!guestMode && !modifiedTutorialOpen && ["save", "publish"].includes(builderTutorialStage) && !["duplicates", "invalid", "confirmPublish", "confirmSave"].includes(modal) && (isMobile ? (!overflowOpen ? (
        <ThinkBotTutorial accentColor={quiz ? templateAccent(quiz.template_type) : undefined}
          target='[data-tutorial="builder-overflow-toggle"]'
          placement="below"
          dialogWidth={300}
          highlightMode="target"
        >
          <p>{builderTutorialStage === "save" ? "Save your finished work to continue." : "Your work is saved. Publish it when you are ready to use it in a session."}</p>
        </ThinkBotTutorial>
      ) : null) : (
        <ThinkBotTutorial accentColor={quiz ? templateAccent(quiz.template_type) : undefined}
          target={builderTutorialStage === "publish" ? '[data-tutorial="builder-publish"]' : '[data-tutorial="builder-save"]'}
          placement="below"
          dialogWidth={390}
          dragKey="builder-save-publish-dialog"
          highlightMode="target"
        >
          <p>{builderTutorialStage === "save" ? "Save your finished work to continue." : "Your work is saved. Publish it when you are ready to use it in a session."}</p>
        </ThinkBotTutorial>
      ))}
      {!guestMode && !modifiedTutorialOpen && isMobile && builderTutorialStage === "save_menu" && overflowOpen && !["duplicates", "invalid", "confirmPublish", "confirmSave"].includes(modal) && (
        <ThinkBotTutorial accentColor={quiz ? templateAccent(quiz.template_type) : undefined}
          target='[data-tutorial="builder-overflow-save"]'
          placement="below"
          dialogWidth={300}
          highlightMode="target"
        >
          <p>Save your finished work to continue.</p>
        </ThinkBotTutorial>
      )}
      {!guestMode && !modifiedTutorialOpen && isMobile && builderTutorialStage === "publish_menu" && overflowOpen && !["duplicates", "invalid", "confirmPublish", "confirmSave"].includes(modal) && (<>
        <ThinkBotTutorial accentColor={quiz ? templateAccent(quiz.template_type) : undefined}
          target='[data-tutorial="builder-overflow-publish"]'
          highlightMode="target"
        />
        <ThinkBotTutorial accentColor={quiz ? templateAccent(quiz.template_type) : undefined}
          target='[data-tutorial="builder-overflow-save"]'
          placement="above"
          dialogWidth={300}
          highlight={false}
          blockInteraction={false}
        >
          <p>Your work is saved. Publish it when you are ready to use it in a session.</p>
        </ThinkBotTutorial>
      </>)}
      {!guestMode && modifiedTutorialOpen && <ThinkBotTutorial accentColor={quiz ? templateAccent(quiz.template_type) : undefined} target='[data-tutorial="builder-mcq-options"]' placement="screen-right" square dialogWidth={370} clickAnywhere onClickAnywhere={() => setModifiedTutorialOpen(false)}><p>For Modified Multiple Choice, you can set images as the answer choices.</p></ThinkBotTutorial>}
    </>
  );
}
