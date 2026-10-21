import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { Billboard, Text, useGLTF, useTexture } from '@react-three/drei'
import { SRGBColorSpace, SphereGeometry, Vector2, type BufferGeometry, type Group, type Mesh } from 'three'
import { useBodyContent, useSitesForBody } from './content'
import { BODY_BY_ID } from './bodies'
import { makeLumpyGeometry } from './geo'
import { useXRApp } from './store'
import { useDwellOccluder } from './dwell'
import { Hotspots } from './Hotspots'
import { InfoCard3D } from './InfoCard'
import { Button3D } from './Button3D'
import { ErrorBoundary } from './ErrorBoundary'
import { withBVH } from './bvh'
import { FONT, FONT_BOLD } from './font'
import { useQuality } from './quality'
import { Atmosphere } from './space'
import { BennuEjecta } from './surface/particles'

/** The body blocks pointer rays and gaze, so pins on the far side cannot be picked through it. */
const block = (e: ThreeEvent<PointerEvent | MouseEvent>) => e.stopPropagation()

function BodyMesh({ geometry, children }: { geometry: BufferGeometry; children: React.ReactNode }) {
  const ref = useRef<Mesh>(null)
  useDwellOccluder(ref)
  return (
    <mesh ref={ref} geometry={geometry} onPointerOver={block} onClick={block}>
      {children}
    </mesh>
  )
}

const sphere = withBVH(new SphereGeometry(1, 96, 64))

function TexturedPlanet({ url, relief }: { url: string; relief?: string }) {
  const map = useTexture(url)
  map.colorSpace = SRGBColorSpace
  map.anisotropy = 8
  return (
    <BodyMesh geometry={sphere}>
      {relief ? (
        <Suspense fallback={<meshStandardMaterial map={map} roughness={1} metalness={0} />}>
          <ReliefMaterial map={map} relief={relief} />
        </Suspense>
      ) : (
        <meshStandardMaterial map={map} roughness={1} metalness={0} />
      )}
    </BodyMesh>
  )
}

/** Real topography as lighting: normal map from the MGS MOLA laser-altimeter grid (scripts/build-assets.mjs). */
function ReliefMaterial({ map, relief }: { map: ReturnType<typeof useTexture>; relief: string }) {
  const normalMap = useTexture(relief)
  normalMap.anisotropy = 8
  return <meshStandardMaterial map={map as never} normalMap={normalMap} normalScale={new Vector2(1.2, 1.2)} roughness={0.95} metalness={0} />
}

function PlainPlanet({ color }: { color: string }) {
  return (
    <BodyMesh geometry={sphere}>
      <meshStandardMaterial color={color} roughness={1} />
    </BodyMesh>
  )
}

function GltfAsteroid({ url, onGeometry }: { url: string; onGeometry: (g: BufferGeometry) => void }) {
  const { scene } = useGLTF(url)
  const geometry = useMemo(() => {
    let g: BufferGeometry | null = null
    scene.traverse((o) => {
      if (!g && (o as Mesh).isMesh) g = (o as Mesh).geometry
    })
    return g ? withBVH(g as BufferGeometry) : null
  }, [scene])
  useEffect(() => {
    if (geometry) onGeometry(geometry)
  }, [geometry, onGeometry])
  if (!geometry) return null
  return (
    <BodyMesh geometry={geometry}>
      <meshStandardMaterial color="#7a746c" roughness={1} metalness={0} />
    </BodyMesh>
  )
}

function LumpyAsteroid({ onGeometry }: { onGeometry: (g: BufferGeometry) => void }) {
  const geometry = useMemo(() => withBVH(makeLumpyGeometry(3)), [])
  useEffect(() => onGeometry(geometry), [geometry, onGeometry])
  return (
    <BodyMesh geometry={geometry}>
      <meshStandardMaterial color="#6f6a64" roughness={1} flatShading />
    </BodyMesh>
  )
}

/** Uses the GLB when the file really exists (Vite's SPA fallback returns HTML for missing files). */
function useModelAvailable(url?: string): boolean | null {
  const [ok, setOk] = useState<boolean | null>(url ? null : false)
  useEffect(() => {
    if (!url) return setOk(false)
    let alive = true
    fetch(url, { method: 'HEAD' })
      .then((r) => alive && setOk(r.ok && !(r.headers.get('content-type') ?? '').includes('text/html')))
      .catch(() => alive && setOk(false))
    return () => {
      alive = false
    }
  }, [url])
  return ok
}

function Asteroid({ model, onGeometry, onIllustration }: { model?: string; onGeometry: (g: BufferGeometry) => void; onIllustration: (v: boolean) => void }) {
  const available = useModelAvailable(model)
  useEffect(() => {
    if (available !== null) onIllustration(!available)
  }, [available, onIllustration])
  if (available === null) return null
  if (!available || !model) return <LumpyAsteroid onGeometry={onGeometry} />
  return (
    <ErrorBoundary fallback={<LumpyAsteroid onGeometry={onGeometry} />}>
      <Suspense fallback={null}>
        <GltfAsteroid url={model} onGeometry={onGeometry} />
      </Suspense>
    </ErrorBoundary>
  )
}

/**
 * Generic explorer for one body: loads content/bodies/<id>.json, shows a textured sphere (planets)
 * or a GLB / procedural placeholder (asteroids), hotspots, and (in VR) the in-world info card.
 */
export function BodyExplorer({ id, vr }: { id: string; vr: boolean }) {
  const content = useBodyContent(id)
  const q = useQuality()
  const sites = useSitesForBody(vr ? id : null)
  const info = BODY_BY_ID[id]
  const spin = useRef<Group>(null)
  const [geometry, setGeometry] = useState<BufferGeometry | null>(null)
  const [illustration, setIllustration] = useState(false)
  useEffect(() => useXRApp.setState({ shapeIsIllustration: illustration }), [illustration])
  const paused = useXRApp((s) => s.hotspotId !== null || s.hoveredId !== null)

  useFrame((_, dt) => {
    if (spin.current && !paused) spin.current.rotation.y += dt * 0.06
  })

  const name = content?.name ?? info?.name ?? id
  const isAsteroid = content?.type === 'asteroid' || info?.kind === 'asteroid'
  const color = info?.color ?? '#888888'
  const subtitle =
    content === undefined
      ? 'Loading…'
      : illustration
        ? 'Shape is an illustration (no model available)'
        : content === null || content.hotspots.length === 0
          ? 'No hotspots for this body yet'
          : `${content.hotspots.length} hotspots, point, tap or look to explore`

  return (
    <group>
      <group ref={spin}>
        {isAsteroid ? (
          <Asteroid model={content?.model} onGeometry={setGeometry} onIllustration={setIllustration} />
        ) : content?.texture ? (
          <ErrorBoundary fallback={<PlainPlanet color={color} />}>
            <Suspense fallback={<PlainPlanet color={color} />}>
              <TexturedPlanet url={content.texture} relief={id === 'mars' && q.marsRelief ? `/textures/mars_normal_${q.marsRelief}.png` : undefined} />
            </Suspense>
          </ErrorBoundary>
        ) : (
          content !== undefined && <PlainPlanet color={color} />
        )}
        {content && <Hotspots content={content} geometry={geometry} />}
        {id === 'bennu' && q.bursts && <BennuEjecta surface={geometry ? (geometry.attributes.position.array as Float32Array) : null} />}
      </group>

      {id === 'mars' && <Atmosphere color="#e3a07a" intensity={0.9} />}
      <Billboard position={[0, 1.38, 0]}>
        <Text font={FONT_BOLD} fontSize={0.16} color="#ffffff" anchorY="bottom" outlineWidth={0.006} outlineColor="#000">
          {name}
        </Text>
        <Text font={FONT} position={[0, -0.03, 0]} fontSize={0.06} color={illustration ? '#b18cff' : '#aab4cc'} anchorY="top">
          {subtitle}
        </Text>
      </Billboard>

      {vr && (
        <>
          <InfoCard3D />
          <Button3D label="◂ Solar System" position={[0, -1.35, 0.2]} width={0.6} height={0.13} onClick={() => useXRApp.getState().selectBody(null)} />
          {sites.map((s, i) => (
            <Button3D key={s.id} label={`Stand at ${s.name}`} position={[-1.55, 0.3 - i * 0.18, 0.3]} width={0.95} height={0.13} color="#b5562b" onClick={() => useXRApp.getState().selectSite(s.id, s.body)} />
          ))}
        </>
      )}
    </group>
  )
}
