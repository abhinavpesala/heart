import { useEffect, useMemo, useState } from "react";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { ARTERIES, BRANCHES, ELLIPSOIDS, LESION_T, TUBES, deform } from "./heartGeometry";

// Anatomical-illustration style: opaque pink myocardium with muscle fibres, red aorta, lilac pulmonary arteries,
// mauve right heart, branching coronary arteries. Artery COLOUR = predicted stenosis probability (green -> amber -> red);
// the yellow "plaque" swelling grows with that probability. Lighting comes from the <Canvas> in App.jsx.

const GREEN = new THREE.Color("#2fbf71"), AMBER = new THREE.Color("#f5a524"), RED = new THREE.Color("#e5484d");
export function riskColor(p) {
  if (p == null) return new THREE.Color("#c9a0a6");           // neutral until a prediction exists
  return p < 0.5 ? GREEN.clone().lerp(AMBER, p / 0.5) : AMBER.clone().lerp(RED, (p - 0.5) / 0.5);
}

// Procedural muscle-fibre texture (diagonal strokes, wrapped so the sphere seam is invisible).
function makeMuscleTexture() {
  const c = document.createElement("canvas"); c.width = 512; c.height = 512;
  const g = c.getContext("2d");
  const grad = g.createLinearGradient(0, 0, 0, 512); grad.addColorStop(0, "#ecb4b2"); grad.addColorStop(1, "#d98c92");
  g.fillStyle = grad; g.fillRect(0, 0, 512, 512);
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  g.lineCap = "round";
  for (let i = 0; i < 700; i++) {
    const x = rnd() * 512, y = rnd() * 512, len = 40 + rnd() * 90, ang = 0.9 + rnd() * 0.5, bend = (rnd() - 0.5) * 24;
    g.strokeStyle = rnd() < 0.5 ? `rgba(255,236,236,${0.08 + rnd() * 0.12})` : `rgba(150,70,85,${0.05 + rnd() * 0.1})`;
    g.lineWidth = 1 + rnd() * 2.5;
    for (const dx of [-512, 0, 512]) {
      g.beginPath(); g.moveTo(x + dx, y);
      g.quadraticCurveTo(x + dx + Math.cos(ang) * len * 0.5 + bend, y + Math.sin(ang) * len * 0.5, x + dx + Math.cos(ang) * len, y + Math.sin(ang) * len);
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 1);
  return t;
}

// Ventricular mass: a unit sphere pushed through deform() (tapered apex, larger left ventricle, flatter base).
function useHeartBody() {
  const geo = useMemo(() => {
    const g = new THREE.SphereGeometry(1, 72, 56);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const [x, y, z] = deform(pos.getX(i), pos.getY(i), pos.getZ(i));
      pos.setXYZ(i, x, y, z);
    }
    g.computeVertexNormals();
    return g;
  }, []);
  const tex = useMemo(() => makeMuscleTexture(), []);
  useEffect(() => () => { geo.dispose(); tex.dispose(); }, [geo, tex]);
  return { geo, tex };
}

// Generic tube along a polyline (great vessels, side branches). Rounded cap at the far end.
function Tube({ pts, radius, color, segments = 40, capped = false, onClick }) {
  const vecs = useMemo(() => pts.map((p) => new THREE.Vector3(...p)), [pts]);
  const geo = useMemo(() => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(vecs), segments, radius, 14, false), [vecs, radius, segments]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <group>
      <mesh geometry={geo} onClick={onClick}>
        <meshStandardMaterial color={color} roughness={0.4} metalness={0.03} />
      </mesh>
      {capped && (
        <mesh position={vecs[vecs.length - 1]}>
          <sphereGeometry args={[radius, 16, 12]} />
          <meshStandardMaterial color={color} roughness={0.4} />
        </mesh>
      )}
    </group>
  );
}

// One coronary artery + its side branches + a yellow plaque swelling at the lesion site.
function Artery({ name, prob, selected, onSelect }) {
  const [hover, setHover] = useState(false);
  const curve = useMemo(() => new THREE.CatmullRomCurve3(ARTERIES[name].map((p) => new THREE.Vector3(...p))), [name]);
  const geometry = useMemo(() => new THREE.TubeGeometry(curve, 72, selected ? 0.07 : 0.052, 12, false), [curve, selected]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const color = useMemo(() => riskColor(prob), [prob]);

  // plaque = three overlapping blobs along the artery at the lesion site; size grows with probability (illustrative)
  const plaque = useMemo(() => {
    if (prob == null || prob < 0.4) return [];
    const s = Math.min((prob - 0.3) / 0.7, 1), up = new THREE.Vector3(0, 1, 0);
    return [-0.07, 0, 0.07].map((dt, i) => {
      const t = Math.min(Math.max(LESION_T[name] + dt, 0.02), 0.98);
      const tangent = curve.getTangentAt(t);
      return { pos: curve.getPointAt(t), quat: new THREE.Quaternion().setFromUnitVectors(up, tangent),
               scale: [0.07 + 0.05 * s * (i === 1 ? 1.2 : 0.9), 0.1 + 0.05 * s, 0.07 + 0.05 * s * (i === 1 ? 1.2 : 0.9)] };
    });
  }, [curve, prob, name]);

  const labelPos = useMemo(() => {
    const p = curve.getPoint(LESION_T[name]);
    return p.clone().add(p.clone().normalize().multiplyScalar(0.3));
  }, [curve, name]);
  const emissive = selected ? 0.6 : hover ? 0.35 : 0.12;
  const click = (e) => { e.stopPropagation(); onSelect(name); };

  return (
    <group>
      <mesh geometry={geometry} onClick={click}
            onPointerOver={(e) => { e.stopPropagation(); setHover(true); document.body.style.cursor = "pointer"; }}
            onPointerOut={() => { setHover(false); document.body.style.cursor = "auto"; }}>
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={emissive} roughness={0.4} />
      </mesh>
      {BRANCHES[name].map((pts, i) => <Tube key={i} pts={pts} radius={0.02} color={color} segments={16} onClick={click} />)}
      {plaque.map((b, i) => (
        <mesh key={i} position={b.pos} quaternion={b.quat} scale={b.scale} onClick={click}>
          <sphereGeometry args={[1, 20, 16]} />
          <meshStandardMaterial color="#f2d36b" roughness={0.45} emissive="#f2d36b" emissiveIntensity={selected ? 0.35 : 0.05} />
        </mesh>
      ))}
      <Html position={labelPos} center distanceFactor={7} style={{ pointerEvents: "none" }}>
        <div className={`vessel-tag ${selected ? "sel" : ""}`}>{name}{prob != null ? ` ${(prob * 100).toFixed(0)}%` : ""}</div>
      </Html>
    </group>
  );
}

export default function CardiacMesh({ probs, selected, onSelect }) {
  const { geo, tex } = useHeartBody();
  return (
    <group position={[-0.1, -0.45, 0]}>
      {/* left ventricle / main mass: click selects the overall CAD result */}
      <mesh geometry={geo} onClick={(e) => { e.stopPropagation(); onSelect("CAD"); }}>
        <meshPhysicalMaterial map={tex} color="#ffffff" roughness={0.5} clearcoat={0.25} clearcoatRoughness={0.45}
                              emissive="#7a1f2a" emissiveIntensity={selected === "CAD" ? 0.35 : 0} />
      </mesh>

      {/* right ventricle, right atrium, left atrial appendage */}
      {ELLIPSOIDS.map((e) => (
        <mesh key={e.name} position={e.c} scale={e.r}>
          <sphereGeometry args={[1, 40, 30]} />
          <meshStandardMaterial color={e.color} roughness={0.55} />
        </mesh>
      ))}

      {/* aorta + arch branches, pulmonary trunk/arteries, superior vena cava */}
      {TUBES.map((t) => <Tube key={t.name} pts={t.pts} radius={t.radius} color={t.color} capped />)}

      {/* coronary arteries coloured by predicted stenosis probability */}
      {["LAD", "LCX", "RCA"].map((v) => (
        <Artery key={v} name={v} prob={probs?.[v]} selected={selected === v} onSelect={onSelect} />
      ))}
    </group>
  );
}
