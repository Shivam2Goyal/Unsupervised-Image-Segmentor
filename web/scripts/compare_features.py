"""Checks the JS preprocessing (blur, LAB, LBP texture, normalisation) against OpenCV/scikit-image,
and the JS GMM fit quality against scikit-learn.
Run after `node scripts/test-engine.mjs .test-out`: python scripts/compare_features.py .test-out
"""
import json, sys, warnings
import numpy as np, cv2
warnings.filterwarnings("ignore")
from sklearn.mixture import GaussianMixture
from sklearn import preprocessing
from skimage import feature

d = sys.argv[1] if len(sys.argv) > 1 else ".test-out"
h, w = json.load(open(f"{d}/cat_shape.json"))
rgba = np.fromfile(f"{d}/cat_rgb.raw", np.uint8).reshape(h, w, 4)
js = np.fromfile(f"{d}/cat_features.f64", np.float64).reshape(-1, 4)
js_lbp = np.fromfile(f"{d}/cat_lbp.u8", np.uint8).reshape(h, w)

bgr = cv2.cvtColor(rgba[:, :, :3], cv2.COLOR_RGB2BGR)
blur = cv2.GaussianBlur(bgr, (5, 5), 0)
lab = cv2.cvtColor(blur, cv2.COLOR_BGR2LAB).reshape(-1, 3)
gray = cv2.cvtColor(blur, cv2.COLOR_BGR2GRAY)
lbp = feature.local_binary_pattern(gray, 24, 8, method="uniform")

# LBP: skimage pads with 0 at the borders, the JS port replicates edges -> compare the interior
inner = (slice(9, h - 9), slice(9, w - 9))
agree = (lbp[inner] == js_lbp[inner]).mean()
print(f"LBP interior: {agree * 100:.2f}% identical, max |diff| {np.abs(lbp[inner] - js_lbp[inner]).max():.0f}")

ref = preprocessing.normalize(np.column_stack((lab, lbp.reshape(-1, 1) * (255.0 / 25))), norm="l2")
diff = np.abs(ref.reshape(h, w, 4)[inner] - js.reshape(h, w, 4)[inner])
print(f"features (interior): max abs diff {diff.max():.5f}, mean {diff.mean():.6f}")

rng = np.random.RandomState(0)
for seed in range(3):
    idx = rng.permutation(len(ref))[:1000]
    gm = GaussianMixture(7, covariance_type="full", tol=1e-3, reg_covar=1e-6, max_iter=1200, random_state=seed).fit(ref[idx])
    print(f"sklearn seed {seed}: mean log-lik on train {gm.score(ref[idx]):.3f}, on all pixels {gm.score(ref):.3f}, iters {gm.n_iter_}")
