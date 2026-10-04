// Browser-side image helpers: decode -> downscale -> ImageData, and export PNG blobs.

function fitSize(w, h, maxSide) {
  const s = Math.min(1, maxSide / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * s)), height: Math.max(1, Math.round(h * s)) };
}

function drawScaled(source, sw, sh, maxSide) {
  const { width, height } = fitSize(sw, sh, maxSide);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, width, height);
  return canvas;
}

export function canvasToBlob(canvas, type = "image/png") {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode image"))), type)
  );
}

/** Build the object the app passes around for a chosen picture. */
async function fromCanvas(canvas, name) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const blob = await canvasToBlob(canvas);
  return { name, width: canvas.width, height: canvas.height, imageData, url: URL.createObjectURL(blob) };
}

/** File / Blob (upload, sample) -> prepared source, honouring EXIF orientation. */
export async function loadBlob(blob, name, maxSide) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
  } catch {
    throw new Error("That file could not be read as an image. Try a JPG, PNG or WebP.");
  }
  const canvas = drawScaled(bitmap, bitmap.width, bitmap.height, maxSide);
  bitmap.close?.();
  return fromCanvas(canvas, name);
}

export function resultToCanvas(result) {
  const canvas = document.createElement("canvas");
  canvas.width = result.width;
  canvas.height = result.height;
  canvas.getContext("2d").putImageData(new ImageData(result.segmented, result.width, result.height), 0, 0);
  return canvas;
}

/** Original | Segmented in one PNG, with a thick divider. */
export async function comparisonBlob(source, result) {
  const gap = 12;
  const canvas = document.createElement("canvas");
  canvas.width = result.width * 2 + gap;
  canvas.height = result.height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.putImageData(source.imageData, 0, 0);
  ctx.drawImage(resultToCanvas(result), result.width + gap, 0);
  return canvasToBlob(canvas);
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function baseName(name) {
  return (name || "image").replace(/\.[^.]+$/, "").replace(/[^\w-]+/g, "_") || "image";
}
