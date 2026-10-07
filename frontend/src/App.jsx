import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import CardiacMesh from "./components/CardiacMesh";
import "./App.css";

const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:8000").replace(/\/$/, "");
const VESSELS = ["LAD", "LCX", "RCA"];
const NAMES = { CAD: "Overall CAD", LAD: "LAD (left anterior descending)", LCX: "LCX (left circumflex)", RCA: "RCA (right coronary)" };
const DEFAULT_DISCLAIMER =
  "Decision-support / educational use only. Not a substitute for formal diagnostic imaging or clinical judgement.";

async function api(path, options = {}, timeoutMs = 90000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_URL}${path}`, { ...options, signal: ctrl.signal });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || `HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

const pct = (p) => `${(p * 100).toFixed(0)}%`;
const bandClass = (b) => (b || "").toLowerCase();

function Field({ f, value, onChange }) {
  if (f.kind === "binary")
    return (
      <label className="check">
        <input type="checkbox" checked={value === 1} onChange={(e) => onChange(e.target.checked ? 1 : 0)} />
        {f.label}
      </label>
    );
  if (f.kind === "ordinal")
    return (
      <div className="input-group">
        <label>{f.label}</label>
        <select value={value} onChange={(e) => onChange(Number(e.target.value))}>
          {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
    );
  return (
    <div className="input-group">
      <label>{f.label}{f.unit ? ` (${f.unit})` : ""}</label>
      <input type="number" value={value} step="any" min={f.min} max={f.max}
             onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))} />
      <small>training range {f.min}–{f.max}</small>
    </div>
  );
}

function Explanation({ title, t }) {
  const max = Math.max(...t.contributions.map((c) => Math.abs(c.contribution)), 1e-6);
  return (
    <div className="card">
      <h3>Why: {title}</h3>
      <p className="muted">
        Average patient ≈ {pct(t.base_probability)} → this patient {pct(t.probability)}. Bars show how much each
        measurement pushed the estimate up (red) or down (blue).
      </p>
      <table className="contrib">
        <tbody>
          {t.contributions.map((c) => (
            <tr key={c.feature} title={c.supplied ? "" : "not entered: training median used"}>
              <td className="lab">{c.label}<span className={c.supplied ? "" : "dflt"}>{" "}
                {c.value.toLocaleString(undefined, { maximumFractionDigits: 1 })}{c.unit ? ` ${c.unit}` : ""}{c.supplied ? "" : " (default)"}</span></td>
              <td className="barcell">
                <div className="bar" style={{ width: `${(Math.abs(c.contribution) / max) * 100}%`,
                                              background: c.contribution >= 0 ? "#e5484d" : "#3b82f6" }} />
              </td>
              <td className="num">{c.contribution >= 0 ? "+" : ""}{(c.contribution * 100).toFixed(1)} pp</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Metrics({ data }) {
  if (!data?.metrics) return null;
  return (
    <details className="card">
      <summary>Model performance ({data.meta?.cv}, n={data.meta?.n_patients})</summary>
      <table className="metrics">
        <thead><tr><th></th><th>Acc</th><th>Prec</th><th>Rec</th><th>F1</th><th>AUC</th></tr></thead>
        <tbody>
          {Object.entries(data.metrics).map(([k, m]) => (
            <tr key={k}><td>{k}</td><td>{m.accuracy.toFixed(2)}</td><td>{m.precision.toFixed(2)}</td>
              <td>{m.recall.toFixed(2)}</td><td>{m.f1.toFixed(2)}</td><td>{m.roc_auc.toFixed(2)}</td></tr>
          ))}
        </tbody>
      </table>
      <p className="muted">Out-of-fold estimates on a small single-centre dataset; vessel-level LCX/RCA models are weaker.</p>
    </details>
  );
}

export default function App() {
  const [schema, setSchema] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [values, setValues] = useState({});
  const [result, setResult] = useState(null);
  const [selected, setSelected] = useState("CAD");
  const [status, setStatus] = useState("connecting"); // connecting | ready | error
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [live, setLive] = useState(true);
  const reqId = useRef(0);

  // Load schema (also wakes a sleeping free-tier Render server).
  useEffect(() => {
    api("/schema")
      .then((s) => {
        setSchema(s);
        setValues(Object.fromEntries(s.fields.map((f) => [f.name, f.default])));
        setStatus("ready");
      })
      .catch((e) => { setError(e.message); setStatus("error"); });
    api("/metrics").then(setMetrics).catch(() => {});
  }, []);

  const predict = useCallback(async (vals) => {
    const id = ++reqId.current;
    setLoading(true); setError("");
    try {
      const body = JSON.stringify({ features: Object.fromEntries(Object.entries(vals).filter(([, v]) => v !== "")) });
      const data = await api("/predict", { method: "POST", headers: { "Content-Type": "application/json" }, body });
      if (id === reqId.current) setResult(data); // ignore out-of-order responses
    } catch (e) {
      if (id === reqId.current) setError(e.message);
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, []);

  // Live update: debounce so typing does not spam the server.
  useEffect(() => {
    if (status !== "ready" || !live) return;
    const t = setTimeout(() => predict(values), 600);
    return () => clearTimeout(t);
  }, [values, live, status, predict]);

  const probs = useMemo(
    () => (result ? Object.fromEntries(VESSELS.map((v) => [v, result.vessels[v].probability])) : null),
    [result]
  );
  const target = result ? (selected === "CAD" ? result.cad : result.vessels[selected]) : null;
  const fieldsByGroup = (g) => schema.fields.filter((f) => f.group === g);

  return (
    <div className="app">
      <div className="disclaimer" role="alert">
        ⚠️ {result?.disclaimer || schema?.disclaimer || DEFAULT_DISCLAIMER}
      </div>

      <div className="container">
        <aside className="sidebar">
          <h1>🫀 Cardiac Risk Engine</h1>
          {status === "connecting" && <p className="notice">Connecting to the server… the free tier can take up to a minute to wake up.</p>}
          {status === "error" && <p className="notice err">Cannot reach the API at {API_URL}: {error}</p>}
          {schema && (
            <>
              <label className="check live"><input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} /> Live update</label>
              {schema.groups.map((g, i) => (
                <details key={g.id} open={i === 0} className="group">
                  <summary>{g.title}</summary>
                  <div className="fields">
                    {fieldsByGroup(g.id).map((f) => (
                      <Field key={f.name} f={f} value={values[f.name]}
                             onChange={(v) => setValues((s) => ({ ...s, [f.name]: v }))} />
                    ))}
                  </div>
                </details>
              ))}
              {!live && <button className="btn-predict" onClick={() => predict(values)} disabled={loading}>{loading ? "Predicting…" : "Predict"}</button>}
            </>
          )}
        </aside>

        <main className="canvas-container">
          <Canvas camera={{ position: [0, 0, 5], fov: 45 }} dpr={[1, 1.5]}>
            <ambientLight intensity={0.8} />
            <directionalLight position={[3, 3, 4]} intensity={1.1} />
            <CardiacMesh probs={probs} selected={selected} onSelect={setSelected} />
            <OrbitControls enablePan={false} minDistance={2.5} maxDistance={9} />
          </Canvas>
          <div className="hint">Drag to rotate · scroll to zoom · click a vessel to inspect it</div>
          {loading && <div className="busy">updating…</div>}
        </main>

        <section className="panel">
          {error && status === "ready" && <p className="notice err">{error}</p>}
          {!result && status === "ready" && <p className="muted">Calculating…</p>}
          {result && (
            <>
              <div className="card overall" onClick={() => setSelected("CAD")}>
                <h3>Overall CAD</h3>
                <div className={`risk-badge ${bandClass(result.risk_band)}`}>{result.risk_band} risk · {pct(result.cad.probability)}</div>
                <p className="muted">
                  {result.cad.decision === "automated"
                    ? `Model is confident (${pct(result.cad.confidence)}).`
                    : "Low confidence — defer to a cardiologist."}{" "}
                  {result.n_defaulted > 0 && `${result.n_defaulted} of ${result.n_supplied + result.n_defaulted} inputs use training medians.`}
                </p>
              </div>

              <div className="card">
                <h3>Vessel-specific stenosis probability</h3>
                {VESSELS.map((v) => {
                  const t = result.vessels[v];
                  return (
                    <div key={v} className={`vrow ${selected === v ? "sel" : ""}`} onClick={() => setSelected(v)}>
                      <span className="vname">{v}</span>
                      <div className="track"><div className="fill" style={{ width: pct(t.probability),
                        background: t.probability >= 0.7 ? "#e5484d" : t.probability >= 0.4 ? "#f5a524" : "#2fbf71" }} /></div>
                      <span className="vp">{pct(t.probability)}</span>
                      {t.decision !== "automated" && <span className="defer" title="Low confidence — defer to a cardiologist">⚠</span>}
                    </div>
                  );
                })}
              </div>

              {target && <Explanation title={NAMES[selected]} t={target} />}
              {result.input_warnings?.length > 0 && <p className="notice">{result.input_warnings.join("; ")}</p>}
              <Metrics data={metrics} />
            </>
          )}
        </section>
      </div>
    </div>
  );
}
