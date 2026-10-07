"use client";

import { useMemo, useRef, Suspense, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { SpotLight } from "@react-three/drei";
import { OrbitControls, Float } from "@react-three/drei";
import * as THREE from "three";
import { dShapeGeometry } from "@/lib/three-helpers";

function DShapeGeometry(props: { args?: [number, number, number, number, number] }) {
  // Built during render from a stable key, then disposed on unmount. Creating
  // the geometry here (rather than in an effect that then setStates) avoids an
  // extra render pass.
  const key = props.args ? props.args.join(",") : "default";
  const geo = useMemo(() => {
    const [w, h, d, bevel, br] = props.args ?? [1.3, 1.3, 0.4, 0.07, 0.14];
    return dShapeGeometry(w, h, d, bevel, br);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    return () => {
      geo.dispose();
    };
  }, [geo]);

  if (!geo) {
    return null;
  }

  return <primitive object={geo} {...props} />;
}

type NameplateProps = {
  size?: "sm" | "md" | "lg";
};

export function DevoraNameplate({ size = "lg" }: NameplateProps) {
  return (
    <div
      className="nameplate-host"
      style={{
        height: size === "sm" ? 180 : size === "md" ? 230 : 280,
      }}
    >
      <Canvas
        camera={{ position: [0, 0, 5.4], fov: 32 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
        style={{ background: "transparent" }}
      >
        <Suspense fallback={<NameplateFallback />}>
          <color attach="background" args={["#0b0b0c"]} />
          <ambientLight intensity={0.4} />
          <SpotLight
            position={[5, 6, 7]}
            angle={0.55}
            penumbra={1}
            intensity={160}
            color="#f2932c"
            decay={2}
            distance={16}
          />
          <SpotLight
            position={[-4.5, 2.5, 7]}
            angle={0.6}
            penumbra={1}
            intensity={90}
            color="#ffe7c2"
            decay={2}
            distance={16}
          />
          <pointLight position={[0, -3, 5]} intensity={25} color="#ffffff" />
          <DevoraNameplateMesh size={size} />
          <Float speed={1.15} rotationIntensity={0.22} floatIntensity={0.1}>
            <DevoraNameplateMesh size={size} />
          </Float>
          <OrbitControls
            enableZoom={false}
            enablePan={false}
            enableRotate={true}
            rotateSpeed={0.45}
            autoRotate
            autoRotateSpeed={1.3}
            target={[0, 0, 0]}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}

function DevoraNameplateMesh({ size }: { size: "sm" | "md" | "lg" }) {
  const groupRef = useRef<THREE.Group>(null);
  const baseScale =
    size === "sm" ? 0.95 : size === "md" ? 1.45 : 2;

  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.getElapsedTime() * 0.22;
    groupRef.current.rotation.y = Math.sin(t) * 0.14;
    groupRef.current.rotation.x = Math.sin(t * 0.7) * 0.05;
  });

  const dim = {
    sm: { w: 1.0, h: 1.0, d: 0.28, bevel: 0.05, br: 0.1 },
    md: { w: 1.15, h: 1.15, d: 0.34, bevel: 0.06, br: 0.12 },
    lg: { w: 1.3, h: 1.3, d: 0.4, bevel: 0.07, br: 0.14 },
  }[size];

  const innerScale = dim.w * 0.32;
  const bracketDepth = dim.d * 0.42;

  return (
    <group ref={groupRef} scale={baseScale}>
      <mesh castShadow material={dBodyMaterial}>
        <DShapeGeometry args={[dim.w, dim.h, dim.d, dim.bevel, dim.br]} />
      </mesh>

      {/* Inner bracket cutout */}
      <mesh position={[0, 0, bracketDepth]} material={bracketMaterial}>
        <boxGeometry args={[innerScale * 1.7, innerScale * 1.7, dim.d * 0.35]} />
      </mesh>

      {/* Rim highlight */}
      <mesh position={[0, 0, dim.d / 2 + 0.005]} material={rimMaterial}>
        <DShapeGeometry args={[dim.w + 0.02, dim.h + 0.02, dim.d, dim.bevel, dim.br]} />
      </mesh>
    </group>
  );
}

const dBodyMaterial = new THREE.MeshPhysicalMaterial({
  color: "#f2932c",
  metalness: 0.55,
  roughness: 0.32,
  clearcoat: 0.3,
  clearcoatRoughness: 0.35,
  envMapIntensity: 1.3,
});

const bracketMaterial = new THREE.MeshPhysicalMaterial({
  color: "#0b0b0c",
  metalness: 0.9,
  roughness: 0.22,
  envMapIntensity: 1.5,
});

const rimMaterial = new THREE.MeshPhysicalMaterial({
  color: "#ffe7c2",
  metalness: 0.95,
  roughness: 0.16,
  clearcoat: 0.5,
  transparent: true,
  opacity: 0.95,
  envMapIntensity: 1.7,
});

function NameplateFallback() {
  return (
    <div
      style={{
        width: 120,
        height: 120,
        borderRadius: 24,
        background: "linear-gradient(135deg, #f2932c, #b85a16)",
        display: "grid",
        placeItems: "center",
        color: "#0b0b0c",
        fontFamily: "var(--mono)",
        fontWeight: 700,
        fontSize: 32,
        boxShadow: "0 0 0 1px rgba(0,0,0,0.25), 0 0 20px rgba(232,122,38,0.4)",
        opacity: 0.9,
      }}
    >
      &lt;/&gt;
    </div>
  );
}

