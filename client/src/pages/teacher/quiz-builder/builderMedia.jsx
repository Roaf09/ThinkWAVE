import { useState } from "react";
import { TwIcon } from "../../../components/TwUI";
import { compressImageFile } from "./quizBuilderUtils";

export function MediaInput({ label, value, placeholder, onChange, ui, c }) {
  async function handleFile(file) {
    if (!file || !/^image\//.test(file.type || "")) return;
    const optimized = await compressImageFile(file);
    if (optimized) onChange(optimized);
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {label ? <label style={ui.smallLabel}>{label}</label> : null}
      <div style={{ display: "grid", gridTemplateColumns: value ? "104px 1fr" : "1fr", gap: 10, alignItems: "stretch" }}>
        {value ? (
          <div style={{ position: "relative", minHeight: 82, borderRadius: 12, overflow: "hidden", border: `1px solid ${c.border}`, background: c.cardBg2 }}>
            <img src={value} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            <button
              type="button"
              onClick={() => onChange("")}
              style={{ position: "absolute", top: 6, right: 6, width: 24, height: 24, borderRadius: 999, border: "none", background: "rgba(15,23,42,0.78)", color: "#fff", fontWeight: 900, cursor: "pointer" }}
            >
              x
            </button>
          </div>
        ) : null}
        <div style={{ display: "grid", gap: 8 }}>
          <input
            maxLength={6000}
            value={value || ""}
            placeholder={placeholder || "Image URL or uploaded image"}
            onChange={(e) => onChange(e.target.value)}
            style={ui.input}
          />
          <label
            style={{
              ...ui.secondaryBtn,
              textAlign: "center",
              padding: "9px 12px",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Upload image
            <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => handleFile(e.target.files?.[0])} />
          </label>
        </div>
      </div>
    </div>
  );
}

export function ImageUploadTile({ value, label = "Upload image", onChange, c, accent = "#2b6cff", compact = false, hideRemove = false, solid = null }) {
  const [dragOver, setDragOver] = useState(false);
  async function handleFile(file) {
    if (!file || !/^image\//.test(file.type || "")) return;
    const optimized = await compressImageFile(file);
    if (optimized) onChange(optimized);
  }
  // Solid 3D frame (e.g. all-green guess tiles a la modified MCQ choices).
  const solidStyle = !value && solid ? {
    borderStyle: "solid",
    borderWidth: 4,
    borderColor: solid.border,
    borderRadius: 20,
    background: solid.face,
    boxShadow: `0 8px 0 ${solid.base}, 0 16px 28px rgba(15,23,42,.16)`,
    color: solid.ink,
  } : null;
  return (
    <div
      className={`tw-builder-image-tile${compact ? " is-compact" : ""}`}
      style={{
        borderColor: dragOver ? accent : `${accent}99`,
        background: value ? c.cardBg : dragOver ? `${accent}22` : `${accent}0e`,
        ...(solidStyle || {}),
        ...((!value && !solid) ? { borderStyle: "dashed", borderWidth: 2, borderRadius: 8 } : null),
      }}
      onDragOver={(e) => { e.preventDefault(); if (!value) setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer?.files?.[0]); }}
    >
      <label title={value ? "Click to replace image" : `${label} (or drop an image here)`} style={(!value && solid) ? { color: solid.ink } : undefined}>
        {value ? <img src={value} alt="" /> : <span style={solid ? { color: solid.ink } : undefined}><TwIcon name="upload" size={22} /><span>{dragOver ? "Drop image" : label}</span><small style={{ fontWeight: 600, opacity: 0.75 }}>Drag &amp; drop or click to browse</small></span>}
        <input type="file" accept="image/*" hidden onChange={(event) => { handleFile(event.target.files?.[0]); event.target.value = ""; }} />
      </label>
      {value && !hideRemove && <button type="button" className="tw-builder-image-remove" onClick={() => onChange("")} aria-label="Remove image">×</button>}
    </div>
  );
}
