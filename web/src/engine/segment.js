import { preprocess } from "./preprocess.js";
import { fitGmm, predict } from "./gmm.js";
import { makeRng } from "./rng.js";
import { PALETTE, hexToRgb } from "./palette.js";

/**
 * Unsupervised segmentation: fit a GMM on a random pixel sample, label every pixel,
 * paint each cluster with a flat palette colour.
 *
 * @param {{data: Uint8ClampedArray|Uint8Array, width: number, height: number}} image RGBA
 * @param {{k?:number, sampleSize?:number, seed?:number, palette?:string[], texture?:number}} options
 *        texture: weight of the LBP texture feature (0 = colour only, default 1)
 * @param {(p:{stage:string, progress:number, detail?:object})=>void} [onProgress]
 *        progress is 0..1 overall; stage is one of
 *        "preprocess" | "sample" | "fit" | "label" | "paint".
 */
export function segment(image, options = {}, onProgress = () => {}) {
  const { width: w, height: h, data } = image;
  const { k = 7, sampleSize = 1000, palette = PALETTE, texture = 1 } = options;
  const rng = makeRng(options.seed);
  const n = w * h;
  const report = (stage, progress, detail) => onProgress({ stage, progress, detail });

  report("preprocess", 0);
  const { features, dim, lightness } = preprocess(data, w, h, texture);
  report("preprocess", 0.2);

  // random subsample (partial Fisher-Yates on indices)
  const m = Math.min(sampleSize, n);
  const idx = new Uint32Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  const train = new Float64Array(m * dim);
  for (let i = 0; i < m; i++) {
    const j = i + Math.floor(rng() * (n - i));
    const t = idx[i]; idx[i] = idx[j]; idx[j] = t;
    const p = idx[i];
    for (let d = 0; d < dim; d++) train[i * dim + d] = features[p * dim + d];
  }
  report("sample", 0.25);

  // Fit; if a component collapses, retry with stronger regularisation.
  let model;
  let reg = 1e-6;
  for (let attempt = 0; ; attempt++) {
    try {
      model = fitGmm(train, m, dim, k, rng, {
        regCovar: reg,
        onIteration: ({ iter, maxIter, lowerBound }) =>
          // EM usually converges long before maxIter, so ease towards 0.6 asymptotically
          report("fit", 0.25 + 0.35 * (1 - Math.exp(-iter / 15)), { iter, maxIter, lowerBound }),
      });
      break;
    } catch (e) {
      if (attempt >= 4) throw e;
      reg *= 10;
    }
  }
  report("fit", 0.6, { iter: model.iterations, converged: model.converged });

  const labels = predict(features, n, model, (done, total) =>
    report("label", 0.6 + 0.3 * (done / total))
  );

  // order clusters by mean lightness so colours are stable between runs
  const sumL = new Float64Array(k);
  const count = new Uint32Array(k);
  for (let i = 0; i < n; i++) { sumL[labels[i]] += lightness[i]; count[labels[i]]++; }
  const order = Array.from({ length: k }, (_, c) => c)
    .sort((a, b) => (count[a] ? sumL[a] / count[a] : 1e9) - (count[b] ? sumL[b] / count[b] : 1e9));
  const rank = new Uint8Array(k);
  order.forEach((c, r) => { rank[c] = r; });

  report("paint", 0.9);
  const rgb = palette.map(hexToRgb);
  const out = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    const c = rgb[rank[labels[i]] % rgb.length];
    out[i * 4] = c[0]; out[i * 4 + 1] = c[1]; out[i * 4 + 2] = c[2]; out[i * 4 + 3] = 255;
  }
  const clusters = order.map((c, r) => ({
    color: palette[r % palette.length],
    fraction: count[c] / n,
  }));
  report("paint", 1);

  return {
    width: w, height: h,
    segmented: out,
    labels: Uint8Array.from(labels, (c) => rank[c]),
    clusters,
    seed: rng.seed,
    iterations: model.iterations,
    converged: model.converged,
    lowerBound: model.lowerBound,
  };
}
