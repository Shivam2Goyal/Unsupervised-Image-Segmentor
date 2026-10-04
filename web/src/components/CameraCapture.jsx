import { useEffect, useRef, useState } from "react";

const ERRORS = {
  NotAllowedError: "Camera permission was denied. Allow camera access in the address bar and try again.",
  PermissionDeniedError: "Camera permission was denied. Allow camera access in the address bar and try again.",
  NotFoundError: "No camera was found on this device.",
  NotReadableError: "The camera is busy — close other apps that are using it and try again.",
};

export default function CameraCapture({ onCapture, disabled }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [state, setState] = useState("starting"); // starting | live | error
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState("starting");
    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Camera access needs a secure (https) page and a browser that supports it.");
        setState("error");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const v = videoRef.current;
        v.srcObject = stream;
        await v.play();
        setState("live");
      } catch (e) {
        if (cancelled) return;
        setError(ERRORS[e.name] || `Could not start the camera (${e.name || "unknown error"}).`);
        setState("error");
      }
    }
    start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [attempt]);

  return (
    <div>
      {state === "error" ? (
        <>
          <div className="notice err">{error}</div>
          <button className="btn" onClick={() => setAttempt((a) => a + 1)}>Try again</button>
        </>
      ) : (
        <>
          <div className="preview">
            <span className="corner">{state === "live" ? "● LIVE" : "STARTING CAMERA…"}</span>
            <video ref={videoRef} playsInline muted />
          </div>
          <div className="row gap-top">
            <button
              className="btn dark"
              disabled={state !== "live" || disabled}
              onClick={() => onCapture(videoRef.current)}
            >
              ● Take picture
            </button>
          </div>
        </>
      )}
    </div>
  );
}
