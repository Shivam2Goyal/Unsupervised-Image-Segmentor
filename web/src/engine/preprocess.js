// Mirrors createData() in src/utils.py:
//   GaussianBlur(5x5) -> BGR2LAB (OpenCV 8-bit scaling)
//   + Local Binary Pattern texture of the grey image (P=24, R=8, "uniform")
//   -> per pixel (L, a, b, texture), scaled to a common 0-255 range, then L2-normalised.

const KSIZE = 5;
const SIGMA = 0.3 * ((KSIZE - 1) * 0.5 - 1) + 0.8; // OpenCV's default sigma for ksize 5

function gaussianKernel() {
  const k = new Float64Array(KSIZE);
  const r = (KSIZE - 1) / 2;
  let sum = 0;
  for (let i = 0; i < KSIZE; i++) {
    const x = i - r;
    k[i] = Math.exp(-(x * x) / (2 * SIGMA * SIGMA));
    sum += k[i];
  }
  for (let i = 0; i < KSIZE; i++) k[i] /= sum;
  return k;
}

// BORDER_REFLECT_101: -1 -> 1, n -> n-2
function reflect101(i, n) {
  if (n === 1) return 0;
  if (i < 0) i = -i;
  if (i >= n) i = 2 * (n - 1) - i;
  return i;
}

/** Separable 5x5 Gaussian blur on interleaved RGBA; alpha is ignored. Returns RGB Uint8Array. */
export function blurRgb(rgba, w, h) {
  const k = gaussianKernel();
  const r = (KSIZE - 1) / 2;
  const tmp = new Float32Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r0 = 0, g0 = 0, b0 = 0;
      for (let i = 0; i < KSIZE; i++) {
        const xx = reflect101(x + i - r, w);
        const p = (y * w + xx) * 4;
        r0 += k[i] * rgba[p];
        g0 += k[i] * rgba[p + 1];
        b0 += k[i] * rgba[p + 2];
      }
      const o = (y * w + x) * 3;
      tmp[o] = r0; tmp[o + 1] = g0; tmp[o + 2] = b0;
    }
  }
  const out = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r0 = 0, g0 = 0, b0 = 0;
      for (let i = 0; i < KSIZE; i++) {
        const yy = reflect101(y + i - r, h);
        const p = (yy * w + x) * 3;
        r0 += k[i] * tmp[p];
        g0 += k[i] * tmp[p + 1];
        b0 += k[i] * tmp[p + 2];
      }
      const o = (y * w + x) * 3;
      out[o] = Math.round(r0);
      out[o + 1] = Math.round(g0);
      out[o + 2] = Math.round(b0);
    }
  }
  return out;
}

const GAMMA = new Float64Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  GAMMA[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
const XN = 0.950456, ZN = 1.088754;
const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);

/** sRGB (0-255) -> OpenCV 8-bit LAB triple. */
export function rgbToLab8(r, g, b, out, o) {
  const R = GAMMA[r], G = GAMMA[g], B = GAMMA[b];
  const X = (0.412453 * R + 0.35758 * G + 0.180423 * B) / XN;
  const Y = 0.212671 * R + 0.71516 * G + 0.072169 * B;
  const Z = (0.019334 * R + 0.119193 * G + 0.950227 * B) / ZN;
  const fx = f(X), fy = f(Y), fz = f(Z);
  const L = Y > 0.008856 ? 116 * fy - 16 : 903.3 * Y;
  const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
  out[o] = clamp((L * 255) / 100);
  out[o + 1] = clamp(500 * (fx - fy) + 128);
  out[o + 2] = clamp(200 * (fy - fz) + 128);
}

export const LBP_POINTS = 24;
export const LBP_RADIUS = 8;
const LBP_MAX = LBP_POINTS + 1; // "uniform" codes run 0..P+1; P+1 = non-uniform pattern

function popcount(v) {
  v -= (v >>> 1) & 0x55555555;
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  return (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

/**
 * Rotation-invariant uniform LBP (skimage.feature.local_binary_pattern, method="uniform"):
 * compare each pixel with P bilinearly-sampled neighbours on a circle of radius R. A pattern
 * with at most 2 circular 0/1 transitions is "uniform" and is coded as its number of 1s
 * (0..P); every other pattern is coded P+1. Image edges are replicated (skimage pads with 0,
 * which draws a dark frame around the picture).
 * @param {Uint8Array} gray w*h
 */
export function lbpUniform(gray, w, h, P = LBP_POINTS, R = LBP_RADIUS) {
  const pad = R + 1;
  const pw = w + 2 * pad;
  const ph = h + 2 * pad;
  const g = new Float32Array(pw * ph);
  for (let y = 0; y < ph; y++) {
    const sy = Math.min(h - 1, Math.max(0, y - pad));
    for (let x = 0; x < pw; x++) {
      g[y * pw + x] = gray[sy * w + Math.min(w - 1, Math.max(0, x - pad))];
    }
  }
  // neighbour offsets: integer part + fractional part (fractions are the same for every pixel)
  const oy = new Int32Array(P), ox = new Int32Array(P);
  const wa = new Float64Array(P), wb = new Float64Array(P), wc = new Float64Array(P), wd = new Float64Array(P);
  for (let p = 0; p < P; p++) {
    const th = (2 * Math.PI * p) / P;
    // skimage rounds the sampling offsets to 5 decimals
    const rp = Math.round(-R * Math.sin(th) * 1e5) / 1e5;
    const cp = Math.round(R * Math.cos(th) * 1e5) / 1e5;
    const fy = Math.floor(rp), fx = Math.floor(cp);
    const ty = rp - fy, tx = cp - fx;
    oy[p] = fy; ox[p] = fx;
    wa[p] = (1 - ty) * (1 - tx); wb[p] = (1 - ty) * tx; wc[p] = ty * (1 - tx); wd[p] = ty * tx;
  }
  const mask = (1 << P) - 1;
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const base = (y + pad) * pw + (x + pad);
      const centre = g[base];
      let pat = 0;
      for (let p = 0; p < P; p++) {
        const q = base + oy[p] * pw + ox[p];
        const v = wa[p] * g[q] + wb[p] * g[q + 1] + wc[p] * g[q + pw] + wd[p] * g[q + pw + 1];
        if (v >= centre - 1e-6) pat |= 1 << p; // tolerance: flat regions must count as ties
      }
      const rot = ((pat << 1) | (pat >>> (P - 1))) & mask;
      out[y * w + x] = popcount((pat ^ rot) >>> 0) <= 2 ? popcount(pat >>> 0) : P + 1;
    }
  }
  return out;
}

/**
 * @param {Uint8ClampedArray|Uint8Array} rgba interleaved RGBA pixels
 * @param {number} textureWeight 0 = colour only (3-D features); 1 = texture counts as much as one
 *        colour channel; >1 emphasises texture.
 * @returns {{features: Float64Array, dim: number, lightness: Uint8Array, lbp: Uint8Array}}
 *          n*dim unit-normalised feature vectors (L, a, b[, texture]), the raw 8-bit L channel
 *          (used later to order clusters) and the raw LBP codes (0..P+1).
 */
export function preprocess(rgba, w, h, textureWeight = 1) {
  const rgb = blurRgb(rgba, w, h);
  const n = w * h;
  const lab = new Uint8Array(n * 3);
  const gray = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    rgbToLab8(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2], lab, i * 3);
    gray[i] = Math.round(0.299 * rgb[i * 3] + 0.587 * rgb[i * 3 + 1] + 0.114 * rgb[i * 3 + 2]);
  }
  const lbp = lbpUniform(gray, w, h);
  const dim = textureWeight > 0 ? 4 : 3;
  const tScale = (255 / LBP_MAX) * textureWeight; // bring texture to the 0-255 range of L, a, b
  const features = new Float64Array(n * dim);
  const lightness = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const L = lab[i * 3], A = lab[i * 3 + 1], B = lab[i * 3 + 2];
    const T = dim === 4 ? lbp[i] * tScale : 0;
    const norm = Math.hypot(L, A, B, T) || 1;
    features[i * dim] = L / norm;
    features[i * dim + 1] = A / norm;
    features[i * dim + 2] = B / norm;
    if (dim === 4) features[i * dim + 3] = T / norm;
    lightness[i] = L;
  }
  return { features, dim, lightness, lbp };
}
