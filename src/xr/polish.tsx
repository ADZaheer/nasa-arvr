import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Bloom, EffectComposer, N8AO, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { useStore } from 'zustand'
import { BackSide, MeshBasicMaterial, MeshStandardMaterial, Quaternion, Vector3, type Mesh, type SkinnedMesh } from 'three'
import { xrStore } from './xrStore'
import { useXRApp } from './store'
import { viewCamera } from './viewCamera'
import { applyMix, setAirlessSteps, setAmbience, updateListener, type Mood } from './feedback'
import { useSiteContent } from './content'
import { useLoading } from './loading'
import { blink } from './smooth'
import type { TierParams } from './quality'

/**
 * Fade-through-black whenever the scene changes (Solar System ↔ planet ↔ surface). A sphere around
 * the viewer, so it also works inside a headset, where it is gentler than any camera motion.
 */
export function TransitionVeil({ sceneKey }: { sceneKey: string }) {
  const ref = useRef<Mesh>(null)
  const t = useRef(0)
  const material = useMemo(() => new MeshBasicMaterial({ color: '#000000', side: BackSide, transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false }), [])
  useEffect(() => {
    t.current = 1
  }, [sceneKey])
  useEffect(() => () => material.dispose(), [material])
  useFrame(({ camera, gl }, dt) => {
    const m = ref.current
    if (!m) return
    // stay black while the new scene loads, then fade in
    t.current = useLoading.getState().active ? 1 : Math.max(0, t.current - Math.min(dt, 0.05) / 0.9)
    blink.t = Math.max(0, blink.t - Math.min(dt, 0.05) / 0.22)
    const a = Math.max(t.current * t.current, blink.t)
    material.opacity = a
    m.visible = a > 0.001
    viewCamera(gl, camera).getWorldPosition(m.position)
  })
  return (
    <mesh ref={ref} material={material} renderOrder={10000} frustumCulled={false}>
      <sphereGeometry args={[0.5, 16, 12]} />
    </mesh>
  )
}

/**
 * Desktop-only screen effects for High / Ultra: bloom on the Sun, beacons and glows, soft ambient
 * occlusion (Ultra), anti-aliasing and a slight vignette. Never used inside a headset.
 */
export function ScreenEffects({ q, tier }: { q: TierParams; tier: string }) {
  const session = useStore(xrStore, (s) => s.session)
  if (!q.post || session) return null
  return (
    <EffectComposer multisampling={0}>
      <>{tier === 'ultra' ? <N8AO aoRadius={1.2} intensity={1.4} distanceFalloff={1} halfRes /> : null}</>
      <Bloom mipmapBlur luminanceThreshold={0.9} luminanceSmoothing={0.2} intensity={0.55} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <SMAA />
      <Vignette offset={0.3} darkness={0.45} />
    </EffectComposer>
  )
}

/**
 * Glowing teal hands (like hand-tracked menu UIs): restyles the tracked hand meshes — the only skinned
 * meshes in the scene — once they appear.
 */
export function HandStyler() {
  const scene = useThree((s) => s.scene)
  const session = useStore(xrStore, (s) => s.session)
  const last = useRef(0)
  const material = useMemo(
    () => new MeshStandardMaterial({ color: '#6fe7dc', emissive: '#1d8f87', emissiveIntensity: 0.7, roughness: 0.35, metalness: 0, transparent: true, opacity: 0.82 }),
    [],
  )
  // passthrough: draw nothing, but write depth, so virtual objects behind your real hands are hidden
  const occluder = useMemo(() => new MeshBasicMaterial({ colorWrite: false, depthWrite: true }), [])
  const ar = useXRApp((s) => s.mode === 'ar')
  useFrame(({ clock }) => {
    if (!session || clock.elapsedTime - last.current < 1) return
    last.current = clock.elapsedTime
    const style = ar ? 'occluder' : 'teal'
    scene.traverse((o) => {
      const m = o as SkinnedMesh
      if (m.isSkinnedMesh && m.userData.handStyle !== style) {
        m.material = ar ? occluder : material
        m.renderOrder = ar ? -10 : 0
        m.userData.handStyle = style
      }
    })
  })
  return null
}

/** Keeps soundtrack mood, ambience, mix and the 3D listener in step with the scene and settings. */
export function SoundDirector({ kind }: { kind: 'hub' | 'body' | 'surface' }) {
  const sound = useXRApp((s) => s.settings.sound)
  const music = useXRApp((s) => s.settings.musicVolume)
  const sfx = useXRApp((s) => s.settings.sfxVolume)
  const siteId = useXRApp((s) => s.siteId)
  const site = useSiteContent(siteId)
  const world: Mood = kind === 'surface' ? ((site?.environment?.kind ?? 'mars') as Mood) : 'space'
  const airless = kind === 'surface' && (world === 'moon' || world === 'asteroid')
  useEffect(() => {
    setAirlessSteps(airless)
    setAmbience(sound ? kind : 'none', world)
  }, [sound, kind, world, airless])
  useEffect(() => applyMix(), [music, sfx])
  useEffect(() => () => setAmbience('none'), [])
  const v = useMemo(() => ({ p: new Vector3(), f: new Vector3(), u: new Vector3(), q: new Quaternion() }), [])
  useFrame(({ camera, gl }) => {
    if (!sound) return
    const cam = viewCamera(gl, camera)
    cam.getWorldPosition(v.p)
    cam.getWorldDirection(v.f)
    v.u.set(0, 1, 0).applyQuaternion(cam.getWorldQuaternion(v.q))
    updateListener(v.p, v.f, v.u, airless)
  })
  return null
}
