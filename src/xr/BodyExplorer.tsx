import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { Billboard, Text, useGLTF, useTexture } from '@react-three/drei'
import { MeshStandardMaterial, SRGBColorSpace, SphereGeometry, Vector2, type BufferGeometry, type Group, type Material, type Mesh } from 'three'
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
import { SceneReady } from './smooth'
import { useMaterialFadeIn } from './fade'
import { t as tr, useT } from './i18n'
import { HOLO, HoloOrbit } from './holo'
import { layersFor, type DataLayer } from './layers'
import { Choice3D, Label, UI, roundedRect, uiMat } from './ui3d'
import { manipulation, useBodyManipulation } from './BodyManipulator'

/** The body blocks pointer rays and gaze, so pins on the far side cannot be picked through it. */
const block = (e: ThreeEvent<PointerEvent | MouseEvent>) => e.stopPropagation()

function BodyMesh({ geometry, material, children }: { geometry: BufferGeometry; material?: Material; children?: React.ReactNode }) {
  const ref = useRef<Mesh>(null)
  useDwellOccluder(ref)
  return (
    <mesh ref={ref} geometry={geometry} material={material} onPointerOver={block} onClick={block}>
      {children}
    </mesh>
  )
}

const sphere = withBVH(new SphereGeometry(1, 96, 64))

function TexturedPlanet({ url, relief, color }: { url: string; relief?: string; color: string }) {
  // colour map + (Mars) MOLA relief normal map arrive together, then fade in over the plain-colour globe
  const maps = useTexture(relief ? [url, relief] : [url])
  const material = useMemo(() => {
    const [map, normalMap] = maps
    map.colorSpace = SRGBColorSpace
    map.anisotropy = 8
    if (normalMap) normalMap.anisotropy = 8
    return new MeshStandardMaterial({ map, normalMap: normalMap ?? null, normalScale: new Vector2(1.2, 1.2), roughness: normalMap ? 0.95 : 1, metalness: 0 })
  }, [maps])
  useEffect(() => () => material.dispose(), [material])
  useMaterialFadeIn(material)
  return (
    <>
      <mesh geometry={sphere} scale={0.996}>
        <meshStandardMaterial color={color} roughness={1} />
      </mesh>
      <BodyMesh geometry={sphere} material={material} />
    </>
  )
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
  const manip = useRef<Group>(null)
  useBodyManipulation(manip)
  const [geometry, setGeometry] = useState<BufferGeometry | null>(null)
  const [illustration, setIllustration] = useState(false)
  useEffect(() => useXRApp.setState({ shapeIsIllustration: illustration }), [illustration])
  const paused = useXRApp((s) => s.hotspotId !== null || s.hoveredId !== null)
  const t = useT()
  const layers = layersFor(id)
  const layerId = useXRApp((s) => s.layer[id] ?? layers[0]?.id)
  const layer = layers.find((l) => l.id === layerId)
  const layerUrl = layer?.url

  useFrame((_, dt) => {
    if (spin.current && !paused && !manipulation.active) spin.current.rotation.y += dt * 0.06
  })

  const name = content?.name ?? info?.name ?? id
  const isAsteroid = content?.type === 'asteroid' || info?.kind === 'asteroid'
  const color = info?.color ?? '#888888'
  const subtitle =
    content === undefined
      ? t('Loading…')
      : illustration
        ? t('Shape is an illustration (no model available)')
        : content === null || content.hotspots.length === 0
          ? t('No hotspots for this body yet')
          : t('{n} hotspots, point, tap or look to explore', { n: content.hotspots.length })

  return (
    <group>
      <group ref={manip}>
      <group ref={spin}>
        {isAsteroid ? (
          <Asteroid model={content?.model} onGeometry={setGeometry} onIllustration={setIllustration} />
        ) : content?.texture ? (
          <ErrorBoundary fallback={<PlainPlanet color={color} />}>
            <Suspense fallback={<PlainPlanet color={color} />}>
              <TexturedPlanet url={layerUrl ?? content.texture} color={color} relief={id === 'mars' && q.marsRelief ? `/textures/mars_normal_${q.marsRelief}.png` : undefined} />
            </Suspense>
          </ErrorBoundary>
        ) : (
          content !== undefined && <PlainPlanet color={color} />
        )}
        {content && <Hotspots content={content} geometry={geometry} />}
        {id === 'bennu' && q.bursts && <BennuEjecta surface={geometry ? (geometry.attributes.position.array as Float32Array) : null} />}
      </group>
      </group>

      {content !== undefined && <SceneReady />}
      {/* the Solar System chart's language: a faint orbit ring with ticks around the body */}
      <group rotation={[0.22, 0, 0]}>
        <HoloOrbit radius={1.55} color={HOLO.teal} />
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
          {layers.length > 1 && <LayerPicker3D body={id} layers={layers} active={layerId} />}
          <Button3D label={t('Solar System')} icon="back" position={[0, -1.35, 0.2]} width={0.6} height={0.13} onClick={() => useXRApp.getState().selectBody(null)} />
          {sites.map((s, i) => (
            <Button3D key={s.id} icon="walk" label={t('Stand at {x}', { x: s.name })} position={[-1.55, 0.3 - i * 0.18, 0.3]} width={0.95} height={0.13} color="#b5562b" onClick={() => useXRApp.getState().selectSite(s.id, s.body)} />
          ))}
        </>
      )}
    </group>
  )
}

/** VR: switch NASA image layers on the globe, with the legend and credit of the one shown. */
function LayerPicker3D({ body, layers, active }: { body: string; layers: DataLayer[]; active?: string }) {
  const layer = layers.find((l) => l.id === active) ?? layers[0]
  return (
    <group position={[1.55, -0.85, 0.3]} rotation={[0, -0.45, 0]} scale={0.32}>
      <Choice3D label={tr('NASA image layer')} value={layer.id} options={layers.map((l) => ({ value: l.id, label: tr(l.label) }))} onChange={(v) => useXRApp.getState().setLayer(body, v)} position={[0, 0, 0]} width={2.4} />
      {layer.legend && (
        <group position={[0, -0.45, 0]}>
          {layer.legend.stops.map((c, i) => (
            <mesh key={c} geometry={roundedRect(2.4 / layer.legend!.stops.length, 0.09, 0.01)} material={uiMat(c)} position={[-1.2 + (2.4 / layer.legend!.stops.length) * (i + 0.5), 0, 0]} />
          ))}
          <Label text={layer.legend.min} position={[-1.2, -0.14, 0.005]} size={UI.type.tiny} />
          <Label text={layer.legend.max} position={[1.2, -0.14, 0.005]} size={UI.type.tiny} anchorX="right" />
        </group>
      )}
      <Label text={tr(layer.credit)} position={[-1.2, layer.legend ? -0.36 : -0.32, 0.005]} size={UI.type.tiny} color={UI.muted} maxWidth={2.4} />
    </group>
  )
}
