import { useEffect, useRef, useState } from "react";

const STAGES = [
  ["preprocess", "Blur + LAB"],
  ["sample", "Sample pixels"],
  ["fit", "Fit GMM (EM)"],
  ["label", "Label pixels"],
  ["paint", "Paint"],
];
const SEGMENTS = 24;
const MIN_MS = 1000; // keep the loader on screen long enough to read, even for tiny images

/**
 * Block-style progress bar. `target` (0..1) is the real progress reported by the worker;
 * the bar eases towards it every frame so it never jumps. When the job is done the parent
 * sets target = 1 and `onFilled` fires once the bar has visibly filled.
 */
export default function Loader({ target, stage, detail, done, onFilled, onCancel }) {
  const [shown, setShown] = useState(0);
  const start = useRef(performance.now());
  const shownRef = useRef(0);
  const fired = useRef(false);
  const targetRef = useRef(target);
  targetRef.current = target;

  useEffect(() => {
    let raf;
    const tick = () => {
      const t = targetRef.current;
      const cur = shownRef.current;
      if (cur < t) {
        const next = Math.min(t, cur + Math.max(0.004, Math.min((t - cur) * 0.12, 0.02)));
        shownRef.current = next;
        setShown(next);
      } else if (cur < 0.97 && !done) {
        // creep so the bar never looks frozen while the worker is busy
        shownRef.current = cur + 0.0008;
        setShown(shownRef.current);
      }
      if (done && shownRef.current >= 0.999 && performance.now() - start.current >= MIN_MS && !fired.current) {
        fired.current = true;
        onFilled?.();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [done, onFilled]);

  const on = Math.round(shown * SEGMENTS);
  const stageIndex = Math.max(0, STAGES.findIndex(([id]) => id === stage));
  const pct = Math.min(100, Math.round(shown * 100));

  return (
    <div className="loader" role="status" aria-live="polite">
      <h2>Segmenting…</h2>
      <div className="segbar" aria-hidden="true">
        {Array.from({ length: SEGMENTS }, (_, i) => <i key={i} className={i < on ? "on" : ""} />)}
      </div>
      <div className="meta">
        <span>
          {done ? "Done" : STAGES[stageIndex][1]}
          {!done && stage === "fit" && detail?.iter ? ` · iteration ${detail.iter}` : ""}
        </span>
        <span>{pct}%</span>
      </div>
      <ol className="stages">
        {STAGES.map(([id, label], i) => (
          <li key={id} className={done || i < stageIndex ? "done" : i === stageIndex ? "now" : ""}>
            {done || i < stageIndex ? "✓ " : ""}{label}
          </li>
        ))}
      </ol>
      {!done && onCancel && (
        <div className="row gap-top">
          <button className="btn small" onClick={onCancel}>Cancel</button>
        </div>
      )}
    </div>
  );
}
