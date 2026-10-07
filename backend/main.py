"""FastAPI app.  Local:  uvicorn backend.main:app --reload     Render: see render.yaml"""
import os
from typing import Any, Dict
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from backend import service

app = FastAPI(title="Cardiac Risk API", version="2.0.0",
              description="Decision-support / educational use only. Not a diagnostic device.")

# Set CORS_ORIGINS on Render to your Vercel URL(s), comma separated. '*' is only for first tests.
origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",") if o.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["*"], allow_headers=["*"])

service.load()      # fail fast at start-up with a clear message if models were not trained

class PredictRequest(BaseModel):
    features: Dict[str, Any] = Field(default_factory=dict,
        description="Any subset of the schema fields; missing ones default to the training median.")

@app.get("/")
def root():
    return {"service": "cardiac-risk-api", "docs": "/docs", "health": "/health"}

@app.get("/health")
def health():
    return {"status": "ok", "models_loaded": True, "meta": service.bundle()["meta"]}

@app.get("/schema")
def schema():
    return service.schema()

@app.get("/metrics")
def metrics():
    return service.metrics()

@app.post("/predict")
def predict(req: PredictRequest):
    try:
        return service.predict(req.features)
    except Exception as e:                       # return a readable 400 rather than a bare 500
        raise HTTPException(status_code=400, detail=f"Prediction error: {e}")
