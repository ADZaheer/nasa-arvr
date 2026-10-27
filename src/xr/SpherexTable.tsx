import { Suspense, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text, useTexture } from '@react-three/drei'
import { SRGBColorSpace, type Group, type Mesh } from 'three'
import { useXRApp } from './store'
import { FONT, FONT_BOLD } from './font'
import { t } from './i18n'
import { Button, Choice3D, GlassPanel, Label, Slider3D, UI, roundedFrame, roundedRect, uiMat } from './ui3d'
import { backToSource } from './events'
import { KIND_COLORS } from './bodies'
import { SceneReady } from './smooth'
import type { ViewMode } from './types'

/**
 * SPHEREx on a table: a real NASA SPHEREx image lies on a (virtual, or in AR your real) table like a
 * photographic plate. Markers A and B and a time slider show how a moving object would be found between
 * two observations — the blink-comparator idea behind searching for a distant planet.
 * Honesty rules: the images are real NASA/JPL-Caltech SPHEREx releases; the moving object, A and B are a
 * clearly labelled DEMO (no real detection is shown); only RCW 36 is marked as a known object, from NASA's caption.
 */
interface SkyImage {
  id: string
  label: string
  url: string
  aspect: number
  credit: string
  known: { u: number; v: number; label: string }[]
}
const IMAGES: SkyImage[] = [
  {
    id: 'vela',
    label: 'Vela Molecular Ridge (Jul 2025)',
    url: '/spherex/vela.jpg',
    aspect: 949 / 1919,
    credit: 'NASA/JPL-Caltech SPHEREx: Vela Molecular Ridge, first public data release, 2 July 2025 (PIA26354)',
    known: [{ u: 0.688, v: 0.358, label: 'Known: RCW 36, an emission nebula' }],
  },
  {
    id: 'first-light',
    label: 'First images (Mar 2025)',
    url: '/spherex/first-light.jpg',
    aspect: 1243 / 1920,
    credit: 'NASA/JPL-Caltech SPHEREx: first images, 27 March 2025, uncalibrated (PIA26280)',
    known: [],
  },
]
/** demo track across the plate (u, v in 0..1 from the top-left) */
const A = { u: 0.3, v: 0.62 }
const B = { u: 0.43, v: 0.53 }

const W = 3

export function SpherexTable({ mode }: { mode: ViewMode }) {
  useXRApp((s) => s.settings.lang)
  const [imageId, setImageId] = useState(IMAGES[0].id)
  const image = IMAGES.find((i) => i.id === imageId)!
  // the moving dot reads this every frame; React state only refreshes the slider ~10× a second
  const timeRef = useRef(0)
  const [time, setTimeState] = useState(0)
  const lastUi = useRef(0)
  const [playing, setPlaying] = useState(true)
  const setTime = (v: number) => {
    timeRef.current = v
    setTimeState(v)
  }
  const H = W * image.aspect
  // the plate sits at table height in VR; flat on your real table in AR; centred on screen
  const y = mode === 'vr' ? -1.15 : mode === 'ar' ? -1.1 : -0.2
  const tilt = mode === 'ar' ? -Math.PI / 2 : -Math.PI / 2 + 0.42
  useFrame(({ clock }, dt) => {
    if (!playing) return
    timeRef.current = (timeRef.current + dt / 6) % 1
    if (clock.elapsedTime - lastUi.current > 0.1) {
      lastUi.current = clock.elapsedTime
      setTimeState(timeRef.current)
    }
  })
  const toPlate = (p: { u: number; v: number }): [number, number, number] => [(p.u - 0.5) * W, (0.5 - p.v) * H, 0.004]

  return (
    <group position={[0, y, 0]}>
      {mode !== 'ar' && <TableTop />}
      <group rotation={[tilt, 0, 0]} position={[0, mode === 'ar' ? 0.01 : (H / 2 + 0.1) * Math.sin(0.42) + 0.04, 0]}>
        <mesh geometry={roundedRect(W + 0.16, H + 0.16, 0.06)} material={uiMat('#0b1820')} position={[0, 0, -0.004]} />
        <mesh geometry={roundedFrame(W + 0.16, H + 0.16, 0.06, 0.018)} material={uiMat(UI.rim, 0.5)} position={[0, 0, -0.002]} />
        <Suspense fallback={null}>
          <Plate url={image.url} w={W} h={H} />
        </Suspense>
        {image.known.map((k) => (
          <Marker key={k.label} position={toPlate(k)} color={KIND_COLORS.fact} label={t(k.label)} />
        ))}
        <Marker position={toPlate(A)} color={KIND_COLORS.illustration} label={t('A · observation 1 (demo)')} small />
        <Marker position={toPlate(B)} color={KIND_COLORS.illustration} label={t('B · observation 2 (demo)')} small />
        <TrackLine a={toPlate(A)} b={toPlate(B)} />
        <MovingDot timeRef={timeRef} from={toPlate(A)} to={toPlate(B)} />
      </group>

      {/* control panel in front of the plate */}
      <group
        position={mode === 'vr' ? [0, 0.3, H / 2 + 0.5] : mode === 'ar' ? [0, 0.02, H / 2 + 0.55] : [0, -0.1, H / 2 + 1.05]}
        rotation={[mode === 'vr' ? -0.5 : -Math.PI / 2 + (mode === 'ar' ? 0 : 0.35), 0, 0]}
        scale={mode === 'vr' ? 0.34 : 0.42}
      >
        <GlassPanel width={5.6} height={2.5} radius={0.16} />
        <Label text={t('SPHEREx sky on your table')} position={[-2.6, 1.0, 0.005]} size={UI.type.title} bold />
        <Label text={t('Real NASA image · markers A and B and the moving dot are a demo, not a discovery')} position={[-2.6, 0.78, 0.005]} size={UI.type.small} color={UI.warn} maxWidth={5.2} />
        <Slider3D label={t('Time: observation A → B (demo)')} value={time} min={0} max={1} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => (setPlaying(false), setTime(v))} position={[-1.1, 0.25, 0]} width={3.1} />
        <Button label={playing ? t('Pause') : t('Play')} icon={playing ? 'pause' : 'play'} onPress={() => setPlaying((p) => !p)} position={[1.55, 0.2, 0]} width={1.0} height={0.3} />
        <Choice3D label={t('NASA image')} value={image.id} options={IMAGES.map((i) => ({ value: i.id, label: t(i.label) }))} onChange={setImageId} position={[-1.1, -0.42, 0]} width={3.1} />
        <Button label={t('Back to source image')} icon="back" onPress={() => backToSource('spherex', image.id)} position={[1.75, -0.5, 0]} width={1.6} height={0.3} />
        <Legend position={[-2.6, -0.95, 0.005]} />
        <Label text={t(image.credit)} position={[-2.6, -1.12, 0.005]} size={UI.type.tiny} color={UI.muted} maxWidth={5.2} />
      </group>
      <SceneReady />
    </group>
  )
}

function TableTop() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0.35]} geometry={roundedRect(4.2, 3.6, 0.3)} material={uiMat('#10202a', 0.9)} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0.35]} geometry={roundedFrame(4.2, 3.6, 0.3, 0.03)} material={uiMat(UI.rim, 0.45)} />
    </group>
  )
}

function Plate({ url, w, h }: { url: string; w: number; h: number }) {
  const map = useTexture(url)
  map.colorSpace = SRGBColorSpace
  map.anisotropy = 8
  return (
    <mesh>
      <planeGeometry args={[w, h]} />
      <meshBasicMaterial map={map} toneMapped={false} />
    </mesh>
  )
}

function Marker({ position, color, label, small = false }: { position: [number, number, number]; color: string; label: string; small?: boolean }) {
  const r = small ? 0.05 : 0.11
  return (
    <group position={position}>
      <mesh geometry={roundedFrame(r * 2, r * 2, r, r * 0.22)} material={uiMat(color)} />
      <Text font={FONT_BOLD} position={[r + 0.03, r + 0.02, 0.002]} fontSize={0.065} color={color} outlineWidth={0.005} outlineColor="#000" anchorX="left" anchorY="bottom" maxWidth={1.3}>
        {label}
      </Text>
    </group>
  )
}

function TrackLine({ a, b }: { a: [number, number, number]; b: [number, number, number] }) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1])
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0])
  return (
    <mesh position={[(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0.003]} rotation={[0, 0, ang]}>
      <planeGeometry args={[len, 0.012]} />
      <meshBasicMaterial color={KIND_COLORS.illustration} transparent opacity={0.6} toneMapped={false} />
    </mesh>
  )
}

function MovingDot({ timeRef, from, to }: { timeRef: React.RefObject<number>; from: [number, number, number]; to: [number, number, number] }) {
  const g = useRef<Group>(null)
  const ring = useRef<Mesh>(null)
  useFrame(({ clock }) => {
    const k = timeRef.current ?? 0
    g.current?.position.set(from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k, 0.004)
    if (ring.current) ring.current.scale.setScalar(1 + 0.35 * Math.sin(clock.elapsedTime * 5) ** 2)
  })
  const dot = useMemo(() => roundedRect(0.05, 0.05, 0.025), [])
  return (
    <group ref={g}>
      <mesh geometry={dot} material={uiMat('#ffffff')} />
      <mesh ref={ring} geometry={roundedFrame(0.12, 0.12, 0.06, 0.012)} material={uiMat(KIND_COLORS.illustration)} />
      <Text font={FONT} position={[0, -0.09, 0.002]} fontSize={0.05} color="#e9ddff" outlineWidth={0.004} outlineColor="#000" anchorY="top">
        {t('Simulated moving object')}
      </Text>
    </group>
  )
}

function Legend({ position }: { position: [number, number, number] }) {
  const items: [string, string][] = [
    [KIND_COLORS.fact, t('Known (catalogued)')],
    [KIND_COLORS.candidate, t('Candidate (needs follow-up)')],
    [KIND_COLORS.illustration, t('Unverified / demo')],
  ]
  return (
    <group position={position}>
      {items.map(([c, l], i) => (
        <group key={l} position={[i * 1.75, 0, 0]}>
          <mesh geometry={roundedRect(0.12, 0.12, 0.06)} material={uiMat(c)} position={[0.06, 0, 0]} />
          <Label text={l} position={[0.18, 0, 0.002]} size={UI.type.tiny} />
        </group>
      ))}
    </group>
  )
}
