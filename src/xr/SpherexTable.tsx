import { Suspense, useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Text, useTexture } from '@react-three/drei'
import { SRGBColorSpace, type Group, type Mesh } from 'three'
import { useXRApp } from './store'
import { FONT, FONT_BOLD } from './font'
import { t } from './i18n'
import { Button, Choice3D, GlassPanel, Label, UI, roundedFrame, roundedRect, uiMat } from './ui3d'
import { backToSource } from './events'
import { KIND_COLORS } from './bodies'
import { SceneReady } from './smooth'
import { pressFeedback, playChime } from './feedback'
import type { ViewMode } from './types'
import { isHit, loadBlinkMeta, movedArcsec, useSpherex, utcOf } from './spherexState'

/** Reveal the known object; a chime if the visitor had flagged it. */
export function revealBlink() {
  const s = useSpherex.getState()
  s.reveal()
  if (s.meta && s.flags.some((f) => isHit(f, s.meta!))) playChime()
}

export const SPHEREX_IMAGES = () => IMAGES

/**
 * SPHEREx on a table, laid out like a photographic plate (on a virtual table in VR / on screen, on your real
 * table in AR).
 *
 * "Spot what moved" is a real blink comparator: two real SPHEREx exposures of the same patch of sky taken
 * 1.8 hours apart (31 Dec 2025, IRSA), reprojected onto one sky grid by scripts/build-blink.mjs so the stars
 * line up. The plate flips between them; anything that jumps is moving. Visitors tap what they think moved,
 * then "Reveal" shows the known object there: asteroid 15 Eunomia, at the positions JPL Horizons gives for
 * the two exposure times. Flags near it count as found; every other flag stays "unverified" — we never
 * present a visitor's guess as a discovery.
 *
 * The other two views are NASA's released SPHEREx images to browse; only RCW 36 is marked (from NASA's caption).
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
const W = 3




export function SpherexTable({ mode }: { mode: ViewMode }) {
  useXRApp((s) => s.settings.lang)
  const { view, blinking, frame, flags, revealed, meta, setView, setBlinking, flip, addFlag, reset } = useSpherex()
  useEffect(() => void loadBlinkMeta(), [])
  // phones held upright: the console moves into an on-screen panel (SpherexPanel) where text stays readable
  const narrow = useThree((st) => st.size.width < 640 && st.size.width < st.size.height)
  const consoleIn3D = mode !== 'desktop' || !narrow
  const image = IMAGES.find((i) => i.id === view)
  // the square blink plate is a little smaller so the plate + console still fit the view
  const PW = image ? W : 2.3
  const H = image ? W * image.aspect : PW
  const y = mode === 'vr' ? -1.15 : mode === 'ar' ? -1.1 : -0.2
  const tilt = mode === 'ar' ? -Math.PI / 2 : -Math.PI / 2 + 0.42
  const toPlate = (p: { u: number; v: number }): [number, number, number] => [(p.u - 0.5) * PW, (0.5 - p.v) * H, 0.006]

  // blink comparator state
  const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
  const last = useRef(0)
  useFrame(({ clock }) => {
    if (view !== 'blink' || !blinking) return
    // a calm 0.7 s flip (1.2 s with reduced motion), the classic blink-comparator rhythm
    if (clock.elapsedTime - last.current > (reduced ? 1.2 : 0.7)) {
      last.current = clock.elapsedTime
      flip()
    }
  })
  const found = meta ? flags.some((f) => isHit(f, meta)) : false
  const moved = meta ? movedArcsec(meta) : 0

  const onPlate = (e: ThreeEvent<MouseEvent>) => {
    if (view !== 'blink' || !e.uv) return
    e.stopPropagation()
    pressFeedback()
    addFlag({ u: e.uv.x, v: 1 - e.uv.y })
  }
  const reveal = revealBlink

  return (
    <group position={[0, y, 0]}>
      {mode !== 'ar' && <TableTop />}
      <group rotation={[tilt, 0, 0]} position={[0, mode === 'ar' ? 0.01 : (H / 2 + 0.1) * Math.sin(0.42) + 0.04, 0]}>
        <mesh geometry={roundedRect(PW + 0.16, H + 0.16, 0.06)} material={uiMat('#0b1820')} position={[0, 0, -0.004]} />
        <mesh geometry={roundedFrame(PW + 0.16, H + 0.16, 0.06, 0.018)} material={uiMat(UI.rim, 0.5)} position={[0, 0, -0.002]} />
        <Suspense fallback={null}>
          {view === 'blink' ? (
            <>
              <Plate url="/spherex/blink-a.png" w={PW} h={H} visible={frame === 0} onClick={onPlate} />
              <Plate url="/spherex/blink-b.png" w={PW} h={H} visible={frame === 1} onClick={onPlate} />
            </>
          ) : (
            image && <Plate url={image.url} w={W} h={H} />
          )}
        </Suspense>
        {view === 'blink' && meta && (
          <>
            <Text font={FONT_BOLD} position={[-PW / 2 + 0.08, H / 2 - 0.08, 0.006]} fontSize={0.09} color="#ffffff" outlineWidth={0.006} outlineColor="#000" anchorX="left" anchorY="top">
              {frame === 0 ? `A · ${utcOf(meta.a.mjd)}` : `B · ${utcOf(meta.b.mjd)} (+${meta.gapHours} h)`}
            </Text>
            {flags.map((f, i) => {
              const hit = revealed && isHit(f, meta)
              return (
                <Marker
                  key={i}
                  position={toPlate(f)}
                  color={hit ? UI.good : revealed ? KIND_COLORS.illustration : KIND_COLORS.candidate}
                  label={hit ? t('✓ Found it') : revealed ? t('Unverified') : t('Your flag')}
                  small
                />
              )
            })}
            {revealed && (
              <>
                <Marker position={toPlate(meta.a)} color={KIND_COLORS.fact} label={`A · ${t('Known: asteroid {x}', { x: meta.target.name })}`} />
                <Marker position={toPlate(meta.b)} color={KIND_COLORS.fact} label="B" />
                <TrackLine a={toPlate(meta.a)} b={toPlate(meta.b)} />
              </>
            )}
          </>
        )}
        {image?.known.map((k) => (
          <Marker key={k.label} position={toPlate(k)} color={KIND_COLORS.fact} label={t(k.label)} />
        ))}
      </group>

      {/* control panel in front of the plate */}
      {consoleIn3D && (
      <group
        position={mode === 'vr' ? [0, 0.3, H / 2 + 0.5] : mode === 'ar' ? [0, 0.02, H / 2 + 0.55] : [0, -0.1, H / 2 + 0.78]}
        rotation={[mode === 'vr' ? -0.5 : -Math.PI / 2 + (mode === 'ar' ? 0 : 0.35), 0, 0]}
        scale={mode === 'vr' ? 0.34 : 0.42}
      >
        <GlassPanel width={5.6} height={2.7} radius={0.16} />
        <Label text={view === 'blink' ? t('Spot what moved') : t('SPHEREx sky on your table')} position={[-2.6, 1.1, 0.005]} size={UI.type.title} bold />
        {view === 'blink' ? (
          <>
            <Label
              text={
                revealed
                  ? found
                    ? t('You found it! That dot is asteroid {x}: it moved {n}″ in {h} hours.', { x: meta?.target.name ?? '', n: Math.round(moved), h: meta?.gapHours ?? '' })
                    : t('The moving dot is asteroid {x} (known, from NASA JPL). Your other flags stay unverified.', { x: meta?.target.name ?? '' })
                  : t('Two real SPHEREx images of the same sky, 1.8 hours apart. Stars stay put. Tap the dot that jumps.')
              }
              position={[-2.6, 0.78, 0.005]}
              size={UI.type.small}
              color={revealed && found ? UI.good : '#d6e4ea'}
              maxWidth={5.2}
            />
            <Button label={blinking ? t('Pause blink') : t('Blink')} icon={blinking ? 'pause' : 'play'} onPress={() => setBlinking(!blinking)} position={[-1.95, 0.25, 0]} width={1.5} height={0.32} />
            <Button label={t('Reveal')} icon="check" tone="accent" disabled={revealed} onPress={reveal} position={[-0.3, 0.25, 0]} width={1.5} height={0.32} />
            <Button label={t('Start over')} icon="refresh" onPress={reset} position={[1.35, 0.25, 0]} width={1.5} height={0.32} />
          </>
        ) : (
          <Label text={t('NASA’s released SPHEREx images to explore. Only NASA-identified objects are marked.')} position={[-2.6, 0.78, 0.005]} size={UI.type.small} color="#d6e4ea" maxWidth={5.2} />
        )}
        <Choice3D
          label={t('NASA image')}
          value={view}
          options={[{ value: 'blink', label: t('Spot what moved') }, ...IMAGES.map((i) => ({ value: i.id, label: t(i.label) }))]}
          onChange={setView}
          position={[-0.7, -0.38, 0]}
          width={3.9}
        />
        <Button label={t('Back to source image')} icon="back" onPress={() => backToSource('spherex', view)} position={[2.05, -0.46, 0]} width={1.0} height={0.3} />
        <Legend position={[-2.6, -0.92, 0.005]} />
        <Label text={t(view === 'blink' ? (meta?.credit ?? '') : (image?.credit ?? ''))} position={[-2.6, -1.14, 0.005]} size={UI.type.tiny} color={UI.muted} maxWidth={5.2} />
      </group>
      )}
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

function Plate({ url, w, h, visible = true, onClick }: { url: string; w: number; h: number; visible?: boolean; onClick?: (e: ThreeEvent<MouseEvent>) => void }) {
  const map = useTexture(url)
  map.colorSpace = SRGBColorSpace
  map.anisotropy = 8
  return (
    <mesh visible={visible} onClick={visible ? onClick : undefined}>
      <planeGeometry args={[w, h]} />
      <meshBasicMaterial map={map} toneMapped={false} />
    </mesh>
  )
}

function Marker({ position, color, label, small = false }: { position: [number, number, number]; color: string; label: string; small?: boolean }) {
  const r = small ? 0.06 : 0.11
  const ring = useRef<Mesh>(null)
  const g = useRef<Group>(null)
  useFrame(({ clock }) => {
    if (ring.current) ring.current.scale.setScalar(1 + 0.12 * Math.sin(clock.elapsedTime * 3))
  })
  const frame = useMemo(() => roundedFrame(r * 2, r * 2, r, r * 0.22), [r])
  return (
    <group ref={g} position={position}>
      <mesh ref={ring} geometry={frame} material={uiMat(color)} />
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
    <mesh position={[(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0.005]} rotation={[0, 0, ang]}>
      <planeGeometry args={[len, 0.014]} />
      <meshBasicMaterial color={KIND_COLORS.fact} transparent opacity={0.7} toneMapped={false} />
    </mesh>
  )
}

function Legend({ position }: { position: [number, number, number] }) {
  const items: [string, string][] = [
    [KIND_COLORS.fact, t('Known (catalogued)')],
    [KIND_COLORS.candidate, t('Your flag')],
    [KIND_COLORS.illustration, t('Unverified')],
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
