import { useEffect, useRef, useState } from "react";
import { blurRgb, rgbToLab8, preprocess } from "../engine/preprocess.js";
import { segment } from "../engine/segment.js";

const IMAGES = ["cat", "eiffel", "elephant", "lemon"];
const SIZE = 360;
const TEXTURE = 0.5; // same default as the main page

const STAGES = [
  ["original", "Original", "The photo, downscaled to 360 px for this demo."],
  ["blur", "1 · Blurred", "5×5 Gaussian blur. Speckle and JPEG noise melt away, so neighbouring pixels agree more often."],
  ["L", "2 · L channel", "Lightness from the LAB colour space — how bright each pixel is."],
  ["a", "2 · a channel", "Green ↔ red axis. Mid-grey means 'no red or green tint'."],
  ["b", "2 · b channel", "Blue ↔ yellow axis. Mid-grey means 'no blue or yellow tint'."],
  ["lbp", "3 · Texture (LBP)", "Local Binary Pattern code per pixel, 0 to 25, shown as grey. Flat sky stays quiet; grass, fur and fabric light up."],
  ["unit", "4 · Normalised", "Each (L, a, b, texture) vector scaled to length 1; the colour part is drawn as RGB. Only the direction survives, so shadows and highlights of the same colour look alike."],
  ["seg", "5 · Segmented", "Pixels labelled by a 7-component GMM fitted on 1,000 random 4-D samples (texture weight 50%)."],
];

function toImageData(channel, { w, h }) {
  const out = new ImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    out.data[i * 4] = channel(i, 0);
    out.data[i * 4 + 1] = channel(i, 1);
    out.data[i * 4 + 2] = channel(i, 2);
    out.data[i * 4 + 3] = 255;
  }
  return out;
}

async function compute(name, seed) {
  const img = new Image();
  img.src = `/samples/${name}.jpg`;
  await img.decode();
  const s = Math.min(1, SIZE / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * s), h = Math.round(img.naturalHeight * s);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const orig = ctx.getImageData(0, 0, w, h);
  const dims = { w, h };

  const blurred = blurRgb(orig.data, w, h);
  const lab = new Uint8Array(w * h * 3);
  for (let i = 0; i < w * h; i++) rgbToLab8(blurred[i * 3], blurred[i * 3 + 1], blurred[i * 3 + 2], lab, i * 3);
  const { features, dim, lbp } = preprocess(orig.data, w, h, TEXTURE);
  const res = segment({ data: orig.data, width: w, height: h }, { k: 7, seed, texture: TEXTURE });

  return {
    w, h,
    original: orig,
    blur: toImageData((i, c) => blurred[i * 3 + c], dims),
    L: toImageData((i) => lab[i * 3], dims),
    a: toImageData((i) => lab[i * 3 + 1], dims),
    b: toImageData((i) => lab[i * 3 + 2], dims),
    lbp: toImageData((i) => Math.round((lbp[i] * 255) / 25), dims),
    unit: toImageData((i, c) => Math.round(features[i * dim + c] * 255), dims),
    seg: new ImageData(new Uint8ClampedArray(res.segmented), w, h),
  };
}

export default function PipelineExplorer() {
  const canvasRef = useRef(null);
  const [name, setName] = useState("cat");
  const [stage, setStage] = useState("original");
  const [seed, setSeed] = useState(7);
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    setData(null);
    setErr("");
    compute(name, seed)
      .then((d) => alive && setData(d))
      .catch(() => alive && setErr("Could not load the demo image."));
    return () => { alive = false; };
  }, [name, seed]);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || !data) return;
    cv.width = data.w;
    cv.height = data.h;
    cv.getContext("2d").putImageData(data[stage === "original" ? "original" : stage], 0, 0);
  }, [data, stage]);

  const info = STAGES.find(([id]) => id === stage);

  return (
    <div className="card explorer">
      <span className="card-title">Interactive · pipeline explorer</span>
      <div className="stage-tabs" role="group" aria-label="Image">
        {IMAGES.map((n) => (
          <button key={n} className="chip" aria-pressed={name === n} onClick={() => setName(n)}>{n}</button>
        ))}
        <button className="chip" onClick={() => setSeed((s) => s + 1)} title="Run again with a different random sample">⟳ new sample</button>
      </div>
      <div className="stage-tabs" role="group" aria-label="Stage">
        {STAGES.map(([id, label]) => (
          <button key={id} className="chip" aria-pressed={stage === id} onClick={() => setStage(id)}>{label}</button>
        ))}
      </div>
      {err && <div className="notice err">{err}</div>}
      <div style={{ minHeight: 120 }}>
        {!data && !err && <div className="notice">Computing…</div>}
        <canvas ref={canvasRef} style={{ display: data ? "block" : "none" }} aria-label={info[1]} role="img" />
      </div>
      <p style={{ marginTop: 14, marginBottom: 0 }}><b>{info[1]}.</b> {info[2]}</p>
    </div>
  );
}
