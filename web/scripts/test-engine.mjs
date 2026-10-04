// Runs the segmentation engine in Node on the sample images and writes side-by-side PNGs.
// Usage: node scripts/test-engine.mjs [outDir] [maxSide]
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { segment } from "../src/engine/segment.js";
import { preprocess } from "../src/engine/preprocess.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const inputDir = path.resolve(here, "../../input");
const outDir = path.resolve(process.argv[2] ?? path.join(here, "../.test-out"));
const maxSide = Number(process.argv[3] ?? 640);
fs.mkdirSync(outDir, { recursive: true });

let failed = false;
for (const file of fs.readdirSync(inputDir)) {
  const name = path.parse(file).name;
  const { data, info } = await sharp(path.join(inputDir, file))
    .rotate()
    .resize({ width: maxSide, height: maxSide, fit: "inside", withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const image = { data: new Uint8ClampedArray(data), width: info.width, height: info.height };

  const t0 = performance.now();
  const stages = new Set();
  const res = segment(image, { seed: 1 }, (p) => stages.add(p.stage));
  const ms = performance.now() - t0;

  const n = info.width * info.height;
  const frac = res.clusters.map((c) => c.fraction);
  const sum = frac.reduce((a, b) => a + b, 0);
  const ok = Math.abs(sum - 1) < 1e-9 && res.labels.length === n && stages.size === 5;
  if (!ok) failed = true;
  console.log(
    `${name.padEnd(10)} ${info.width}x${info.height}  ${ms.toFixed(0)} ms  iters=${res.iterations} meanLogLik=${res.lowerBound.toFixed(3)}` +
      ` converged=${res.converged}  clusters=[${frac.map((f) => (f * 100).toFixed(1)).join(", ")}]%  ${ok ? "OK" : "FAIL"}`
  );

  // side by side: original | segmented
  const both = Buffer.alloc(n * 2 * 4);
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const src = (y * info.width + x) * 4;
      const dstL = (y * info.width * 2 + x) * 4;
      const dstR = (y * info.width * 2 + info.width + x) * 4;
      for (let c = 0; c < 4; c++) {
        both[dstL + c] = data[src + c];
        both[dstR + c] = res.segmented[src + c];
      }
    }
  }
  await sharp(both, { raw: { width: info.width * 2, height: info.height, channels: 4 } })
    .png()
    .toFile(path.join(outDir, `${name}_js.png`));

  if (name === "cat") {
    // dump features so they can be compared against OpenCV (see scripts/compare_features.py)
    const { features, lbp } = preprocess(image.data, info.width, info.height);
    fs.writeFileSync(path.join(outDir, "cat_features.f64"), Buffer.from(features.buffer));
    fs.writeFileSync(path.join(outDir, "cat_lbp.u8"), Buffer.from(lbp));
    fs.writeFileSync(path.join(outDir, "cat_rgb.raw"), data);
    fs.writeFileSync(path.join(outDir, "cat_shape.json"), JSON.stringify([info.height, info.width]));
  }
}
process.exit(failed ? 1 : 0);
