# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- Run end to end: `./run.sh` (bash). It creates `venv/`, installs `requirements.txt` (skipped if its hash is unchanged), then runs `python src/main.py "$filename"`. The input image is hardcoded as `filename` at the top of `run.sh`; edit it to change images.
- Windows: `.\run.bat [image]` (the `.\` is required in PowerShell) does the same as `run.sh` using `venv\Scripts` (default image `input\eiffel.jpeg`).
- Run directly: `python src/main.py input/<image>`. `main.py` does `from utils import *`, so it must be run as a script (the `src/` directory has to be on `sys.path`).
- There are no tests, linter or build step.

## Architecture

Unsupervised image segmentation: cluster every pixel with a Gaussian mixture, then paint each cluster a fixed colour. The code is three files in `src/`:

- `main.py` is a script (no functions). The flow is `createData` → `train` → `test` → `segmented`. It saves the first model's segmentation, `seg1`, to `output/16.png`.
- `utils.py` holds the pipeline functions.
  - `createData`: Gaussian blur, then BGR→LAB plus LBP texture of the grey image, stacked into `(w*h, 4)` and L2-normalised.
  - `train`: fits a `GaussianMixture` (the local one) and a sklearn `BayesianGaussianMixture` (Dirichlet-process prior) with 7 components on 1000 randomly shuffled pixels.
  - `test`: predicts labels for all pixels.
  - `segmented`: recolours pixels using `_color_codes`.
- `gmm.py` is a vendored copy of scikit-learn's `GaussianMixture`, subclassing the private `sklearn.mixture._base.BaseMixture`. It depends on sklearn internals, so it is sensitive to the pinned `scikit-learn==1.5.0`.

## Quirks to know before changing things

- `createData` builds 4-D features (L, a, b, LBP texture) and L2-normalises them. The LBP codes (0..25) are stretched by `255/(numPoints+1)` so they carry weight comparable to the LAB channels. Originally the stacked data was overwritten by `normalize(imtest)`, so texture was silently dropped; that is fixed, and `web/` mirrors it.
- In `train`, `return` is inside the `for` loop, so it runs one iteration, not `num_patches`. `warm_start` therefore has no effect.
- `segmented` modifies `img_src` in place. It loops over labels `1..num_comp-1`, so label 0 is left as the original pixels. Each pixel is written in a Python loop, which is slow.
- `w, h, d = img.shape` names rows as `w` and columns as `h`, and the unravel and reshape calls are consistent with that. Keep that order when touching shapes.
- `utils.py` imports `scipy`, which is not listed in `requirements.txt`. It arrives only as a dependency of scikit-learn.
- `output/` holds the README's example results. `main.py` writes `output/16.png`, not `<name>_output.png`.

## Web app (`web/`)

A browser port of the pipeline (React + Vite, no backend), meant for static hosting on Vercel (`web/vercel.json`).

- `cd web && npm install`, then `npm run dev` (dev server), `npm run build` (output in `dist/`), `npm run test:engine` (runs the engine in Node on `../input/*`, writes PNGs to `.test-out/`).
- `python scripts/compare_features.py .test-out` checks the JS preprocessing (blur, LAB, LBP, normalisation) against OpenCV/scikit-image and the fit quality against scikit-learn (interior LBP agrees on about 97% of pixels; the rest is ±1 rounding in the blur/grey conversion). Run `test:engine` first.
- `src/engine/` is the pure-JS port of `src/utils.py` + `src/gmm.py` and has no DOM dependencies. `segment.js` is the entry point and `worker.js` wraps it for the browser. It mirrors the Python pipeline (blur, LAB, LBP texture, normalise, GMM). Differences: image edges are replicated for LBP (skimage pads with 0), and the texture weight is a UI setting (default 0.5; Python is fixed at 1.0).
- `src/lib/segmenterClient.js` talks to the worker, and `src/lib/imageIO.js` handles decode/downscale/export. `src/docs/` holds the interactive docs pieces. The EM demo is its own 2-D implementation.
- The design is neo-brutalist (`src/styles.css`): flat colours, 3px borders, hard shadows. Hover only changes colour and `:active` presses the element. Don't add glows, gradients or hover lift.
