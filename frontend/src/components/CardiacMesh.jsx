import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";

// Heart ellipsoid radii.
const A = 1.0, B = 1.2, C = 0.9;
const pt = (x, y, side = 1) => {
  const q = 1 - (x * x) / (A * A) - (y * y) / (B * B);
  return new THREE.Vector3(x, y, side * C * Math.sqrt(Math.max(q, 0))).multiplyScalar(1.04);
};

// Main coronary pathways
const PATHS = {
  LAD: [pt(0.05, 0.65), pt(0.15, 0.4), pt(0.3, 0.0), pt(0.35, -0.4), pt(0.2, -0.85)],
  LCX: [pt(0.1, 0.65), pt(0.4, 0.55), pt(0.7, 0.4), pt(0.8, 0.2), pt(0.7, -0.1)],
  RCA: [pt(-0.1, 0.6), pt(-0.4, 0.4), pt(-0.6, 0.1), pt(-0.5, -0.3), pt(-0.3, -0.6)],
};

// Medical color palette matching the illustration
const COLORS = {
  myocardium: "#b03a47",       // Muscle red-crimson
  vesselHealthy: "#d64550",   // Oxygenated arterial red
  plaque: "#fcd34d",          // Stenosis yellow
  aorta: "#e0535d",           // Main aortic arch red
  pulmonary: "#c0a0c7"        // Deoxygenated artery pink-purple
};

// Aorta & Pulmonary main artery path definitions
const createAortaPoints = () => [
  new THREE.Vector3(0.0, 0.5, 0.2),
  new THREE.Vector3(-0.05, 1.1, 0.3),
  new THREE.Vector3(0.1, 1.5, 0.1),
  new THREE.Vector3(0.4, 1.4, -0.3),
  new THREE.Vector3(0.45, 0.7, -0.5)
];

const createPulmonaryPoints = () => [
  new THREE.Vector3(0.1, 0.5, 0.4),
  new THREE.Vector3(0.2, 0.9, 0.45),
  new THREE.Vector3(0.4, 1.0, 0.2),
];

function GreatVessels() {
  const aortaGeo = useMemo(() => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(createAortaPoints()), 32, 0.22, 16, false), []);
  const pulmGeo = useMemo(() => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(createPulmonaryPoints()), 32, 0.16, 16, false), []);
  
  // High-order branching vessels coming off the aortic arch
  const branchGeo1 = useMemo(() => new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0.05, 1.42, 0.18), new THREE.Vector3(0.02, 1.8, 0.2)]), 10, 0.05, 8, false), []);
  const branchGeo2 = useMemo(() => new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0.18, 1.47, 0.08), new THREE.Vector3(0.18, 1.85, 0.08)]), 10, 0.04, 8, false), []);
  const branchGeo3 = useMemo(() => new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0.28, 1.46, -0.05), new THREE.Vector3(0.32, 1.82, -0.1)]), 10, 0.04, 8, false), []);

  return (
    <group>
      {/* Aorta */}
      <mesh geometry={aortaGeo}>
        <meshStandardMaterial color={COLORS.aorta} roughness={0.3} metalness={0.1} />
      </mesh>
      <mesh geometry={branchGeo1}><meshStandardMaterial color={COLORS.aorta} /></mesh>
      <mesh geometry={branchGeo2}><meshStandardMaterial color={COLORS.aorta} /></mesh>
      <mesh geometry={branchGeo3}><meshStandardMaterial color={COLORS.aorta} /></mesh>

      {/* Pulmonary Artery Trunk & Left/Right division */}
      <mesh geometry={pulmGeo}>
        <meshStandardMaterial color={COLORS.pulmonary} roughness={0.4} />
      </mesh>
      {/* Left branch */}
      <mesh position={[0.4, 1.0, 0.2]} rotation={[0, 0, Math.PI / 4]}>
        <cylinderGeometry args={[0.09, 0.08, 0.3]} />
        <meshStandardMaterial color={COLORS.pulmonary} />
      </mesh>
      {/* Right branch curving under aorta */}
      <mesh position={[0.1, 0.88, 0.1]} rotation={[0, 0, -Math.PI / 2.5]}>
        <cylinderGeometry args={[0.09, 0.08, 0.4]} />
        <meshStandardMaterial color={COLORS.pulmonary} />
      </mesh>
    </group>
  );
}

function Vessel({ name, prob, selected, onSelect }) {
  const [hover, setHover] = useState(false);
  const points = PATHS[name];
  const curve = useMemo(() => new THREE.CatmullRomCurve3(points), [points]);
  
  // Generate geometry for base healthy vessel
  const baseGeometry = useMemo(() => new THREE.TubeGeometry(curve, 64, selected ? 0.05 : 0.035, 12, false), [curve, selected]);
  
  // Isolate a specific midpoint segment along the curve to represent the plaque stenosis block
  const plaqueGeometry = useMemo(() => {
    if (!prob || prob < 0.3) return null;
    // Extract a subset of path coordinates to overlay a plaque segment near the center
    const subPoints = points.slice(Math.floor(points.length * 0.25), Math.ceil(points.length * 0.65));
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(subPoints), 32, selected ? 0.06 : 0.045, 12, false);
  }, [points, prob, selected]);

  const emissive = selected ? 0.5 : hover ? 0.3 : 0.0;

  return (
    <group>
      {/* Underlying Healthy Vessel Channel */}
      <mesh
        geometry={baseGeometry}
        onClick={(e) => { e.stopPropagation(); onSelect(name); }}
        onPointerOver={(e) => { e.stopPropagation(); setHover(true); document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { setHover(false); document.body.style.cursor = "auto"; }}
      >
        <meshStandardMaterial color={COLORS.vesselHealthy} emissive={COLORS.vesselHealthy} emissiveIntensity={emissive} roughness={0.5} />
      </mesh>

      {/* Localized Plaque Stenosis Overlay Indicator */}
      {plaqueGeometry && (
        <mesh geometry={plaqueGeometry} onClick={(e) => { e.stopPropagation(); onSelect(name); }}>
          <meshStandardMaterial color={COLORS.plaque} roughness={0.3} bumpScale={0.05} />
        </mesh>
      )}
    </group>
  );
}

export default function CardiacMesh({ probs, selected, onSelect }) {
  return (
    <group rotation={[0, -Math.PI / 6, 0]}> {/* Slight rotation for anatomical perspective */}
      {/* Great Vessels (Aorta and Pulmonary Systems) */}
      <GreatVessels />

      {/* Myocardium (Heart Muscle Body) */}
      <mesh scale={[A, B, C]} onClick={(e) => { e.stopPropagation(); onSelect("CAD"); }}>
        <sphereGeometry args={[1, 48, 32]} />
        <meshStandardMaterial 
          color={COLORS.myocardium} 
          transparent 
          opacity={selected === "CAD" ? 0.9 : 0.75} 
          roughness={0.6} 
        />
      </mesh>

      {/* Coronary Tree Branches */}
      {["LAD", "LCX", "RCA"].map((v) => (
        <Vessel key={v} name={v} prob={probs?.[v]} selected={selected === v} onSelect={onSelect} />
      ))}
    </group>
  );
}
