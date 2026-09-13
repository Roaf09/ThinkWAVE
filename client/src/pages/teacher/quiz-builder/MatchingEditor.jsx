import { useEffect, useState } from "react";
import { ImageUploadTile } from "./builderMedia";
import { trimText } from "./quizBuilderUtils";

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
  const maxPairs = 999;
  const maxDummies = 2;
  const activeDummy = dummyB.slice(0, maxDummies);
  const activePair = Math.min(matchingPairIndex, colA.length - 1);
  const imagesEnabled = Boolean(cfg.matchingImagesEnabled ?? matchingImagesEnabled);

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
  function addDummy() { if (activeDummy.length < maxDummies) emit(colA, pairB, [...activeDummy, { text: "", image: "" }]); }
  function removeDummy(index) { emit(colA, pairB, activeDummy.filter((_, i) => i !== index)); }
  function showPair(index) {
    if (index < 0 || index >= colA.length || index === activePair) return;
    setMatchingDirection(index > activePair ? "next" : "prev");
    setMatchingPairIndex(index);
  }

  return (
    <div style={ui.innerCard} className={isMobile ? "tw-matching-mobile" : undefined}>
      <div data-tutorial="builder-matching-pairs">
      <div className="tw-matching-head-row flex justify-between mb-[14px]" style={{ alignItems: "center", gap: 12, flexWrap: "nowrap" }}>
        <div style={{ flex: "1 1 auto", minWidth: 0 }}><h4 style={{ ...ui.innerTitle, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{isMobile ? "Matching" : "Matching Pairs"}</h4></div>
        <div className="tw-matching-pair-actions" style={{ marginLeft: "auto", flex: "0 0 auto" }}>
          <button
            type="button"
            data-tutorial="builder-matching-add-image"
            className="tw-builder-press tw-matching-white-action"
            style={{ ...ui.secondaryBtn, padding: "7px 12px", fontSize: 12 }}
            onClick={togglePairImages}
          >{imagesEnabled ? "− Image" : "＋ Image"}</button>
          <button type="button" data-tutorial="builder-matching-add-pair" className="tw-builder-press tw-matching-white-action" style={{ ...ui.secondaryBtn, padding: "7px 12px", fontSize: 12, opacity: colA.length >= maxPairs ? .5 : 1 }} disabled={colA.length >= maxPairs} onClick={addRow}>＋ Pair</button>
        </div>
      </div>

      <div className="tw-matching-pair-carousel">
        <button type="button" className="tw-matching-arrow" style={{ "--tw-match-accent": ui.templateAccent, "--tw-match-disabled-border": c.border, "--tw-match-disabled-bg": c.cardBg, "--tw-match-disabled-color": c.text }} disabled={activePair === 0} onClick={() => showPair(activePair - 1)}>←</button>
        <div key={`${activePair}-${matchingDirection}`} data-tutorial="builder-matching-active-pair" className={`tw-matching-pair-card is-${matchingDirection}`} style={{ borderColor: ui.templateBorder, background: c.cardBg2 }}>
          <div className="tw-matching-pair-head">
            <span style={{ ...ui.badge, background: ui.templateSoftBg, color: ui.templateAccent }}>Pair {activePair + 1} of {colA.length}</span>
            <button type="button" className="tw-builder-press tw-builder-press-red tw-matching-delete-minus" title="Delete pair" aria-label="Delete pair" disabled={colA.length <= 1} onClick={() => removeRow(activePair)}>−</button>
          </div>
          <div className="tw-matching-pair-fields">
            <div>
              <label style={ui.smallLabel}>Column A</label>
              {isMobile ? (
                <textarea rows={3} maxLength={255} value={colA[activePair]?.text || ""} placeholder={imagesEnabled ? "Concept, term, or caption (optional)" : "Concept or term"} onChange={(e) => updateA(activePair, { text: e.target.value.slice(0, 255) })} className="min-h-[78px] resize-y leading-[1.45]" style={ui.input} />
              ) : (
                <input maxLength={255} value={colA[activePair]?.text || ""} placeholder={imagesEnabled ? "Concept, term, or caption (optional)" : "Concept or term"} onChange={(e) => updateA(activePair, { text: e.target.value.slice(0, 255) })} style={ui.input} />
              )}
              {imagesEnabled && <ImageUploadTile compact value={colA[activePair]?.image || ""} label="Upload Column A image" onChange={(value) => updateA(activePair, { image: value })} c={c} accent={ui.templateAccent} />}
            </div>
            <div className="tw-matching-link">⇄</div>
            <div>
              <label style={ui.smallLabel}>Column B</label>
              {isMobile ? (
                <textarea rows={3} maxLength={255} value={pairB[activePair]?.text || ""} placeholder={imagesEnabled ? "Answer or caption (optional)" : "Correct match"} onChange={(e) => updateB(activePair, { text: e.target.value.slice(0, 255) })} className="min-h-[78px] resize-y leading-[1.45]" style={ui.input} />
              ) : (
                <input maxLength={255} value={pairB[activePair]?.text || ""} placeholder={imagesEnabled ? "Answer or caption (optional)" : "Correct match"} onChange={(e) => updateB(activePair, { text: e.target.value.slice(0, 255) })} style={ui.input} />
              )}
              {imagesEnabled && <ImageUploadTile compact value={pairB[activePair]?.image || ""} label="Upload Column B image" onChange={(value) => updateB(activePair, { image: value })} c={c} accent={ui.templateAccent} />}
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
              <div key={index} className="tw-matching-dummy-card" style={{ borderColor: c.border, background: c.cardBg }}>
                <div className="tw-matching-dummy-label"><label style={ui.smallLabel}>Distractor {index + 1}</label><button type="button" className="tw-builder-press tw-builder-press-red tw-matching-delete-minus" title="Delete distractor" aria-label="Delete distractor" onClick={() => removeDummy(index)}>−</button></div>
                <div className="tw-matching-dummy-fields">
                  <textarea rows={4} className="tw-matching-dummy-input tw-matching-distractor-input" maxLength={255} value={row.text || ""} placeholder="Distractor answer (optional)" onChange={(e) => updateDummy(index, { text: e.target.value.slice(0, 255) })} style={ui.input} />
                  <ImageUploadTile compact value={row.image || ""} label="Upload image" onChange={(value) => updateDummy(index, { image: value })} c={c} accent={ui.templateAccent} />
                </div>
              </div>
            ))}
          </div>
        </>}
      </div>
    </div>
  );
}
