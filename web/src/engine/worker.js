import { segment } from "./segment.js";

// Messages in:  { id, image: {data: ArrayBuffer, width, height}, options }
// Messages out: { id, type: "progress", stage, progress, detail }
//               { id, type: "done", result }   (buffers transferred)
//               { id, type: "error", message }
self.onmessage = (e) => {
  const { id, image, options } = e.data;
  try {
    const img = {
      width: image.width,
      height: image.height,
      data: new Uint8ClampedArray(image.data),
    };
    let last = 0;
    const result = segment(img, options, ({ stage, progress, detail }) => {
      const now = performance.now();
      if (now - last < 30 && progress < 1) return; // throttle UI messages
      last = now;
      self.postMessage({ id, type: "progress", stage, progress, detail });
    });
    self.postMessage({ id, type: "done", result }, [
      result.segmented.buffer,
      result.labels.buffer,
    ]);
  } catch (err) {
    self.postMessage({ id, type: "error", message: String(err && err.message ? err.message : err) });
  }
};
