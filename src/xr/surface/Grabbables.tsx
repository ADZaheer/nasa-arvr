import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useStore } from 'zustand'
import { Euler, IcosahedronGeometry, Matrix4, Quaternion, Vector3, type Mesh, type MeshStandardMaterial, type Object3D } from 'three'
import { xrStore } from '../xrStore'
import { viewCamera } from '../viewCamera'
import { haptic, playClick, playLand } from '../feedback'
import { missionEvent } from '../missions'
import type { SiteContent } from '../types'
import type { HeightField } from './terrain'
import { vnoise } from './terrain'
import { world } from './player'
import { emitPuff } from './particles'
import { useRockMaterial } from './materials'
import type { TierParams } from '../quality'

/**
 * Loose rocks you can pick up and throw in Mars' 38% gravity.
 * - VR controllers: grip (squeeze) or trigger near a rock grabs it; pointing at a rock and pressing pulls it
 *   to your hand (Quest-style distance grab). Release to throw — speed comes from your hand's motion.
 * - Hand tracking: pinch near a rock (or pinch while pointing at one) to grab; open to throw.
 * - Desktop / phone: click or tap a rock to pick it up; click or tap again to throw it forward.
 * Simple physics: gravity, bounce, friction on the terrain; a dust puff and thud on impact.
 */
interface Rock {
  pos: Vector3
  vel: Vector3
  quat: Quaternion
  spin: Vector3
  radius: number
  holder: XRInputSource | 'screen' | null
  /** rock pose relative to the holder (near grab) */
  offset: Matrix4
  /** 1 → 0 while being pulled to the hand */
  pull: number
  history: { p: Vector3; t: number }[]
  thrownFrom: Vector3 | null
  /** where it started, to put it back after it is lost (e.g. thrown off Bennu) */
  home: Vector3
  lostAt: number
  sleeping: boolean
  hot: number
}

const COUNT = 7
const tmpM = new Matrix4()
const tmpM2 = new Matrix4()
const tmpV = new Vector3()
const tmpV2 = new Vector3()
const tmpQ = new Quaternion()
const tmpS = new Vector3()
const tmpE = new Euler()

/** The tracked object (controller grip / hand) for an input source; transient screen pointers have none. */
function objectOf(s: unknown): Object3D | undefined {
  return (s as { object?: Object3D }).object
}
function inputObject(src: XRInputSource): Object3D | undefined {
  return objectOf(xrStore.getState().inputSourceStates.find((s) => s.inputSource === src))
}

export function Grabbables({ site, hf, q }: { site: SiteContent; hf: HeightField; q: TierParams }) {
  const material = useRockMaterial(q.textures)
  const session = useStore(xrStore, (s) => s.session)
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const meshes = useRef<(Mesh | null)[]>([])
  const mats = useMemo(() => Array.from({ length: COUNT }, () => material.clone() as MeshStandardMaterial), [material])
  useEffect(() => () => mats.forEach((m) => m.dispose()), [mats])

  const geometry = useMemo(() => {
    const g = new IcosahedronGeometry(1, 2)
    const p = g.attributes.position
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i)
      const d = 1 + 0.22 * vnoise(x * 2.1 + 3, y * 2.4 - z * 1.3) + 0.07 * vnoise(x * 6.3, z * 5.9 + y * 4.1)
      p.setXYZ(i, x * d, y * d * 0.8, z * d)
    }
    g.computeVertexNormals()
    return g
  }, [])

  const rocks = useMemo<Rock[]>(() => {
    const out: Rock[] = []
    for (let i = 0; i < COUNT; i++) {
      const a = (i / COUNT) * Math.PI * 2 + 0.4
      const r = 2.2 + (i % 3) * 1.6
      const x = site.spawn.x + Math.cos(a) * r, z = site.spawn.z + Math.sin(a) * r
      const radius = 0.09 + ((i * 37) % 10) * 0.012
      out.push({
        pos: new Vector3(x, hf.heightAt(x, z) + radius * 0.8, z),
        vel: new Vector3(),
        quat: new Quaternion().setFromAxisAngle(new Vector3(Math.sin(i), 1, Math.cos(i)).normalize(), i),
        spin: new Vector3(),
        radius,
        holder: null,
        offset: new Matrix4(),
        pull: 0,
        history: [],
        thrownFrom: null,
        home: new Vector3(x, hf.heightAt(x, z) + radius * 0.8, z),
        lostAt: 0,
        sleeping: true,
        hot: 0,
      })
    }
    return out
  }, [site, hf])

  // ---- XR grabbing via WebXR select/squeeze events (controllers: trigger/grip; hands: pinch)
  useEffect(() => {
    if (!session) return
    const start = (e: XRInputSourceEvent) => {
      const obj = inputObject(e.inputSource)
      if (!obj || rocks.some((r) => r.holder === e.inputSource)) return
      obj.updateWorldMatrix(true, false)
      const p = tmpV.setFromMatrixPosition(obj.matrixWorld)
      const fwd = tmpV2.set(0, 0, -1).transformDirection(obj.matrixWorld)
      let best: Rock | null = null, bestD = Infinity, pull = false
      for (const r of rocks) {
        if (r.holder) continue
        const d = r.pos.distanceTo(p) - r.radius
        if (d < 0.14 && d < bestD) {
          best = r
          bestD = d
          pull = false
        }
      }
      if (!best) {
        // distance grab: closest rock near the pointing ray, up to 8 m away
        for (const r of rocks) {
          if (r.holder) continue
          const to = r.pos.clone().sub(p)
          const along = to.dot(fwd)
          if (along < 0.2 || along > 8) continue
          const off = to.addScaledVector(fwd, -along).length()
          if (off < r.radius * 2.5 + along * 0.04 && along < bestD) {
            best = r
            bestD = along
            pull = true
          }
        }
      }
      if (!best) return
      best.holder = e.inputSource
      best.pull = pull ? 1 : 0
      best.sleeping = false
      best.thrownFrom = null
      best.history = []
      // keep the current relative pose for a near grab; a pulled rock lands just in front of the hand
      if (pull) best.offset.compose(tmpS.set(0, 0, -0.06), new Quaternion(), new Vector3(1, 1, 1))
      else best.offset.copy(tmpM.copy(obj.matrixWorld).invert()).multiply(tmpM2.compose(best.pos, best.quat, new Vector3(1, 1, 1)))
      haptic(0.45, 30)
      playClick()
    }
    const end = (e: XRInputSourceEvent) => {
      for (const r of rocks) if (r.holder === e.inputSource) release(r, 1.35)
    }
    session.addEventListener('selectstart', start)
    session.addEventListener('squeezestart', start)
    session.addEventListener('selectend', end)
    session.addEventListener('squeezeend', end)
    return () => {
      session.removeEventListener('selectstart', start)
      session.removeEventListener('squeezestart', start)
      session.removeEventListener('selectend', end)
      session.removeEventListener('squeezeend', end)
    }
  }, [session, rocks])

  // ---- desktop / phone: click a rock to hold it, click again to throw
  useEffect(() => {
    if (session) return
    const throwHeld = (e: PointerEvent) => {
      const r = rocks.find((x) => x.holder === 'screen')
      if (!r || (e.target as HTMLElement)?.tagName !== 'CANVAS') return
      viewCamera(gl, camera).getWorldDirection(tmpV)
      r.vel.copy(tmpV).multiplyScalar(7).add(tmpV2.set(0, 1.8, 0))
      r.spin.set(Math.random() * 6 - 3, Math.random() * 6 - 3, Math.random() * 6 - 3)
      r.holder = null
      r.thrownFrom = r.pos.clone()
      r.sleeping = false
      playClick()
      e.stopPropagation()
    }
    window.addEventListener('pointerdown', throwHeld, true)
    return () => window.removeEventListener('pointerdown', throwHeld, true)
  }, [session, rocks, camera, gl])

  function release(r: Rock, boost: number) {
    const h = r.history
    if (h.length >= 2) {
      const a = h[0], b = h[h.length - 1]
      const dt = Math.max(0.016, (b.t - a.t) / 1000)
      r.vel.copy(b.p).sub(a.p).divideScalar(dt).multiplyScalar(boost)
    }
    r.spin.set(Math.random() * 4 - 2, Math.random() * 4 - 2, Math.random() * 4 - 2)
    r.holder = null
    r.thrownFrom = r.pos.clone()
    r.sleeping = false
    haptic(0.25, 20)
  }

  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const now = performance.now()
    const cam = viewCamera(gl, camera)
    for (let i = 0; i < COUNT; i++) {
      const r = rocks[i]
      const m = meshes.current[i]
      if (r.holder === 'screen') {
        cam.getWorldPosition(tmpV)
        cam.getWorldDirection(tmpV2)
        // held low and to the right, like carrying it in your hand
        const rightX = -tmpV2.z, rightZ = tmpV2.x
        r.pos.copy(tmpV).addScaledVector(tmpV2, 0.8).add(tmpS.set(rightX * 0.28, -0.3 + Math.sin(clock.elapsedTime * 2) * 0.01, rightZ * 0.28))
        r.quat.multiply(tmpQ.setFromAxisAngle(tmpS.set(0, 1, 0), dt * 0.6))
      } else if (r.holder) {
        const obj = inputObject(r.holder)
        if (!obj) {
          release(r, 1)
        } else {
          obj.updateWorldMatrix(true, false)
          tmpM.copy(obj.matrixWorld).multiply(r.offset)
          tmpM.decompose(tmpV, tmpQ, tmpS)
          if (r.pull > 0) {
            r.pull = Math.max(0, r.pull - dt / 0.25)
            r.pos.lerp(tmpV, 1 - r.pull * 0.85)
            r.quat.slerp(tmpQ, 0.3)
          } else {
            r.pos.copy(tmpV)
            r.quat.copy(tmpQ)
          }
          r.history.push({ p: r.pos.clone(), t: now })
          while (r.history.length > 6) r.history.shift()
        }
      } else if (!r.sleeping) {
        // free flight in the site's gravity
        r.vel.y -= world.g * dt
        r.pos.addScaledVector(r.vel, dt)
        // on a tiny asteroid a gentle throw escapes: count it, then bring the rock back after a while
        if (r.thrownFrom && r.pos.distanceTo(r.thrownFrom) > 30) {
          missionEvent('rock-thrown')
          missionEvent('rock-escaped')
          r.thrownFrom = null
          r.lostAt = now
        }
        if (r.lostAt && now - r.lostAt > 20000) {
          r.pos.copy(r.home)
          r.vel.set(0, 0, 0)
          r.sleeping = true
          r.lostAt = 0
        }
        r.quat.multiply(tmpQ.setFromEuler(tmpE.set(r.spin.x * dt, r.spin.y * dt, r.spin.z * dt)))
        const ground = hf.heightAt(r.pos.x, r.pos.z) + r.radius * 0.75
        if (r.pos.y < ground) {
          const impact = -r.vel.y
          r.pos.y = ground
          if (impact > 1.2) {
            emitPuff(r.pos.x, ground - r.radius * 0.6, r.pos.z, Math.min(30, Math.round(impact * 6)), Math.min(2, impact * 0.4))
            playLand()
          }
          r.vel.y = impact * 0.32
          r.vel.x *= 0.72
          r.vel.z *= 0.72
          r.spin.multiplyScalar(0.7)
          if (r.thrownFrom && Math.hypot(r.pos.x - r.thrownFrom.x, r.pos.z - r.thrownFrom.z) > 4) {
            missionEvent('rock-thrown')
            r.thrownFrom = null
          }
          if (r.vel.lengthSq() < 0.04) {
            r.vel.set(0, 0, 0)
            r.sleeping = true
            r.thrownFrom = null
          }
        }
      }
      // highlight when a hand/controller is close, or while held
      const near = r.holder ? 1 : Math.max(0, 1 - (handDistance(r.pos) - r.radius) / 0.25)
      r.hot += (near - r.hot) * Math.min(1, dt * 10)
      if (m) {
        m.position.copy(r.pos)
        m.quaternion.copy(r.quat)
        m.scale.setScalar(r.radius)
        const mat = mats[i]
        mat.emissive.setRGB(0.05 * r.hot, 0.24 * r.hot, 0.23 * r.hot)
      }
    }
  })

  return (
    <>
      {rocks.map((r, i) => (
        <mesh
          key={i}
          ref={(m) => (meshes.current[i] = m)}
          geometry={geometry}
          material={mats[i]}
          castShadow={q.shadow > 0}
          receiveShadow={q.shadow > 0}
          onPointerOver={(e) => {
            e.stopPropagation()
            document.body.style.cursor = 'grab'
            if (!xrStore.getState().session) r.hot = 1
          }}
          onPointerOut={() => (document.body.style.cursor = '')}
          onClick={(e) => {
            if (xrStore.getState().session) return // XR uses select/squeeze events above
            e.stopPropagation()
            if (rocks.some((x) => x.holder === 'screen')) return
            r.holder = 'screen'
            r.sleeping = false
            playClick()
          }}
        />
      ))}
    </>
  )
}

/** Distance from a point to the nearest tracked controller / hand (Infinity outside XR). */
function handDistance(p: Vector3) {
  let best = Infinity
  for (const s of xrStore.getState().inputSourceStates) {
    const o = objectOf(s)
    if (!o) continue
    best = Math.min(best, tmpV2.setFromMatrixPosition(o.matrixWorld).distanceTo(p))
  }
  return best
}
