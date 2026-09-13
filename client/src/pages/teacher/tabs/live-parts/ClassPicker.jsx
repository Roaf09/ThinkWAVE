import { useMemo, useState } from "react";
import { TwIcon } from "../../../../components/TwUI";
import { solidModalBg } from "../teacherTabShared";

// Extracted verbatim from LiveSessionsTab.jsx (no behavior change).
export function ClassPicker({ c, dark, folders, selectedId, onClose, onSelect }) {
  const [parentId, setParentId] = useState(null);
  const { byId, childrenByParent } = useMemo(() => {
    const rowsById = new Map();
    const grouped = new Map();
    (folders || []).forEach((folder) => rowsById.set(Number(folder.id), folder));
    (folders || []).forEach((folder) => {
      const key = folder.parent_id ? Number(folder.parent_id) : null;
      const rows = grouped.get(key) || [];
      rows.push(folder);
      grouped.set(key, rows);
    });
    grouped.forEach((rows) => rows.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""))));
    return { byId: rowsById, childrenByParent: grouped };
  }, [folders]);
  const visibleFolders = childrenByParent.get(parentId) || [];
  const currentFolder = parentId ? byId.get(Number(parentId)) : null;
  const parentFolderId = currentFolder?.parent_id ? Number(currentFolder.parent_id) : null;

  function openFolder(folder) {
    const children = childrenByParent.get(Number(folder.id)) || [];
    if (children.length) {
      setParentId(Number(folder.id));
      return;
    }
    onSelect(Number(folder.id));
  }

  return <div className="tw-class-picker-backdrop" onClick={(event) => { event.stopPropagation(); onClose(); }}>
    <section className="tw-class-picker-modal" onClick={(event) => event.stopPropagation()} style={{ background: dark ? "#102443" : solidModalBg(c), borderColor: c.border, color: c.text }}>
      <div className="tw-class-picker-header">
        <div>
          <h3>Choose a class</h3>
          <p style={{ color: c.textMuted }}>{currentFolder ? currentFolder.name : folders.length ? "Choose a folder or class to continue." : ""}</p>
        </div>
        <button type="button" onClick={onClose} style={{ color: c.text }}><TwIcon name="close" size={20} /></button>
      </div>
      {parentId && <button type="button" className="tw-class-picker-back" onClick={() => setParentId(parentFolderId)} style={{ color: c.accent }}><TwIcon name="arrowRight" size={18} style={{ transform: "rotate(180deg)" }} /> Back</button>}
      <div className="tw-class-picker-grid">
        {visibleFolders.map((folder) => {
          const hasChildren = (childrenByParent.get(Number(folder.id)) || []).length > 0;
          const selected = Number(selectedId) === Number(folder.id);
          return <button type="button" key={folder.id} className={`tw-class-picker-card${selected ? " is-selected" : ""}`} onClick={() => openFolder(folder)} style={{ background: c.cardBg2, borderColor: selected ? c.accent : c.border, color: c.text }}>
            <TwIcon name="folder" size={34} />
            <span className="tw-class-picker-name" title={folder.name}>{folder.name}</span>
            {hasChildren && <small style={{ color: c.textMuted }}>{(childrenByParent.get(Number(folder.id)) || []).length} folder{(childrenByParent.get(Number(folder.id)) || []).length === 1 ? "" : "s"}</small>}
          </button>;
        })}
        {!visibleFolders.length && <div className="tw-class-picker-empty tw-class-picker-thinkbot" style={{ color: c.textMuted }}><img src="/media/thinkbotbot.webp" alt="ThinkBOT" /><p>You have not made any classes yet.</p></div>}
      </div>
    </section>
  </div>;
}
