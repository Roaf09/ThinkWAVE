import { TwIcon } from "../../../../components/TwUI";
import { TeacherPressButton } from "../../TeacherUI";
import { tabCard as card, tabBtn as btn, tabMenuBtn as menuBtn, tabInputStyle as input, solidModalBg } from "../teacherTabShared";

// Extracted verbatim from ClassesTab.jsx (no behavior change).
// iconBtn + modalBackdrop stay local (Classes-specific styling).
// input now uses the shared tabInputStyle (adds box-sizing + theme fallbacks).
export function RemoveStudentModal({ c, student, onClose, onConfirm }) {
  return <div className="fixed inset-0 grid place-items-center p-[20px] bg-[rgba(0,0,0,.55)]" style={modalBackdrop}>
    <div className="tw-class-remove-modal w-[min(94vw,430px)]" style={{ ...card(c, { background: solidModalBg(c) }) }}>
      <h3 className="mt-0" style={{ color: c.text }}>Remove student?</h3>
      <p className="mt-0" style={{ color: c.textMuted }}>This will remove <b style={{ color: c.text }}>{student.last_name}, {student.first_name}</b> from the selected class.</p>
      <div className="flex justify-end gap-[10px] mt-[16px]">
        <button type="button" onClick={onClose} style={btn(c)}>Cancel</button>
        <button type="button" onClick={onConfirm} style={{ ...btn(c), color: c.redFg, background: c.redBg, borderColor: c.redBorder }}>Remove</button>
      </div>
    </div>
  </div>;
}

export function FolderCard({ folder, c, menuFor, setMenuFor, onOpen, onRename, onDelete, onDuplicate }) {
  const open = Number(menuFor) === Number(folder.id);
  return <div className="tw-folder-card relative overflow-visible" data-folder-id={folder.id} style={{ ...card(c, { padding: 0, boxShadow: "none", border: `4px solid ${c.border}`, borderRadius: 12 }) }}>
    <button onClick={onOpen} className="flex w-full items-center gap-[12px] border-0 bg-transparent px-[16px] py-[14px] text-left" style={{ color: c.text }}>
      <span className="inline-flex" style={{ color: c.accent }}><TwIcon name="folder" size={24} /></span>
      <span title={folder.name} className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap pr-[34px] font-[900]">{folder.name}</span>
    </button>
    <button onClick={(e) => { e.stopPropagation(); setMenuFor(open ? null : folder.id); }} className="absolute right-[8px] top-[8px] h-[34px] w-[34px] cursor-pointer rounded-[10px] border-0 bg-transparent font-[900]" style={iconBtn(c)}>⋮</button>
    {open && <div className="tw-folder-action-menu absolute right-[8px] top-[44px] w-[180px]" style={{ zIndex: 10, ...card(c, { padding: 8, background: solidModalBg(c) }) }}>
      <button onClick={onRename} style={menuBtn(c)}>Rename</button>
      <button onClick={onDuplicate} style={menuBtn(c)}>Duplicate</button>
      <button onClick={onDelete} style={{ ...menuBtn(c), color: c.redFg }}>Delete</button>
    </div>}
  </div>;
}

export function FolderModal({ c, title, value, setValue, onSubmit, onClose, confirmLabel = "Create", disableCancel = false, placeholder = "Maximum 95 characters" }) {
  return <div className="fixed inset-0 grid place-items-center p-[20px] bg-[rgba(0,0,0,.55)]" style={modalBackdrop} onMouseDown={disableCancel ? undefined : onClose}>
    <form className="tw-class-folder-modal flex w-[min(94vw,620px)] min-h-[290px] flex-col" data-tutorial="class-folder-modal" onSubmit={onSubmit} onMouseDown={(event) => event.stopPropagation()} style={{ ...card(c, { background: solidModalBg(c), padding: 30 }) }}>
      <div className="flex items-center gap-[10px]"><TwIcon name="folder" size={24} /><h3 className="m-0" style={{ color: c.text }}>{title}</h3></div>
      <p className="m-[9px_0_22px]" style={{ color: c.textMuted }}>Give the class a clear name so quizzes, students, and reports stay organised.</p>
      <label className="mb-[7px] block text-[13px] font-[800]" style={{ color: c.textMuted }}>Class name</label>
      <input value={value} maxLength={95} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} required style={input(c)} />
      <div className="flex items-center justify-end gap-[16px] pt-[28px] mt-auto">
        <button type="button" className="tw-teacher-text-cancel" onClick={onClose} disabled={disableCancel} style={disableCancel ? { opacity: .38, cursor: "not-allowed" } : undefined}>Cancel</button>
        <TeacherPressButton type="submit" tone="blue">{confirmLabel}</TeacherPressButton>
      </div>
    </form>
  </div>;
}

function iconBtn(c) { return { color: c.text }; }
const modalBackdrop = { zIndex: 2000 };
