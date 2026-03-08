import React, { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Line } from "@react-three/drei";

export default function Interviewer3D({
  mode = "idle",
  aiSpeaking = false,
  volumeLevel = 0.2,
}) {
  return (
    <div style={{ width: "100%", height: "100%" }}>
      <Canvas camera={{ position: [0, 0, 5], fov: 35 }} dpr={[1, 2]}>
        <ambientLight intensity={0.8} />
        <pointLight position={[0, 2, 3]} intensity={1.2} />
        <WaveScene mode={mode} aiSpeaking={aiSpeaking} volumeLevel={volumeLevel} />
      </Canvas>
    </div>
  );
}

function WaveScene({ mode, aiSpeaking, volumeLevel }) {
  const groupRef = useRef();

  useFrame((state) => {
    const t = state.clock.getElapsedTime();

    if (groupRef.current) {
      groupRef.current.rotation.z = Math.sin(t * 0.4) * 0.02;
      groupRef.current.position.y = Math.sin(t * 0.8) * 0.03;
    }
  });

  return (
    <group ref={groupRef}>
      <mesh position={[0, 0, -2]}>
        <planeGeometry args={[12, 8]} />
        <meshStandardMaterial color="#081120" />
      </mesh>

      <mesh position={[0, 0, -1]}>
        <planeGeometry args={[3.5, 3.5]} />
        <meshBasicMaterial color="#0ea5e9" transparent opacity={0.08} />
      </mesh>

      <AudioWave
        y={0}
        width={4.8}
        aiSpeaking={aiSpeaking}
        volumeLevel={volumeLevel}
        mode={mode}
      />

      <AudioWave
        y={0.28}
        width={4.2}
        aiSpeaking={aiSpeaking}
        volumeLevel={volumeLevel * 0.7}
        mode={mode}
        opacity={0.35}
      />

      <AudioWave
        y={-0.28}
        width={4.2}
        aiSpeaking={aiSpeaking}
        volumeLevel={volumeLevel * 0.7}
        mode={mode}
        opacity={0.35}
      />
    </group>
  );
}

function AudioWave({
  y = 0,
  width = 4.8,
  aiSpeaking,
  volumeLevel,
  mode,
  opacity = 1,
}) {
  const lineRef = useRef();
  const pointCount = 120;

  const basePoints = useMemo(() => {
    const pts = [];
    for (let i = 0; i < pointCount; i++) {
      const x = (i / (pointCount - 1)) * width - width / 2;
      pts.push([x, y, 0]);
    }
    return pts;
  }, [width, y]);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();

    const thinkingBoost = mode === "thinking" ? 0.08 : 0;
    const activeAmp = aiSpeaking ? 0.08 + volumeLevel * 0.9 : 0.03 + thinkingBoost;
    const speed = aiSpeaking ? 3.5 : 1.4;

    const points = [];

    for (let i = 0; i < pointCount; i++) {
      const x = (i / (pointCount - 1)) * width - width / 2;
      const envelope = Math.exp(-Math.pow(x / 1.8, 2));

      const wave1 = Math.sin(x * 4.2 - t * speed * 3.0);
      const wave2 = Math.sin(x * 7.0 + t * speed * 2.2);
      const wave3 = Math.sin(x * 10.5 - t * speed * 1.3);

      const combined = (wave1 * 0.5 + wave2 * 0.3 + wave3 * 0.2) * envelope;
      const yy = y + combined * activeAmp;

      points.push([x, yy, 0]);
    }

    if (lineRef.current) {
      lineRef.current.geometry.setPositions(points.flat());
      lineRef.current.material.opacity = aiSpeaking ? 0.95 * opacity : 0.45 * opacity;
    }
  });

  return (
    <Line
      ref={lineRef}
      points={basePoints}
      color="#38bdf8"
      lineWidth={2.2}
      transparent
      opacity={opacity}
    />
  );
}