# GMM-EM Image Segmentation

This project implements image segmentation using **Gaussian Mixture Models (GMM)** and **Dirichlet Process Gaussian Mixture Models (DPGMM)** through the **Expectation-Maximization (EM)** algorithm. It combines color features and texture (via Local Binary Patterns) for unsupervised segmentation.

---

## 🔍 Overview

- Segments images based on **color (LAB space)** and **texture (LBP descriptors)**.
- Uses both **GMM** and **Bayesian GMM (DPGMM)** for clustering.
- Supports unsupervised learning without labeled data.
- Employs **scikit-learn**, **OpenCV**, and **scikit-image** for processing and modeling.
- Outputs a segmented version of the input image with distinct color-coded regions.
> Achieves up to **0.917 Jaccard similarity coefficient** on test images.

---

## 📊 Visualization

| Input Image | Output Image |
|-------------|--------------|
| ![Input](input/lemon.jpeg) | ![Output](output/lemon_output.png) |
| ![Input](input/cat.jpeg) | ![Output](output/cat_output.png) |
| ![Input](input/elephant.jpg) | ![Output](output/elephant_output.png) |
| ![Input](input/eiffel.jpeg) | ![Output](output/eiffel_output.png) |

---

## ⚙️ Setup Instructions

### 1. Clone the repository

```bash
git clone https://github.com/Shivam2Goyal/GMM-Segmentation.git
cd gmm-segmentation
```
### 2. Run the Script(run.sh)
<p>Place your image in the input directory and update the filename accordingly.</p>

```bash
chmod +x run.sh
./run.sh
```

**Windows (cmd or PowerShell):**

```bat
.\run.bat input\cat.jpeg
```
(In PowerShell the `.\` prefix is required; in cmd it is optional.)
(Requires Python 3.10+. With no argument it uses `input\eiffel.jpeg`.)
