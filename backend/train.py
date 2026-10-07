"""Train CAD + LAD/LCX/RCA classifiers.  Run from the repo root:  python -m backend.train
Output: backend/models/cad_bundle.joblib and backend/models/metrics.json"""
import json, os, time
from pathlib import Path
import joblib, numpy as np, pandas as pd, sklearn
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (accuracy_score, average_precision_score, brier_score_loss, confusion_matrix,
                             f1_score, precision_score, recall_score, roc_auc_score)
from sklearn.model_selection import StratifiedKFold, cross_val_predict
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from backend.common import FEATURE_GROUPS, FEATURES, LEAKAGE_COLS, TARGETS, logit, make_targets, preprocess

ROOT = Path(__file__).resolve().parent.parent
DATA = Path(os.environ.get("DATA_PATH", ROOT / "dataset.csv"))
OUT = Path(__file__).resolve().parent / "models"
SEED = 42
N_REPEATS = int(os.environ.get("N_REPEATS", 3))
N_TREES = int(os.environ.get("N_TREES", 200))
REJECT_CONF = 0.65        # below this confidence the app defers to a cardiologist
ALPHA = 0.10              # conformal prediction: 90% target coverage

def make_rf():
    return RandomForestClassifier(N_TREES, min_samples_leaf=3, class_weight="balanced_subsample",
                                  random_state=SEED, n_jobs=-1)

def make_lr():
    return make_pipeline(StandardScaler(), LogisticRegression(C=0.3, max_iter=3000, class_weight="balanced"))

def oof(make_model, X, y):
    """Out-of-fold probabilities averaged over repeated stratified 5-fold CV (every score is out-of-fold)."""
    ps = [cross_val_predict(make_model(), X, y, method="predict_proba",
                            cv=StratifiedKFold(5, shuffle=True, random_state=SEED + r))[:, 1] for r in range(N_REPEATS)]
    return np.mean(ps, axis=0)

def conformal_q(p, y):
    s = np.where(y == 1, 1 - p, p)                     # nonconformity = 1 - prob. of the true class
    k = int(np.ceil((len(s) + 1) * (1 - ALPHA)))
    return float(np.sort(s)[min(k, len(s)) - 1])

def main():
    t0 = time.time()
    raw = pd.read_csv(DATA)
    ys = make_targets(raw)
    X = preprocess(raw.drop(columns=LEAKAGE_COLS))     # leakage columns removed BEFORE preprocessing
    assert not set(LEAKAGE_COLS) & set(X.columns) and not X.isna().any().any()
    print(f"data {X.shape} | positives: " + ", ".join(f"{t}={int(y.sum())}" for t, y in ys.items()))

    metrics, models, importances = {}, {}, {}
    rng = np.random.RandomState(SEED)
    for t in TARGETS:
        y = ys[t]
        p_raw = oof(make_rf, X, y)
        # Platt calibration on out-of-fold scores (cross-validated again so the Brier score stays honest)
        p = cross_val_predict(LogisticRegression(), logit(p_raw)[:, None], y, method="predict_proba",
                              cv=StratifiedKFold(5, shuffle=True, random_state=SEED))[:, 1]
        yh = (p >= 0.5).astype(int)
        tn, fp, fn, tp = confusion_matrix(y, yh).ravel()
        conf = np.maximum(p, 1 - p); keep = conf >= REJECT_CONF
        idx = rng.permutation(len(y)); a, b = idx[: len(y) // 2], idx[len(y) // 2:]
        q_half = conformal_q(p[a], y.values[a])
        sets = np.stack([p[b] <= q_half, (1 - p[b]) <= q_half], axis=1)
        metrics[t] = dict(
            n_positive=int(y.sum()), n_negative=int((1 - y).sum()), prevalence=float(y.mean()),
            accuracy=accuracy_score(y, yh), precision=precision_score(y, yh), recall=recall_score(y, yh),
            f1=f1_score(y, yh), roc_auc=roc_auc_score(y, p), pr_auc=average_precision_score(y, p),
            brier_raw=brier_score_loss(y, p_raw), brier_calibrated=brier_score_loss(y, p),
            confusion=dict(tn=int(tn), fp=int(fp), fn=int(fn), tp=int(tp)),
            baseline_logreg_roc_auc=roc_auc_score(y, oof(make_lr, X, y)),
            reject=dict(threshold=REJECT_CONF, coverage=float(keep.mean()),
                        accuracy_on_kept=float((yh[keep] == y.values[keep]).mean()) if keep.any() else None),
            conformal=dict(alpha=ALPHA, empirical_coverage=float(sets[np.arange(len(b)), y.values[b]].mean()),
                           single_label_fraction=float((sets.sum(1) == 1).mean())))
        metrics[t] = {k: (round(float(v), 4) if isinstance(v, (float, np.floating)) else v) for k, v in metrics[t].items()}
        rf = make_rf().fit(X, y)
        platt = LogisticRegression().fit(logit(p_raw)[:, None], y)
        models[t] = dict(rf=rf, platt=platt, conformal_q=conformal_q(p, y.values))
        importances[t] = dict(sorted(zip(FEATURES, map(float, rf.feature_importances_)), key=lambda kv: -kv[1])[:15])
        print(f"{t}: AUC {metrics[t]['roc_auc']:.3f}  acc {metrics[t]['accuracy']:.3f}  "
              f"P {metrics[t]['precision']:.3f}  R {metrics[t]['recall']:.3f}  F1 {metrics[t]['f1']:.3f}")

    bundle = dict(
        features=FEATURES, groups=FEATURE_GROUPS, targets=TARGETS, models=models,
        medians={c: float(X[c].median()) for c in FEATURES},
        ranges={c: dict(min=float(X[c].min()), max=float(X[c].max())) for c in FEATURES},
        background=X.sample(100, random_state=SEED).to_numpy(),      # reference patients for the explanations
        reject_conf=REJECT_CONF, alpha=ALPHA, global_importance=importances,
        meta=dict(sklearn=sklearn.__version__, n_patients=len(X), cv=f"{N_REPEATS}x repeated stratified 5-fold",
                  trained_at=time.strftime("%Y-%m-%d %H:%M:%S")))
    OUT.mkdir(parents=True, exist_ok=True)
    joblib.dump(bundle, OUT / "cad_bundle.joblib", compress=3)
    (OUT / "metrics.json").write_text(json.dumps(dict(metrics=metrics, meta=bundle["meta"],
                                                      global_importance=importances), indent=2))
    print(f"saved to {OUT} ({(OUT / 'cad_bundle.joblib').stat().st_size / 1e6:.1f} MB) in {time.time() - t0:.0f}s")

if __name__ == "__main__":
    main()
