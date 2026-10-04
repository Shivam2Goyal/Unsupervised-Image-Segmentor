import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Architecture, Flowchart } from "../docs/Diagrams.jsx";
import EmDemo from "../docs/EmDemo.jsx";
import PipelineExplorer from "../docs/PipelineExplorer.jsx";

const SECTIONS = [
  ["overview", "Overview"],
  ["pipeline", "The pipeline"],
  ["blur", "1 · Blur"],
  ["lab", "2 · LAB colour"],
  ["lbp", "3 · Texture (LBP)"],
  ["normalise", "4 · Normalise"],
  ["sample", "5 · Sample"],
  ["em", "6 · GMM + EM"],
  ["paint", "7 · Label & paint"],
  ["explore", "Try each stage"],
  ["browser", "Running in the browser"],
  ["notes", "Honest notes"],
];

const FLOW = [
  { title: "Decode & downscale", text: "Image → RGBA pixels, longest side capped (480 / 800 / 1200 px) so it stays fast." },
  { title: "Gaussian blur 5×5", text: "Smooths noise so pixels of the same object look alike." },
  { title: "RGB → LAB", text: "A colour space where distance roughly matches how different two colours look." },
  { title: "Texture with LBP", text: "Compare each pixel with 24 neighbours on a circle: smooth, edgy and busy surfaces get different codes." },
  { title: "Normalise each pixel", text: "Stack (L, a, b, texture) into one 4-D vector and scale it to unit length." },
  { title: "Sample 1,000 pixels", text: "Fitting on a tiny random subset is enough — and nearly instant." },
  { title: "Fit a GMM with EM", text: "k-means seeds K Gaussians; E-step and M-step alternate until the likelihood stops improving." },
  { title: "Label every pixel", text: "Each pixel joins the Gaussian that explains it best (highest posterior)." },
  { title: "Paint", text: "Clusters are ordered by brightness and filled with flat palette colours." },
];

const NOTES = [
  {
    warn: true,
    title: "Results vary from run to run.",
    text: "The 1,000-pixel sample and the k-means starting points are random, and EM only finds a local optimum, so Re-roll can give a different split. Different is not wrong, but some runs are nicer than others.",
  },
  {
    warn: true,
    title: "Texture can speckle smooth areas.",
    text: "A clear sky or a plain wall has tiny random brightness differences, and LBP turns them into random patterns. If smooth regions look noisy, lower the texture weight; at 0% only colour is used.",
  },
  {
    title: "You choose the number of regions.",
    text: "The model can't know how many things are in your photo. Too few regions merge objects; too many split one object into patches.",
  },
  {
    title: "Very dark pixels are unreliable.",
    text: "Normalising divides by the vector length, which is tiny for near-black pixels, so noise there gets amplified. Shadows may split into more regions than you'd expect.",
  },
  {
    title: "Output is at working resolution.",
    text: "Large photos are scaled down to 480, 800 or 1200 px on the longest side before segmenting, and the downloaded image has that size, not the original.",
  },
  {
    title: "Not pixel-identical to the Python original.",
    text: "This is a JavaScript re-implementation. The random draws differ, LBP image edges are replicated rather than zero-padded, the texture weight is adjustable (default 50%), and the Python version also fits a Dirichlet-process mixture, which isn't included here.",
  },
];

function useScrollSpy(ids) {
  const [active, setActive] = useState(ids[0]);
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setActive(e.target.id)),
      { rootMargin: "-20% 0px -70% 0px" }
    );
    ids.forEach((id) => { const el = document.getElementById(id); if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, [ids]);
  return active;
}

const Num = ({ n }) => <span className="num">{n}</span>;

export default function Docs() {
  const active = useScrollSpy(SECTIONS.map(([id]) => id));
  const [notesOpen, setNotesOpen] = useState(false);

  // open the dropdown when it is linked to (contents list, shared #notes URL)
  useEffect(() => {
    const open = () => { if (window.location.hash === "#notes") setNotesOpen(true); };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, []);
  return (
    <div className="wrap docs">
      <nav className="toc" aria-label="On this page">
        <b>Contents</b>
        {SECTIONS.map(([id, label]) => (
          <a key={id} href={`#${id}`} className={active === id ? "on" : ""}>{label}</a>
        ))}
      </nav>

      <article>
        <section id="overview" className="doc-section">
          <h1>How it works</h1>
          <p>
            This tool does <b>unsupervised image segmentation</b>: it splits a picture into regions of similar colour
            without ever being told what is in it. There is no training set and no neural network — for each image it
            fits a small statistical model, a <b>Gaussian Mixture Model (GMM)</b>, to that image's own pixels, using
            each pixel's <b>colour</b> and the <b>texture</b> around it.
          </p>
          <div className="two-col">
            <div className="card flat"><h3>Input</h3><p style={{ margin: 0 }}>Any photo: upload, camera, or sample. Pick the number of regions K (default 7).</p></div>
            <div className="card flat"><h3>Output</h3><p style={{ margin: 0 }}>The same picture where every pixel is replaced by the flat colour of its cluster.</p></div>
          </div>
          <div className="callout tip">
            <b>The idea in one sentence:</b> pixels that belong to the same thing tend to form a blob in colour-and-texture
            space, so find the blobs, then colour each pixel by its blob.
          </div>
        </section>

        <section id="pipeline" className="doc-section">
          <h2>The pipeline</h2>
          <Flowchart steps={FLOW} />
        </section>

        <section id="blur" className="doc-section">
          <h2><Num n={1} />Blur</h2>
          <p>
            Photos are noisy: sensor grain, JPEG artefacts, fine texture like fur. A 5×5 Gaussian kernel averages each
            pixel with its neighbours, weighting the centre most. Without it, the model wastes clusters on speckle.
          </p>
          <div className="formula">G(x, y) ∝ exp( −(x² + y²) / 2σ² ),&nbsp; σ ≈ 1.1 for a 5×5 kernel</div>
        </section>

        <section id="lab" className="doc-section">
          <h2><Num n={2} />LAB colour</h2>
          <p>
            RGB is how screens work, not how people see. In <b>CIE LAB</b> the three numbers are{" "}
            <b>L</b> (lightness), <b>a</b> (green↔red) and <b>b</b> (blue↔yellow), and straight-line distance between two
            colours roughly matches how different they look. That makes "close in LAB" a good proxy for "same region".
          </p>
          <p>We use OpenCV's 8-bit scaling: L is stretched to 0–255, a and b are shifted by +128.</p>
        </section>

        <section id="lbp" className="doc-section">
          <h2><Num n={3} />Texture (LBP)</h2>
          <p>
            Colour alone can't tell a lawn from a smooth green wall. <b>Local Binary Patterns</b> describe the
            surface: for each pixel, look at 24 points on a circle of radius 8 around it and write down a 1 for every
            neighbour that is at least as bright as the centre.
          </p>
          <div className="formula">pattern = [ g(neighbour₀) ≥ g(centre), … , g(neighbour₂₃) ≥ g(centre) ]</div>
          <p>
            Patterns with at most two 0↔1 changes around the circle are <i>uniform</i> — flat areas, edges, corners —
            and are coded by how many 1s they contain (0 to 24). Everything messier gets one shared code, 25. The
            result is a single texture number T per pixel that is the same wherever the pattern is rotated.
          </p>
          <p>
            T runs 0–25 while L, a and b run 0–255, so it is stretched by 255/25 and multiplied by the{" "}
            <b>texture weight</b> from the settings panel (default 50%). At 0% the model sees colour only; at 200%
            texture dominates and regions follow the surface pattern.
          </p>
          <div className="callout">
            <b>Try it:</b> open the explorer below and flip to <i>Texture (LBP)</i>: smooth sky is nearly black, while
            grass and fur light up.
          </div>
        </section>

        <section id="normalise" className="doc-section">
          <h2><Num n={4} />Normalise</h2>
          <p>Every pixel's four numbers are divided by the length of the vector they form:</p>
          <div className="formula">x = (L, a, b, T) / ‖(L, a, b, T)‖</div>
          <p>
            All points now sit on the surface of a 4-D unit sphere, so only the <i>direction</i> matters.
            A sunlit and a shaded patch of the same wall land close together. The cost: very dark pixels are
            unstable, because dividing by a tiny length amplifies noise.
          </p>
        </section>

        <section id="sample" className="doc-section">
          <h2><Num n={5} />Sample 1,000 pixels</h2>
          <p>
            A 800×533 image has 426,000 pixels, but a model with 7 Gaussians in 4-D only has 7 × (4 + 10) + 6 = 104
            numbers to learn. A random 1,000-pixel sample (a partial Fisher–Yates shuffle) contains plenty of
            information and makes every EM iteration take microseconds. Every pixel is still labelled in the end.
          </p>
        </section>

        <section id="em" className="doc-section">
          <h2><Num n={6} />GMM + EM</h2>
          <p>
            A GMM says each pixel was drawn from one of K Gaussians (bell-shaped blobs), each with its own centre μₖ,
            shape Σₖ and weight πₖ:
          </p>
          <div className="formula">p(x) = Σₖ πₖ · N(x | μₖ, Σₖ)</div>
          <p>We don't know which pixel came from which blob, so we use <b>Expectation–Maximisation</b>:</p>
          <ol>
            <li>
              <b>Initialise</b> with k-means (k-means++ seeding, then Lloyd's iterations) — the same thing scikit-learn does.
            </li>
            <li>
              <b>E-step</b> — for each pixel compute the <i>responsibility</i>, the probability it belongs to each blob:
              <div className="formula">rᵢₖ = πₖ N(xᵢ | μₖ, Σₖ) / Σⱼ πⱼ N(xᵢ | μⱼ, Σⱼ)</div>
            </li>
            <li>
              <b>M-step</b> — re-estimate each blob as the responsibility-weighted average:
              <div className="formula">
                μₖ = Σᵢ rᵢₖ xᵢ / Nₖ,&nbsp; Σₖ = Σᵢ rᵢₖ (xᵢ−μₖ)(xᵢ−μₖ)ᵀ / Nₖ + 10⁻⁶·I,&nbsp; πₖ = Nₖ / N
              </div>
            </li>
            <li>
              <b>Repeat</b> until the average log-likelihood improves by less than 10⁻³ (or 1,200 iterations).
              Every step is guaranteed not to make the likelihood worse.
            </li>
          </ol>
          <p>The tiny 10⁻⁶ added to the diagonal keeps a blob from collapsing onto a single point.</p>
          <EmDemo />
        </section>

        <section id="paint" className="doc-section">
          <h2><Num n={7} />Label &amp; paint</h2>
          <p>
            With the model fixed, every pixel gets the label of its most probable component (argmax of{" "}
            <code>log πₖ + log N(x | μₖ, Σₖ)</code>). To keep colours stable between runs, clusters are sorted by their
            average lightness and given palette colours in that order — the darkest region is always the same colour.
          </p>
          <p>The legend under your result shows how much of the image each region covers.</p>
        </section>

        <section id="explore" className="doc-section">
          <h2>Try each stage</h2>
          <p>This runs the real engine on a small copy of an image, right now, in your browser:</p>
          <PipelineExplorer />
        </section>

        <section id="browser" className="doc-section">
          <h2>Running in the browser</h2>
          <p>
            The whole thing is static files: no server, no upload, no cold start. The heavy lifting happens in a Web
            Worker, so the page — including the loader animation — never freezes.
          </p>
          <Architecture />
          <p style={{ marginTop: 16 }}>
            The original project was Python (OpenCV, scikit-learn, scikit-image). This site re-implements the
            same pipeline in JavaScript; I checked the preprocessing against OpenCV and the fit quality against
            scikit-learn.
          </p>
        </section>

        <section id="notes" className="doc-section">
          <details className="dropdown" open={notesOpen} onToggle={(e) => setNotesOpen(e.currentTarget.open)}>
            <summary>
              <h2>Honest notes</h2>
              <span className="dd-hint">{notesOpen ? "Hide" : "Show"} {NOTES.length} caveats</span>
              <span className="dd-arrow" aria-hidden="true">{notesOpen ? "▲" : "▼"}</span>
            </summary>
            <div className="dropdown-body">
              {NOTES.map((n) => (
                <div key={n.title} className={`callout${n.warn ? " warn" : ""}`}>
                  <b>{n.title}</b> {n.text}
                </div>
              ))}
            </div>
          </details>
          <p style={{ marginTop: 24 }}>
            <Link className="btn primary" to="/">Try it on your image →</Link>
          </p>
        </section>
      </article>
    </div>
  );
}
