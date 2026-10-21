import { useRef, useState } from 'react'
import { Text } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { MeshBasicMaterial, Vector3, type Mesh } from 'three'
import { FONT, FONT_BOLD } from './font'
import { pressFeedback } from './feedback'

/**
 * Small 3D UI kit for in-world panels (wrist menu). Works with controller rays, hand rays (pinch),
 * hand poke (touch pointer) and mouse. Units: the parent panel is scaled so 1 unit ≈ 10 cm.
 */
export const TEAL = '#2bb8b0'
const PANEL = '#0c2a2e'
const PANEL_HI = '#12484d'
const noFog = new MeshBasicMaterial({ fog: false, toneMapped: false })

function useHover() {
  const [hover, setHover] = useState(false)
  return {
    hover,
    bind: {
      onPointerOver: (e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation()
        setHover(true)
      },
      onPointerOut: () => setHover(false),
    },
  }
}

export function Label({ text, position, size = 0.11, color = '#dff7f5', bold = false, anchorX = 'left' as 'left' | 'center' | 'right' }: {
  text: string
  position: [number, number, number]
  size?: number
  color?: string
  bold?: boolean
  anchorX?: 'left' | 'center' | 'right'
}) {
  return (
    <Text font={bold ? FONT_BOLD : FONT} material={noFog} position={position} fontSize={size} color={color} anchorX={anchorX} anchorY="middle">
      {text}
    </Text>
  )
}

export function Tile({ label, active, onPress, position, width = 0.9, height = 0.32 }: {
  label: string
  active?: boolean
  onPress: () => void
  position: [number, number, number]
  width?: number
  height?: number
}) {
  const { hover, bind } = useHover()
  return (
    <group position={position}>
      <mesh
        {...bind}
        onClick={(e) => {
          e.stopPropagation()
          pressFeedback()
          onPress()
        }}
      >
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial color={active ? TEAL : hover ? PANEL_HI : PANEL} fog={false} toneMapped={false} />
      </mesh>
      <Text font={FONT_BOLD} material={noFog} position={[0, 0, 0.005]} fontSize={height * 0.34} maxWidth={width * 0.92} textAlign="center" color={active ? '#021c1e' : '#dff7f5'} anchorX="center" anchorY="middle">
        {label}
      </Text>
    </group>
  )
}

export function Toggle3D({ label, value, onChange, position, width = 2.1 }: {
  label: string
  value: boolean
  onChange: (v: boolean) => void
  position: [number, number, number]
  width?: number
}) {
  const { hover, bind } = useHover()
  return (
    <group position={position}>
      <Label text={label} position={[-width / 2, 0, 0.005]} />
      <group position={[width / 2 - 0.25, 0, 0]}>
        <mesh
          {...bind}
          onClick={(e) => {
            e.stopPropagation()
            pressFeedback()
            onChange(!value)
          }}
        >
          <planeGeometry args={[0.5, 0.24]} />
          <meshBasicMaterial color={value ? TEAL : hover ? PANEL_HI : '#24393b'} fog={false} toneMapped={false} />
        </mesh>
        <mesh position={[value ? 0.13 : -0.13, 0, 0.005]}>
          <circleGeometry args={[0.09, 20]} />
          <meshBasicMaterial color="#ffffff" fog={false} toneMapped={false} />
        </mesh>
      </group>
    </group>
  )
}

export function Slider3D({ label, value, min, max, format, onChange, position, width = 2.1, disabled = false }: {
  label: string
  value: number
  min: number
  max: number
  format: (v: number) => string
  onChange: (v: number) => void
  position: [number, number, number]
  width?: number
  disabled?: boolean
}) {
  const track = useRef<Mesh>(null)
  const dragging = useRef(false)
  const tmp = useRef(new Vector3())
  const trackW = width - 0.1
  const t = (value - min) / (max - min)
  const update = (e: ThreeEvent<PointerEvent>) => {
    const m = track.current
    if (!m || disabled) return
    const local = m.worldToLocal(tmp.current.copy(e.point))
    const f = Math.min(1, Math.max(0, local.x / trackW + 0.5))
    onChange(+(min + f * (max - min)).toFixed(3))
  }
  return (
    <group position={position}>
      <Label text={label} position={[-width / 2, 0.14, 0.005]} color={disabled ? '#6f8c8b' : '#dff7f5'} />
      <Label text={disabled ? 'on the surface' : format(value)} position={[width / 2, 0.14, 0.005]} anchorX="right" color={TEAL} size={0.1} />
      <mesh position={[0, -0.08, 0]}>
        <planeGeometry args={[trackW, 0.05]} />
        <meshBasicMaterial color="#24393b" fog={false} toneMapped={false} />
      </mesh>
      <mesh position={[(-trackW / 2) * (1 - t), -0.08, 0.002]}>
        <planeGeometry args={[trackW * t, 0.05]} />
        <meshBasicMaterial color={disabled ? '#3d5554' : TEAL} fog={false} toneMapped={false} />
      </mesh>
      <mesh position={[-trackW / 2 + trackW * t, -0.08, 0.004]}>
        <circleGeometry args={[0.07, 20]} />
        <meshBasicMaterial color="#ffffff" fog={false} toneMapped={false} />
      </mesh>
      {/* tall invisible hit strip: easy to poke, click or drag */}
      <mesh
        ref={track}
        position={[0, -0.08, 0.006]}
        onPointerDown={(e) => {
          e.stopPropagation()
          dragging.current = true
          update(e)
        }}
        onPointerMove={(e) => dragging.current && update(e)}
        onPointerUp={() => (dragging.current = false)}
        onPointerOut={() => (dragging.current = false)}
      >
        <planeGeometry args={[trackW + 0.1, 0.26]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  )
}

export function Choice3D({ label, value, options, onChange, position, width = 2.1 }: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
  position: [number, number, number]
  width?: number
}) {
  const w = width / options.length
  return (
    <group position={position}>
      <Label text={label} position={[-width / 2, 0.16, 0.005]} />
      {options.map((o, i) => (
        <Tile key={o.value} label={o.label} active={o.value === value} onPress={() => onChange(o.value)} position={[-width / 2 + w * (i + 0.5), -0.1, 0]} width={w - 0.04} height={0.24} />
      ))}
    </group>
  )
}
