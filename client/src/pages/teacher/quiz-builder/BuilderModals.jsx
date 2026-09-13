import { TeacherPressButton } from "../TeacherUI";
import { BankModal, BuilderModal } from "./QuizBuilderParts";
import { validateQuestion } from "./quizBuilderUtils";

export function BuilderModals({
  modal,
  setModal,
  quiz,
  questions,
  qIndex,
  currentQ,
  dupeList,
  invalidList,
  msg,
  setMsg,
  builderTutorialStage,
  setBuilderTutorialStage,
  publishFlow,
  ui,
  c,
  builderDialogActionStyle,
  guestMode,
  bankOpen,
  setBankOpen,
  addFromBank,
  deleteQuiz,
  performDeleteCurrentQuestion,
  save,
  confirmPublish,
  doSaveToBank,
  _doSave,
}) {
  return (
    <>
      {modal === "confirmDelete" && (
        <BuilderModal
          tone="red"
          icon="trash"
          title="Delete Quiz?"
          message={<>Delete <b style={{ color: c.text }}>{quiz.title}</b>? This cannot be undone.</>}
          onClose={() => setModal(null)}
          ui={ui}
          c={c}
          actions={(
            <>
              <button type="button" className="tw-teacher-text-cancel" onClick={() => setModal(null)}>Cancel</button>
              <TeacherPressButton tone="red" onClick={deleteQuiz}>Yes, delete</TeacherPressButton>
            </>
          )}
        />
      )}
      {modal === "confirmDeleteQuestion" && (
        <BuilderModal
          tone="red"
          icon="trash"
          title="Delete question?"
          message={questions.length === 1 ? "This will reset the builder to one blank question." : <>{quiz?.template_type === "MATCHING" ? "Batch" : "Question"} <b style={{ color: c.text }}>{qIndex + 1}</b> will be removed from this quiz.</>}
          onClose={() => setModal(null)}
          ui={ui}
          c={c}
          actions={(
            <>
              <button type="button" className="tw-teacher-text-cancel" onClick={() => setModal(null)}>Cancel</button>
              <TeacherPressButton tone="red" onClick={performDeleteCurrentQuestion}>Yes, delete</TeacherPressButton>
            </>
          )}
        />
      )}
      {modal === "confirmSave" && (
        <BuilderModal
          tone="blue"
          icon="check"
          title="Save Quiz?"
          message="Save your current quiz questions and settings? You can continue editing after saving."
          onClose={() => setModal(null)}
          ui={ui}
          c={c}
          actions={(
            <>
              <button type="button" className="tw-teacher-text-cancel" onClick={() => setModal(null)}>Cancel</button>
              <TeacherPressButton tone="blue" style={builderDialogActionStyle} onClick={async () => { setModal(null); await save(); }}>Yes, save</TeacherPressButton>
            </>
          )}
        />
      )}
      {modal === "confirmPublish" && (
        <BuilderModal
          tone="blue"
          icon="spark"
          title="Publish Quiz?"
          message="You'll be able to host this quiz live and students can join. You can still view and edit it later if needed."
          onClose={() => setModal(null)}
          ui={ui}
          c={c}
          actions={(
            <>
              <button type="button" className="tw-teacher-text-cancel" onClick={() => setModal(null)}>Cancel</button>
              <TeacherPressButton data-tutorial="builder-confirm-publish" tone="blue" style={builderDialogActionStyle} onClick={confirmPublish}>Yes, publish</TeacherPressButton>
            </>
          )}
        />
      )}
      {!guestMode && modal === "confirmBank" && (
        <BuilderModal
          tone="blue"
          icon="bank"
          title="Save question to bank?"
          message={quiz?.template_type === "MATCHING" ? "This will add the current batch to your question bank so you can reuse it later." : "This will add the current question to your question bank so you can reuse it later."}
          onClose={() => setModal(null)}
          ui={ui}
          c={c}
          actions={(
            <>
              <button type="button" className="tw-teacher-text-cancel" onClick={() => setModal(null)}>Cancel</button>
              <TeacherPressButton tone="blue" style={builderDialogActionStyle} onClick={async () => { const issues = validateQuestion(currentQ, quiz?.template_type); if (issues.length) { setMsg(`Complete this ${quiz?.template_type === "MATCHING" ? "batch" : "question"} first: ${issues[0]}.`); setModal(null); return; } setModal(null); await doSaveToBank(currentQ); }}>Yes, save to bank</TeacherPressButton>
            </>
          )}
        />
      )}
      {modal === "duplicates" && (
        <BuilderModal
          tone="yellow"
          icon="warning"
          title="Duplicate Questions Detected"
          onClose={() => { setModal(null); if (builderTutorialStage === "save") setBuilderTutorialStage("save_review"); }}
          ui={ui}
          c={c}
          message={(
            <div>
              <p style={{ margin: "0 0 12px", color: c.textMuted, fontSize: 14 }}>The following questions are very similar. Please review before saving:</p>
              {dupeList.map((d, i) => (
                <div key={i} style={ui.warnItem}><strong>Q{d.i} and Q{d.j}</strong><span style={{ opacity: 0.75 }}> — {d.score}% similar</span></div>
              ))}
            </div>
          )}
          actions={builderTutorialStage === "save" ? (
            <button type="button" className="tw-teacher-text-cancel tw-builder-review-duplicates" onClick={() => { setModal(null); setBuilderTutorialStage("save_review"); }}>Review questions</button>
          ) : (
            <>
              <button type="button" className="tw-teacher-text-cancel tw-builder-review-duplicates" onClick={() => setModal(null)}>Review questions</button>
              <TeacherPressButton tone="blue" style={builderDialogActionStyle} onClick={async () => {
                setModal(null);
                const saved = await _doSave({ showModal: !publishFlow && builderTutorialStage !== "save" });
                if (publishFlow && saved) await confirmPublish();
              }}>{publishFlow ? "Publish Anyway" : "Save Anyway"}</TeacherPressButton>
            </>
          )}
        />
      )}
      {modal === "invalid" && (
        <BuilderModal
          tone="yellow"
          icon="warning"
          title="Some questions are incomplete"
          onClose={() => { setModal(null); if (builderTutorialStage === "save") setBuilderTutorialStage("save_review"); }}
          ui={ui}
          c={c}
          message={(
            <div>
              <p style={{ margin: "0 0 12px", color: c.textMuted, fontSize: 14 }}>Please complete these questions first before saving or publishing:</p>
              {invalidList.map((item) => (
                <div key={item.question} style={ui.warnItem}><strong>{quiz?.template_type === "MATCHING" ? `Batch ${item.question}` : `Question ${item.question}`}</strong><div style={{ marginTop: 4 }}>{item.issues.join(" · ")}</div></div>
              ))}
            </div>
          )}
          actions={<TeacherPressButton tone="yellow" onClick={() => { setModal(null); if (builderTutorialStage === "save") setBuilderTutorialStage("save_review"); }}>Okay</TeacherPressButton>}
        />
      )}

      {msg && !modal && <BuilderModal
        tone={/failed|error|cannot|only|complete|already/i.test(msg) ? "yellow" : "green"}
        icon={/failed|error|cannot|only|complete|already/i.test(msg) ? "warning" : "check"}
        title={/failed|error|cannot|only|complete|already/i.test(msg) ? "Action needed" : "Updated"}
        message={msg}
        onClose={() => setMsg("")}
        ui={ui}
        c={c}
        autoDismiss={!/failed|error|cannot|only|complete|already/i.test(msg)}
      />}
      {!guestMode && bankOpen && <BankModal templateType={quiz.template_type} onSelect={addFromBank} onClose={() => setBankOpen(false)} ui={ui} c={c} />}
    </>
  );
}
