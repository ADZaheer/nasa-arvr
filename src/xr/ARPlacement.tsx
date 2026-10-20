import { useEffect, useMemo, useRef } from 'react'
import { useXR, useXRHitTest } from '@react-three/xr'
import { Matrix4, Vector3, type Mesh } from 'three'
import { useXRApp } from './store'

/**
 * Handheld AR tabletop placement: a reticle follows the hit-test result at the screen centre;
 * tapping places the scene there. "Move model" in the HUD clears the anchor to place again.
 */
export function ARPlacement() {
  const placed = useXRApp((s) => s.arAnchor !== null)
  const session = useXR((s) => s.session)
  const reticle = useRef<Mesh>(null)
  const latest = useRef<Vector3 | null>(null)
  const m = useMemo(() => new Matrix4(), [])

  useXRHitTest((results, getWorldMatrix) => {
    const r = reticle.current
    if (!r) return
    if (placed || results.length === 0 || !getWorldMatrix(m, results[0])) {
      r.visible = false
      latest.current = null
      return
    }
    const p = new Vector3().setFromMatrixPosition(m)
    r.position.copy(p)
    r.visible = true
    latest.current = p
  }, 'viewer')

  useEffect(() => {
    if (!session) return
    const onSelect = () => {
      const s = useXRApp.getState()
      if (s.arAnchor || !latest.current) return
      const p = latest.current
      s.setArAnchor([p.x, p.y, p.z])
    }
    session.addEventListener('select', onSelect)
    return () => session.removeEventListener('select', onSelect)
  }, [session])

  return (
    <mesh ref={reticle} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
      <ringGeometry args={[0.06, 0.075, 40]} />
      <meshBasicMaterial color="#4fd1ff" transparent opacity={0.9} />
    </mesh>
  )
}
