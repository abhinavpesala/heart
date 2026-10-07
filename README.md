# Cardiac Risk Engine: CAD + LAD / LCX / RCA stenosis (Track A)

Predicts overall coronary artery disease (CAD) and stenosis of the three main coronary arteries from the
Z-Alizadeh Sani clinical dataset (303 patients) and paints the predicted probabilities onto an interactive 3D heart.

> **Decision-support / educational use only. Not a substitute for formal diagnostic imaging or clinical judgement.**

## What it does
| Part | Implementation |
|---|---|
| Models | 4 calibrated Random Forests (CAD, LAD, LCX, RCA). `Cath`, `LAD`, `LCX`, `RCA` are **never** inputs (no target leakage). |
| Validation | 3x repeated stratified 5-fold CV, out-of-fold metrics: accuracy, precision, recall, F1, ROC-AUC, PR-AUC, Brier. |
| Uncertainty | Platt calibration + one confidence threshold (defer to a cardiologist) + split-conformal prediction sets. |
| Explanations | Per-patient Shapley values (permutation sampling, real-patient baseline) in probability points, per target. |
| API | FastAPI: `/health`, `/schema`, `/metrics`, `/predict`. The form is generated from `/schema`, so new features need no UI change. |
| 3D | React Three Fiber: LAD/LCX/RCA tubes coloured by probability, click to inspect, rotate and zoom. |

**Honest scope note.** The dataset has no raw ECG signals or echo videos, only ECG- and echo-*derived* columns, so no ECG/echo
foundation-model embeddings are used. Region-RWMA is a clinical feature, not an anatomical lesion map. LCX/RCA models are
weaker than CAD/LAD (see `/metrics`).

## Run locally
```bash
pip install -r requirements.txt
python -m backend.train                      # ~20 s -> backend/models/
uvicorn backend.main:app --reload            # http://localhost:8000/docs

cd frontend && cp .env.example .env.local && npm install && npm run dev   # http://localhost:5173
```

## Deploy
1. **Push to GitHub** (include `dataset.csv`; `backend/models/` is rebuilt on the server).
2. **Render**: New > Blueprint > select the repo (reads `render.yaml`). Build installs requirements and trains; start runs uvicorn on `$PORT`.
   Note the URL, e.g. `https://cardiac-risk-api.onrender.com`; check `/health`.
3. **Vercel**: New Project > import repo > **Root Directory = `frontend`** (Vite is auto-detected) > Environment Variable
   `VITE_API_URL` = the Render URL (no trailing slash) > Deploy.
4. **Back on Render**: set `CORS_ORIGINS` to your Vercel URL (e.g. `https://your-app.vercel.app`) and redeploy.
   Changing `VITE_API_URL` later requires a Vercel **redeploy** (it is baked in at build time).

Free-tier note: Render sleeps after ~15 min idle, so the first request can take up to a minute (the UI shows a connecting notice).

## Layout
```
dataset.csv   requirements.txt   render.yaml
backend/  common.py (shared preprocessing + field metadata)  train.py  service.py  main.py
frontend/ package.json  vite.config.js  index.html  src/{main.jsx, App.jsx, App.css, index.css, components/CardiacMesh.jsx}
```
