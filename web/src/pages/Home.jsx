import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import InputPanel from "../components/InputPanel.jsx";
import Loader from "../components/Loader.jsx";
import ResultView from "../components/ResultView.jsx";
import { loadBlob } from "../lib/imageIO.js";
import { cancelSegmentation, runSegmentation } from "../lib/segmenterClient.js";

const RESOLUTIONS = [
  [480, "Fast · 480 px"],
  [800, "Balanced · 800 px"],
  [1200, "Detailed · 1200 px"],
];
const newSeed = () => (Math.random() * 2 ** 32) >>> 0;

export default function Home() {
  const [tab, setTab] = useState("upload");
  const [raw, setRaw] = useState(null); // { blob, name } as picked, before downscaling
  const [source, setSource] = useState(null);
  const [maxSide, setMaxSide] = useState(800);
  const [k, setK] = useState(7);
  const [texture, setTexture] = useState(50); // LBP weight, percent
  const [seed, setSeed] = useState(newSeed);
  const [phase, setPhase] = useState("idle"); // idle | running | done
  const [progress, setProgress] = useState({ target: 0, stage: "preprocess", detail: null });
  const [jobDone, setJobDone] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const pending = useRef(null);
  const resultRef = useRef(null);
  const runId = useRef(0);

  const busy = phase === "running";

  // (Re)decode the picked image whenever the file or the resolution setting changes.
  useEffect(() => {
    if (!raw) return;
    let alive = true;
    loadBlob(raw.blob, raw.name, maxSide)
      .then((s) => { if (alive) { setSource((old) => { if (old) URL.revokeObjectURL(old.url); return s; }); setError(""); } })
      .catch((e) => alive && setError(e.message));
    return () => { alive = false; };
  }, [raw, maxSide]);

  useEffect(() => () => cancelSegmentation(), []);

  const resetOutput = () => { setResult(null); setPhase("idle"); setJobDone(false); };

  const onFile = (file) => {
    if (!file.type.startsWith("image/")) { setError("Please choose an image file."); return; }
    resetOutput();
    setRaw({ blob: file, name: file.name });
  };
  const onSample = async (s) => {
    try {
      const blob = await (await fetch(s.url)).blob();
      resetOutput();
      setRaw({ blob, name: s.id });
    } catch { setError("Could not load that sample."); }
  };
  const onCapture = async (video) => {
    try {
      // keep the full-resolution frame; the effect above downsizes it to the chosen working size
      const full = document.createElement("canvas");
      full.width = video.videoWidth;
      full.height = video.videoHeight;
      full.getContext("2d").drawImage(video, 0, 0);
      const blob = await new Promise((r) => full.toBlob(r, "image/png"));
      if (!blob) throw new Error("Could not capture the picture.");
      resetOutput();
      setError("");
      setRaw({ blob, name: "camera" });
    } catch (e) { setError(e.message || "Could not capture the picture."); }
  };
  const onClear = () => {
    setRaw(null);
    setSource((old) => { if (old) URL.revokeObjectURL(old.url); return null; });
    resetOutput();
  };

  const start = (useSeed) => {
    if (!source || busy) return;
    const id = ++runId.current;
    setError("");
    setPhase("running");
    setJobDone(false);
    setResult(null);
    setProgress({ target: 0.02, stage: "preprocess", detail: null });
    const t0 = performance.now();
    runSegmentation(source.imageData, { k, seed: useSeed, texture: texture / 100 }, (p) => {
      if (id === runId.current) setProgress({ target: p.progress, stage: p.stage, detail: p.detail });
    })
      .then((res) => {
        if (id !== runId.current) return;
        pending.current = { ...res, ms: Math.round(performance.now() - t0) };
        setProgress((p) => ({ ...p, target: 1 }));
        setJobDone(true);
      })
      .catch((e) => {
        if (id !== runId.current || e.message === "cancelled") return;
        setError(`Segmentation failed: ${e.message}`);
        setPhase("idle");
      });
  };

  const onSegment = () => { const s = newSeed(); setSeed(s); start(s); };
  const onReroll = () => onSegment();
  const onCancel = () => { runId.current++; cancelSegmentation(); setPhase("idle"); };

  const onFilled = useCallback(() => {
    setResult(pending.current);
    setPhase("done");
  }, []);

  useEffect(() => {
    if (phase === "done") resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [phase]);

  return (
    <div className="wrap">
      <section className="hero">
        <h1>
          Turn any photo into <span className="hl">flat colour regions</span>
        </h1>
        <p>
          No labels, no neural net. A Gaussian Mixture Model learns the colours in your picture with the EM algorithm
          and paints every pixel with its cluster. It runs entirely in your browser — nothing is uploaded.{" "}
          <Link to="/docs">See how it works →</Link>
        </p>
      </section>

      <div className="workbench">
        <InputPanel
          tab={tab}
          setTab={setTab}
          source={source}
          onFile={onFile}
          onSample={onSample}
          onCapture={onCapture}
          onClear={onClear}
          disabled={busy}
          error={error}
        />

        <aside className="card settings" aria-label="Settings">
          <span className="card-title">2 · Settings</span>
          <div>
            <label className="field" htmlFor="k">
              Regions (clusters) <span className="value">{k}</span>
            </label>
            <input id="k" type="range" min={2} max={10} value={k} disabled={busy} onChange={(e) => setK(+e.target.value)} />
          </div>
          <div>
            <label className="field" htmlFor="tex">
              Texture (LBP) weight <span className="value">{texture}%</span>
            </label>
            <input id="tex" type="range" min={0} max={200} step={25} value={texture} disabled={busy} onChange={(e) => setTexture(+e.target.value)} />
            <p style={{ fontSize: "0.78rem", margin: "4px 0 0" }}>0% = colour only · higher = group by surface pattern too</p>
          </div>
          <div>
            <label className="field" htmlFor="res">Working resolution</label>
            <select id="res" value={maxSide} disabled={busy} onChange={(e) => { resetOutput(); setMaxSide(+e.target.value); }} style={{ width: "100%" }}>
              {RESOLUTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="seedline">
            <span><b>Seed</b> <code>{seed}</code></span>
          </div>
          <button className="btn primary" style={{ width: "100%", justifyContent: "center" }} disabled={!source || busy} onClick={onSegment}>
            {busy ? "Working…" : "Segment"}
          </button>
          {!source && <p style={{ fontSize: "0.82rem", margin: 0 }}>Add an image first.</p>}
        </aside>
      </div>

      {busy && (
        <Loader
          target={progress.target}
          stage={progress.stage}
          detail={progress.detail}
          done={jobDone}
          onFilled={onFilled}
          onCancel={onCancel}
        />
      )}

      <div ref={resultRef}>
        {result && source && phase === "done" && (
          <ResultView source={source} result={result} onNewSeed={onReroll} busy={busy} />
        )}
      </div>
    </div>
  );
}
