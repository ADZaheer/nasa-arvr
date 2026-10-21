import { useCallback, useMemo, useRef, useState } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { Billboard, Text } from '@react-three/drei'
import { AdditiveBlending, Quaternion, Vector3, type BufferGeometry, type Group, type Mesh } from 'three'
import type { BodyContent, Hotspot } from './types'
import { latLonToVec3, snapToSurface } from './geo'
import { useXRApp } from './store'
import { useDwellTarget } from './dwell'
import { KIND_COLORS } from './bodies'
import { FONT_BOLD } from './font'
import { viewCamera } from './viewCamera'

const MAX_LABELS = 6
const UP = new Vector3(0, 1, 0)

interface Placed {
  h: Hotspot
  pos: Vector3
  normal: Vector3
}

/**
 * Glowing pins on a body. Planets: lat/lon on a unit sphere. Asteroids: a direction snapped onto the mesh.
 * Pointing works through any R3F/@react-three/xr pointer (mouse, touch, XR controller/hand ray, AR screen tap)
 * plus gaze dwell. Only the MAX_LABELS nearest camera-facing pins show labels at once.
 */
export function Hotspots({ content, geometry }: { content: BodyContent; geometry: BufferGeometry | null }) {
  const pins = useXRApp((st) => st.settings.pins)
  const placed = useMemo<Placed[]>(() => {
    const out: Placed[] = []
    for (const h of content.hotspots) {
      if (h.anchor.type === 'latlon') {
        const pos = latLonToVec3(h.anchor.lat, h.anchor.lon, 1.002)
        out.push({ h, pos, normal: pos.clone().normalize() })
      } else if (h.anchor.type === 'mesh' && geometry) {
        const { point, normal } = snapToSurface(geometry, h.anchor.point)
        out.push({ h, pos: point, normal })
      }
    }
    return out
  }, [content, geometry])

  const groups = useRef<Record<string, Group | null>>({})
  const [labelled, setLabelled] = useState<string>('')
  const last = useRef(0)
  const tmp = useMemo(() => ({ wp: new Vector3(), cam: new Vector3(), n: new Vector3() }), [])

  useFrame(({ camera, gl, clock }) => {
    const t = clock.elapsedTime
    if (t - last.current < 0.25) return
    last.current = t
    viewCamera(gl, camera).getWorldPosition(tmp.cam)
    const ranked: { id: string; dist: number }[] = []
    for (const p of placed) {
      const g = groups.current[p.h.id]
      if (!g || !g.parent) continue
      g.getWorldPosition(tmp.wp)
      tmp.n.copy(p.normal).transformDirection(g.parent.matrixWorld)
      const toCam = tmp.cam.clone().sub(tmp.wp)
      const dist = toCam.length()
      if (tmp.n.dot(toCam.normalize()) > 0.05) ranked.push({ id: p.h.id, dist })
    }
    ranked.sort((a, b) => a.dist - b.dist)
    const key = ranked
      .slice(0, MAX_LABELS)
      .map((r) => r.id)
      .sort()
      .join('|')
    if (key !== labelled) setLabelled(key)
  })

  const labelSet = useMemo(() => new Set(labelled.split('|')), [labelled])

  if (!pins) return null
  return (
    <group>
      {placed.map((p) => (
        <Pin key={p.h.id} p={p} showLabel={labelSet.has(p.h.id)} groupRef={(g) => (groups.current[p.h.id] = g)} />
      ))}
    </group>
  )
}

function Pin({ p, showLabel, groupRef }: { p: Placed; showLabel: boolean; groupRef: (g: Group | null) => void }) {
  const { h } = p
  const hovered = useXRApp((s) => s.hoveredId === h.id)
  const labels = useXRApp((s) => s.settings.labels)
  const selected = useXRApp((s) => s.hotspotId === h.id)
  const hit = useRef<Mesh>(null)
  const glow = useRef<Mesh>(null)
  const quat = useMemo(() => new Quaternion().setFromUnitVectors(UP, p.normal), [p.normal])
  const color = KIND_COLORS[h.kind]

  const select = useCallback(() => {
    const s = useXRApp.getState()
    s.selectHotspot(s.hotspotId === h.id ? null : h.id)
  }, [h.id])
  useDwellTarget(hit, select)

  useFrame(({ clock }) => {
    const g = glow.current
    if (!g) return
    const base = hovered || selected ? 1.7 : 1
    g.scale.setScalar(base * (1 + 0.15 * Math.sin(clock.elapsedTime * 3 + h.id.length)))
  })

  const over = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    useXRApp.getState().setHovered(h.id)
    document.body.style.cursor = 'pointer'
  }
  const out = () => {
    const s = useXRApp.getState()
    if (s.hoveredId === h.id) s.setHovered(null)
    document.body.style.cursor = ''
  }

  return (
    <group ref={groupRef} position={p.pos} quaternion={quat}>
      <mesh position={[0, 0.03, 0]}>
        <cylinderGeometry args={[0.003, 0.003, 0.06, 6]} />
        <meshBasicMaterial color={color} transparent opacity={0.7} />
      </mesh>
      <mesh position={[0, 0.065, 0]}>
        <sphereGeometry args={[0.02, 16, 16]} />
        <meshBasicMaterial color={hovered || selected ? '#ffffff' : color} toneMapped={false} />
      </mesh>
      <mesh ref={glow} position={[0, 0.065, 0]}>
        <sphereGeometry args={[0.04, 16, 16]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={hovered || selected ? 0.55 : 0.22}
          depthWrite={false}
          blending={AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
      {/* generous invisible hit target for rays, fingers and gaze */}
      <mesh
        ref={hit}
        position={[0, 0.06, 0]}
        onPointerOver={over}
        onPointerOut={out}
        onClick={(e) => {
          e.stopPropagation()
          select()
        }}
      >
        <sphereGeometry args={[0.075, 12, 12]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {((showLabel && labels > 0.02) || hovered || selected) && (
        <Billboard position={[0, 0.12, 0]}>
          <Text
            font={FONT_BOLD}
            fontSize={hovered || selected ? 0.06 : 0.048}
            fillOpacity={hovered || selected ? 1 : labels}
            outlineOpacity={hovered || selected ? 1 : labels}
            color="#ffffff"
            outlineWidth={0.005}
            outlineColor="#000000"
            anchorY="bottom"
            maxWidth={0.9}
            textAlign="center"
          >
            {h.title}
          </Text>
        </Billboard>
      )}
    </group>
  )
}
