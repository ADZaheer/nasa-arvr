import { useCallback, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Billboard, Text } from '@react-three/drei'
import { DoubleSide, type Group, type Mesh } from 'three'
import { BODIES, type BodyInfo } from './bodies'
import { hasContent } from './content'
import { useXRApp } from './store'
import { useDwellTarget } from './dwell'
import { FONT, FONT_BOLD } from './font'
import { Sun } from './space'

const GOLDEN = 2.39996

/** Body picker. Sizes and distances are deliberately NOT to scale. */
export function SolarSystemHub({ tilt = 0 }: { tilt?: number }) {
  return (
    <group rotation={[tilt, 0, 0]}>
      {BODIES.filter((b) => b.orbit > 0).map((b) => (
        <mesh key={`orbit-${b.id}`} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[b.orbit - 0.004, b.orbit + 0.004, 128]} />
          <meshBasicMaterial color={b.kind === 'asteroid' ? '#5a5146' : '#33415e'} side={DoubleSide} transparent opacity={0.6} />
        </mesh>
      ))}
      {BODIES.map((b, i) => {
        const a = i * GOLDEN
        return <HubBody key={b.id} b={b} position={[Math.cos(a) * b.orbit, 0, Math.sin(a) * b.orbit]} />
      })}
      <Billboard position={[0, 0.95, 0]}>
        <Text font={FONT_BOLD} fontSize={0.2} color="#ffffff" anchorY="bottom">
          Choose a destination
        </Text>
        <Text font={FONT} position={[0, -0.04, 0]} fontSize={0.09} color="#ffcc55" anchorY="top">
          Not to scale: sizes and distances are exaggerated
        </Text>
      </Billboard>
    </group>
  )
}

function HubBody({ b, position }: { b: BodyInfo; position: [number, number, number] }) {
  const [hover, setHover] = useState(false)
  const labels = useXRApp((s) => s.settings.labels)
  const hit = useRef<Mesh>(null)
  const spin = useRef<Group>(null)
  const explorable = hasContent(b.id)
  const select = useCallback(() => useXRApp.getState().selectBody(b.id), [b.id])
  useDwellTarget(hit, select)
  useFrame((_, dt) => {
    if (spin.current) spin.current.rotation.y += dt * 0.3
  })
  const s = hover ? 1.25 : 1

  return (
    <group position={position}>
      {b.kind === 'star' && <Sun radius={b.size} />}
      <group ref={spin} scale={s}>
        <mesh>
          <sphereGeometry args={[b.size, 32, 24]} />
          <meshStandardMaterial color={b.color} roughness={1} emissive={b.color} emissiveIntensity={hover ? 0.35 : 0.12} visible={b.kind !== 'star'} />
        </mesh>
        {b.rings && (
          <mesh rotation={[-Math.PI / 2 + 0.4, 0, 0]}>
            <ringGeometry args={[b.size * 1.3, b.size * 2.1, 64]} />
            <meshBasicMaterial color="#cdb987" side={DoubleSide} transparent opacity={0.6} />
          </mesh>
        )}
      </group>
      {explorable && (
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[Math.max(b.size, 0.05) * 1.6, Math.max(b.size, 0.05) * 1.6 + 0.012, 48]} />
          <meshBasicMaterial color="#4fd1ff" side={DoubleSide} toneMapped={false} />
        </mesh>
      )}
      <mesh
        ref={hit}
        onPointerOver={(e) => {
          e.stopPropagation()
          setHover(true)
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => {
          setHover(false)
          document.body.style.cursor = ''
        }}
        onClick={(e) => {
          e.stopPropagation()
          select()
        }}
      >
        <sphereGeometry args={[Math.max(b.size * 1.5, 0.11), 12, 12]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <Billboard position={[0, -Math.max(b.size, 0.05) - 0.06, 0]}>
        <Text
          font={hover ? FONT_BOLD : FONT}
          fillOpacity={hover ? 1 : labels}
          outlineOpacity={hover ? 1 : labels}
          visible={hover || labels > 0.02}
          fontSize={hover ? 0.1 : 0.075}
          color={explorable ? '#ffffff' : '#aab4cc'}
          anchorY="top"
          outlineWidth={0.004}
          outlineColor="#000"
        >
          {b.name + (explorable ? ' ●' : '')}
        </Text>
      </Billboard>
    </group>
  )
}
