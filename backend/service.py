"""Prediction + explanation logic (no web framework here, so it can be unit-tested)."""
import json
from pathlib import Path
import joblib, numpy as np, pandas as pd
from backend.common import FEATURE_GROUPS, FEATURES, GROUP_TITLES, META, TARGETS, logit, preprocess

MODEL_DIR = Path(__file__).resolve().parent / "models"
DISCLAIMER = ("Decision-support / educational use only. Predictions are NOT a substitute for formal "
              "diagnostic imaging (e.g. coronary angiography) or clinical judgement.")
_B = None

def load():
    """Load the trained bundle once. Fails loudly (with the fix) if training has not been run."""
    global _B
    path = MODEL_DIR / "cad_bundle.joblib"
    if not path.exists():
        raise RuntimeError(f"{path} not found. Run `python -m backend.train` first "
                           "(on Render this runs in the build command).")
    _B = joblib.load(path)
    for m in _B["models"].values():
        m["rf"].set_params(n_jobs=1)                      # small free-tier CPU: avoid thread overhead
    return _B

def bundle():
    return _B if _B is not None else load()

def metrics():
    p = MODEL_DIR / "metrics.json"
    return json.loads(p.read_text()) if p.exists() else {}

def schema():
    b = bundle()
    fields = []
    for g, cols in FEATURE_GROUPS.items():
        for c in cols:
            m = META[c]; r = b["ranges"][c]
            f = dict(name=c, group=g, label=m["label"], kind=m["kind"], unit=m.get("unit", ""),
                     min=r["min"], max=r["max"], default=b["medians"][c])
            if m["kind"] == "ordinal":
                f["options"] = [dict(value=int(k), label=v) for k, v in m["options"].items()]
            fields.append(f)
    return dict(groups=[dict(id=g, title=GROUP_TITLES[g]) for g in FEATURE_GROUPS], fields=fields,
                targets=TARGETS, disclaimer=DISCLAIMER)

def _p(m, p_raw):
    return m["platt"].predict_proba(logit(np.asarray(p_raw))[:, None])[:, 1]

def _attributions(x, n_pairs=40, seed=0):
    """Permutation-sampling Shapley values in PROBABILITY space (antithetic pairs).
    Reference = random real patients from the training set (interventional SHAP baseline), so the values read
    as "pushes this patient's risk up/down vs the average patient". Efficiency holds on average:
    sum(phi) == p(patient) - mean p(reference patients). Deterministic (fixed seed)."""
    b = bundle(); F = len(FEATURES); bg = b["background"]; rng = np.random.RandomState(seed)
    perms, refs = [], []
    for _ in range(n_pairs):
        p = rng.permutation(F); r = bg[rng.randint(len(bg))]
        perms += [p, p[::-1]]; refs += [r, r]
    rows = np.empty((len(perms) * (F + 1), F)); k = 0
    for perm, ref in zip(perms, refs):
        cur = ref.copy(); rows[k] = cur; k += 1
        for j in perm:
            cur[j] = x[j]; rows[k] = cur; k += 1
    frame = pd.DataFrame(rows, columns=FEATURES)
    out = {}
    for t, m in b["models"].items():
        P = _p(m, m["rf"].predict_proba(frame)[:, 1]).reshape(len(perms), F + 1)
        phi = np.zeros(F)
        for i, perm in enumerate(perms):
            phi[perm] += np.diff(P[i])
        out[t] = (phi / len(perms), float(P[:, 0].mean()), float(P[0, -1]))
    return out

def predict(raw: dict, top_k: int = 12):
    b = bundle()
    known = set(FEATURES) | {"Weight", "Length"}
    unknown = sorted(k for k in raw if k not in known)
    row = preprocess(pd.DataFrame([raw]))
    given = {c for c in FEATURES if not np.isnan(row.at[0, c])}
    warnings = [f"{META[c]['label']} = {row.at[0, c]:g} is outside the training range "
                f"[{b['ranges'][c]['min']:g}, {b['ranges'][c]['max']:g}]"
                for c in given if not b["ranges"][c]["min"] <= row.at[0, c] <= b["ranges"][c]["max"]]
    for c in FEATURES:                                    # anything not supplied -> training median
        if c not in given: row.at[0, c] = b["medians"][c]
    x = row.iloc[0].to_numpy(dtype=float)
    attrs = _attributions(x)
    res = {}
    for t, m in b["models"].items():
        phi, base_p, p = attrs[t]
        conf = max(p, 1 - p)
        pset = [lab for lab, ok in (("normal", p <= m["conformal_q"]), ("stenotic", 1 - p <= m["conformal_q"])) if ok]
        order = np.argsort(-np.abs(phi))[:top_k]
        res[t] = dict(
            probability=round(p, 4), label="stenotic" if p >= 0.5 else "normal", confidence=round(conf, 4),
            decision="automated" if (conf >= b["reject_conf"] and len(pset) == 1) else "defer_to_cardiologist",
            conformal_set=pset, base_probability=round(base_p, 4),
            contributions=[dict(feature=FEATURES[i], label=META[FEATURES[i]]["label"], value=float(x[i]),
                                unit=META[FEATURES[i]].get("unit", ""), contribution=round(float(phi[i]), 4),
                                supplied=FEATURES[i] in given) for i in order])
    pc = res["CAD"]["probability"]
    return dict(cad=res["CAD"], vessels={v: res[v] for v in ("LAD", "LCX", "RCA")},
                risk_band="High" if pc >= 0.7 else "Moderate" if pc >= 0.4 else "Low",
                n_supplied=len(given), n_defaulted=len(FEATURES) - len(given),
                unknown_fields=unknown, input_warnings=warnings, disclaimer=DISCLAIMER)
