import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, NormalBlending, ShaderMaterial, Vector3, type Points } from 'three'
import type { HeightField } from './terrain'
import { player, world } from './player'
import { viewCamera } from '../viewCamera'
import { playLand, playStep, updateEmitter } from '../feedback'
import { missionEvent } from '../missions'

/** World-size point sprites: gl_PointSize = size[m] * uScale / depth. uScale ≈ half the viewport height × projection[1][1]. */
function pointScale(gl: { xr: { isPresenting: boolean }; domElement: HTMLCanvasElement }, proj: number) {
  return (gl.xr.isPresenting ? 1700 : gl.domElement.height) * 0.5 * proj
}

function rand(seed: number) {
  let s = seed >>> 0
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296)
}

// ------------------------------------------------------------------------------------------------
/**
 * Wind-blown dust: fine grains drifting past within ~40 m of you, plus a few larger sunlit motes.
 * Positions wrap around the camera in the shader, so the cloud is endless at a fixed particle count.
 */
export function DustField({ count, color = '#d9a77f' }: { count: number; color?: string }) {
  const ref = useRef<Points>(null)
  const cam = useMemo(() => new Vector3(), [])
  const geometry = useMemo(() => {
    const r = rand(7)
    const seed = new Float32Array(count * 3)
    const size = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      seed[i * 3] = r()
      seed[i * 3 + 1] = r()
      seed[i * 3 + 2] = r()
      size[i] = r() < 0.04 ? 0.06 + r() * 0.05 : 0.012 + r() * 0.02 // motes vs fine grains (metres)
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(count * 3), 3)) // unused, positions come from 'seed'
    g.setAttribute('seed', new BufferAttribute(seed, 3))
    g.setAttribute('size', new BufferAttribute(size, 1))
    return g
  }, [count])
  const material = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: NormalBlending,
        uniforms: {
          uTime: { value: 0 },
          uCam: { value: new Vector3() },
          uBox: { value: 80 },
          uWind: { value: new Vector3(2.2, 0, 0.9) },
          uScale: { value: 500 },
          uColor: { value: new Color(color) },
        },
        vertexShader: /* glsl */ `
          attribute vec3 seed;
          attribute float size;
          uniform float uTime, uBox, uScale;
          uniform vec3 uCam, uWind;
          varying float vAlpha;
          void main() {
            vec3 p = seed * uBox + uWind * uTime * (0.6 + seed.y);
            p.xz = mod(p.xz - uCam.xz + uBox * 0.5, uBox) + uCam.xz - uBox * 0.5;
            // keep the dust in the lowest few metres above the ground (camera is ~1.7 m up)
            p.y = uCam.y - 1.6 + mod(seed.y * 7.0 + sin(uTime * 0.4 + seed.x * 40.0) * 0.4, 7.0) * (0.3 + seed.z);
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = clamp(size * uScale / -mv.z, 0.0, 24.0);
            float dist = length(p - uCam);
            vAlpha = smoothstep(uBox * 0.5, uBox * 0.25, dist) * smoothstep(0.4, 2.0, -mv.z) * (size > 0.05 ? 0.55 : 0.32);
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor;
          varying float vAlpha;
          void main() {
            float d = length(gl_PointCoord - 0.5);
            float a = smoothstep(0.5, 0.0, d) * vAlpha;
            if (a < 0.01) discard;
            gl_FragColor = vec4(uColor, a);
            #include <colorspace_fragment>
          }`,
      }),
    [color],
  )
  useEffect(() => () => (geometry.dispose(), material.dispose()), [geometry, material])
  useFrame(({ camera, gl, clock }) => {
    const c = viewCamera(gl, camera)
    c.getWorldPosition(cam)
    material.uniforms.uTime.value = clock.elapsedTime
    material.uniforms.uCam.value.copy(cam)
    material.uniforms.uScale.value = pointScale(gl, camera.projectionMatrix.elements[5])
  })
  if (count <= 0) return null
  return <points ref={ref} geometry={geometry} material={material} frustumCulled={false} renderOrder={5} />
}

// ------------------------------------------------------------------------------------------------
/**
 * Dust devils: rotating dust columns wandering across the plains, like the ones NASA's rovers have filmed.
 * Each column is one GPU point cloud; only its centre is moved on the CPU.
 */
export function DustDevils({ count, hf, particles }: { count: number; hf: HeightField; particles: number }) {
  if (count <= 0) return null
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <DustDevil key={i} index={i} hf={hf} particles={particles} />
      ))}
    </>
  )
}

function DustDevil({ index, hf, particles }: { index: number; hf: HeightField; particles: number }) {
  const r = useMemo(() => rand(1000 + index * 77), [index])
  const state = useRef({ x: 0, z: 0, vx: 0, vz: 0, height: 80, radius: 6 })
  const respawn = () => {
    const s = state.current
    const a = r() * Math.PI * 2, d = 150 + r() * 260
    s.x = player.x + Math.cos(a) * d
    s.z = player.z + Math.sin(a) * d
    const va = a + Math.PI / 2 + (r() - 0.5)
    const speed = 2 + r() * 4
    s.vx = Math.cos(va) * speed
    s.vz = Math.sin(va) * speed
    s.height = 50 + r() * 110
    s.radius = 4 + r() * 6
  }
  const started = useRef(false)
  if (!started.current) {
    started.current = true
    respawn()
  }

  const geometry = useMemo(() => {
    const g = new BufferGeometry()
    const a = new Float32Array(particles * 3)
    const rr = rand(31 + index)
    for (let i = 0; i < particles; i++) {
      a[i * 3] = rr() // angle seed
      a[i * 3 + 1] = Math.pow(rr(), 1.4) // height fraction (denser near the ground)
      a[i * 3 + 2] = rr() // radius seed
    }
    g.setAttribute('position', new BufferAttribute(new Float32Array(particles * 3), 3))
    g.setAttribute('seed', new BufferAttribute(a, 3))
    return g
  }, [particles, index])
  const material = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { uTime: { value: 0 }, uCenter: { value: new Vector3() }, uHeight: { value: 80 }, uRadius: { value: 6 }, uScale: { value: 500 } },
        vertexShader: /* glsl */ `
          attribute vec3 seed;
          uniform float uTime, uHeight, uRadius, uScale;
          uniform vec3 uCenter;
          varying float vAlpha;
          void main() {
            float h = seed.y;
            float ang = seed.x * 6.2831 + uTime * (2.6 - h * 1.3);
            float rad = uRadius * (0.25 + pow(h, 1.2) * 1.8) * (0.6 + 0.8 * seed.z);
            vec3 p = uCenter + vec3(cos(ang) * rad, h * uHeight, sin(ang) * rad);
            p.x += sin(uTime * 0.6 + h * 4.0) * h * uRadius * 1.2;
            p.z += cos(uTime * 0.5 + h * 3.0) * h * uRadius;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = clamp((3.0 + h * 7.0) * uScale / -mv.z, 0.0, 64.0);
            vAlpha = (1.0 - h) * 0.11 + 0.015;
          }`,
        fragmentShader: /* glsl */ `
          varying float vAlpha;
          void main() {
            float d = length(gl_PointCoord - 0.5);
            float a = smoothstep(0.5, 0.0, d) * vAlpha;
            if (a < 0.004) discard;
            gl_FragColor = vec4(0.72, 0.54, 0.42, a);
            #include <colorspace_fragment>
          }`,
      }),
    [],
  )
  useEffect(() => () => (geometry.dispose(), material.dispose()), [geometry, material])
  useFrame(({ camera, gl, clock }, dt) => {
    const s = state.current
    s.x += s.vx * dt
    s.z += s.vz * dt
    if (Math.hypot(s.x - player.x, s.z - player.z) > 700) respawn()
    const u = material.uniforms
    u.uTime.value = clock.elapsedTime + index * 13
    u.uCenter.value.set(s.x, hf.baseAt(s.x, s.z), s.z)
    updateEmitter(`devil-${index}`, 'devil', s.x, hf.baseAt(s.x, s.z) + 10, s.z)
    u.uHeight.value = s.height
    u.uRadius.value = s.radius
    u.uScale.value = pointScale(gl, camera.projectionMatrix.elements[5])
  })
  return <points geometry={geometry} material={material} frustumCulled={false} renderOrder={4} />
}

// ------------------------------------------------------------------------------------------------
/** Puffs of dust kicked up by your steps and by landing a low-gravity jump. CPU-simulated pool. */
const POOL = 360
const puffQueue: { x: number; y: number; z: number; n: number; speed: number }[] = []
/** Ask for a dust burst at a point (e.g. on landing). */
export function emitPuff(x: number, y: number, z: number, n: number, speed = 1) {
  puffQueue.push({ x, y, z, n, speed })
}

export function FootstepDust({ hf }: { hf: HeightField }) {
  const sim = useMemo(
    () => ({
      pos: new Float32Array(POOL * 3),
      vel: new Float32Array(POOL * 3),
      age: new Float32Array(POOL).fill(99),
      life: new Float32Array(POOL).fill(1),
      next: 0,
      lastX: player.x,
      lastZ: player.z,
      walked: 0,
      wasAir: false,
    }),
    [],
  )
  const geometry = useMemo(() => {
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(sim.pos, 3))
    g.setAttribute('age', new BufferAttribute(new Float32Array(POOL).fill(1), 1))
    return g
  }, [sim])
  const material = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { uScale: { value: 500 } },
        vertexShader: /* glsl */ `
          attribute float age;
          uniform float uScale;
          varying float vAlpha;
          void main() {
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = clamp((0.12 + age * 0.9) * uScale / -mv.z, 0.0, 120.0);
            vAlpha = (1.0 - age) * 0.38;
          }`,
        fragmentShader: /* glsl */ `
          varying float vAlpha;
          void main() {
            float d = length(gl_PointCoord - 0.5);
            float a = smoothstep(0.5, 0.0, d) * vAlpha;
            if (a < 0.01) discard;
            gl_FragColor = vec4(0.74, 0.52, 0.38, a);
            #include <colorspace_fragment>
          }`,
      }),
    [],
  )
  useEffect(() => () => (geometry.dispose(), material.dispose()), [geometry, material])

  const spawn = (x: number, y: number, z: number, n: number, speed: number) => {
    for (let k = 0; k < n; k++) {
      const i = sim.next
      sim.next = (sim.next + 1) % POOL
      const a = Math.random() * Math.PI * 2
      const v = (0.25 + Math.random() * 0.7) * speed
      sim.pos.set([x + Math.cos(a) * 0.15, y + 0.05, z + Math.sin(a) * 0.15], i * 3)
      sim.vel.set([Math.cos(a) * v, (0.2 + Math.random() * 0.6) * speed, Math.sin(a) * v], i * 3)
      sim.age[i] = 0
      sim.life[i] = 1.6 + Math.random() * 1.4
    }
  }

  useFrame(({ camera, gl }, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    // footsteps every ~0.75 m walked on the ground; a big puff when landing a jump
    const d = Math.hypot(player.x - sim.lastX, player.z - sim.lastZ)
    sim.lastX = player.x
    sim.lastZ = player.z
    if (d < 5 && !player.airborne) {
      sim.walked += d
      if (sim.walked > 0.75) {
        sim.walked = 0
        spawn(player.x, hf.heightAt(player.x, player.z), player.z, 4, 0.8)
        playStep()
      }
    }
    if (sim.wasAir && !player.airborne) {
      spawn(player.x, hf.heightAt(player.x, player.z), player.z, 40, 1.8)
      playLand()
    }
    sim.wasAir = player.airborne
    while (puffQueue.length) {
      const q = puffQueue.shift()!
      spawn(q.x, q.y, q.z, q.n, q.speed)
      if (q.n > 20) playLand()
    }
    const ageAttr = geometry.attributes.age as BufferAttribute
    for (let i = 0; i < POOL; i++) {
      if (sim.age[i] >= sim.life[i]) {
        ageAttr.array[i] = 1
        continue
      }
      sim.age[i] += dt
      // with air, fine dust drags and settles slowly; without air it flies in clean ballistic arcs
      const drag = world.air ? Math.exp(-dt * 1.4) : 1
      sim.vel[i * 3] *= drag
      sim.vel[i * 3 + 2] *= drag
      sim.vel[i * 3 + 1] = sim.vel[i * 3 + 1] * drag - world.g * (world.air ? 0.08 : 1) * dt
      sim.pos[i * 3] += sim.vel[i * 3] * dt
      sim.pos[i * 3 + 1] += sim.vel[i * 3 + 1] * dt
      sim.pos[i * 3 + 2] += sim.vel[i * 3 + 2] * dt
      ageAttr.array[i] = Math.min(1, sim.age[i] / sim.life[i])
    }
    ;(geometry.attributes.position as BufferAttribute).needsUpdate = true
    ageAttr.needsUpdate = true
    material.uniforms.uScale.value = pointScale(gl, camera.projectionMatrix.elements[5])
  })
  return <points geometry={geometry} material={material} frustumCulled={false} renderOrder={6} />
}

// ------------------------------------------------------------------------------------------------
/**
 * Bennu particle ejection: OSIRIS-REx saw Bennu regularly flinging small pebbles off its surface.
 * Here, every few seconds a small burst leaves a random surface point (body-local units, radius ≈ 1).
 */
export function BennuEjecta({ surface }: { surface: Float32Array | null }) {
  const N = 160
  const pointsRef = useRef<Points>(null)
  const tmpV = useMemo(() => new Vector3(), [])
  const tmpN = useMemo(() => new Vector3(), [])
  const tmpC = useMemo(() => new Vector3(), [])
  const sim = useMemo(() => ({ pos: new Float32Array(N * 3), vel: new Float32Array(N * 3), age: new Float32Array(N).fill(99), next: 0, timer: 1.5 }), [])
  const geometry = useMemo(() => {
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(sim.pos, 3))
    g.setAttribute('age', new BufferAttribute(new Float32Array(N).fill(1), 1))
    return g
  }, [sim])
  const material = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: { uScale: { value: 500 } },
        vertexShader: /* glsl */ `
          attribute float age;
          uniform float uScale;
          varying float vAlpha;
          void main() {
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = clamp(0.03 * uScale / -mv.z, 1.5, 8.0);
            vAlpha = 1.0 - age;
          }`,
        fragmentShader: /* glsl */ `
          varying float vAlpha;
          void main() {
            float d = length(gl_PointCoord - 0.5);
            gl_FragColor = vec4(vec3(1.0, 0.92, 0.8) * smoothstep(0.5, 0.0, d) * vAlpha, 1.0);
          }`,
      }),
    [],
  )
  useEffect(() => () => (geometry.dispose(), material.dispose()), [geometry, material])
  useFrame(({ camera, gl }, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    sim.timer -= dt
    if (sim.timer <= 0 && surface && surface.length >= 3) {
      sim.timer = 3 + Math.random() * 5
      const v = Math.floor(Math.random() * (surface.length / 3)) * 3
      const px = surface[v], py = surface[v + 1], pz = surface[v + 2]
      const L = Math.hypot(px, py, pz) || 1
      // mission: a burst counts as "seen" when it leaves the side of Bennu that faces you
      const pts = pointsRef.current
      if (pts) {
        tmpV.set(px, py, pz).applyMatrix4(pts.matrixWorld)
        tmpN.set(px / L, py / L, pz / L).transformDirection(pts.matrixWorld)
        viewCamera(gl, camera).getWorldPosition(tmpC)
        if (tmpN.dot(tmpC.sub(tmpV).normalize()) > 0.2) missionEvent('bennu-burst-seen')
      }
      const n = 6 + Math.floor(Math.random() * 10)
      for (let k = 0; k < n; k++) {
        const i = sim.next
        sim.next = (sim.next + 1) % N
        const s = 0.08 + Math.random() * 0.12
        sim.pos.set([px, py, pz], i * 3)
        sim.vel.set([(px / L) * s + (Math.random() - 0.5) * 0.06, (py / L) * s + (Math.random() - 0.5) * 0.06, (pz / L) * s + (Math.random() - 0.5) * 0.06], i * 3)
        sim.age[i] = 0
      }
    }
    const ageAttr = geometry.attributes.age as BufferAttribute
    for (let i = 0; i < N; i++) {
      if (sim.age[i] >= 1) {
        ageAttr.array[i] = 1
        continue
      }
      sim.age[i] += dt / 5
      // weak pull back toward the asteroid's centre: some pebbles fall back, some escape
      const x = sim.pos[i * 3], y = sim.pos[i * 3 + 1], z = sim.pos[i * 3 + 2]
      const r2 = Math.max(0.6, x * x + y * y + z * z)
      const g = 0.012 / r2
      sim.vel[i * 3] -= x * g * dt
      sim.vel[i * 3 + 1] -= y * g * dt
      sim.vel[i * 3 + 2] -= z * g * dt
      sim.pos[i * 3] += sim.vel[i * 3] * dt
      sim.pos[i * 3 + 1] += sim.vel[i * 3 + 1] * dt
      sim.pos[i * 3 + 2] += sim.vel[i * 3 + 2] * dt
      ageAttr.array[i] = sim.age[i]
    }
    ;(geometry.attributes.position as BufferAttribute).needsUpdate = true
    ageAttr.needsUpdate = true
    material.uniforms.uScale.value = pointScale(gl, camera.projectionMatrix.elements[5])
  })
  return <points ref={pointsRef} geometry={geometry} material={material} frustumCulled={false} />
}

