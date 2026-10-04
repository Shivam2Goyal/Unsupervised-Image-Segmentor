import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { makeRng } from "../engine/rng.js";

// A 2-D toy version of the EM loop the site runs on pixels, drawn live so you can watch
// the Gaussians crawl onto the clusters. Same maths as src/engine/gmm.js, just 2-D.

const W = 800, H = 500, SCALE = 2;
const COLORS = ["#FFD23F", "#FF5C39", "#5BD08A", "#4FA3E0", "#FF9EC4"];
const RGB = COLORS.map((c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)));

function makeData(seed) {
  const rng = makeRng(seed);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
  const blobs = [
    { c: [220, 150], s: [58, 24], a: 0.5, n: 80 },
    { c: [580, 170], s: [30, 52], a: -0.3, n: 70 },
    { c: [400, 365], s: [70, 28], a: 0.1, n: 90 },
  ];
  const pts = [];
  for (const b of blobs) {
    for (let i = 0; i < b.n; i++) {
      const x = gauss() * b.s[0], y = gauss() * b.s[1];
      const cs = Math.cos(b.a), sn = Math.sin(b.a);
      pts.push([b.c[0] + x * cs - y * sn, b.c[1] + x * sn + y * cs]);
    }
  }
  return pts;
}

function initModel(pts, K, rng) {
  const means = [];
  for (let k = 0; k < K; k++) means.push(pts[Math.floor(rng() * pts.length)].slice());
  return {
    means,
    covs: means.map(() => [3600, 0, 3600]), // xx, xy, yy
    weights: means.map(() => 1 / K),
    resp: pts.map(() => new Array(K).fill(1 / K)),
    logLik: null,
    iter: 0,
  };
}

function logGauss(p, mean, cov) {
  const [a, b, c] = cov;
  const det = a * c - b * b;
  const dx = p[0] - mean[0], dy = p[1] - mean[1];
  const q = (c * dx * dx - 2 * b * dx * dy + a * dy * dy) / det;
  return -0.5 * q - 0.5 * Math.log(det) - Math.log(2 * Math.PI);
}

function emStep(pts, m) {
  const K = m.means.length;
  const resp = [];
  let ll = 0;
  for (const p of pts) {
    const lp = m.means.map((mu, k) => Math.log(m.weights[k]) + logGauss(p, mu, m.covs[k]));
    const mx = Math.max(...lp);
    const s = lp.reduce((acc, v) => acc + Math.exp(v - mx), 0);
    const lse = mx + Math.log(s);
    ll += lse;
    resp.push(lp.map((v) => Math.exp(v - lse)));
  }
  const means = [], covs = [], weights = [];
  for (let k = 0; k < K; k++) {
    let nk = 1e-9, mx = 0, my = 0;
    pts.forEach((p, i) => { nk += resp[i][k]; mx += resp[i][k] * p[0]; my += resp[i][k] * p[1]; });
    mx /= nk; my /= nk;
    let a = 0, b = 0, c = 0;
    pts.forEach((p, i) => {
      const r = resp[i][k], dx = p[0] - mx, dy = p[1] - my;
      a += r * dx * dx; b += r * dx * dy; c += r * dy * dy;
    });
    means.push([mx, my]);
    covs.push([a / nk + 1, b / nk, c / nk + 1]); // +1 = reg_covar
    weights.push(nk / pts.length);
  }
  return { means, covs, weights, resp, logLik: ll / pts.length, iter: m.iter + 1 };
}

const lerp = (a, b, t) => a + (b - a) * t;

function lerpModel(a, b, t) {
  return {
    ...b,
    means: b.means.map((m, k) => [lerp(a.means[k][0], m[0], t), lerp(a.means[k][1], m[1], t)]),
    covs: b.covs.map((c, k) => c.map((v, j) => lerp(a.covs[k][j], v, t))),
    resp: b.resp.map((r, i) => r.map((v, k) => lerp(a.resp[i][k], v, t))),
  };
}

function draw(ctx, pts, m) {
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);
  // Gaussian ellipses (2 sigma)
  m.means.forEach((mu, k) => {
    const [a, b, c] = m.covs[k];
    const tr = a + c, det = a * c - b * b;
    const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
    const l1 = tr / 2 + disc, l2 = Math.max(tr / 2 - disc, 1e-6);
    const ang = 0.5 * Math.atan2(2 * b, a - c);
    ctx.beginPath();
    ctx.ellipse(mu[0], mu[1], 2 * Math.sqrt(l1), 2 * Math.sqrt(l2), ang, 0, Math.PI * 2);
    ctx.globalAlpha = 0.22 + 0.5 * m.weights[k];
    ctx.fillStyle = COLORS[k];
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#111";
    ctx.stroke();
  });
  // points, coloured by responsibility
  pts.forEach((p, i) => {
    let r = 0, g = 0, bl = 0;
    m.resp[i].forEach((w, k) => { r += w * RGB[k][0]; g += w * RGB[k][1]; bl += w * RGB[k][2]; });
    ctx.beginPath();
    ctx.arc(p[0], p[1], 4.2, 0, Math.PI * 2);
    ctx.fillStyle = `rgb(${r | 0},${g | 0},${bl | 0})`;
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = "#111";
    ctx.stroke();
  });
  // means
  m.means.forEach((mu, k) => {
    ctx.fillStyle = COLORS[k];
    ctx.fillRect(mu[0] - 7, mu[1] - 7, 14, 14);
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#111";
    ctx.strokeRect(mu[0] - 7, mu[1] - 7, 14, 14);
  });
}

export default function EmDemo() {
  const canvasRef = useRef(null);
  const [K, setK] = useState(3);
  const [round, setRound] = useState(1); // bump to re-initialise
  const [playing, setPlaying] = useState(false);
  const [info, setInfo] = useState({ iter: 0, logLik: null });
  const pts = useMemo(() => makeData(42), []);
  const modelRef = useRef(null);
  const animRef = useRef(0);

  const render = useCallback((m) => {
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) draw(ctx, pts, m);
  }, [pts]);

  useEffect(() => {
    modelRef.current = initModel(pts, K, makeRng(round * 7919 + K));
    setInfo({ iter: 0, logLik: null });
    setPlaying(false);
    cancelAnimationFrame(animRef.current);
    render(modelRef.current);
  }, [K, round, pts, render]);

  const step = useCallback(() => {
    const prev = modelRef.current;
    const next = emStep(pts, prev);
    modelRef.current = next;
    setInfo({ iter: next.iter, logLik: next.logLik });
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    cancelAnimationFrame(animRef.current);
    if (reduce) { render(next); return; }
    const t0 = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - t0) / 450);
      render(lerpModel(prev, next, 1 - Math.pow(1 - t, 3)));
      if (t < 1) animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
  }, [pts, render]);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(step, 650);
    return () => clearInterval(id);
  }, [playing, step]);

  useEffect(() => () => cancelAnimationFrame(animRef.current), []);

  return (
    <div className="card">
      <span className="card-title">Interactive · watch EM converge</span>
      <canvas
        ref={canvasRef}
        className="em-canvas"
        width={W * SCALE}
        height={H * SCALE}
        role="img"
        aria-label="Scatter plot of 240 points with Gaussian ellipses moving onto three clusters"
      />
      <div className="em-controls">
        <button className="btn small" onClick={step}>Step</button>
        <button className="btn small dark" onClick={() => setPlaying((p) => !p)}>{playing ? "❚❚ Pause" : "▶ Play"}</button>
        <button className="btn small" onClick={() => setRound((r) => r + 1)}>↺ New start</button>
        <span style={{ fontWeight: 700, fontSize: "0.8rem" }}>K =</span>
        {[2, 3, 4, 5].map((n) => (
          <button key={n} className="chip" aria-pressed={K === n} onClick={() => setK(n)}>{n}</button>
        ))}
        <span className="em-readout">
          iteration {info.iter}
          {info.logLik !== null && ` · avg log-likelihood ${info.logLik.toFixed(3)}`}
        </span>
      </div>
      <p style={{ marginTop: 14, marginBottom: 0, fontSize: "0.88rem" }}>
        The data secretly has three clumps. Try <b>K = 3</b> (fits cleanly), <b>K = 2</b> (two clumps get merged) and{" "}
        <b>K = 5</b> (clumps get split). Each point's colour is its mix of responsibilities; squares are the means.
      </p>
    </div>
  );
}
