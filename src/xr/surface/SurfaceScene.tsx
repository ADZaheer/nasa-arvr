import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Billboard, Text, useGLTF } from '@react-three/drei'
import { TeleportTarget, XROrigin, useXRControllerLocomotion } from '@react-three/xr'
import {
  AdditiveBlending,
  Box3,
  IcosahedronGeometry,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  Vector3,
  type Group,
  type InstancedMesh,
  type Mesh,
  type PerspectiveCamera,
} from 'three'
import { useSiteContent } from '../content'
import { useXRApp } from '../store'
import { useDwellTarget } from '../dwell'
import { KIND_COLORS } from '../bodies'
import { FONT, FONT_BOLD } from '../font'
import { InfoCard3D } from '../InfoCard'
import { Button3D } from '../Button3D'
import { ErrorBoundary } from '../ErrorBoundary'
import type { Hotspot, SiteContent, ViewMode } from '../types'
import { buildDiorama, buildRadialTerrain, getGroundTexture, sunDirection, useHeightField, vnoise, type HeightField } from './terrain'
import { MarsSky, MARS_HORIZON } from './MarsSky'
import { EYE_HEIGHT, MARS_G, input, player } from './player'
import { viewCamera } from '../viewCamera'

const DEG = Math.PI / 180

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
  const hf = useHeightField(site)

  useLayoutEffect(() => {
    if (!site) return
    player.x = site.spawn.x
    player.z = site.spawn.z
    useXRApp.setState({ headingOffset: spawnYaw(site) })
    return () => useXRApp.setState({ headingOffset: 0 })
  }, [site])

  if (site === null) return <Notice text={`Unknown site "${siteId}"`} />
  if (!site || !hf) return <Notice text="Landing…" />
  if (mode === 'ar') return <Diorama site={site} hf={hf} />

  return (
    <>
      <SurfaceEnvironment site={site} />
      <Terrain site={site} hf={hf} teleport={mode === 'vr'} />
      <Rocks site={site} hf={hf} />
      {site.rover && (
        <ErrorBoundary fallback={null}>
          <Suspense fallback={null}>
            <Rover rover={site.rover} hf={hf} />
          </Suspense>
        </ErrorBoundary>
      )}
      {site.hotspots.map((h) => (
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

function SurfaceEnvironment({ site }: { site: SiteContent }) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const sun = useMemo(() => sunDirection(site.sun.azimuthDeg, site.sun.elevationDeg), [site])
  const far = site.terrain.viewRadius * 1.2
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
  return (
    <>
      <fogExp2 attach="fog" args={[MARS_HORIZON, site.fogDensity]} />
      <MarsSky sunDir={sun} radius={far * 0.8} />
      <hemisphereLight args={['#d9b08c', '#5e3522', 0.9]} />
      <directionalLight position={[sun[0] * 100, sun[1] * 100, sun[2] * 100]} intensity={2.3} color="#fff0dc" />
    </>
  )
}

function Terrain({ site, hf, teleport }: { site: SiteContent; hf: HeightField; teleport: boolean }) {
  const [center, setCenter] = useState<[number, number]>([site.spawn.x, site.spawn.z])
  const geometry = useMemo(() => buildRadialTerrain(hf, center[0], center[1], site.terrain.viewRadius), [hf, center, site])
  useEffect(() => () => geometry.dispose(), [geometry])
  // re-centre the fine detail on the player after they walk away
  useFrame(() => {
    if (Math.hypot(player.x - center[0], player.z - center[1]) > 40) setCenter([player.x, player.z])
  })
  const mesh = (
    <mesh geometry={geometry}>
      <meshStandardMaterial vertexColors map={getGroundTexture()} roughness={1} metalness={0} />
    </mesh>
  )
  if (!teleport) return mesh
  return <TeleportTarget onTeleport={(p) => useXRApp.getState().requestGoTo({ x: p.x, z: p.z, exact: true })}>{mesh}</TeleportTarget>
}

function seeded(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

/** Scattered basalt rocks around the landing spot (procedural, "artistic"). */
function Rocks({ site, hf }: { site: SiteContent; hf: HeightField }) {
  const COUNT = 900
  const ref = useRef<InstancedMesh>(null)
  const geometry = useMemo(() => {
    const g = new IcosahedronGeometry(1, 1)
    const p = g.attributes.position
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i)
      const d = 1 + 0.28 * vnoise(x * 2.3 + 11, y * 2.1 + z * 1.7)
      p.setXYZ(i, x * d, y * d, z * d)
    }
    g.computeVertexNormals()
    return g
  }, [])
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
      const size = 0.03 + 0.75 * Math.pow(rnd(), 5)
      axis.set(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize()
      q.setFromAxisAngle(axis, rnd() * Math.PI * 2)
      pos.set(x, hf.heightAt(x, z) + size * 0.15, z)
      scl.set(size, size * (0.5 + rnd() * 0.4), size * (0.8 + rnd() * 0.5))
      m.setMatrixAt(i, mat.compose(pos, q, scl))
    }
    m.instanceMatrix.needsUpdate = true
    m.computeBoundingSphere()
  }, [site, hf])
  return (
    <instancedMesh ref={ref} args={[geometry, undefined, COUNT]}>
      <meshStandardMaterial color="#5e3b2b" roughness={1} flatShading />
    </instancedMesh>
  )
}

function Rover({ rover, hf }: { rover: NonNullable<SiteContent['rover']>; hf: HeightField }) {
  const { scene } = useGLTF(rover.model)
  const obj = useMemo(() => {
    const c = scene.clone(true)
    const size = new Box3().setFromObject(c).getSize(new Vector3())
    c.scale.setScalar(rover.sizeM / Math.max(size.x, size.z))
    const b = new Box3().setFromObject(c)
    c.position.set(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2)
    return c
  }, [scene, rover])
  return (
    <group position={[rover.x, hf.heightAt(rover.x, rover.z), rover.z]} rotation={[0, rover.yawDeg * DEG, 0]}>
      <primitive object={obj} />
    </group>
  )
}

const noFogText = new MeshBasicMaterial({ fog: false, toneMapped: false })

/** A point of interest on the surface: glowing beacon that stays readable at any distance. */
function Beacon({ h, hf }: { h: Hotspot; hf: HeightField }) {
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
    s.selectHotspot(s.hotspotId === h.id ? null : h.id)
  }, [h.id])
  useDwellTarget(hit, select)

  useFrame(({ camera, gl, clock }) => {
    viewCamera(gl, camera).getWorldPosition(tmp)
    const d = tmp.distanceTo(base)
    // keep beacons a readable size on screen at any distance
    if (inner.current) inner.current.scale.setScalar(Math.max(1, d / 9))
    if (glow.current) glow.current.scale.setScalar((hovered || selected ? 1.6 : 1) * (1 + 0.15 * Math.sin(clock.elapsedTime * 3)))
    if (clock.elapsedTime - last.current > 0.5) {
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
        <Billboard position={[0, orbY + 0.35, 0]}>
          <Text font={FONT_BOLD} material={noFogText} fontSize={hovered || selected ? 0.2 : 0.16} color="#ffffff" outlineWidth={0.012} outlineColor="#000000" anchorY="bottom" maxWidth={2.4} textAlign="center">
            {h.title}
          </Text>
          <Text font={FONT} material={noFogText} position={[0, -0.02, 0]} fontSize={0.11} color="#e6d7c8" outlineWidth={0.008} outlineColor="#000000" anchorY="top">
            {distLabel}
          </Text>
        </Billboard>
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
  const st = useRef({ x: site.spawn.x, z: site.spawn.z, yaw: spawnYaw(site), pitch: spawnPitch(site, hf), vy: 0, jy: 0 })
  const gyroRef = useRef(gyro)
  gyroRef.current = gyro
  const dir = useMemo(() => new Vector3(), [])

  useEffect(() => {
    st.current = { x: site.spawn.x, z: site.spawn.z, yaw: spawnYaw(site), pitch: spawnPitch(site, hf), vy: 0, jy: 0 }
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
      ShiftLeft: 'run', ShiftRight: 'run', Space: 'jump',
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
    const mf = (input.forward ? 1 : 0) - (input.back ? 1 : 0)
    const mr = (input.right ? 1 : 0) - (input.left ? 1 : 0)
    if (mf || mr) {
      const speed = input.run ? 4.5 : 1.6
      const L = Math.hypot(mf, mr)
      s.x += ((fx * mf - fz * mr) / L) * speed * dt
      s.z += ((fz * mf + fx * mr) / L) * speed * dt
      clampToTerrain(hf, s)
    }
    // low-gravity jump: same push as on Earth, but Mars pulls only 38% as hard
    if (input.jump && s.jy === 0) s.vy = 2.6
    input.jump = false
    if (s.vy !== 0 || s.jy > 0) {
      s.vy -= MARS_G * dt
      s.jy += s.vy * dt
      if (s.jy <= 0) {
        s.jy = 0
        s.vy = 0
      }
    }
    const ground = hf.heightAt(s.x, s.z)
    camera.position.set(s.x, ground + EYE_HEIGHT + s.jy, s.z)
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
  useXRControllerLocomotion(origin, { speed: 2 }, { type: 'snap', degrees: 30 })

  useFrame(() => {
    const o = origin.current
    if (!o) return
    const target = consumeGoTo({ x: o.position.x, z: o.position.z })
    if (target) o.position.set(target.x, o.position.y, target.z)
    clampToTerrain(hf, o.position)
    const ground = hf.heightAt(o.position.x, o.position.z)
    o.position.y = ground
    const camera = viewCamera(gl, defaultCamera)
    camera.getWorldPosition(head)
    camera.getWorldDirection(dir)
    updatePlayerReadout(head.x, head.z, ground, dir, false)
  })

  return <XROrigin ref={origin} position={[site.spawn.x, hf.heightAt(site.spawn.x, site.spawn.z), site.spawn.z]} rotation={[0, spawnYaw(site), 0]} />
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
        <mesh position={[0, 0, -0.01]}>
          <planeGeometry args={[1.5, 0.62]} />
          <meshBasicMaterial color="#0b1020" transparent opacity={0.85} fog={false} />
        </mesh>
        <Text font={FONT_BOLD} material={noFogText} position={[-0.68, 0.25, 0]} fontSize={0.065} color="#ffffff" anchorX="left" anchorY="top">
          {`${site.name} · heading ${heading}° ${cardinal}`}
        </Text>
        <Text font={FONT} material={noFogText} position={[-0.68, 0.15, 0]} fontSize={0.042} color="#d7def0" anchorX="left" anchorY="top" lineHeight={1.35} maxWidth={1.36}>
          {lines}
        </Text>
        <Button3D label="◂ Back to orbit" position={[0.45, -0.22, 0]} width={0.5} height={0.1} onClick={() => useXRApp.getState().selectBody(site.body)} />
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
  const geometry = useMemo(() => buildDiorama(hf, SIZE, site.dioramaExaggeration), [hf, site])
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
