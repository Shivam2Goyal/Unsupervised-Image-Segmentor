import { useEffect, useRef, useState } from "react";
import { baseName, canvasToBlob, comparisonBlob, downloadBlob, resultToCanvas } from "../lib/imageIO.js";

function CompareSlider({ beforeUrl, afterUrl, width, height }) {
  const [pos, setPos] = useState(50);
  const ref = useRef(null);
  const move = (clientX) => {
    const r = ref.current.getBoundingClientRect();
    setPos(Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100)));
  };
  return (
    <div className="frame">
      <header><span>Drag to compare</span><span>{Math.round(pos)}%</span></header>
      <div
        ref={ref}
        className="slider-frame"
        style={{ aspectRatio: `${width} / ${height}` }}
        role="slider"
        tabIndex={0}
        aria-label="Compare original and segmented"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pos)}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); move(e.clientX); }}
        onPointerMove={(e) => e.buttons && move(e.clientX)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") setPos((p) => Math.max(0, p - 5));
          if (e.key === "ArrowRight") setPos((p) => Math.min(100, p + 5));
        }}
      >
        <img src={afterUrl} alt="Segmented" draggable={false} />
        <div className="top" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
          <img src={beforeUrl} alt="Original" draggable={false} />
        </div>
        <span className="slider-label" style={{ left: 10 }}>Original</span>
        <span className="slider-label" style={{ right: 10 }}>Segmented</span>
        <div className="slider-handle" style={{ left: `${pos}%` }}><b>↔</b></div>
      </div>
    </div>
  );
}

export default function ResultView({ source, result, onRerun, onNewSeed, busy }) {
  const [mode, setMode] = useState("side");
  const [segUrl, setSegUrl] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let url;
    let alive = true;
    canvasToBlob(resultToCanvas(result)).then((b) => {
      if (!alive) return;
      url = URL.createObjectURL(b);
      setSegUrl(url);
    });
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [result]);

  const name = baseName(source.name);

  const saveSegmented = async () => {
    setSaving(true);
    try { downloadBlob(await canvasToBlob(resultToCanvas(result)), `${name}-segmented.png`); }
    finally { setSaving(false); }
  };
  const saveComparison = async () => {
    setSaving(true);
    try { downloadBlob(await comparisonBlob(source, result), `${name}-comparison.png`); }
    finally { setSaving(false); }
  };

  return (
    <section className="result" aria-label="Result">
      <div className="result-head">
        <h2>Result</h2>
        <div className="row">
          <div className="tabs" style={{ margin: 0 }} role="tablist">
            <button className="tab" role="tab" aria-selected={mode === "side"} onClick={() => setMode("side")}>Side by side</button>
            <button className="tab" role="tab" aria-selected={mode === "slider"} onClick={() => setMode("slider")}>Slider</button>
          </div>
        </div>
      </div>

      {mode === "side" ? (
        <div className="compare">
          <div className="frame">
            <header><span>Original</span><span>{source.width}×{source.height}</span></header>
            <img src={source.url} alt="Original" />
          </div>
          <div className="frame">
            <header><span>Segmented</span><span>{result.clusters.length} regions</span></header>
            {segUrl ? <img src={segUrl} alt="Segmented" /> : <div style={{ aspectRatio: `${result.width} / ${result.height}` }} />}
          </div>
        </div>
      ) : (
        segUrl && <CompareSlider beforeUrl={source.url} afterUrl={segUrl} width={result.width} height={result.height} />
      )}

      <div className="row gap-top">
        <button className="btn primary" style={{ fontSize: "1.05rem", padding: "12px 22px" }} onClick={saveSegmented} disabled={saving || !segUrl}>
          ↓ Download segmented
        </button>
        <button className="btn" onClick={saveComparison} disabled={saving}>↓ Download comparison</button>
        <button className="btn" onClick={onNewSeed} disabled={busy}>⟳ Re-roll</button>
      </div>

      <div className="legend" aria-label="Regions by size">
        {result.clusters.map((c, i) => (
          <div key={i} title={`${(c.fraction * 100).toFixed(1)}% of pixels`}>
            <i style={{ background: c.color }} />
            <span className="bar"><u style={{ width: `${Math.max(2, c.fraction * 100)}%` }} /></span>
            <span>{(c.fraction * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>

      <div className="stats">
        <span className="tag">EM iterations: {result.iterations}{result.converged ? "" : " (cap hit)"}</span>
        <span className="tag" style={{ background: "var(--pink)" }}>time: {result.ms} ms</span>
        <span className="tag" style={{ background: "var(--green)" }}>seed: {result.seed}</span>
      </div>
    </section>
  );
}
