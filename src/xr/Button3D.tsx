import { useRef, useState } from 'react'
import { Text } from '@react-three/drei'
import type { Mesh } from 'three'
import { useDwellTarget } from './dwell'
import { FONT_BOLD } from './font'
import { pressFeedback } from './feedback'

/** A flat 3D button usable with XR rays/hands, mouse, touch and gaze dwell. */
export function Button3D({
  label,
  onClick,
  position,
  width = 0.5,
  height = 0.12,
  color = '#1d2a4a',
  textColor = '#ffffff',
}: {
  label: string
  onClick: () => void
  position: [number, number, number]
  width?: number
  height?: number
  color?: string
  textColor?: string
}) {
  const [hover, setHover] = useState(false)
  const ref = useRef<Mesh>(null)
  useDwellTarget(ref, onClick)
  return (
    <group position={position}>
      <mesh
        ref={ref}
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
          pressFeedback()
          onClick()
        }}
      >
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial color={hover ? '#3b5bdb' : color} />
      </mesh>
      <Text font={FONT_BOLD} position={[0, 0, 0.002]} fontSize={height * 0.42} color={textColor} anchorX="center" anchorY="middle">
        {label}
      </Text>
    </group>
  )
}
