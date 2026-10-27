import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Text, useGLTF } from '@react-three/drei'
import { useStore } from 'zustand'
import { BackSide, Group, MeshBasicMaterial, ShaderMaterial, Vector3, type Object3D } from 'three'
import { useXRApp } from './store'
import { xrStore } from './xrStore'
import { viewCamera } from './viewCamera'
import { beginScene, beginTask, endTask, reportProblem, retryScene, useLoading, type Problem } from './loading'
import { Appear, Button, GlassPanel, Icon, Label, UI, roundedFrame, roundedRect, uiMat } from './ui3d'
import { useSitesForBody } from './content'
import { FONT, FONT_BOLD } from './font'
import { t } from './i18n'

/** Motion of the VR player (0 = still, 1 = fast), written by the VR walker, read by the comfort vignette. */
export const comfort = { motion: 0 }

/**
 * Starts loading tracking whenever the scene changes; the scene's own <SceneReady/> ends it once its
 * essentials exist and shaders are compiled. A safety timeout ends it after 15 s regardless.
 */
export function SceneLoadTracker({ label, sceneKey }: { label: string; sceneKey: string }) {
  useEffect(() => {
    beginScene(label)
    beginTask('scene')
    // still not ready after 15 s: say so (offline / slow) with Retry, rather than a black or empty view
    const t = setTimeout(() => useLoading.getState().active && reportProblem('slow', label), 15000)
    return () => clearTimeout(t)
  }, [sceneKey]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

/** Render inside a scene once it has what it needs: compiles shaders up front (no first-frame hitch), then ends loading. */
export function SceneReady() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  useEffect(() => {
    let alive = true
    const done = () => alive && endTask('scene')
    // wait one frame so freshly mounted objects are in the scene graph
    const id = requestAnimationFrame(() => {
      const r = gl as unknown as { compileAsync?: (s: unknown, c: unknown) => Promise<void> }
      if (r.compileAsync) r.compileAsync(scene, camera).then(done, done)
      else {
        gl.compile(scene, camera)
        done()
      }
    })
    return () => {
      alive = false
      cancelAnimationFrame(id)
    }
  }, [gl, scene, camera])
  return null
}

/** While a scene loads in a headset: progress text floating in front of you inside the black veil. */
export function LoadingPanelVR() {
  const session = useStore(xrStore, (s) => s.session)
  const active = useLoading((s) => s.active)
  const label = useLoading((s) => s.label)
  const progress = useLoading((s) => s.progress)
  const g = useRef<Group>(null)
  const arm = useRef<Group>(null)
  const mat = useMemo(() => new MeshBasicMaterial({ fog: false, toneMapped: false, depthTest: false, transparent: true }), [])
  useFrame(({ camera, gl }, dt) => {
    const o = g.current
    if (!o) return
    const cam = viewCamera(gl, camera)
    cam.getWorldPosition(o.position)
    cam.getWorldQuaternion(o.quaternion)
    o.translateZ(-0.45)
    if (arm.current) arm.current.rotation.z -= dt * 2.4
  })
  if (!session || !active) return null
  return (
    <group ref={g} renderOrder={10002}>
      {/* the same little orbit as the on-screen loader: a sun, a ring and a planet going round */}
      <group position={[0, 0.062, 0]}>
        <mesh geometry={roundedFrame(0.07, 0.07, 0.035, 0.0018)} material={uiMat(UI.accent, 0.8, true)} renderOrder={10002} />
        <mesh geometry={roundedRect(0.014, 0.014, 0.007)} material={uiMat('#ffb54a', 1, true)} renderOrder={10003} />
        <group ref={arm}>
          <mesh geometry={roundedRect(0.01, 0.01, 0.005)} material={uiMat('#e0612a', 1, true)} position={[0, 0.035, 0]} renderOrder={10003} />
        </group>
      </group>
      <Text font={FONT_BOLD} material={mat} fontSize={0.028} color="#ffffff" anchorX="center" anchorY="bottom" renderOrder={10002}>
        {t('Preparing {x}…', { x: t(label) })}
      </Text>
      <mesh position={[0, -0.02, 0]} renderOrder={10002}>
        <planeGeometry args={[0.24, 0.006]} />
        <meshBasicMaterial color="#24393b" depthTest={false} toneMapped={false} />
      </mesh>
      <mesh position={[-0.12 + 0.12 * progress, -0.02, 0.001]} renderOrder={10003}>
        <planeGeometry args={[0.24 * Math.max(0.02, progress), 0.006]} />
        <meshBasicMaterial color="#2bb8b0" depthTest={false} toneMapped={false} />
      </mesh>
      <Text font={FONT} material={mat} position={[0, -0.04, 0]} fontSize={0.016} color="#8fd9d3" anchorX="center" anchorY="top" renderOrder={10002}>
        {`${Math.round(progress * 100)}%`}
      </Text>
    </group>
  )
}

/**
 * Comfort vignette (VR): softly darkens the edges of your view while you move or turn with the stick,
 * which reduces motion sickness (a standard technique in Quest apps). Off when you stand still.
 */
export function ComfortVignette() {
  const enabled = useXRApp((s) => s.settings.vignette)
  const session = useStore(xrStore, (s) => s.session)
  const ref = useRef<Group>(null)
  const level = useRef(0)
  const material = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        depthTest: false,
        depthWrite: false,
        side: BackSide,
        fog: false,
        uniforms: { uAmount: { value: 0 } },
        vertexShader: /* glsl */ `varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform float uAmount; varying vec3 vDir;
          void main() {
            float c = dot(normalize(vDir), vec3(0.0, 0.0, -1.0)); // 1 straight ahead
            float inner = mix(0.98, 0.72, uAmount);
            float a = smoothstep(inner, inner - 0.25, c) * uAmount;
            gl_FragColor = vec4(0.0, 0.0, 0.0, a);
          }`,
      }),
    [],
  )
  useEffect(() => () => material.dispose(), [material])
  useFrame(({ camera, gl }, dt) => {
    const o = ref.current
    if (!o) return
    const target = enabled ? Math.min(1, comfort.motion) : 0
    level.current += (target - level.current) * Math.min(1, dt * 6)
    material.uniforms.uAmount.value = level.current
    o.visible = level.current > 0.01
    const cam = viewCamera(gl, camera)
    cam.getWorldPosition(o.position)
    cam.getWorldQuaternion(o.quaternion)
  })
  if (!session) return null
  return (
    <group ref={ref} renderOrder={9999}>
      <mesh material={material} renderOrder={9999} frustumCulled={false}>
        <sphereGeometry args={[0.2, 32, 16]} />
      </mesh>
    </group>
  )
}

/**
 * Streams the next likely scenes in the background: in a planet's orbit view, warms the HTTP cache with
 * the terrain data and NASA models of its walkable sites, so landing is quick.
 */
export function Prefetcher() {
  const bodyId = useXRApp((s) => s.bodyId)
  const siteId = useXRApp((s) => s.siteId)
  const sites = useSitesForBody(siteId ? null : bodyId)
  const [idle, setIdle] = useState(false)
  useEffect(() => {
    setIdle(false)
    const t = setTimeout(() => setIdle(true), 3500)
    return () => clearTimeout(t)
  }, [bodyId, siteId])
  useEffect(() => {
    if (!idle) return
    for (const s of sites) {
      void fetch(s.terrain.url, { priority: 'low' } as RequestInit).catch(() => {})
      for (const m of [...(s.rover ? [s.rover] : []), ...(s.models ?? [])]) useGLTF.preload(m.model)
    }
  }, [idle, sites])
  return null
}

export const PROBLEM_TEXT: Record<Problem['kind'], { title: (what: string) => string; body: () => string }> = {
  offline: { title: () => t('You are offline'), body: () => t('This place needs an internet connection the first time. Places you have already visited still work.') },
  failed: { title: (w) => t("Couldn't load {x}", { x: t(w) }), body: () => t('The download failed. Check your connection and try again.') },
  slow: { title: (w) => t('{x} is taking a while', { x: t(w) }), body: () => t('It is still downloading on a slow connection. Keep waiting, retry, or go somewhere else.') },
}

/** In a headset: the problem card floats in front of you with Retry and a way home (never an empty scene). */
export function ProblemPanelVR() {
  const session = useStore(xrStore, (s) => s.session)
  const problem = useLoading((s) => s.problem)
  useXRApp((s) => s.settings.lang)
  const g = useRef<Group>(null)
  const v = useMemo(() => ({ head: new Vector3(), fwd: new Vector3(), target: new Vector3(), placed: false }), [])
  useEffect(() => {
    v.placed = false
  }, [problem, v])
  useFrame(({ camera, gl }, dt) => {
    const o = g.current
    if (!o) return
    const cam = viewCamera(gl, camera)
    cam.getWorldPosition(v.head)
    cam.getWorldDirection(v.fwd)
    v.fwd.y = 0
    v.fwd.normalize()
    v.target.copy(v.head).addScaledVector(v.fwd, 1.1)
    if (!v.placed) o.position.copy(v.target)
    else o.position.lerp(v.target, 1 - Math.exp(-dt * 1.5))
    v.placed = true
    o.lookAt(v.head.x, o.position.y, v.head.z)
  })
  if (!session || !problem) return null
  const text = PROBLEM_TEXT[problem.kind]
  return (
    <group ref={g}>
      <Appear>
        <group scale={0.18}>
          <GlassPanel width={2.6} height={1.25} radius={0.16} />
          <Icon name={problem.kind === 'slow' ? 'refresh' : 'warning'} size={0.22} color={UI.warn} position={[-1.08, 0.4, 0.004]} />
          <Label text={text.title(problem.what)} position={[-0.88, 0.4, 0.005]} size={UI.type.title} bold maxWidth={2.1} />
          <Label text={text.body()} position={[-1.15, 0.05, 0.005]} size={UI.type.body} color={UI.muted} maxWidth={2.3} />
          <Button label={t('Retry')} icon="refresh" tone="accent" onPress={retryScene} position={[-0.62, -0.38, 0]} width={1.1} height={0.3} />
          <Button label={t('Solar System')} icon="back" onPress={() => useXRApp.getState().selectBody(null)} position={[0.62, -0.38, 0]} width={1.1} height={0.3} />
        </group>
      </Appear>
    </group>
  )
}

/**
 * "Re-centre view": turns the XR origin around your head so you face `yaw` (rotation.y convention),
 * and optionally slides it so your head is above `toXZ`. Your real-world position doesn't change.
 */
export function recenterOrigin(origin: Object3D, cam: Object3D, yaw: number, toXZ?: [number, number]) {
  const head = cam.getWorldPosition(new Vector3())
  const f = cam.getWorldDirection(new Vector3())
  const d = yaw - Math.atan2(-f.x, -f.z)
  const c = Math.cos(d), s = Math.sin(d)
  const ox = origin.position.x - head.x, oz = origin.position.z - head.z
  origin.position.x = head.x + ox * c + oz * s
  origin.position.z = head.z - ox * s + oz * c
  origin.rotation.y += d
  if (toXZ) {
    origin.position.x += toXZ[0] - head.x
    origin.position.z += toXZ[1] - head.z
  }
}

/** A short dip to black on teleport, so the jump doesn't feel like a lurch (read by the transition veil). */
export const blink = { t: 0 }
export function teleportBlink() {
  blink.t = 0.75
}
