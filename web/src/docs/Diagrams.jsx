const COLORS = ["#FFD23F", "#FF9EC4", "#5BD08A", "#4FA3E0", "#FF5C39", "#FFD23F"];

export function Flowchart({ steps }) {
  return (
    <div className="flow" role="list">
      {steps.map((s, i) => (
        <div key={s.title} role="listitem">
          <div className="flow-step">
            <div className="n" style={{ background: COLORS[i % COLORS.length] }}>{i + 1}</div>
            <div className="t">
              <b>{s.title}</b>
              <small>{s.text}</small>
            </div>
          </div>
          {i < steps.length - 1 && <div className="flow-arrow" aria-hidden="true">▼</div>}
        </div>
      ))}
    </div>
  );
}

function Box({ x, y, w, h, fill, title, lines, shadow = true }) {
  return (
    <g>
      {shadow && <rect x={x + 6} y={y + 6} width={w} height={h} fill="#111" />}
      <rect x={x} y={y} width={w} height={h} fill={fill} stroke="#111" strokeWidth="3" />
      <text x={x + 12} y={y + 26} fontSize="15" fontWeight="700" fill="#111">{title}</text>
      {lines.map((l, i) => (
        <text key={i} x={x + 12} y={y + 48 + i * 18} fontSize="12" fill="#111">{l}</text>
      ))}
    </g>
  );
}

function Arrow({ x1, y1, x2, y2, label }) {
  return (
    <g stroke="#111" strokeWidth="3" fill="none">
      <line x1={x1} y1={y1} x2={x2 - 8 * Math.sign(x2 - x1)} y2={y2} />
      <polygon
        points={`${x2},${y2} ${x2 - 14 * Math.sign(x2 - x1)},${y2 - 8} ${x2 - 14 * Math.sign(x2 - x1)},${y2 + 8}`}
        fill="#111"
      />
      {label && <text x={(x1 + x2) / 2} y={y1 - 10} textAnchor="middle" fontSize="11" fontWeight="700" fill="#111" stroke="none">{label}</text>}
    </g>
  );
}

/** Where each piece of the work runs inside the browser. */
export function Architecture() {
  return (
    <div className="arch">
      <svg viewBox="0 0 960 330" role="img" aria-label="Architecture: main thread decodes the image, a web worker runs the segmentation, main thread shows the result">
        <Box x={10} y={20} w={200} h={110} fill="#FFFFFF" title="YOUR IMAGE" lines={["file upload or", "camera frame", "(never leaves the", "device)"]} />
        <Box x={285} y={20} w={250} h={110} fill="#FFD23F" title="MAIN THREAD" lines={["decode (EXIF-aware)", "downscale to 480–1200 px", "read pixels → ImageData"]} />
        <Box x={610} y={20} w={340} h={290} fill="#FF9EC4" title="WEB WORKER  (engine/)" lines={[
          "1  blur 5×5, RGB → LAB, LBP",
          "2  normalise (L,a,b,T) vectors",
          "3  sample 1,000 pixels",
          "4  k-means seed + EM loop",
          "5  predict all pixels",
          "6  rank clusters, paint",
          "",
          "keeps the page responsive:",
          "the loader keeps animating",
        ]} />
        <Box x={285} y={190} w={250} h={120} fill="#5BD08A" title="MAIN THREAD" lines={["show original | segmented", "legend + stats", "download PNG"]} />
        <Arrow x1={210} y1={75} x2={285} y2={75} label="Blob" />
        <Arrow x1={535} y1={75} x2={610} y2={75} label="transfer" />
        <Arrow x1={610} y1={250} x2={535} y2={250} label="result" />
      </svg>
    </div>
  );
}
