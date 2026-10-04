// Full-covariance Gaussian mixture fitted with EM, for D-dimensional data (D = 3 or 4 here).
// Follows scikit-learn's GaussianMixture (the vendored src/gmm.py): kmeans init, Cholesky
// parametrisation, convergence on the change of mean log-likelihood.
import { kmeans } from "./kmeans.js";

const LOG_2PI = Math.log(2 * Math.PI);

function estimateParams(X, m, D, resp, K, regCovar) {
  const nk = new Float64Array(K);
  const means = new Float64Array(K * D);
  const covs = new Float64Array(K * D * D);
  const eps = 10 * 2.220446049250313e-16;
  for (let i = 0; i < m; i++) {
    for (let k = 0; k < K; k++) {
      const r = resp[i * K + k];
      nk[k] += r;
      for (let j = 0; j < D; j++) means[k * D + j] += r * X[i * D + j];
    }
  }
  for (let k = 0; k < K; k++) {
    nk[k] += eps;
    for (let j = 0; j < D; j++) means[k * D + j] /= nk[k];
  }
  const diff = new Float64Array(D);
  for (let i = 0; i < m; i++) {
    for (let k = 0; k < K; k++) {
      const r = resp[i * K + k];
      if (r === 0) continue;
      for (let j = 0; j < D; j++) diff[j] = X[i * D + j] - means[k * D + j];
      const o = k * D * D;
      for (let a = 0; a < D; a++) {
        const ra = r * diff[a];
        for (let b = 0; b <= a; b++) covs[o + a * D + b] += ra * diff[b];
      }
    }
  }
  for (let k = 0; k < K; k++) {
    const o = k * D * D;
    for (let a = 0; a < D; a++) {
      for (let b = 0; b <= a; b++) {
        const v = covs[o + a * D + b] / nk[k];
        covs[o + a * D + b] = v;
        covs[o + b * D + a] = v;
      }
      covs[o + a * D + a] += regCovar;
    }
  }
  return { nk, means, covs };
}

/**
 * Per component: invL = inverse of the lower Cholesky factor of the covariance
 * (lower-triangular, row-major D x D). Mahalanobis distance is then |invL (x - mu)|^2.
 */
function inverseCholesky(covs, K, D) {
  const out = new Float64Array(K * D * D);
  const L = new Float64Array(D * D);
  for (let k = 0; k < K; k++) {
    const c = k * D * D;
    L.fill(0);
    for (let i = 0; i < D; i++) {
      for (let j = 0; j <= i; j++) {
        let s = covs[c + i * D + j];
        for (let p = 0; p < j; p++) s -= L[i * D + p] * L[j * D + p];
        if (i === j) {
          if (!(s > 0)) throw new Error("ill-defined covariance (collapsed component)");
          L[i * D + i] = Math.sqrt(s);
        } else {
          L[i * D + j] = s / L[j * D + j];
        }
      }
    }
    // invert lower-triangular L by forward substitution, column by column
    for (let col = 0; col < D; col++) {
      for (let i = col; i < D; i++) {
        let s = i === col ? 1 : 0;
        for (let p = col; p < i; p++) s -= L[i * D + p] * out[c + p * D + col];
        out[c + i * D + col] = s / L[i * D + i];
      }
    }
  }
  return out;
}

function logDetOf(invL, K, D) {
  const ld = new Float64Array(K);
  for (let k = 0; k < K; k++) {
    let s = 0;
    for (let i = 0; i < D; i++) s += Math.log(invL[k * D * D + i * D + i]);
    ld[k] = s;
  }
  return ld;
}

/** log(w_k) + log N(x | k) for sample i, written into `out` (length K). */
function weightedLogProb(X, i, model, out) {
  const { K, D, weightsLog, means, invL, logDet } = model;
  const base = i * D;
  const norm = D * LOG_2PI;
  for (let k = 0; k < K; k++) {
    const mo = k * D;
    const lo = k * D * D;
    let sq = 0;
    for (let a = 0; a < D; a++) {
      let y = 0;
      for (let b = 0; b <= a; b++) y += invL[lo + a * D + b] * (X[base + b] - means[mo + b]);
      sq += y * y;
    }
    out[k] = -0.5 * (norm + sq) + logDet[k] + weightsLog[k];
  }
}

function buildModel(K, D, weights, means, covs, regCovar) {
  const invL = inverseCholesky(covs, K, D);
  return {
    K, D, regCovar, weights, means, covs, invL,
    logDet: logDetOf(invL, K, D),
    weightsLog: weights.map(Math.log),
  };
}

/**
 * @param {Float64Array} X m*D training samples
 * @param {object} opts
 * @param {(info:{iter:number,maxIter:number,lowerBound:number,model:object})=>void} [opts.onIteration]
 */
export function fitGmm(X, m, D, K, rng, opts = {}) {
  const { tol = 1e-3, regCovar = 1e-6, maxIter = 1200, onIteration } = opts;
  const init = kmeans(X, m, K, D, rng);
  const resp = new Float64Array(m * K);
  for (let i = 0; i < m; i++) resp[i * K + init.labels[i]] = 1;

  let { nk, means, covs } = estimateParams(X, m, D, resp, K, regCovar);
  let weights = nk.map((v) => v / m);
  let model = buildModel(K, D, weights, means, covs, regCovar);

  const lp = new Float64Array(K);
  let lower = -Infinity;
  let iterations = 0;
  let converged = false;
  for (let iter = 1; iter <= maxIter; iter++) {
    const prev = lower;
    // E-step
    let total = 0;
    for (let i = 0; i < m; i++) {
      weightedLogProb(X, i, model, lp);
      let mx = -Infinity;
      for (let k = 0; k < K; k++) if (lp[k] > mx) mx = lp[k];
      let s = 0;
      for (let k = 0; k < K; k++) s += Math.exp(lp[k] - mx);
      const lse = mx + Math.log(s);
      total += lse;
      for (let k = 0; k < K; k++) resp[i * K + k] = Math.exp(lp[k] - lse);
    }
    lower = total / m;
    // M-step
    ({ nk, means, covs } = estimateParams(X, m, D, resp, K, regCovar));
    const sumNk = nk.reduce((a, b) => a + b, 0);
    weights = nk.map((v) => v / sumNk);
    model = buildModel(K, D, weights, means, covs, regCovar);

    iterations = iter;
    if (onIteration) onIteration({ iter, maxIter, lowerBound: lower, model });
    if (Math.abs(lower - prev) < tol) { converged = true; break; }
  }
  model.iterations = iterations;
  model.converged = converged;
  model.lowerBound = lower;
  return model;
}

/** Hard assignment of every sample (argmax posterior). `onChunk(done,total)` for progress. */
export function predict(X, n, model, onChunk, chunk = 32768) {
  const labels = new Uint8Array(n);
  const lp = new Float64Array(model.K);
  for (let start = 0; start < n; start += chunk) {
    const end = Math.min(n, start + chunk);
    for (let i = start; i < end; i++) {
      weightedLogProb(X, i, model, lp);
      let best = 0;
      for (let k = 1; k < model.K; k++) if (lp[k] > lp[best]) best = k;
      labels[i] = best;
    }
    if (onChunk) onChunk(end, n);
  }
  return labels;
}
