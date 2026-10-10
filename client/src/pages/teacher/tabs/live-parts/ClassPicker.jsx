import { useMemo, useState } from "react";
import { TwIcon } from "../../../../components/TwUI";
import { TeacherPressButton } from "../../TeacherUI";
import { solidModalBg } from "../teacherTabShared";

// Extracted verbatim from LiveSessionsTab.jsx (no behavior change).
// Single mode (default, used by Host Live): pick one class via onSelect(id).
// Multiple mode (used by Assign): tick any number of classes/sections, even
// across folders, then confirm once via onSelectMany(ids).
export function ClassPicker({ c, dark, folders, selectedId, onClose, onSelect, accent = null, multiple = false, selectedIds = [], onSelectMany }) {
  const [parentId, setParentId] = useState(null);
  // Pending choice: clicking a folder only highlights it (and drills in when
  // it has mini folders). Nothing is confirmed until "Select class" is
  // pressed - the last folder no longer auto-selects on click.
  const [pickedId, setPickedId] = useState(selectedId ? Number(selectedId) : null);
  const [pickedIds, setPickedIds] = useState(() => (selectedIds || []).map(Number));
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
  const pickedFolder = pickedId ? byId.get(Number(pickedId)) : null;
  // Directory trail from the root down to the folder being viewed, same idea
  // as the Class tab breadcrumbs: main folder -> section folder -> ...
  // Ancestor pills are clickable, so no separate back button is needed.
  const crumbs = useMemo(() => {
    const trail = [];
    let cursor = parentId ? byId.get(Number(parentId)) : null;
    while (cursor) {
      trail.unshift(cursor);
      cursor = cursor.parent_id ? byId.get(Number(cursor.parent_id)) : null;
    }
    return trail;
  }, [byId, parentId]);

  function toggleFolder(folder) {
    const id = Number(folder.id);
    setPickedIds((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
  }
  const allVisibleSelected = visibleFolders.length > 0 && visibleFolders.every((folder) => pickedIds.includes(Number(folder.id)));
  function toggleAllVisible() {
    const visibleIds = visibleFolders.map((folder) => Number(folder.id));
    setPickedIds((current) => (allVisibleSelected ? current.filter((id) => !visibleIds.includes(id)) : [...new Set([...current, ...visibleIds])]));
  }

  function handleFolderClick(folder) {
    const id = Number(folder.id);
    setPickedId(id);
    const children = childrenByParent.get(id) || [];
    if (children.length) setParentId(id);
  }

  return <div className="tw-class-picker-backdrop" onClick={(event) => { event.stopPropagation(); onClose(); }}>
    <section className="tw-class-picker-modal" onClick={(event) => event.stopPropagation()} style={{ background: dark ? "#102443" : solidModalBg(c), borderColor: c.border, color: c.text }}>
      <div className="tw-class-picker-header">
        <div>
          <h3>{multiple ? "Choose classes" : "Choose a class"}</h3>
        </div>
        <button type="button" aria-label="Close" onClick={onClose} style={{ color: c.text }}><TwIcon name="close" size={20} /></button>
      </div>
      <div className="tw-class-picker-back-row" style={{ display: "flex", justifyContent: "flex-start", alignItems: "center", gap: 10 }}>
        <nav aria-label="Folder location" style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", minWidth: 0, fontSize: 13, fontWeight: 800 }}>
          <button type="button" onClick={() => setParentId(null)} title="Back to all folders" style={{ border: `2px solid ${parentId ? c.border : c.accent}`, borderRadius: 999, padding: "4px 12px", background: parentId ? "transparent" : c.accent, color: parentId ? c.textMuted : "#fff", cursor: "pointer", font: "inherit" }}>All</button>
          {crumbs.map((folder) => {
            const isCurrent = Number(folder.id) === Number(parentId);
            return <span key={folder.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0 }}>
              <span aria-hidden="true" style={{ color: c.textMuted }}>→</span>
              {isCurrent
                ? <span title={folder.name} style={{ border: `2px solid ${c.accent}`, borderRadius: 999, padding: "4px 12px", background: c.accent, color: "#fff", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{folder.name}</span>
                : <button type="button" onClick={() => setParentId(Number(folder.id))} title={folder.name} style={{ border: `2px solid ${c.border}`, borderRadius: 999, padding: "4px 12px", background: "transparent", color: c.textMuted, cursor: "pointer", font: "inherit", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{folder.name}</button>}
            </span>;
          })}
        </nav>
      </div>
      {multiple && visibleFolders.length > 1 && <div style={{ display: "flex", justifyContent: "flex-end", margin: "0 0 8px" }}><button type="button" onClick={toggleAllVisible} style={{ border: 0, background: "transparent", color: accent || c.accent, fontWeight: 900, cursor: "pointer", fontSize: 13 }}>{allVisibleSelected ? "Clear these" : "Select all here"}</button></div>}
      <div className="tw-class-picker-grid">
        {visibleFolders.map((folder) => {
          const hasChildren = (childrenByParent.get(Number(folder.id)) || []).length > 0;
          const childCount = (childrenByParent.get(Number(folder.id)) || []).length;
          if (multiple) {
            const ticked = pickedIds.includes(Number(folder.id));
            return <div key={folder.id} style={{ position: "relative", display: "grid" }}>
              <button type="button" aria-pressed={ticked} className={`tw-class-picker-card${ticked ? " is-selected" : ""}`} onClick={() => toggleFolder(folder)} style={{ background: c.cardBg2, borderColor: ticked ? (accent || c.accent) : c.border, color: c.text, width: "100%" }}>
                <TwIcon name="folder" size={34} />
                <span className="tw-class-picker-name" title={folder.name}>{folder.name}</span>
                {hasChildren && <small style={{ color: c.textMuted }}>{childCount} folder{childCount === 1 ? "" : "s"}</small>}
              </button>
              <span aria-hidden="true" style={{ position: "absolute", top: 10, left: 10, width: 24, height: 24, borderRadius: 6, border: `2px solid ${ticked ? (accent || c.accent) : c.border}`, background: ticked ? (accent || c.accent) : "transparent", color: "#fff", display: "grid", placeItems: "center", fontSize: 15, fontWeight: 900, pointerEvents: "none" }}>{ticked ? "✓" : ""}</span>
              {hasChildren && <button type="button" title={`Open ${folder.name}`} aria-label={`Open ${folder.name}`} onClick={() => setParentId(Number(folder.id))} style={{ position: "absolute", top: 8, right: 8, border: `2px solid ${c.border}`, borderRadius: 999, background: c.cardBg2, color: c.text, padding: "2px 10px", fontSize: 12, fontWeight: 900, cursor: "pointer" }}>Open ›</button>}
            </div>;
          }
          const selected = Number(pickedId) === Number(folder.id);
          return <button type="button" key={folder.id} className={`tw-class-picker-card${selected ? " is-selected" : ""}`} onClick={() => handleFolderClick(folder)} style={{ background: c.cardBg2, borderColor: selected ? c.accent : c.border, color: c.text }}>
            <TwIcon name="folder" size={34} />
            <span className="tw-class-picker-name" title={folder.name}>{folder.name}</span>
            {hasChildren && <small style={{ color: c.textMuted }}>{childCount} folder{childCount === 1 ? "" : "s"}</small>}
          </button>;
        })}
        {!visibleFolders.length && <div className="tw-class-picker-empty tw-class-picker-thinkbot" style={{ color: c.textMuted }}><img src="/media/thinkbotbot.webp" alt="ThinkBOT" /><p>You have not made any classes yet.</p></div>}
      </div>
      {/* Confirming is always explicit via this button, so a parent folder with
          mini folders inside - or a final folder with none - can be chosen. */}
      <div className="tw-class-picker-footer" style={{ display: "flex", justifyContent: multiple ? "space-between" : "flex-end", alignItems: "center", gap: 12, marginTop: 18 }}>
        {multiple && <span style={{ color: c.textMuted, fontWeight: 800, fontSize: 13 }}>{pickedIds.length} selected</span>}
        {multiple
          ? <TeacherPressButton tone="blue" style={accent ? { "--tw-press-face": accent, "--tw-press-base": `color-mix(in srgb, ${accent} 62%, #000)`, "--tw-press-border": accent } : undefined} disabled={!pickedIds.length} onClick={() => { if (pickedIds.length) onSelectMany?.(pickedIds); }} title={pickedIds.length ? `Select ${pickedIds.length} class${pickedIds.length === 1 ? "" : "es"}` : "Pick at least one class first"}>{pickedIds.length > 1 ? `Select ${pickedIds.length} classes` : "Select class"}</TeacherPressButton>
          : <TeacherPressButton tone="blue" style={accent ? { "--tw-press-face": accent, "--tw-press-base": `color-mix(in srgb, ${accent} 62%, #000)`, "--tw-press-border": accent } : undefined} disabled={!pickedId} onClick={() => { if (pickedId) onSelect(Number(pickedId)); }} title={pickedFolder?.name ? `Select "${pickedFolder.name}"` : "Pick a class first"}>Select class</TeacherPressButton>}
      </div>
    </section>
  </div>;
}
