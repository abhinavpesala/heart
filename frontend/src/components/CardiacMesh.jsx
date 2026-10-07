import { useEffect, useMemo, useState, useRef } from "react";
import { useFrame } from "@react-three/fiber";
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

/**
 * Diagnostic Lighting Studio Environment
 * Casts precise clinical drop-shadows across tissue topography
 */
export function CardiacLighting() {
  return (
    <group>
      {/* Soft wrap-around ambient filling */}
      <ambientLight intensity={0.6} color="#ffffff" />
      
      {/* High-definition key light mapping contours from the upper-front-left */}
      <directionalLight
        position={[5, 8, 5]}
        intensity={1.5}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0001}
      />
      
      {/* Rim back-lighting to pop the organic edges away from darkness */}
      <directionalLight position={[-5, 3, -4]} intensity={0.6} color="#90b0ff" />
      
      {/* Soft bounce lighting ascending from body cavity space */}
      <directionalLight position={[0, -5, 2]} intensity={0.4} color="#ffb0b0" />
    </group>
  );
}

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
      <mesh geometry={aortaGeo} castShadow receiveShadow>
        <meshStandardMaterial color={COLORS.aorta} roughness={0.35} metalness={0.05} />
      </mesh>
      <mesh geometry={branchGeo1} castShadow><meshStandardMaterial color={COLORS.aorta} roughness={0.35} /></mesh>
      <mesh geometry={branchGeo2} castShadow><meshStandardMaterial color={COLORS.aorta} roughness={0.35} /></mesh>
      <mesh geometry={branchGeo3} castShadow><meshStandardMaterial color={COLORS.aorta} roughness={0.35} /></mesh>

      {/* Pulmonary Artery Trunk & Left/Right division */}
      <mesh geometry={pulmGeo} castShadow receiveShadow>
        <meshStandardMaterial color={COLORS.pulmonary} roughness={0.45} />
      </mesh>
      {/* Left branch */}
      <mesh position={[0.4, 1.0, 0.2]} rotation={[0, 0, Math.PI / 4]} castShadow>
        <cylinderGeometry args={[0.09, 0.08, 0.3]} />
        <meshStandardMaterial color={COLORS.pulmonary} roughness={0.45} />
      </mesh>
      {/* Right branch curving under aorta */}
      <mesh position={[0.1, 0.88, 0.1]} rotation={[0, 0, -Math.PI / 2.5]} castShadow>
        <cylinderGeometry args={[0.09, 0.08, 0.4]} />
        <meshStandardMaterial color={COLORS.pulmonary} roughness={0.45} />
      </mesh>
    </group>
  );
}

function Vessel({ name, prob, selected, onSelect }) {
  const [hover, setHover] = useState(false);
  const groupRef = useRef();
  
  const points = PATHS[name];
  const curve = useMemo(() => new THREE.CatmullRomCurve3(points), [points]);
  
  // Base vessel shape
  const baseGeometry = useMemo(() => new THREE.TubeGeometry(curve, 64, 0.035, 12, false), [curve]);
  
  // Plaque stenosis geometry slice
  const plaqueGeometry = useMemo(() => {
    if (!prob || prob < 0.3) return null;
    const subPoints = points.slice(Math.floor(points.length * 0.25), Math.ceil(points.length * 0.65));
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(subPoints), 32, 0.046, 12, false);
  }, [points, prob]);

  // Frame animation loop executing steady lerp transitions on active pointers
  useFrame((state, delta) => {
    if (!groupRef.current) return;
    
    // Determine goal transformation matrices based on states
    let targetScale = 1.0;
    if (selected) targetScale = 1.25;
    else if (hover) targetScale = 1.15;
    
    // Smooth damp interpolate across scales
    groupRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), delta * 10);
  });

  const emissive = selected ? 0.4 : hover ? 0.25 : 0.0;

  return (
    <group ref={groupRef}>
      {/* Underlying Healthy Vessel Channel */}
      <mesh
        geometry={baseGeometry}
        castShadow
        onClick={(e) => { e.stopPropagation(); onSelect(name); }}
        onPointerOver={(e) => { e.stopPropagation(); setHover(true); document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { setHover(false); document.body.style.cursor = "auto"; }}
      >
        <meshStandardMaterial 
          color={COLORS.vesselHealthy} 
          emissive={COLORS.vesselHealthy} 
          emissiveIntensity={emissive} 
          roughness={0.4} 
        />
      </mesh>

      {/* Localized Plaque Stenosis Overlay Indicator */}
      {plaqueGeometry && (
        <mesh geometry={plaqueGeometry} castShadow onClick={(e) => { e.stopPropagation(); onSelect(name); }}>
          <meshStandardMaterial color={COLORS.plaque} roughness={0.3} metalness={0.1} />
        </mesh>
      )}
    </group>
  );
}

export default function CardiacMesh({ probs, selected, onSelect }) {
  return (
    <group rotation={[0, -Math.PI / 6, 0]}>
      {/* Lighting Rig inside the local transformations */}
      <CardiacLighting />

      {/* Great Vessels (Aorta and Pulmonary Systems) */}
      <GreatVessels />

      {/* Myocardium (Heart Muscle Body) */}
      <mesh 
        scale={[A, B, C]} 
        castShadow 
        receiveShadow 
        onClick={(e) => { e.stopPropagation(); onSelect("CAD"); }}
      >
        <sphereGeometry args={[1, 48, 32]} />
        <meshStandardMaterial 
          color={COLORS.myocardium} 
          roughness={0.65} 
          metalness={0.02}
        />
      </mesh>

      {/* Coronary Tree Branches */}
      {["LAD", "LCX", "RCA"].map((v) => (
        <Vessel key={v} name={v} prob={probs?.[v]} selected={selected === v} onSelect={onSelect} />
      ))}
    </group>
  );
}
