import { useEffect, useMemo, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import { useXR, useXRHitTest } from '@react-three/xr'
import { Matrix4, Vector3, type Mesh } from 'three'
import { useXRApp } from './store'
import { viewCamera } from './viewCamera'

/**
 * AR placement. With hit-testing (most phones, Quest 3) a reticle follows the real surface at the screen
 * centre / where you look, and a tap or pinch places the scene there. Devices whose AR has no hit-testing
 * still work: a tap places the model in front of you (a table-height spot, or the floor for the life-size
 * rover). "Move model" in the HUD / "Move it" in the wrist menu clears the anchor to place again.
 */
export function ARPlacement() {
  const placed = useXRApp((s) => s.arAnchor !== null)
  const session = useXR((s) => s.session)
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)
  const reticle = useRef<Mesh>(null)
  const latest = useRef<Vector3 | null>(null)
  const lastHit = useRef(0)
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
    lastHit.current = performance.now()
  }, 'viewer')

  useEffect(() => {
    if (!session) return
    const features = (session as XRSession & { enabledFeatures?: string[] }).enabledFeatures
    const noHitTest = Array.isArray(features) && !features.includes('hit-test')
    useXRApp.setState({ arNoHitTest: noHitTest })
    const onSelect = () => {
      const s = useXRApp.getState()
      if (s.arAnchor) return
      if (latest.current) {
        const p = latest.current
        s.setArAnchor([p.x, p.y, p.z])
        return
      }
      // surfaces were found a moment ago: wait for the reticle rather than guessing
      if (!noHitTest && performance.now() - lastHit.current < 4000) return
      // no surface found (or no hit-testing at all): place it in front of you
      const cam = viewCamera(gl, camera)
      const head = cam.getWorldPosition(new Vector3())
      const fwd = cam.getWorldDirection(new Vector3())
      fwd.y = 0
      if (fwd.lengthSq() < 1e-4) fwd.set(0, 0, -1)
      fwd.normalize()
      const rover = s.arModel === 'rover'
      const at = head.addScaledVector(fwd, rover ? 2.2 : 0.8)
      at.y -= rover ? 1.4 : 0.45
      s.setArAnchor([at.x, at.y, at.z])
    }
    session.addEventListener('select', onSelect)
    return () => {
      session.removeEventListener('select', onSelect)
      useXRApp.setState({ arNoHitTest: false })
    }
  }, [session, gl, camera])

  return (
    <mesh ref={reticle} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
      <ringGeometry args={[0.06, 0.075, 40]} />
      <meshBasicMaterial color="#4fd1ff" transparent opacity={0.9} />
    </mesh>
  )
}
