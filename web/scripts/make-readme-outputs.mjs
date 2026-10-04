// Regenerates output/<name>_output.png (the README table) from input/* with the web engine.
// Usage: node scripts/make-readme-outputs.mjs   (fixed seed, so reruns give identical images)
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { segment } from "../src/engine/segment.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const inputDir = path.resolve(here, "../../input");
const outDir = path.resolve(here, "../../output");
const MAX_SIDE = 1000;
fs.mkdirSync(outDir, { recursive: true });

for (const file of fs.readdirSync(inputDir)) {
  const name = path.parse(file).name;
  const { data, info } = await sharp(path.join(inputDir, file))
    .rotate()
    .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const res = segment(
    { data: new Uint8ClampedArray(data), width: info.width, height: info.height },
    { k: 7, seed: 2024, texture: 0.25 }
  );
  const target = path.join(outDir, `${name}_output.png`);
  await sharp(Buffer.from(res.segmented.buffer), { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toFile(target);
  console.log(`${name}: ${info.width}x${info.height} -> ${path.relative(process.cwd(), target)}`);
}
