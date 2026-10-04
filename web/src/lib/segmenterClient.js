// Thin promise wrapper around the segmentation Web Worker.
let worker = null;
let nextId = 1;
let active = null; // { id, reject }

function getWorker() {
  if (!worker) worker = new Worker(new URL("../engine/worker.js", import.meta.url), { type: "module" });
  return worker;
}

/** Abort the running job (terminates the worker; a fresh one is created on demand). */
export function cancelSegmentation() {
  if (worker) { worker.terminate(); worker = null; }
  if (active) { active.reject(new Error("cancelled")); active = null; }
}

/**
 * @param {ImageData} imageData
 * @param {{k:number, seed:number}} options
 * @param {(p:{stage:string, progress:number, detail?:object})=>void} onProgress
 */
export function runSegmentation(imageData, options, onProgress) {
  cancelSegmentation();
  const w = getWorker();
  const id = nextId++;
  // copy so the source ImageData stays usable for the side-by-side view and re-runs
  const copy = imageData.data.slice().buffer;
  return new Promise((resolve, reject) => {
    active = { id, reject };
    w.onmessage = (e) => {
      const msg = e.data;
      if (msg.id !== id) return;
      if (msg.type === "progress") onProgress?.(msg);
      else if (msg.type === "done") { active = null; resolve(msg.result); }
      else if (msg.type === "error") { active = null; reject(new Error(msg.message)); }
    };
    w.onerror = (e) => { active = null; reject(new Error(e.message || "Worker crashed")); };
    w.postMessage(
      { id, image: { data: copy, width: imageData.width, height: imageData.height }, options },
      [copy]
    );
  });
}
