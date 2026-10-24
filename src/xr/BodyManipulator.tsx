import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { useStore } from 'zustand'
import { Matrix4, Quaternion, Ray, Sphere, Vector3, type Group, type Object3D } from 'three'
import { xrStore } from './xrStore'
import { haptic } from './feedback'

/** Shared with the body explorer: while you hold the planet it stops its slow auto-spin. */
export const manipulation = { active: false }

const MIN_SCALE = 0.5
const MAX_SCALE = 3

function inputObject(src: XRInputSource): Object3D | undefined {
  return (xrStore.getState().inputSourceStates.find((s) => s.inputSource === src) as { object?: Object3D } | undefined)?.object
}

interface Grab {
  src: XRInputSource
  prev: Vector3
}

/**
 * Hands-on planets (VR): grab a planet or asteroid and turn it like a globe in your hands.
 * - Controllers: squeeze the grip while your hand is near it or while pointing at it.
 * - Hand tracking: pinch with your hand close to it.
 * - Both hands: pull apart / push together to zoom (0.5×–3×), and twist to turn it.
 * Let go while turning and it keeps spinning, slowing down gently.
 * `target` is the group holding the body (radius 1 in its local units).
 */
export function useBodyManipulation(target: RefObject<Group | null>) {
  const session = useStore(xrStore, (s) => s.session)
  const grabs = useRef<Grab[]>([])
  const two = useRef<{ dist: number; scale: number; axis: Vector3 } | null>(null)
  const momentum = useRef({ axis: new Vector3(0, 1, 0), speed: 0 })
  const v = useMemo(() => ({ c: new Vector3(), a: new Vector3(), b: new Vector3(), p: new Vector3(), q: new Quaternion(), s: new Vector3(), sphere: new Sphere(), ray: new Ray(), m: new Matrix4(), m2: new Matrix4() }), [])

  useEffect(() => {
    if (!session) return
    const center = () => {
      const g = target.current!
      g.getWorldPosition(v.c)
      g.getWorldScale(v.s)
      return v.s.x
    }
    const start = (e: XRInputSourceEvent) => {
      const g = target.current
      const obj = inputObject(e.inputSource)
      if (!g || !obj || grabs.current.some((x) => x.src === e.inputSource)) return
      // pinch (select) only grabs with tracked hands; controllers use the grip button
      if (e.type === 'selectstart' && !e.inputSource.hand) return
      const r = center()
      obj.updateWorldMatrix(true, false)
      const p = v.p.setFromMatrixPosition(obj.matrixWorld)
      const near = p.distanceTo(v.c) < r * 1.35 + 0.12
      let pointing = false
      if (!near && !e.inputSource.hand) {
        // aim along the controller's pointing ray (target-ray space), not the grip's axis, which tilts down
        v.m.copy(obj.matrixWorld)
        const grip = e.inputSource.gripSpace
        try {
          const rel = grip ? e.frame.getPose(e.inputSource.targetRaySpace, grip) : null
          if (rel) v.m.multiply(v.m2.fromArray(rel.transform.matrix))
        } catch {
          /* frame no longer active: fall back to the grip axis */
        }
        v.ray.origin.setFromMatrixPosition(v.m)
        v.ray.direction.set(0, 0, -1).transformDirection(v.m)
        pointing = v.ray.intersectsSphere(v.sphere.set(v.c, r * 1.05))
      }
      if (!near && !pointing) return
      grabs.current.push({ src: e.inputSource, prev: p.clone() })
      momentum.current.speed = 0
      two.current = null
      manipulation.active = true
      haptic(0.35, 40)
    }
    const end = (e: XRInputSourceEvent) => {
      const before = grabs.current.length
      grabs.current = grabs.current.filter((x) => x.src !== e.inputSource)
      if (grabs.current.length !== before) two.current = null
      if (!grabs.current.length) manipulation.active = false
    }
    session.addEventListener('squeezestart', start)
    session.addEventListener('selectstart', start)
    session.addEventListener('squeezeend', end)
    session.addEventListener('selectend', end)
    session.addEventListener('inputsourceschange', end as never)
    return () => {
      session.removeEventListener('squeezestart', start)
      session.removeEventListener('selectstart', start)
      session.removeEventListener('squeezeend', end)
      session.removeEventListener('selectend', end)
      session.removeEventListener('inputsourceschange', end as never)
      grabs.current = []
      manipulation.active = false
    }
  }, [session, target, v])

  useFrame((_, rawDt) => {
    const g = target.current
    if (!g) return
    const dt = Math.min(rawDt, 0.05)
    const list = grabs.current
    if (!list.length) {
      // coast: keep spinning after a flick, slowing down
      const m = momentum.current
      if (m.speed > 0.01) {
        g.quaternion.premultiply(v.q.setFromAxisAngle(m.axis, m.speed * dt))
        m.speed *= Math.exp(-dt * 1.6)
      }
      return
    }
    g.getWorldPosition(v.c)
    const cur = list.map((x) => {
      const obj = inputObject(x.src)
      if (obj) {
        obj.updateWorldMatrix(true, false)
        return new Vector3().setFromMatrixPosition(obj.matrixWorld)
      }
      return x.prev.clone()
    })
    if (list.length === 1) {
      // turn like a trackball around the centre
      v.a.copy(list[0].prev).sub(v.c)
      v.b.copy(cur[0]).sub(v.c)
      if (v.a.lengthSq() > 1e-6 && v.b.lengthSq() > 1e-6) {
        v.q.setFromUnitVectors(v.a.normalize(), v.b.normalize())
        g.quaternion.premultiply(v.q)
        const angle = 2 * Math.acos(Math.min(1, Math.abs(v.q.w)))
        if (angle > 1e-4) {
          const s = Math.sqrt(1 - v.q.w * v.q.w) || 1
          momentum.current.axis.set(v.q.x / s, v.q.y / s, v.q.z / s).normalize()
          momentum.current.speed = momentum.current.speed * 0.6 + (angle / dt) * 0.4
        }
      }
    } else {
      // two hands: distance → zoom, twist of the hand-to-hand line → turn
      const axis = v.a.copy(cur[1]).sub(cur[0])
      const dist = axis.length()
      if (!two.current) two.current = { dist, scale: g.scale.x, axis: axis.clone().normalize() }
      else {
        const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, (two.current.scale * dist) / Math.max(0.02, two.current.dist)))
        g.scale.setScalar(s)
        axis.normalize()
        g.quaternion.premultiply(v.q.setFromUnitVectors(two.current.axis, axis))
        two.current.axis.copy(axis)
      }
      momentum.current.speed = 0
    }
    list.forEach((x, i) => x.prev.copy(cur[i]))
  })
}
