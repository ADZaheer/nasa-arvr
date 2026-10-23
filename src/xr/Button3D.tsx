import { useRef, useState } from 'react'
import { Text } from '@react-three/drei'
import type { Mesh } from 'three'
import { useDwellTarget } from './dwell'
import { FONT_BOLD } from './font'
import { hoverFeedback, pressFeedback } from './feedback'
import { useSpringScale } from './ui3d'

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
  const spring = useSpringScale(hover)
  return (
    <group position={position} ref={spring.ref}>
      <mesh
        ref={ref}
        onPointerOver={(e) => {
          e.stopPropagation()
          hoverFeedback()
          setHover(true)
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => {
          setHover(false)
          document.body.style.cursor = ''
        }}
        onClick={(e) => {
          e.stopPropagation()
          spring.press()
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
