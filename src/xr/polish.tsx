import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Bloom, EffectComposer, N8AO, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { useStore } from 'zustand'
import { BackSide, MeshBasicMaterial, MeshStandardMaterial, type Mesh, type SkinnedMesh } from 'three'
import { xrStore } from './xrStore'
import { useXRApp } from './store'
import { viewCamera } from './viewCamera'
import { setAmbience } from './feedback'
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
    t.current = Math.max(0, t.current - Math.min(dt, 0.05) / 0.9)
    material.opacity = t.current * t.current
    m.visible = t.current > 0.001
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
  useFrame(({ clock }) => {
    if (!session || clock.elapsedTime - last.current < 1) return
    last.current = clock.elapsedTime
    scene.traverse((o) => {
      const m = o as SkinnedMesh
      if (m.isSkinnedMesh && !m.userData.tealHand) {
        m.material = material
        m.userData.tealHand = true
      }
    })
  })
  return null
}

/** Keeps the synthesised ambience in step with the scene and the Sound setting. */
export function SoundDirector({ kind }: { kind: 'hub' | 'body' | 'surface' }) {
  const sound = useXRApp((s) => s.settings.sound)
  useEffect(() => {
    setAmbience(sound ? kind : 'none')
  }, [sound, kind])
  useEffect(() => () => setAmbience('none'), [])
  return null
}
