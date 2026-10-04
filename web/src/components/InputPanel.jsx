import { useRef, useState } from "react";
import CameraCapture from "./CameraCapture.jsx";

export const SAMPLES = [
  { id: "cat", label: "Cat", url: "/samples/cat.jpg" },
  { id: "eiffel", label: "Eiffel", url: "/samples/eiffel.jpg" },
  { id: "elephant", label: "Elephant", url: "/samples/elephant.jpg" },
  { id: "lemon", label: "Lemon", url: "/samples/lemon.jpg" },
];

const TABS = [
  ["upload", "Upload"],
  ["camera", "Camera"],
  ["samples", "Samples"],
];

export default function InputPanel({ tab, setTab, source, onFile, onSample, onCapture, onClear, disabled, error }) {
  const fileRef = useRef(null);
  const [over, setOver] = useState(false);

  const preview = source && (
    <>
      <div className="preview">
        <span className="corner">{source.name} · {source.width}×{source.height}</span>
        <img src={source.url} alt="Selected input" />
      </div>
      <div className="row gap-top">
        <button className="btn small" onClick={onClear} disabled={disabled}>
          {tab === "camera" ? "↺ Retake" : "✕ Remove"}
        </button>
      </div>
    </>
  );

  return (
    <section className="card" aria-label="Input">
      <span className="card-title">1 · Input</span>
      <div className="tabs" role="tablist">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            role="tab"
            id={`tab-${id}`}
            aria-selected={tab === id}
            className="tab"
            onClick={() => setTab(id)}
            disabled={disabled}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <div className="notice err" role="alert">{error}</div>}

      {tab === "upload" &&
        (source ? preview : (
          <div
            className={`dropzone${over ? " over" : ""}`}
            role="button"
            tabIndex={0}
            onClick={() => fileRef.current?.click()}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f) onFile(f);
            }}
          >
            <span className="big">Drop an image here</span>
            <span>or click to browse your computer</span>
            <span className="tag">JPG · PNG · WEBP</span>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }}
            />
          </div>
        ))}

      {tab === "camera" &&
        (source?.name === "camera" ? preview : <CameraCapture onCapture={onCapture} disabled={disabled} />)}

      {tab === "samples" && (
        <>
          <p>No image handy? Pick one:</p>
          <div className="samples">
            {SAMPLES.map((s) => (
              <button key={s.id} className="sample" onClick={() => onSample(s)} disabled={disabled}>
                <img src={s.url} alt="" loading="lazy" />
                <span>{s.label}</span>
              </button>
            ))}
          </div>
          {source && <div style={{ marginTop: 18 }}>{preview}</div>}
        </>
      )}
    </section>
  );
}
