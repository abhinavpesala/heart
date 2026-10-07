"""Shared preprocessing + field metadata. Used by BOTH training and the API,
so the model never sees differently-processed data in production."""
import numpy as np
import pandas as pd

TARGETS = ["CAD", "LAD", "LCX", "RCA"]
LEAKAGE_COLS = ["Cath", "LAD", "LCX", "RCA"]      # never used as model inputs

GROUP_TITLES = {"clinical": "Clinical & history", "ecg": "ECG findings",
                "lab": "Laboratory", "echo": "Echocardiography"}
FEATURE_GROUPS = {
    "clinical": ["Age", "Sex", "BMI", "DM", "HTN", "Current Smoker", "EX-Smoker", "FH", "DLP",
                 "BP", "PR", "Typical Chest Pain", "Atypical", "Nonanginal", "Dyspnea",
                 "Function Class", "Edema", "Lung rales", "Systolic Murmur", "Diastolic Murmur",
                 "Airway disease"],
    "ecg": ["Q Wave", "St Elevation", "St Depression", "Tinversion", "LVH", "Poor R Progression", "BBB"],
    "lab": ["FBS", "CR", "TG", "LDL", "HDL", "BUN", "ESR", "HB", "K", "Na", "WBC", "Lymph", "PLT"],
    "echo": ["EF-TTE", "Region RWMA", "VHD"],
}
FEATURES = [f for g in FEATURE_GROUPS.values() for f in g]

def _b(label): return dict(label=label, kind="binary")
def _n(label, unit=""): return dict(label=label, kind="number", unit=unit)
def _o(label, options): return dict(label=label, kind="ordinal", options=options)

META = {
    "Age": _n("Age", "years"), "Sex": _o("Sex", {0: "Female", 1: "Male"}), "BMI": _n("Body mass index", "kg/m²"),
    "DM": _b("Diabetes mellitus"), "HTN": _b("Hypertension"), "Current Smoker": _b("Current smoker"),
    "EX-Smoker": _b("Ex-smoker"), "FH": _b("Family history of CAD"), "DLP": _b("Dyslipidemia"),
    "BP": _n("Systolic blood pressure", "mmHg"), "PR": _n("Pulse rate", "bpm"),
    "Typical Chest Pain": _b("Typical chest pain"), "Atypical": _b("Atypical chest pain"),
    "Nonanginal": _b("Non-anginal chest pain"), "Dyspnea": _b("Dyspnea"),
    "Function Class": _o("Functional class (NYHA)", {0: "0", 1: "I", 2: "II", 3: "III"}),
    "Edema": _b("Edema"), "Lung rales": _b("Lung rales"), "Systolic Murmur": _b("Systolic murmur"),
    "Diastolic Murmur": _b("Diastolic murmur"), "Airway disease": _b("Airway disease"),
    "Q Wave": _b("Q wave"), "St Elevation": _b("ST elevation"), "St Depression": _b("ST depression"),
    "Tinversion": _b("T-wave inversion"), "LVH": _b("Left ventricular hypertrophy"),
    "Poor R Progression": _b("Poor R-wave progression"),
    "BBB": _o("Bundle branch block", {0: "None", 1: "LBBB", 2: "RBBB"}),
    "FBS": _n("Fasting blood sugar", "mg/dl"), "CR": _n("Creatinine", "mg/dl"), "TG": _n("Triglycerides", "mg/dl"),
    "LDL": _n("LDL cholesterol", "mg/dl"), "HDL": _n("HDL cholesterol", "mg/dl"), "BUN": _n("Blood urea nitrogen", "mg/dl"),
    "ESR": _n("Erythrocyte sedimentation rate", "mm/h"), "HB": _n("Hemoglobin", "g/dl"),
    "K": _n("Potassium", "mEq/L"), "Na": _n("Sodium", "mEq/L"), "WBC": _n("White blood cells", "cells/mL"),
    "Lymph": _n("Lymphocytes", "%"), "PLT": _n("Platelets", "1000/mL"),
    "EF-TTE": _n("Ejection fraction (echo)", "%"),
    "Region RWMA": _o("Regions with wall-motion abnormality", {i: str(i) for i in range(5)}),
    "VHD": _o("Valvular heart disease", {0: "None", 1: "Mild", 2: "Moderate", 3: "Severe"}),
}
assert set(META) == set(FEATURES)

_YES = {"y", "yes", "true", "male"}
_NO = {"n", "no", "false", "female", "fmale"}          # 'Fmale' = typo in the source CSV
_ORD = {"mild": 1, "moderate": 2, "severe": 3, "lbbb": 1, "rbbb": 2}

def _num(v):
    """Y/N, Male/Female, mild/moderate/severe, LBBB/RBBB, numbers, None -> float (NaN if unknown)."""
    if v is None: return np.nan
    if isinstance(v, (bool, np.bool_)): return float(v)
    if isinstance(v, (int, float, np.integer, np.floating)): return float(v)
    s = str(v).strip().lower()
    if s in _YES: return 1.0
    if s in _NO: return 0.0
    if s in _ORD: return float(_ORD[s])
    try: return float(s)
    except ValueError: return np.nan

def make_targets(df):
    """Binary targets, 1 = CAD / stenotic."""
    return {"CAD": (df["Cath"] == "CAD").astype(int), "LAD": (df["LAD"] == "Stenotic").astype(int),
            "LCX": (df["LCX"] == "Stenotic").astype(int), "RCA": (df["RCA"] == "Stenotic").astype(int)}

def preprocess(df):
    """Raw rows (CSV rows or API payload) -> float matrix with columns == FEATURES. Missing -> NaN."""
    d = df.copy()
    if "BMI" not in d and {"Weight", "Length"} <= set(d.columns):
        d["BMI"] = d["Weight"].map(_num) / (d["Length"].map(_num) / 100) ** 2
    out = pd.DataFrame({c: (d[c].map(_num) if c in d else pd.Series(np.nan, index=d.index)) for c in FEATURES})
    return out.astype(float)

def logit(p):
    p = np.clip(p, 1e-4, 1 - 1e-4)
    return np.log(p / (1 - p))
