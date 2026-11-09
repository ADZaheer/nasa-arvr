import { useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Raycaster, Vector3, type Group, type Object3D } from 'three'
import { DWELL_MS, dwellBorn, dwellOccluders, dwellTargets } from './dwell'
import { viewCamera } from './viewCamera'

function visibleInTree(o: Object3D | null): boolean {
  for (; o; o = o.parent) if (!o.visible) return false
  return true
}

/**
 * Gaze dwell: a reticle at the centre of view; looking at a dwell target for 1.5 s selects it.
 * Works in VR (head gaze), handheld AR (screen centre) and phone gyro mode.
 */
/** A target seen within this long after it appeared needs the gaze to leave and come back first. */
const ARM_MS = 2500

export function GazeDwell({ enabled, distance = 1 }: { enabled: boolean; distance?: number }) {
  const defaultCamera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const ray = useMemo(() => new Raycaster(), [])
  const reticle = useRef<Group>(null)
  const st = useRef<{ target: Object3D | null; start: number; fired: boolean }>({ target: null, start: 0, fired: false })
  const [progress, setProgress] = useState(0)
  const o = useMemo(() => new Vector3(), [])
  const d = useMemo(() => new Vector3(), [])

  useFrame(() => {
    const r = reticle.current
    if (!r) return
    r.visible = enabled
    if (!enabled) return
    const camera = viewCamera(gl, defaultCamera)
    camera.getWorldPosition(o)
    camera.getWorldDirection(d)
    ray.set(o, d)
    const objs = [...dwellTargets.keys(), ...dwellOccluders].filter(visibleInTree)
    let target: Object3D | null = null
    for (const hit of ray.intersectObjects(objs, true)) {
      let obj: Object3D | null = hit.object
      while (obj && !dwellTargets.has(obj) && !dwellOccluders.has(obj)) obj = obj.parent
      if (!obj) continue
      if (dwellTargets.has(obj)) target = obj
      break // nearest target or occluder wins
    }
    const now = performance.now()
    const s = st.current
    if (target !== s.target) {
      s.target = target
      s.start = now
      // right after a scene opens you are looking at whatever is in front of you (in the Solar System that
      // is the Sun): don't select it until the gaze has moved off it once
      s.fired = !!target && now - (dwellBorn.get(target) ?? 0) < ARM_MS
    }
    let p = target && !s.fired ? Math.min(1, (now - s.start) / DWELL_MS) : 0
    if (target && p >= 1 && !s.fired) {
      s.fired = true
      p = 0
      dwellTargets.get(target)?.()
    }
    const q = Math.round(p * 24) / 24
    if (q !== progress) setProgress(q)

    r.position.copy(o).addScaledVector(d, distance)
    camera.getWorldQuaternion(r.quaternion)
    r.scale.setScalar(distance)
  })

  return (
    <group ref={reticle} renderOrder={999}>
      <mesh renderOrder={999}>
        <ringGeometry args={[0.008, 0.012, 32]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.8} depthTest={false} depthWrite={false} />
      </mesh>
      {progress > 0 && (
        <mesh renderOrder={1000}>
          <ringGeometry args={[0.016, 0.022, 48, 1, Math.PI / 2, -progress * Math.PI * 2]} />
          <meshBasicMaterial color="#4fd1ff" depthTest={false} depthWrite={false} />
        </mesh>
      )}
    </group>
  )
}
