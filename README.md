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


TERMINAL 1:
pip install -r requirements.txt

python -m backend.train     


uvicorn backend.main:app --workers 4

OUTPUT:
http://localhost:8000/docs



TERMINAL 2:
cd frontend 

cp .env.example .env.local 

npm install 

npm run dev

OUTPUT:
http://localhost:5173


dataset.csv 
requirements.txt 
render.yaml
backend/ 
     common.py (shared preprocessing + field metadata)  
     train.py  
     service.py 
     main.py
frontend/ 
     package.json  
     vite.config.js  
     index.html  
  src/
    components/
        CardiacMesh.jsx
        heartGeometry.js
     main.jsx
     App.jsx
     App.css
     index.css
