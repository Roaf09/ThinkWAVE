import { useEffect, useState } from "react";
import { VoiceRecorderButton } from "../../../components/AudioControls";
import { ImageUploadTile } from "./builderMedia";
import { fitCappedLines, trimText } from "./quizBuilderUtils";

export function MatchingEditor({ q, onChange, ui, c, isMobile = false }) {
  const [matchingPairIndex, setMatchingPairIndex] = useState(0);
  const [matchingDirection, setMatchingDirection] = useState("next");
  const [matchingImagesEnabled, setMatchingImagesEnabled] = useState(false);
  const cfg = q.config || {};
  const cor = q.correct || {};

  useEffect(() => {
    const count = Math.max(1, Array.isArray(cfg.colA) ? cfg.colA.length : 1);
    setMatchingPairIndex((current) => Math.min(current, count - 1));
    const hasExistingImages = [...(Array.isArray(cfg.colA) ? cfg.colA : []), ...(Array.isArray(cfg.colB) ? cfg.colB : [])]
      .some((item) => trimText(item?.image));
    setMatchingImagesEnabled(Boolean(cfg.matchingImagesEnabled || hasExistingImages));
  }, [q.order, cfg.matchingImagesEnabled, Array.isArray(cfg.colA) ? cfg.colA.length : 0, Array.isArray(cfg.colB) ? cfg.colB.length : 0]);

  const colA = Array.isArray(cfg.colA) && cfg.colA.length ? cfg.colA.map((item) => ({ text: item?.text || "", image: item?.image || "" })) : [{ text: "", image: "" }];
  const allB = Array.isArray(cfg.colB) && cfg.colB.length ? cfg.colB.map((item) => ({ text: item?.text || "", image: item?.image || "" })) : [{ text: "", image: "" }];
  const dummyB = Array.isArray(cfg.dummyB) && cfg.dummyB.length ? cfg.dummyB.map((item) => ({ text: item?.text || "", image: item?.image || "" })) : allB.slice(colA.length, colA.length + 2);
  const pairB = Array.from({ length: colA.length }, (_, i) => ({ text: allB[i]?.text || "", image: allB[i]?.image || "" }));
  const maxPairs = 15;
  const maxDummies = 2;
  const activeDummy = dummyB.slice(0, maxDummies);
  const activePair = Math.min(matchingPairIndex, colA.length - 1);
  const imagesEnabled = Boolean(cfg.matchingImagesEnabled ?? matchingImagesEnabled);
  // Same text recipe as the MCQ choice tiles: 22px bold centered text in a
  // fixed 3-line box. Longer text shrinks toward 12px instead of growing;
  // leftover space becomes top padding so short text sits centered both ways.
  const MATCH_FONT_MAX = 22;
  const MATCH_FONT_MIN = 12;
  const MATCH_MAX_HEIGHT = 80;
  function fitMatchingFont(el) {
    if (!el) return;
    fitCappedLines(el, { maxSize: MATCH_FONT_MAX, minSize: MATCH_FONT_MIN, maxLines: 3, maxHeight: MATCH_MAX_HEIGHT });
  }
  const insetField = {
    background: "#ffffff",
    border: `3px solid ${ui.templateAccent}`,
    borderRadius: 14,
    boxShadow: `inset 0 4px 0 rgba(15,23,42,.10), inset 0 10px 20px color-mix(in srgb, ${ui.templateAccent} 16%, transparent)`,
    color: "#0f172a",
    fontWeight: 900,
    fontSize: 22,
    fontFamily: "inherit",
    textAlign: "center",
  };

  function emit(aRows, bRows, dRows, extraConfig = {}) {
    const cleanedDummy = dRows.slice(0, maxDummies);
    onChange({
      config: { ...cfg, matchingImagesEnabled: imagesEnabled, ...extraConfig, colA: aRows, colB: [...bRows, ...cleanedDummy], dummyB: cleanedDummy },
      correct: { ...cor, pairs: aRows.map((_, i) => ({ aIndex: i, bIndex: i })) },
    });
  }

  function togglePairImages() {
    const nextEnabled = !imagesEnabled;
    setMatchingImagesEnabled(nextEnabled);
    onChange({
      config: { ...cfg, matchingImagesEnabled: nextEnabled, colA, colB: [...pairB, ...activeDummy], dummyB: activeDummy },
      correct: { ...cor, pairs: colA.map((_, i) => ({ aIndex: i, bIndex: i })) },
    });
  }

  function updateA(i, patch) { emit(colA.map((row, idx) => (idx === i ? { ...row, ...patch } : row)), pairB, activeDummy); }
  function updateB(i, patch) { emit(colA, pairB.map((row, idx) => (idx === i ? { ...row, ...patch } : row)), activeDummy); }
  function updateDummy(i, patch) { emit(colA, pairB, activeDummy.map((row, idx) => (idx === i ? { ...row, ...patch } : row))); }
  function addRow() {
    if (colA.length >= maxPairs) return;
    emit([...colA, { text: "", image: "" }], [...pairB, { text: "", image: "" }], activeDummy);
    setMatchingDirection("next");
    setMatchingPairIndex(colA.length);
  }
  function removeRow(index) {
    if (colA.length <= 1) return;
    emit(colA.filter((_, i) => i !== index), pairB.filter((_, i) => i !== index), activeDummy);
    setMatchingPairIndex((current) => Math.max(0, Math.min(current, colA.length - 2)));
  }
  // Per-field voice, same as MCQ choices: recordings live in
  // config.voiceAnswers (Column A slots, then Column B slots, then
  // distractor slots). The record button shares a row with the image tile.
  function updateRecording(index, value) {
    const recordings = Array.isArray(cfg.voiceAnswers) ? [...cfg.voiceAnswers] : [];
    recordings[index] = value;
    onChange({ config: { ...cfg, voiceAnswers: recordings } });
  }
  function voiceRecordEl(index, label) {
    if (!cfg.voiceRecord) return null;
    return <div className="tw-builder-choice-record"><span>{label}</span><VoiceRecorderButton value={(Array.isArray(cfg.voiceAnswers) ? cfg.voiceAnswers : [])[index] || ""} onChange={(value) => updateRecording(index, value)} /></div>;
  }
  function mediaRow(tileEl, recordEl) {
    if (tileEl && recordEl) return <div className="tw-mcq-option-media-row is-dual">{tileEl}{recordEl}</div>;
    if (tileEl || recordEl) return <div className="tw-mcq-option-media-row is-single">{tileEl}{recordEl}</div>;
    return null;
  }
  function addDummy() { if (activeDummy.length < maxDummies) emit(colA, pairB, [...activeDummy, { text: "", image: "" }]); }
  function removeDummy(index) { emit(colA, pairB, activeDummy.filter((_, i) => i !== index)); }
  function showPair(index) {
    if (index < 0 || index >= colA.length || index === activePair) return;
    setMatchingDirection(index > activePair ? "next" : "prev");
    setMatchingPairIndex(index);
  }

  return (
    <div style={ui.innerCard} className={isMobile ? "tw-matching-mobile" : undefined}>
      <style>{`.tw-matching-input::placeholder{color:rgba(15,23,42,.5)}`}</style>
      <div data-tutorial="builder-matching-pairs">
      <div className="tw-matching-head-row flex justify-between mb-[14px]" style={{ alignItems: "center", gap: 12, flexWrap: "nowrap" }}>
        <div style={{ flex: "1 1 auto", minWidth: 0 }}><h4 style={{ ...ui.innerTitle, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{isMobile ? "Matching" : "Matching Pairs"}</h4></div>
        <div className="tw-matching-pair-actions" style={{ marginLeft: "auto", flex: "0 0 auto" }}>
          <button
            type="button"
            data-tutorial="builder-matching-add-image"
            className={`tw-builder-press tw-matching-white-action${imagesEnabled ? " is-selected" : ""}`}
            style={{ ...ui.secondaryBtn, padding: "7px 12px", fontSize: 12, ...(imagesEnabled ? { borderColor: "#f59e0b", boxShadow: "0 0 0 2px rgba(245,158,11,.35)" } : null) }}
            onClick={togglePairImages}
          >{imagesEnabled ? "− Image" : "＋ Image"}</button>
          <button type="button" data-tutorial="builder-matching-add-pair" className="tw-builder-press tw-matching-white-action" style={{ ...ui.secondaryBtn, padding: "7px 12px", fontSize: 12, opacity: colA.length >= maxPairs ? .5 : 1 }} disabled={colA.length >= maxPairs} onClick={addRow}>＋ Pair</button>
        </div>
      </div>

      <div className="tw-matching-pair-carousel">
        <button type="button" className="tw-matching-arrow" style={{ "--tw-match-accent": ui.templateAccent, "--tw-match-disabled-border": c.border, "--tw-match-disabled-bg": c.cardBg, "--tw-match-disabled-color": c.text }} disabled={activePair === 0} onClick={() => showPair(activePair - 1)}>←</button>
        <div key={`${activePair}-${matchingDirection}`} data-tutorial="builder-matching-active-pair" className={`tw-matching-pair-card is-${matchingDirection}`} style={{ border: `3px solid ${ui.templateAccent}`, borderRadius: 20, background: ui.templateSoftBg, boxShadow: `0 6px 0 color-mix(in srgb, ${ui.templateAccent} 58%, #0f172a), 0 14px 28px ${ui.templateAccent}40, inset 0 2px 0 rgba(255,255,255,.6)` }}>
          <div className="tw-matching-pair-head">
            <span style={{ ...ui.badge, background: ui.templateSoftBg, color: ui.templateAccent }}>Pair {activePair + 1} of {colA.length}</span>
            <button type="button" className="tw-builder-press tw-builder-press-red tw-matching-delete-minus" title="Delete pair" aria-label="Delete pair" disabled={colA.length <= 1} onClick={() => removeRow(activePair)}>−</button>
          </div>
          <div className="tw-matching-pair-fields">
            <div>
              <label style={ui.smallLabel}>Column A</label>
              {isMobile ? (
                <textarea rows={3} maxLength={255} value={colA[activePair]?.text || ""} placeholder={imagesEnabled ? "Concept, term, or caption (optional)" : "Concept or term"} onChange={(e) => updateA(activePair, { text: e.target.value.slice(0, 255) })} onInput={(e) => fitMatchingFont(e.currentTarget)} ref={(el) => { if (el) fitMatchingFont(el); }} className="leading-[1.45] tw-matching-input" style={{ ...ui.input, ...insetField, resize: "none", overflow: "hidden", lineHeight: 1.45 }} />
              ) : (
                <textarea
                  rows={3}
                  maxLength={255}
                  value={colA[activePair]?.text || ""}
                  placeholder={imagesEnabled ? "Concept, term, or caption (optional)" : "Concept or term"}
                  onChange={(e) => updateA(activePair, { text: e.target.value.slice(0, 255) })}
                  onInput={(e) => fitMatchingFont(e.currentTarget)}
                  ref={(el) => { if (el) fitMatchingFont(el); }}
                  className="tw-matching-input"
                  style={{ ...ui.input, ...insetField, resize: "none", overflow: "hidden", lineHeight: 1.45 }}
                />
              )}
              {mediaRow(
                imagesEnabled ? <ImageUploadTile compact value={colA[activePair]?.image || ""} label="Upload Column A image" onChange={(value) => updateA(activePair, { image: value })} c={c} accent={ui.templateAccent} /> : null,
                voiceRecordEl(activePair, `Column A ${activePair + 1} recording`)
              )}
            </div>
            <div className="tw-matching-link">⇄</div>
            <div>
              <label style={ui.smallLabel}>Column B</label>
              {isMobile ? (
                <textarea rows={3} maxLength={255} value={pairB[activePair]?.text || ""} placeholder={imagesEnabled ? "Answer or caption (optional)" : "Correct match"} onChange={(e) => updateB(activePair, { text: e.target.value.slice(0, 255) })} onInput={(e) => fitMatchingFont(e.currentTarget)} ref={(el) => { if (el) fitMatchingFont(el); }} className="leading-[1.45] tw-matching-input" style={{ ...ui.input, ...insetField, resize: "none", overflow: "hidden", lineHeight: 1.45 }} />
              ) : (
                <textarea
                  rows={3}
                  maxLength={255}
                  value={pairB[activePair]?.text || ""}
                  placeholder={imagesEnabled ? "Answer or caption (optional)" : "Correct match"}
                  onChange={(e) => updateB(activePair, { text: e.target.value.slice(0, 255) })}
                  onInput={(e) => fitMatchingFont(e.currentTarget)}
                  ref={(el) => { if (el) fitMatchingFont(el); }}
                  className="tw-matching-input"
                  style={{ ...ui.input, ...insetField, resize: "none", overflow: "hidden", lineHeight: 1.45 }}
                />
              )}
              {mediaRow(
                imagesEnabled ? <ImageUploadTile compact value={pairB[activePair]?.image || ""} label="Upload Column B image" onChange={(value) => updateB(activePair, { image: value })} c={c} accent={ui.templateAccent} /> : null,
                voiceRecordEl(colA.length + activePair, `Column B ${activePair + 1} recording`)
              )}
            </div>
          </div>
        </div>
        <button type="button" className="tw-matching-arrow" style={{ "--tw-match-accent": ui.templateAccent, "--tw-match-disabled-border": c.border, "--tw-match-disabled-bg": c.cardBg, "--tw-match-disabled-color": c.text }} disabled={activePair >= colA.length - 1} onClick={() => showPair(activePair + 1)}>→</button>
      </div>
      </div>

      <div className="tw-matching-dummy-section" data-tutorial="builder-matching-dummy" style={{ borderColor: c.border, background: c.cardBg2 }}>
        {activeDummy.length === 0 ? (
          <div className="tw-matching-add-dummy-empty"><button type="button" data-tutorial="builder-matching-add-dummy" className="tw-builder-press tw-builder-press-blue" onClick={addDummy}>Add Distractors</button></div>
        ) : <>
          <div className="tw-matching-dummy-head">
            <div><h4 style={{ ...ui.innerTitle, margin: 0 }}>Distractors</h4></div>
            {activeDummy.length < maxDummies && <button type="button" data-tutorial="builder-matching-add-dummy" className="tw-builder-press tw-builder-press-blue" onClick={addDummy}>Add Distractors</button>}
          </div>
          <div className={`tw-matching-dummy-grid${activeDummy.length === 1 ? " is-single" : ""}`}>
            {activeDummy.map((row, index) => (
              <div key={index} className="tw-matching-dummy-card" style={imagesEnabled ? { border: `3px solid ${ui.templateAccent}`, borderRadius: 8, background: `color-mix(in srgb, ${ui.templateAccent} 12%, #ffffff)`, boxShadow: `0 6px 0 color-mix(in srgb, ${ui.templateAccent} 58%, #0f172a), 0 18px 34px ${ui.templateAccent}59, inset 0 2px 0 rgba(255,255,255,.8)` } : { border: `1px solid ${c.border}`, borderRadius: 8, background: c.cardBg2, boxShadow: "none" }}>
                <div className="tw-matching-dummy-label"><label style={ui.smallLabel}>Distractor {index + 1}</label><button type="button" className="tw-builder-press tw-builder-press-red tw-matching-delete-minus" title="Delete distractor" aria-label="Delete distractor" onClick={() => removeDummy(index)}>−</button></div>
                <div className="tw-matching-dummy-fields tw-matching-distractor-like-pair">
                  <textarea rows={3} className="tw-matching-dummy-input tw-matching-distractor-input tw-matching-input" maxLength={255} value={row.text || ""} placeholder="Distractor answer (optional)" onChange={(e) => updateDummy(index, { text: e.target.value.slice(0, 255) })} onInput={(e) => fitMatchingFont(e.currentTarget)} ref={(el) => { if (el) fitMatchingFont(el); }} style={{ ...ui.input, ...insetField, resize: "none", overflow: "hidden", lineHeight: 1.45 }} />
                  {(imagesEnabled || cfg.voiceRecord) && mediaRow(
                    imagesEnabled ? <ImageUploadTile compact value={row.image || ""} label="Upload image" onChange={(value) => updateDummy(index, { image: value })} c={c} accent={ui.templateAccent} /> : null,
                    voiceRecordEl(colA.length + pairB.length + index, `Distractor ${index + 1} recording`)
                  )}
                </div>
              </div>
            ))}
          </div>
        </>}
      </div>
    </div>
  );
}
