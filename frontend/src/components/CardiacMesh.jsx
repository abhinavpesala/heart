import { useEffect, useMemo, useState } from "react";
import { Html } from "@react-three/drei";
import * as THREE from "three";

// Heart ellipsoid radii. Coronary arteries are drawn as tubes lying on its surface.
const A = 1.0, B = 1.2, C = 0.9;
const pt = (x, y, side = 1) => {
  const q = 1 - (x * x) / (A * A) - (y * y) / (B * B);
  return new THREE.Vector3(x, y, side * C * Math.sqrt(Math.max(q, 0))).multiplyScalar(1.04);
};

// Viewer's left = patient's right, so the RCA is on negative x and the LAD/LCX on positive x.
const PATHS = {
  LAD: [pt(0.1, 0.85), pt(0.3, 0.5), pt(0.4, 0.0), pt(0.35, -0.5), pt(0.15, -0.95)],
  LCX: [pt(0.3, 0.7), pt(0.7, 0.55), pt(0.93, 0.3), pt(0.95, 0.1, -1), pt(0.7, 0.2, -1), pt(0.4, 0.25, -1)],
  RCA: [pt(-0.2, 0.8), pt(-0.6, 0.6), pt(-0.88, 0.25), pt(-0.88, -0.2), pt(-0.6, -0.7)],
};
const LABEL_AT = { LAD: [0.75, -0.2, 1.0], LCX: [1.25, 0.35, 0.1], RCA: [-1.3, 0.1, 0.6] };

const GREEN = new THREE.Color("#2fbf71"), AMBER = new THREE.Color("#f5a524"), RED = new THREE.Color("#e5484d");
export function riskColor(p) {
  if (p == null) return new THREE.Color("#9aa3ad");
  return p < 0.5 ? GREEN.clone().lerp(AMBER, p / 0.5) : AMBER.clone().lerp(RED, (p - 0.5) / 0.5);
}

function Vessel({ name, prob, selected, onSelect }) {
  const [hover, setHover] = useState(false);
  const geometry = useMemo(
    () => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(PATHS[name]), 64, selected ? 0.075 : 0.055, 12, false),
    [name, selected]
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  const color = useMemo(() => riskColor(prob), [prob]);
  const emissive = selected ? 0.65 : hover ? 0.4 : 0.15;

  return (
    <group>
      <mesh
        geometry={geometry}
        onClick={(e) => { e.stopPropagation(); onSelect(name); }}
        onPointerOver={(e) => { e.stopPropagation(); setHover(true); document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { setHover(false); document.body.style.cursor = "auto"; }}
      >
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={emissive} roughness={0.4} />
      </mesh>
      <Html position={LABEL_AT[name]} center distanceFactor={6} style={{ pointerEvents: "none" }}>
        <div className={`vessel-tag ${selected ? "sel" : ""}`}>
          {name}{prob != null ? ` ${(prob * 100).toFixed(0)}%` : ""}
        </div>
      </Html>
    </group>
  );
}

export default function CardiacMesh({ probs, selected, onSelect }) {
  return (
    <group>
      {/* faint chest volume for orientation (swap for a .glb torso from BodyParts3D / Sketchfab if desired) */}
      <mesh position={[0, -0.35, -0.5]} scale={[2.4, 2.1, 1.3]}>
        <sphereGeometry args={[1, 32, 24]} />
        <meshStandardMaterial color="#8fb4d9" transparent opacity={0.07} depthWrite={false} />
      </mesh>

      {/* myocardium: click selects the overall CAD result */}
      <mesh scale={[A, B, C]} onClick={(e) => { e.stopPropagation(); onSelect("CAD"); }}>
        <sphereGeometry args={[1, 48, 32]} />
        <meshStandardMaterial color="#8c2f39" transparent opacity={selected === "CAD" ? 0.75 : 0.55} roughness={0.7} />
      </mesh>

      {["LAD", "LCX", "RCA"].map((v) => (
        <Vessel key={v} name={v} prob={probs?.[v]} selected={selected === v} onSelect={onSelect} />
      ))}
    </group>
  );
}
