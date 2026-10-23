import { useRef } from 'react'
import type { Mesh } from 'three'
import { useDwellTarget } from './dwell'
import { Button, type IconName, type Tone } from './ui3d'

const TONE_OF: Record<string, Tone> = { '#2f6fed': 'blue', '#b5562b': 'warm', '#2bb8b0': 'accent' }

/** A 3D button in world/stage units, usable with XR rays, finger poke, mouse, touch and gaze dwell. */
export function Button3D({
  label,
  onClick,
  position,
  width = 0.5,
  height = 0.12,
  color,
  icon,
  tone,
}: {
  label?: string
  onClick: () => void
  position: [number, number, number]
  width?: number
  height?: number
  /** legacy colour → tone */
  color?: string
  icon?: IconName
  tone?: Tone
}) {
  const ref = useRef<Mesh>(null)
  useDwellTarget(ref, onClick)
  return <Button label={label} icon={icon} tone={tone ?? (color ? (TONE_OF[color] ?? 'plate') : 'plate')} onPress={onClick} position={position} width={width} height={height} plateRef={ref} />
}
