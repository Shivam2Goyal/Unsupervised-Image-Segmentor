// Plain k-means (k-means++ seeding + Lloyd) on D-dimensional points. Used to initialise the GMM,
// matching sklearn's init_params="kmeans".

function d2(X, i, C, c, D) {
  let s = 0;
  for (let j = 0; j < D; j++) {
    const d = X[i * D + j] - C[c * D + j];
    s += d * d;
  }
  return s;
}

export function kmeans(X, m, k, D, rng, { maxIter = 300, tol = 1e-8 } = {}) {
  const C = new Float64Array(k * D);
  // k-means++ seeding
  const first = Math.floor(rng() * m);
  C.set(X.subarray(first * D, first * D + D), 0);
  const dist = new Float64Array(m).fill(Infinity);
  for (let c = 1; c < k; c++) {
    let total = 0;
    for (let i = 0; i < m; i++) {
      const d = d2(X, i, C, c - 1, D);
      if (d < dist[i]) dist[i] = d;
      total += dist[i];
    }
    let pick = m - 1;
    if (total > 0) {
      let r = rng() * total;
      for (let i = 0; i < m; i++) {
        r -= dist[i];
        if (r <= 0) { pick = i; break; }
      }
    } else {
      pick = Math.floor(rng() * m);
    }
    C.set(X.subarray(pick * D, pick * D + D), c * D);
  }

  const labels = new Int32Array(m);
  const sums = new Float64Array(k * D);
  const counts = new Int32Array(k);
  for (let iter = 0; iter < maxIter; iter++) {
    sums.fill(0); counts.fill(0);
    for (let i = 0; i < m; i++) {
      let best = 0, bd = Infinity;
      for (let c = 0; c < k; c++) {
        const d = d2(X, i, C, c, D);
        if (d < bd) { bd = d; best = c; }
      }
      labels[i] = best;
      counts[best]++;
      for (let j = 0; j < D; j++) sums[best * D + j] += X[i * D + j];
    }
    let shift = 0;
    for (let c = 0; c < k; c++) {
      if (counts[c] === 0) {
        // empty cluster: move it onto the point farthest from its centre
        let far = 0, fd = -1;
        for (let i = 0; i < m; i++) {
          const d = d2(X, i, C, labels[i], D);
          if (d > fd) { fd = d; far = i; }
        }
        for (let j = 0; j < D; j++) C[c * D + j] = X[far * D + j];
        shift = Infinity;
        continue;
      }
      for (let j = 0; j < D; j++) {
        const v = sums[c * D + j] / counts[c];
        shift += (v - C[c * D + j]) ** 2;
        C[c * D + j] = v;
      }
    }
    if (shift <= tol) break;
  }
  return { labels, centers: C };
}
