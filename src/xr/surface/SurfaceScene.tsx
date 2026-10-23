import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Billboard, Text, useGLTF } from '@react-three/drei'
import { TeleportTarget, XROrigin, useXRControllerLocomotion } from '@react-three/xr'
import {
  AdditiveBlending,
  Box3,
  BufferAttribute,
  BufferGeometry,
  IcosahedronGeometry,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  Vector3,
  type Group,
  type InstancedMesh,
  type Mesh,
  type PerspectiveCamera,
  type DirectionalLight,
} from 'three'
import { useSiteContent } from '../content'
import { useXRApp } from '../store'
import { useDwellTarget } from '../dwell'
import { KIND_COLORS } from '../bodies'
import { FONT, FONT_BOLD } from '../font'
import { InfoCard3D } from '../InfoCard'
import { Button3D } from '../Button3D'
import { GlassPanel, Icon, UI } from '../ui3d'
import { makeFadeable, useFadeIn } from '../fade'
import { ErrorBoundary } from '../ErrorBoundary'
import { DEFAULT_ENVIRONMENT, type Hotspot, type SiteContent, type SiteEnvironment, type SiteModel, type ViewMode } from '../types'
import { EarthInSky, SpaceSun, StarSky } from '../space'
import { buildDiorama, buildRadialTerrain, useHeightField, vnoise, type HeightField } from './terrain'
import { MarsSky, marsSky } from './MarsSky'
import { useGroundMaterial, useRockMaterial } from './materials'
import { DustDevils, DustField, FootstepDust, emitPuff } from './particles'
import { useQuality, type TierParams } from '../quality'
import { Grabbables } from './Grabbables'
import { SceneReady, comfort } from '../smooth'
import { useXRInputSourceState } from '@react-three/xr'
import { EYE_HEIGHT, input, player, world } from './player'
import { withBVH } from '../bvh'
import type { TerrainBuildRequest, TerrainBuildResult } from './terrain.worker'
import { viewCamera } from '../viewCamera'
import { WristMenu } from '../WristMenu'
import { hoverFeedback, pressFeedback, updateEmitter } from '../feedback'

const DEG = Math.PI / 180

/** Desktop / phone arrival: a short descent from orbit-ish height (VR fades in instead, to avoid motion sickness). */
const LANDING_SECONDS = 3.2
const LANDING_HEIGHT = 250

export function envOf(site: SiteContent): SiteEnvironment {
  return site.environment ?? DEFAULT_ENVIRONMENT
}

function spawnYaw(site: SiteContent) {
  const { x, z, lookAt } = site.spawn
  return Math.atan2(-(lookAt.x - x), -(lookAt.z - z))
}

/**
 * "Stand on the surface" mode. Desktop: WASD + drag to look. Phone: gyro look-around + walk button.
 * VR: real scale, thumbstick locomotion, snap turn and teleport. Handheld AR: tabletop diorama.
 */
export function SurfaceScene({ siteId, mode }: { siteId: string; mode: ViewMode }) {
  const site = useSiteContent(siteId)
  const pins = useXRApp((s) => s.settings.pins)
  const q = useQuality()
  const hf = useHeightField(site)

  useLayoutEffect(() => {
    if (!site) return
    player.x = site.spawn.x
    player.z = site.spawn.z
    player.spawnX = site.spawn.x
    player.spawnZ = site.spawn.z
    const env = envOf(site)
    world.g = env.gravity
    world.air = env.kind === 'mars'
    useXRApp.setState({ headingOffset: spawnYaw(site) })
    return () => useXRApp.setState({ headingOffset: 0 })
  }, [site])

  if (site === null) return <Notice text={`Unknown site "${siteId}"`} />
  if (!site || !hf) return <Notice text="Landing…" />
  if (mode === 'ar') return <Diorama site={site} hf={hf} />

  return (
    <>
      <SurfaceEnvironment site={site} q={q} />
      <Terrain site={site} hf={hf} teleport={mode === 'vr'} q={q} />
      <Rocks site={site} hf={hf} q={q} />
      {envOf(site).kind === 'mars' && (
        <>
          <DustField count={q.dust} />
          <DustDevils count={q.devils} hf={hf} particles={mode === 'vr' ? 500 : 1100} />
        </>
      )}
      {q.bursts && <FootstepDust hf={hf} />}
      <Grabbables site={site} hf={hf} q={q} />
      {[...(site.rover ? [site.rover] : []), ...(site.models ?? [])].map((m) => (
        <ErrorBoundary key={m.model} fallback={null}>
          <Suspense fallback={null}>
            <Rover rover={m} hf={hf} shadows={q.shadow > 0} />
          </Suspense>
        </ErrorBoundary>
      ))}
      {pins && site.hotspots.map((h) => (
        <Beacon key={h.id} h={h} hf={hf} />
      ))}
      {mode === 'vr' ? <VRWalker site={site} hf={hf} /> : <Walker site={site} hf={hf} gyro={mode === 'gyro'} />}
      {mode === 'vr' && <SuitPanelVR site={site} />}
    </>
  )
}

function Notice({ text }: { text: string }) {
  const camera = useThree((s) => s.camera)
  const pos = useMemo(() => camera.position.clone().add(camera.getWorldDirection(new Vector3()).multiplyScalar(3)), [camera])
  return (
    <Billboard position={pos}>
      <Text font={FONT} fontSize={0.2} color="#ffffff">
        {text}
      </Text>
    </Billboard>
  )
}

/**
 * Sky, fog, sunlight and shadows for the chosen time of day. The shadow camera is a ~70 m box that
 * follows you (snapped to its texel grid so shadows don't shimmer); size per quality tier, off on Low/Medium VR.
 */
/** Earth seen from Tranquility Base: high in the western sky (about 66° up), roughly where it hangs for Apollo 11's site. */
const EARTH_FROM_TRANQUILITY: [number, number, number] = [-Math.cos((66 * Math.PI) / 180), Math.sin((66 * Math.PI) / 180), 0]

function SurfaceEnvironment({ site, q }: { site: SiteContent; q: TierParams }) {
  const haze = useXRApp((s) => s.settings.haze)
  const timeOfDay = useXRApp((s) => s.settings.timeOfDay)
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const sky = useMemo(() => marsSky(timeOfDay), [timeOfDay])
  const env = envOf(site)
  const space = env.sky === 'space'
  const far = site.terrain.viewRadius * 1.2
  const sun = useRef<DirectionalLight>(null)
  const span = 36
  useEffect(() => {
    const prev = { near: camera.near, far: camera.far }
    camera.near = 0.05
    camera.far = far
    camera.updateProjectionMatrix()
    return () => {
      camera.near = prev.near
      camera.far = prev.far
      camera.updateProjectionMatrix()
    }
  }, [camera, far])

  useFrame(() => {
    const l = sun.current
    if (!l) return
    const texel = (span * 2) / Math.max(1, q.shadow)
    const cx = Math.round(player.x / texel) * texel, cz = Math.round(player.z / texel) * texel
    const cy = player.ground
    l.target.position.set(cx, cy, cz)
    l.position.set(cx + sky.sunDir[0] * 200, cy + sky.sunDir[1] * 200, cz + sky.sunDir[2] * 200)
    l.target.updateMatrixWorld()
  })

  return (
    <>
      {space ? (
        <>
          <StarSky size={q.stars} radius={far * 0.8} />
          <SpaceSun dir={sky.sunDir} distance={far * 0.7} />
          {env.kind === 'moon' && <EarthInSky dir={EARTH_FROM_TRANQUILITY} sunDir={sky.sunDir} distance={far * 0.6} />}
          <hemisphereLight args={['#9aa7c0', '#3a3936', env.kind === 'moon' ? 0.12 : 0.06]} />
        </>
      ) : (
        <>
          <fogExp2 attach="fog" args={[sky.horizon, site.fogDensity * haze]} />
          <MarsSky sky={sky} radius={far * 0.8} />
          <hemisphereLight args={['#d9b08c', '#5e3522', sky.ambient]} />
        </>
      )}
      <directionalLight
        key={q.shadow}
        ref={sun}
        intensity={space ? 3.2 : sky.light}
        color={space ? '#ffffff' : sky.lightColor}
        castShadow={q.shadow > 0}
        shadow-mapSize={[q.shadow || 1, q.shadow || 1]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
        shadow-camera-left={-span}
        shadow-camera-right={span}
        shadow-camera-top={span}
        shadow-camera-bottom={-span}
        shadow-camera-near={10}
        shadow-camera-far={420}
      />
    </>
  )
}


function geometryFromArrays(r: TerrainBuildResult): BufferGeometry {
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(r.position, 3))
  g.setAttribute('normal', new BufferAttribute(r.normal, 3))
  g.setAttribute('uv', new BufferAttribute(r.uv, 2))
  g.setAttribute('color', new BufferAttribute(r.color, 3))
  g.setAttribute('mask', new BufferAttribute(r.mask, 2))
  g.setIndex(new BufferAttribute(r.index, 1))
  g.computeBoundingSphere()
  return g
}

/**
 * Visible ground: built in a Web Worker and swapped in when ready, so re-centring never stalls a frame.
 * It has no pointer handlers, so XR pointers never test its ~40–90k triangles. Teleport aims at a small,
 * low-detail collider with a BVH instead.
 */
function Terrain({ site, hf, teleport, q }: { site: SiteContent; hf: HeightField; teleport: boolean; q: TierParams }) {
  const [center, setCenter] = useState<[number, number]>([site.spawn.x, site.spawn.z])
  const [geometry, setGeometry] = useState<BufferGeometry | null>(null)
  const material = useGroundMaterial(q.textures)
  const [worker, setWorker] = useState<Worker | null>(null)
  const requestId = useRef(0)
  // created in an effect (not useMemo) so React StrictMode's mount/unmount/mount gets a live worker
  useEffect(() => {
    const w = new Worker(new URL('./terrain.worker.ts', import.meta.url), { type: 'module' })
    setWorker(w)
    return () => w.terminate()
  }, [])

  useEffect(() => {
    if (!worker) return
    const id = ++requestId.current
    worker.onmessage = (e: MessageEvent<TerrainBuildResult>) => {
      if (e.data.id !== requestId.current) return
      const g = geometryFromArrays(e.data)
      setGeometry((old) => {
        old?.dispose()
        return g
      })
    }
    const req: TerrainBuildRequest = {
      id,
      terrain: site.terrain,
      cx: center[0],
      cz: center[1],
      rMax: site.terrain.viewRadius,
      rings: q.terrainRings,
      palette: envOf(site).kind,
      segs: q.terrainSegs,
    }
    worker.postMessage(req)
  }, [worker, site, center, q.terrainRings, q.terrainSegs])
  useEffect(() => () => setGeometry((old) => (old?.dispose(), null)), [])

  // re-centre the fine detail on the player after they walk away
  useFrame(() => {
    if (Math.hypot(player.x - center[0], player.z - center[1]) > 40) setCenter([player.x, player.z])
  })

  return (
    <>
      {geometry && (
        <>
          <mesh geometry={geometry} material={material} pointerEvents="none" receiveShadow />
          <SceneReady />
        </>
      )}
      {teleport && <TeleportCollider hf={hf} center={center} />}
    </>
  )
}

/** Invisible, low-detail ground (≈6k triangles, 400 m radius) with a BVH: what the VR teleport arc hits. */
function TeleportCollider({ hf, center }: { hf: HeightField; center: [number, number] }) {
  const geometry = useMemo(() => withBVH(buildRadialTerrain(hf, center[0], center[1], 400, 48, 64)), [hf, center])
  useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <TeleportTarget onTeleport={(p) => useXRApp.getState().requestGoTo({ x: p.x, z: p.z, exact: true })}>
      <mesh geometry={geometry}>
        <meshBasicMaterial colorWrite={false} depthWrite={false} />
      </mesh>
    </TeleportTarget>
  )
}

function seeded(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

/** Scattered basalt rocks around the landing spot (procedural shapes, scanned-rock material). Count and detail follow the quality tier. */
function Rocks({ site, hf, q }: { site: SiteContent; hf: HeightField; q: TierParams }) {
  const COUNT = q.rocks
  const material = useRockMaterial(q.textures)
  const ref = useRef<InstancedMesh>(null)
  const geometry = useMemo(() => {
    const g = new IcosahedronGeometry(1, q.rockDetail)
    const p = g.attributes.position
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i)
      const d = 1 + 0.28 * vnoise(x * 2.3 + 11, y * 2.1 + z * 1.7) + 0.08 * vnoise(x * 7.1 - 3, z * 6.3 + y * 5.2)
      p.setXYZ(i, x * d, y * d, z * d)
    }
    g.computeVertexNormals()
    return g
  }, [q.rockDetail])
  useLayoutEffect(() => {
    const m = ref.current
    if (!m) return
    const rnd = seeded(site.id.length * 7919 + 17)
    const mat = new Matrix4(), q = new Quaternion(), pos = new Vector3(), scl = new Vector3()
    const axis = new Vector3()
    for (let i = 0; i < COUNT; i++) {
      let x = 0, z = 0
      for (let tries = 0; tries < 5; tries++) {
        const r = 2.5 + 150 * Math.sqrt(rnd()), a = rnd() * Math.PI * 2
        x = site.spawn.x + r * Math.cos(a)
        z = site.spawn.z + r * Math.sin(a)
        if (!site.rover || Math.hypot(x - site.rover.x, z - site.rover.z) > 3) break
      }
      const size = (0.03 + 0.75 * Math.pow(rnd(), 5)) * envOf(site).rockScale
      axis.set(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize()
      q.setFromAxisAngle(axis, rnd() * Math.PI * 2)
      pos.set(x, hf.heightAt(x, z) + size * 0.15, z)
      scl.set(size, size * (0.5 + rnd() * 0.4), size * (0.8 + rnd() * 0.5))
      m.setMatrixAt(i, mat.compose(pos, q, scl))
    }
    m.instanceMatrix.needsUpdate = true
    m.computeBoundingSphere()
  }, [site, hf, geometry, COUNT])
  return (
    <instancedMesh key={COUNT} ref={ref} args={[geometry, material, COUNT]} castShadow={q.shadow > 0} receiveShadow={q.shadow > 0} />
  )
}

function Rover({ rover, hf, shadows }: { rover: SiteModel; hf: HeightField; shadows: boolean }) {
  const { scene } = useGLTF(rover.model)
  const obj = useMemo(() => {
    const c = scene.clone(true)
    const size = new Box3().setFromObject(c).getSize(new Vector3())
    c.scale.setScalar(rover.sizeM / Math.max(size.x, size.z))
    const b = new Box3().setFromObject(c)
    c.position.set(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2)
    c.traverse((o) => {
      o.castShadow = shadows
      o.receiveShadow = shadows
    })
    return { c, fading: makeFadeable(c) }
  }, [scene, rover, shadows])
  useFadeIn(obj.fading, 0.9)
  // rovers hum softly in 3D (spacecraft and landers are silent)
  const hums = /rover|perseverance|curiosity|opportunity/i.test(rover.name)
  useFrame(() => {
    if (hums) updateEmitter(rover.name, 'machine', rover.x, hf.heightAt(rover.x, rover.z) + 0.8, rover.z)
  })
  return (
    <group position={[rover.x, hf.heightAt(rover.x, rover.z) + (rover.y ?? 0), rover.z]} rotation={[0, rover.yawDeg * DEG, 0]}>
      <primitive object={obj.c} />
    </group>
  )
}

const noFogText = new MeshBasicMaterial({ fog: false, toneMapped: false })

/** A point of interest on the surface: glowing beacon that stays readable at any distance. */
function Beacon({ h, hf }: { h: Hotspot; hf: HeightField }) {
  const labels = useXRApp((s) => s.settings.labels)
  const a = h.anchor.type === 'site' ? h.anchor : { x: 0, z: 0, y: 0 }
  const lift = a.y ?? 0
  const base = useMemo(() => new Vector3(a.x, hf.heightAt(a.x, a.z) + lift, a.z), [a.x, a.z, lift, hf])
  const hovered = useXRApp((s) => s.hoveredId === h.id)
  const selected = useXRApp((s) => s.hotspotId === h.id)
  const inner = useRef<Group>(null)
  const glow = useRef<Mesh>(null)
  const hit = useRef<Mesh>(null)
  const [dist, setDist] = useState(0)
  const last = useRef(0)
  const tmp = useMemo(() => new Vector3(), [])
  const color = KIND_COLORS[h.kind]
  const pole = lift === 0

  const select = useCallback(() => {
    const s = useXRApp.getState()
    pressFeedback()
    s.selectHotspot(s.hotspotId === h.id ? null : h.id)
  }, [h.id])
  useDwellTarget(hit, select)

  useFrame(({ camera, gl, clock }) => {
    viewCamera(gl, camera).getWorldPosition(tmp)
    const d = tmp.distanceTo(base)
    // keep beacons a readable size on screen at any distance
    if (inner.current) inner.current.scale.setScalar(Math.max(1, d / 9))
    if (glow.current) glow.current.scale.setScalar((hovered || selected ? 1.6 : 1) * (1 + 0.15 * Math.sin(clock.elapsedTime * 3)))
    if (clock.elapsedTime - last.current > 1) {
      last.current = clock.elapsedTime
      const r = d < 1000 ? Math.round(d) : Math.round(d / 100) * 100
      if (r !== dist) setDist(r)
    }
  })

  const orbY = pole ? 1.8 : 0
  const distLabel = dist < 1000 ? `${dist} m` : `${(dist / 1000).toFixed(1)} km`

  return (
    <group position={base}>
      <group ref={inner}>
        {pole && (
          <mesh position={[0, 0.8, 0]}>
            <cylinderGeometry args={[0.02, 0.03, 1.6, 6]} />
            <meshBasicMaterial color={color} fog={false} toneMapped={false} />
          </mesh>
        )}
        <mesh position={[0, orbY, 0]}>
          <sphereGeometry args={[0.1, 16, 16]} />
          <meshBasicMaterial color={hovered || selected ? '#ffffff' : color} fog={false} toneMapped={false} />
        </mesh>
        <mesh ref={glow} position={[0, orbY, 0]}>
          <sphereGeometry args={[0.24, 16, 16]} />
          <meshBasicMaterial color={color} transparent opacity={0.35} depthWrite={false} blending={AdditiveBlending} fog={false} toneMapped={false} />
        </mesh>
        <mesh
          ref={hit}
          position={[0, orbY - (pole ? 0.4 : 0), 0]}
          onPointerOver={(e: ThreeEvent<PointerEvent>) => {
            e.stopPropagation()
            if (useXRApp.getState().hoveredId !== h.id) hoverFeedback()
            useXRApp.getState().setHovered(h.id)
            document.body.style.cursor = 'pointer'
          }}
          onPointerOut={() => {
            if (useXRApp.getState().hoveredId === h.id) useXRApp.getState().setHovered(null)
            document.body.style.cursor = ''
          }}
          onClick={(e) => {
            e.stopPropagation()
            select()
          }}
        >
          <sphereGeometry args={[pole ? 0.6 : 0.45, 10, 10]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
        {(labels > 0.02 || hovered || selected) && (
        <Billboard position={[0, orbY + 0.35, 0]}>
          <Text font={FONT_BOLD} material={noFogText} fillOpacity={hovered || selected ? 1 : labels} outlineOpacity={hovered || selected ? 1 : labels} fontSize={hovered || selected ? 0.2 : 0.16} color="#ffffff" outlineWidth={0.012} outlineColor="#000000" anchorY="bottom" maxWidth={2.4} textAlign="center">
            {h.title}
          </Text>
          <Text font={FONT} material={noFogText} fillOpacity={hovered || selected ? 1 : labels} outlineOpacity={hovered || selected ? 1 : labels} position={[0, -0.02, 0]} fontSize={0.11} color="#e6d7c8" outlineWidth={0.008} outlineColor="#000000" anchorY="top">
            {distLabel}
          </Text>
        </Billboard>
        )}
      </group>
    </group>
  )
}

/** Consumes "walk there" / teleport requests from the store. */
function consumeGoTo(cur: { x: number; z: number }): { x: number; z: number; face?: { x: number; z: number } } | null {
  const g = useXRApp.getState().goTo
  if (!g) return null
  useXRApp.getState().requestGoTo(null)
  if (g.exact) return { x: g.x, z: g.z }
  // stop a few metres short, facing the target
  const dx = g.x - cur.x, dz = g.z - cur.z
  const L = Math.hypot(dx, dz) || 1
  const stop = Math.min(L, 6)
  return { x: g.x - (dx / L) * stop, z: g.z - (dz / L) * stop, face: { x: g.x, z: g.z } }
}

function clampToTerrain(hf: HeightField, p: { x: number; z: number }) {
  const mx = hf.width / 2 - 5, mz = hf.depth / 2 - 5
  p.x = Math.max(-mx, Math.min(mx, p.x))
  p.z = Math.max(-mz, Math.min(mz, p.z))
}

function updatePlayerReadout(x: number, z: number, ground: number, dir: Vector3, airborne: boolean) {
  player.x = x
  player.z = z
  player.ground = ground
  player.heading = ((Math.atan2(dir.x, -dir.z) / DEG) + 360) % 360
  player.airborne = airborne
}

/** Non-XR walking: keyboard + drag-to-look (desktop/touch) or device orientation (gyro mode). */
/** Look slightly down into a crater / up at a mountain, toward the spawn's point of interest. */
function spawnPitch(site: SiteContent, hf: HeightField) {
  const { x, z, lookAt } = site.spawn
  const rise = hf.baseAt(lookAt.x, lookAt.z) - (hf.baseAt(x, z) + EYE_HEIGHT)
  return Math.max(-0.35, Math.min(0.1, Math.atan2(rise, Math.hypot(lookAt.x - x, lookAt.z - z))))
}

function Walker({ site, hf, gyro }: { site: SiteContent; hf: HeightField; gyro: boolean }) {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const st = useRef({ x: site.spawn.x, z: site.spawn.z, yaw: spawnYaw(site), pitch: spawnPitch(site, hf), vy: 0, jy: 0, descent: LANDING_SECONDS })
  const gyroRef = useRef(gyro)
  gyroRef.current = gyro
  const dir = useMemo(() => new Vector3(), [])

  useEffect(() => {
    st.current = { x: site.spawn.x, z: site.spawn.z, yaw: spawnYaw(site), pitch: spawnPitch(site, hf), vy: 0, jy: 0, descent: LANDING_SECONDS }
  }, [site, hf])

  useEffect(() => {
    const el = gl.domElement
    let drag = false, lx = 0, ly = 0
    const down = (e: PointerEvent) => {
      drag = true
      lx = e.clientX
      ly = e.clientY
    }
    const move = (e: PointerEvent) => {
      if (!drag || gyroRef.current) return
      const s = st.current
      s.yaw -= (e.clientX - lx) * 0.0045
      s.pitch = Math.max(-1.35, Math.min(1.35, s.pitch - (e.clientY - ly) * 0.0045))
      lx = e.clientX
      ly = e.clientY
    }
    const up = () => (drag = false)
    const keys: Record<string, keyof typeof input> = {
      KeyW: 'forward', ArrowUp: 'forward', KeyS: 'back', ArrowDown: 'back',
      KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
      ShiftLeft: 'run', ShiftRight: 'run', Space: 'jump', KeyQ: 'turnLeft', KeyE: 'turnRight',
    }
    const key = (on: boolean) => (e: KeyboardEvent) => {
      const k = keys[e.code]
      if (!k || (e.target as HTMLElement)?.tagName === 'INPUT') return
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault()
      if (k === 'jump') {
        if (on) input.jump = true
      } else input[k] = on
    }
    const kd = key(true), ku = key(false)
    const blur = () => Object.keys(input).forEach((k) => ((input as Record<string, boolean>)[k] = false))
    el.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('keydown', kd)
    window.addEventListener('keyup', ku)
    window.addEventListener('blur', blur)
    return () => {
      el.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('keydown', kd)
      window.removeEventListener('keyup', ku)
      window.removeEventListener('blur', blur)
      blur()
    }
  }, [gl])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const s = st.current
    const target = consumeGoTo(s)
    if (target) {
      s.x = target.x
      s.z = target.z
      if (target.face) {
        s.yaw = Math.atan2(-(target.face.x - s.x), -(target.face.z - s.z))
        s.pitch = -0.08
      }
    }
    let fx: number, fz: number
    if (gyroRef.current) {
      camera.getWorldDirection(dir)
      const L = Math.hypot(dir.x, dir.z) || 1
      fx = dir.x / L
      fz = dir.z / L
    } else {
      fx = -Math.sin(s.yaw)
      fz = -Math.cos(s.yaw)
    }
    // landing descent: drop in from ~250 m above the landing spot, easing to a soft touchdown
    if (s.descent > 0) {
      s.descent = Math.max(0, s.descent - dt)
      if (s.descent === 0) emitPuff(s.x, hf.heightAt(s.x, s.z), s.z, 70, 2.4)
    }
    const landing = s.descent > 0
    if (!gyroRef.current) s.yaw += ((input.turnLeft ? 1 : 0) - (input.turnRight ? 1 : 0)) * 1.6 * dt
    const mf = landing ? 0 : (input.forward ? 1 : 0) - (input.back ? 1 : 0)
    const mr = landing ? 0 : (input.right ? 1 : 0) - (input.left ? 1 : 0)
    if (mf || mr) {
      const speed = (input.run ? 4.5 : 1.6) * useXRApp.getState().settings.moveSpeed
      const L = Math.hypot(mf, mr)
      s.x += ((fx * mf - fz * mr) / L) * speed * dt
      s.z += ((fz * mf + fx * mr) / L) * speed * dt
      clampToTerrain(hf, s)
    }
    // low-gravity jump: same push as on Earth, but Mars pulls only 38% as hard
    if (input.jump && s.jy === 0 && !landing) {
      if (world.g < 0.05) useXRApp.getState().showToast('On Bennu a jump would reach escape speed: you would float away into space!')
      else s.vy = 2.6
    }
    input.jump = false
    if (s.vy !== 0 || s.jy > 0) {
      s.vy -= world.g * dt
      s.jy += s.vy * dt
      if (s.jy <= 0) {
        s.jy = 0
        s.vy = 0
      }
    }
    const ground = hf.heightAt(s.x, s.z)
    const k = s.descent / LANDING_SECONDS
    const drop = landing ? LANDING_HEIGHT * k * k * k : 0
    camera.position.set(s.x, ground + EYE_HEIGHT + s.jy + drop, s.z)
    if (!gyroRef.current) {
      camera.rotation.order = 'YXZ'
      camera.rotation.set(s.pitch, s.yaw, 0)
    }
    camera.getWorldDirection(dir)
    updatePlayerReadout(s.x, s.z, ground, dir, s.jy > 0)
  })
  return null
}

/** VR: XR origin stands on the terrain; left stick walks, right stick snap-turns / teleports. */
function VRWalker({ site, hf }: { site: SiteContent; hf: HeightField }) {
  const origin = useRef<Group>(null)
  const defaultCamera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const dir = useMemo(() => new Vector3(), [])
  const head = useMemo(() => new Vector3(), [])
  const moveSpeed = useXRApp((s) => s.settings.moveSpeed)
  const turn = useXRApp((s) => s.settings.turn)
  useXRControllerLocomotion(origin, { speed: 2 * moveSpeed }, turn === 'smooth' ? { type: 'smooth', speed: 1.6 } : { type: 'snap', degrees: turn === 'snap45' ? 45 : 30 })

  const right = useXRInputSourceState('controller', 'right')
  const left = useXRInputSourceState('controller', 'left')
  const hop = useRef({ h: 0, v: 0, was: false })
  const seated = useXRApp((s) => s.settings.seated)
  const last = useRef({ x: 0, z: 0, yaw: 0, init: false })
  useFrame((_, dt) => {
    const o = origin.current
    if (!o) return
    const target = consumeGoTo({ x: o.position.x, z: o.position.z })
    if (target) o.position.set(target.x, o.position.y, target.z)
    clampToTerrain(hf, o.position)
    const ground = hf.heightAt(o.position.x, o.position.z)
    // low-gravity hop on A (right) or X (left): same push as on Earth, Mars pulls only 38% as hard
    const pressed = right?.gamepad?.['a-button']?.state === 'pressed' || left?.gamepad?.['x-button']?.state === 'pressed'
    if (pressed && !hop.current.was && hop.current.h === 0) {
      if (world.g < 0.05) useXRApp.getState().showToast('On Bennu a jump would reach escape speed: you would float away into space!')
      else hop.current.v = 2.6
    }
    hop.current.was = pressed
    if (hop.current.v !== 0 || hop.current.h > 0) {
      hop.current.v -= world.g * Math.min(dt, 0.05)
      hop.current.h = Math.max(0, hop.current.h + hop.current.v * Math.min(dt, 0.05))
      if (hop.current.h === 0) hop.current.v = 0
    }
    o.position.y = ground + hop.current.h + (seated ? 0.5 : 0)
    // comfort vignette: how fast the stick is moving/turning you (not your own head motion)
    const L = last.current
    if (L.init) {
      const step = Math.min(dt, 0.05) || 0.016
      const speed = Math.hypot(o.position.x - L.x, o.position.z - L.z) / step
      let turn = Math.abs(o.rotation.y - L.yaw)
      if (turn > Math.PI) turn = 2 * Math.PI - turn
      comfort.motion = Math.min(1, speed / 2.5 + (turn > 0.2 ? 1 : turn / step / 1.5))
    }
    L.x = o.position.x
    L.z = o.position.z
    L.yaw = o.rotation.y
    L.init = true
    const camera = viewCamera(gl, defaultCamera)
    camera.getWorldPosition(head)
    camera.getWorldDirection(dir)
    updatePlayerReadout(head.x, head.z, ground, dir, hop.current.h > 0)
  })

  return (
    <XROrigin ref={origin} position={[site.spawn.x, hf.heightAt(site.spawn.x, site.spawn.z), site.spawn.z]} rotation={[0, spawnYaw(site), 0]}>
      <WristMenu />
    </XROrigin>
  )
}

/** VR "suit computer": a panel that lazily follows your gaze, below eye level, plus the 3D info card. */
function SuitPanelVR({ site }: { site: SiteContent }) {
  const g = useRef<Group>(null)
  const head = useMemo(() => new Vector3(), [])
  const fwd = useMemo(() => new Vector3(), [])
  const target = useMemo(() => new Vector3(), [])
  const [heading, setHeading] = useState(0)
  const last = useRef(0)
  useFrame(({ camera: defaultCamera, gl, clock }, dt) => {
    const o = g.current
    if (!o) return
    const camera = viewCamera(gl, defaultCamera)
    camera.getWorldPosition(head)
    camera.getWorldDirection(fwd)
    fwd.y = 0
    fwd.normalize()
    target.copy(head).addScaledVector(fwd, 1.1)
    target.y = head.y - 0.1
    o.position.lerp(target, 1 - Math.exp(-dt * 2.5))
    o.lookAt(head.x, o.position.y, head.z)
    if (clock.elapsedTime - last.current > 0.5) {
      last.current = clock.elapsedTime
      setHeading(Math.round(player.heading))
    }
  })
  const cardinal = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(heading / 45) % 8]
  const lines = site.conditions.map((c) => `${c.label}: ${c.value}`).join('\n')
  return (
    <group ref={g}>
      <group position={[0, -0.42, 0]} rotation={[-0.35, 0, 0]} scale={0.5}>
        <GlassPanel width={1.5} height={0.62} radius={0.07} rim={0.006} />
        <Icon name="visuals" size={0.05} color={UI.accent} position={[-0.7, 0.218, 0.002]} />
        <Text font={FONT_BOLD} material={noFogText} position={[-0.66, 0.25, 0]} fontSize={0.06} color="#ffffff" anchorX="left" anchorY="top">
          {`${site.name} · heading ${heading}° ${cardinal}`}
        </Text>
        <Text font={FONT} material={noFogText} position={[-0.68, 0.15, 0]} fontSize={0.042} color="#d7def0" anchorX="left" anchorY="top" lineHeight={1.35} maxWidth={1.36}>
          {lines}
        </Text>
        <Button3D label="Back to orbit" icon="back" position={[0.45, -0.22, 0]} width={0.5} height={0.1} onClick={() => useXRApp.getState().selectBody(site.body)} />
      </group>
      <group position={[0.55, 0.1, 0.05]} scale={0.42}>
        <InfoCard3D position={[0, 0, 0]} rotation={[0, -0.35, 0]} />
      </group>
    </group>
  )
}

/** Handheld AR: the whole site as a tabletop model (vertical exaggeration labelled). */
function Diorama({ site, hf }: { site: SiteContent; hf: HeightField }) {
  const SIZE = 0.6
  const geometry = useMemo(() => buildDiorama(hf, SIZE, site.dioramaExaggeration, envOf(site).kind), [hf, site])
  useEffect(() => () => geometry.dispose(), [geometry])
  const s = SIZE / Math.max(hf.width, hf.depth)
  const spawnY = useMemo(() => {
    let lo = Infinity
    for (let i = 0; i <= 50; i++) for (let j = 0; j <= 50; j++) lo = Math.min(lo, hf.baseAt((i / 50 - 0.5) * hf.width, (j / 50 - 0.5) * hf.depth))
    return (hf.baseAt(site.spawn.x, site.spawn.z) - lo) * s * site.dioramaExaggeration
  }, [hf, site, s])
  return (
    <group>
      <mesh geometry={geometry}>
        <meshStandardMaterial vertexColors roughness={1} />
      </mesh>
      <SceneReady />
      <mesh position={[site.spawn.x * s, spawnY + 0.02, site.spawn.z * s]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.008, 0.03, 12]} />
        <meshBasicMaterial color="#4fd1ff" toneMapped={false} />
      </mesh>
      <Billboard position={[site.spawn.x * s, spawnY + 0.05, site.spawn.z * s]}>
        <Text font={FONT_BOLD} fontSize={0.016} color="#ffffff" outlineWidth={0.0015} outlineColor="#000" anchorY="bottom">
          {`You stand here · ${site.name}`}
        </Text>
      </Billboard>
      <Billboard position={[0, 0.12, 0]}>
        <Text font={FONT} fontSize={0.014} color="#ffcc55" outlineWidth={0.001} outlineColor="#000">
          {`Tabletop model · heights ×${site.dioramaExaggeration} · enter VR or Look around to stand on it`}
        </Text>
      </Billboard>
    </group>
  )
}
