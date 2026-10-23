import { useRef, useState, type ReactNode, type RefObject } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import { MeshBasicMaterial, Path, Shape, ShapeGeometry, Vector3, type Group, type Mesh } from 'three'
import { FONT, FONT_BOLD } from './font'
import { hoverFeedback, pressFeedback } from './feedback'

/**
 * One design system for every in-world panel (wrist menu, info cards, suit computer, mission cards),
 * in the spirit of Quest's Horizon OS: dark rounded glass, a soft rim, pill buttons with icons, a fixed
 * type scale, springy hover/press, and buttons you can physically push in with a fingertip.
 * Units are relative: each panel's parent scales it (the wrist menu uses 1 unit ≈ 7 cm).
 */
export const UI = {
  glass: '#0b1820',
  glassOpacity: 0.86,
  rim: '#a8efe8',
  rimOpacity: 0.28,
  plate: '#1b2e38',
  plateHover: '#27434f',
  accent: '#2bb8b0',
  accentHover: '#3fd0c7',
  accentText: '#03201e',
  warm: '#c4683a',
  warmHover: '#da7c4c',
  blue: '#2f6fed',
  blueHover: '#4a84f5',
  text: '#eef6f8',
  muted: '#93aab4',
  good: '#5ee39a',
  warn: '#ffcc55',
  /** type scale, in panel units */
  type: { title: 0.15, body: 0.105, small: 0.085, tiny: 0.068 },
}
export const TEAL = UI.accent
export type Tone = 'plate' | 'accent' | 'warm' | 'blue'
const TONES: Record<Tone, { base: string; hover: string; text: string }> = {
  plate: { base: UI.plate, hover: UI.plateHover, text: UI.text },
  accent: { base: UI.accent, hover: UI.accentHover, text: UI.accentText },
  warm: { base: UI.warm, hover: UI.warmHover, text: '#ffffff' },
  blue: { base: UI.blue, hover: UI.blueHover, text: '#ffffff' },
}

// ---------- shared geometry + materials (cached: panels mount and unmount often) ----------

const geoCache = new Map<string, ShapeGeometry>()
function cached(key: string, make: () => ShapeGeometry) {
  let g = geoCache.get(key)
  if (!g) geoCache.set(key, (g = make()))
  return g
}
function roundedPath<T extends Path>(p: T, w: number, h: number, r: number, cx = 0, cy = 0): T {
  r = Math.min(r, w / 2, h / 2)
  const x = cx - w / 2, y = cy - h / 2
  p.moveTo(x + r, y)
  p.lineTo(x + w - r, y)
  p.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false)
  p.lineTo(x + w, y + h - r)
  p.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false)
  p.lineTo(x + r, y + h)
  p.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false)
  p.lineTo(x, y + r)
  p.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false)
  return p
}
const k = (n: number) => n.toFixed(4)
export function roundedRect(w: number, h: number, r: number) {
  return cached(`rr${k(w)}|${k(h)}|${k(r)}`, () => new ShapeGeometry(roundedPath(new Shape(), w, h, r), 8))
}
/** A rounded outline (the glass rim). */
export function roundedFrame(w: number, h: number, r: number, t: number) {
  return cached(`rf${k(w)}|${k(h)}|${k(r)}|${k(t)}`, () => {
    const s = roundedPath(new Shape(), w, h, r)
    s.holes.push(roundedPath(new Path(), w - 2 * t, h - 2 * t, Math.max(0, r - t)))
    return new ShapeGeometry(s, 8)
  })
}

const matCache = new Map<string, MeshBasicMaterial>()
/** Unlit, fog-free UI material. `overlay` draws on top of the world (head-locked cards). */
export function uiMat(color: string, opacity = 1, overlay = false) {
  const key = `${color}|${opacity}|${overlay}`
  let m = matCache.get(key)
  if (!m) {
    m = new MeshBasicMaterial({ color, transparent: opacity < 1 || overlay, opacity, fog: false, toneMapped: false, depthWrite: opacity >= 1 && !overlay, depthTest: !overlay })
    matCache.set(key, m)
  }
  return m
}
const textMat = uiMat('#ffffff')
const textMatOverlay = uiMat('#ffffff', 1, true)

// ---------- icons: tiny vector shapes (no icon font or image needed) ----------

type V2 = [number, number]
const poly = (pts: V2[]) => {
  const s = new Shape()
  pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)))
  return s
}
const rect = (cx: number, cy: number, w: number, h: number, rot = 0) => {
  const c = Math.cos(rot), s = Math.sin(rot)
  return poly(([[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]] as V2[]).map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c]))
}
const disc = (cx: number, cy: number, r: number) => {
  const s = new Shape()
  s.absarc(cx, cy, r, 0, Math.PI * 2, false)
  return s
}
const ring = (cx: number, cy: number, r: number, t: number, ry = r) => {
  const s = new Shape()
  s.absellipse(cx, cy, r, ry, 0, Math.PI * 2, false, 0)
  const h = new Path()
  h.absellipse(cx, cy, r - t, ry - t, 0, Math.PI * 2, true, 0)
  s.holes.push(h)
  return s
}
const arcBand = (r: number, t: number, a0: number, a1: number, cx = 0, cy = 0) => {
  const s = new Shape()
  s.absarc(cx, cy, r, a0, a1, false)
  s.absarc(cx, cy, r - t, a1, a0, true)
  return s
}
const ICONS = {
  travel: () => [disc(0, 0, 0.25), rect(0, 0, 0.98, 0.07, 0.38)],
  missions: () => [rect(-0.3, -0.02, 0.08, 0.92), poly([[-0.27, 0.43], [0.4, 0.24], [-0.27, 0.04]])],
  visuals: () => [disc(0, 0, 0.19), ...Array.from({ length: 8 }, (_, i) => rect(Math.cos((i * Math.PI) / 4) * 0.37, Math.sin((i * Math.PI) / 4) * 0.37, 0.15, 0.07, (i * Math.PI) / 4))],
  comfort: () => [disc(0, 0.3, 0.14), poly([[-0.3, -0.46], [0.3, -0.46], [0.22, 0.06], [-0.22, 0.06]])],
  audio: () => [poly([[-0.44, -0.13], [-0.22, -0.13], [0.02, -0.36], [0.02, 0.36], [-0.22, 0.13], [-0.44, 0.13]]), arcBand(0.26, 0.07, -0.8, 0.8, 0.04), arcBand(0.44, 0.07, -0.8, 0.8, 0.04)],
  info: () => [ring(0, 0, 0.46, 0.08), disc(0, 0.2, 0.07), rect(0, -0.09, 0.11, 0.3)],
  close: () => [rect(0, 0, 0.82, 0.13, Math.PI / 4), rect(0, 0, 0.82, 0.13, -Math.PI / 4)],
  pin: () => [ring(0, 0.14, 0.3, 0.12), poly([[-0.26, 0.0], [0.26, 0.0], [0, -0.48]])],
  globe: () => [ring(0, 0, 0.46, 0.07), ring(0, 0, 0.21, 0.07, 0.46), rect(0, 0, 0.9, 0.07)],
  play: () => [poly([[-0.26, -0.4], [0.42, 0], [-0.26, 0.4]])],
  back: () => [poly([[0.16, -0.42], [-0.26, 0], [0.16, 0.42], [0.28, 0.31], [-0.03, 0], [0.28, -0.31]])],
  next: () => [poly([[-0.16, -0.42], [0.26, 0], [-0.16, 0.42], [-0.28, 0.31], [0.03, 0], [-0.28, -0.31]])],
  recenter: () => [ring(0, 0, 0.3, 0.08), disc(0, 0, 0.1), rect(0, 0.42, 0.08, 0.17), rect(0, -0.42, 0.08, 0.17), rect(0.42, 0, 0.17, 0.08), rect(-0.42, 0, 0.17, 0.08)],
  room: () => [poly([[-0.48, 0.02], [0, 0.44], [0.48, 0.02]]), rect(0, -0.22, 0.64, 0.46)],
  check: () => [poly([[-0.44, 0.02], [-0.3, 0.16], [-0.1, -0.05], [0.3, 0.38], [0.44, 0.24], [-0.1, -0.32]])],
  walk: () => [disc(0.06, 0.36, 0.11), poly([[-0.05, 0.2], [0.17, 0.2], [0.12, -0.08], [0.32, -0.44], [0.18, -0.48], [-0.02, -0.14], [-0.2, -0.48], [-0.34, -0.42], [-0.12, -0.04]])],
  grab: () => [rect(-0.24, 0.12, 0.13, 0.5), rect(-0.08, 0.17, 0.13, 0.6), rect(0.08, 0.15, 0.13, 0.56), rect(0.24, 0.08, 0.13, 0.44), rect(0, -0.24, 0.62, 0.42)],
  warning: () => [poly([[0, 0.46], [0.48, -0.4], [-0.48, -0.4]])],
  refresh: () => [arcBand(0.4, 0.1, 0.4, Math.PI * 1.85), poly([[0.18, 0.08], [0.48, 0.34], [0.5, -0.04]])],
} satisfies Record<string, () => Shape[]>
export type IconName = keyof typeof ICONS

export function Icon({ name, size, color = UI.text, position = [0, 0, 0], overlay = false }: { name: IconName; size: number; color?: string; position?: [number, number, number]; overlay?: boolean }) {
  const geometry = cached(`icon:${name}`, () => new ShapeGeometry(ICONS[name](), 10))
  return <mesh geometry={geometry} material={uiMat(color, 1, overlay)} position={position} scale={size} renderOrder={overlay ? 3002 : 0} />
}

// ---------- panels ----------

/** Rounded dark-glass panel with a soft rim and a faint top sheen. Children sit in front of it. */
export function GlassPanel({ width, height, radius = 0.14, rim = 0.012, position = [0, 0, 0], overlay = false, tint = UI.glass, children }: {
  width: number
  height: number
  radius?: number
  rim?: number
  position?: [number, number, number]
  overlay?: boolean
  tint?: string
  children?: ReactNode
}) {
  const ro = overlay ? 3000 : 0
  return (
    <group position={position}>
      <mesh geometry={roundedRect(width, height, radius)} material={uiMat(tint, UI.glassOpacity, overlay)} position={[0, 0, -0.012]} renderOrder={ro} />
      <mesh geometry={roundedFrame(width, height, radius, rim)} material={uiMat(UI.rim, UI.rimOpacity, overlay)} position={[0, 0, -0.011]} renderOrder={ro + 1} />
      <mesh geometry={roundedRect(width - rim * 4, Math.min(height * 0.18, 0.3), Math.max(0, radius - rim * 2))} material={uiMat('#ffffff', 0.035, overlay)} position={[0, height / 2 - rim * 2 - Math.min(height * 0.09, 0.15), -0.0105]} renderOrder={ro + 1} />
      {children}
    </group>
  )
}

/** Springy scale for buttons: grows a little on hover, dips on press, eases back (like Quest UI). */
export function useSpringScale(hover: boolean) {
  const ref = useRef<Group>(null)
  const st = useRef({ s: 1, v: 0, pressAt: 0 })
  useFrame((_, dt) => {
    const g = ref.current
    if (!g) return
    const pressed = performance.now() - st.current.pressAt < 120
    const target = pressed ? 0.94 : hover ? 1.04 : 1
    const stiff = 220, damp = 18, step = Math.min(dt, 0.033)
    st.current.v += ((target - st.current.s) * stiff - st.current.v * damp) * step
    st.current.s += st.current.v * step
    g.scale.setScalar(st.current.s)
  })
  return { ref, press: () => (st.current.pressAt = performance.now()) }
}

const easeOutBack = (x: number) => 1 + 2.2 * Math.pow(x - 1, 3) + 1.2 * Math.pow(x - 1, 2)

/**
 * Animated open/close: children scale up with a little overshoot when `open` turns true and shrink away
 * when it turns false (they stay mounted until the close animation finishes).
 */
export function Appear({ open = true, children, from = 0.75 }: { open?: boolean; children: ReactNode; from?: number }) {
  const ref = useRef<Group>(null)
  const t = useRef(0)
  const [mounted, setMounted] = useState(open)
  if (open && !mounted) setMounted(true)
  useFrame((_, dt) => {
    const g = ref.current
    if (!g) return
    const step = Math.min(dt, 0.033)
    t.current = Math.min(1, Math.max(0, t.current + (open ? step / 0.26 : -step / 0.16)))
    const x = t.current
    g.scale.setScalar(from + (1 - from) * (open ? easeOutBack(x) : x * x))
    g.visible = x > 0.001
    if (!open && x === 0 && mounted) setMounted(false)
  })
  return (
    <group ref={ref} scale={from} visible={false}>
      {mounted && children}
    </group>
  )
}

/** Children pop in whenever this mounts — re-key it to replay. */
export function PopIn({ children }: { children: ReactNode }) {
  return <Appear>{children}</Appear>
}

/**
 * Finger-poke feedback: with hand tracking (touch pointer) the button face sinks toward the panel as
 * your fingertip approaches, like a real key, and the click fires when it bottoms out.
 */
const POKE_TRAVEL_M = 0.012
const POKE_START_M = 0.04
function usePoke() {
  const face = useRef<Group>(null)
  const depth = useRef({ target: 0, cur: 0 })
  const ws = useRef(new Vector3())
  useFrame((_, dt) => {
    const f = face.current
    if (!f) return
    const d = depth.current
    d.cur += (d.target - d.cur) * Math.min(1, dt * 30)
    if (Math.abs(d.cur) < 1e-4 && d.target === 0) {
      if (f.position.z !== 0) f.position.z = 0
      return
    }
    f.getWorldScale(ws.current)
    f.position.z = (-d.cur * POKE_TRAVEL_M) / (ws.current.z || 1)
  })
  return {
    face,
    onMove: (e: ThreeEvent<PointerEvent>) => {
      if (!String((e as unknown as { pointerType?: string }).pointerType ?? '').includes('touch')) return
      depth.current.target = Math.min(1, Math.max(0, 1 - e.distance / POKE_START_M))
    },
    release: () => (depth.current.target = 0),
  }
}

function useHover() {
  const [hover, setHover] = useState(false)
  return {
    hover,
    bind: {
      onPointerOver: (e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation()
        hoverFeedback()
        setHover(true)
        document.body.style.cursor = 'pointer'
      },
      onPointerOut: () => {
        setHover(false)
        document.body.style.cursor = ''
      },
    },
  }
}

/**
 * The one button: rounded plate, optional icon, label; hover glow, springy press, finger-poke push-in.
 * `stack` puts the icon above a small label (tab bars).
 */
export function Button({ label, icon, active, tone = 'plate', onPress, position, width = 0.9, height = 0.3, stack = false, plateRef, disabled = false, overlay = false }: {
  label?: string
  icon?: IconName
  active?: boolean
  tone?: Tone
  onPress: () => void
  position: [number, number, number]
  width?: number
  height?: number
  stack?: boolean
  plateRef?: RefObject<Mesh | null>
  disabled?: boolean
  overlay?: boolean
}) {
  const { hover, bind } = useHover()
  const spring = useSpringScale(hover && !disabled)
  const poke = usePoke()
  const t = TONES[active ? 'accent' : tone]
  const fill = disabled ? UI.plate : hover ? t.hover : t.base
  const color = disabled ? UI.muted : t.text
  const r = Math.min(height * 0.32, width / 2)
  const fs = stack ? height * 0.2 : height * 0.36
  const iconSize = stack ? height * 0.36 : height * 0.46
  const ro = overlay ? 3002 : 0
  const textX = icon && label && !stack ? -width / 2 + height * 0.42 + iconSize * 0.9 : 0
  return (
    <group position={position} ref={spring.ref}>
      <group ref={poke.face}>
        <mesh
          ref={plateRef as RefObject<Mesh>}
          geometry={roundedRect(width, height, r)}
          material={uiMat(fill, 1, overlay)}
          renderOrder={ro}
          {...bind}
          onPointerMove={poke.onMove}
          onPointerLeave={poke.release}
          onClick={(e) => {
            e.stopPropagation()
            if (disabled) return
            spring.press()
            pressFeedback()
            poke.release()
            onPress()
          }}
        />
        {hover && !disabled && <mesh geometry={roundedFrame(width, height, r, height * 0.035)} material={uiMat('#ffffff', 0.45, overlay)} position={[0, 0, 0.001]} renderOrder={ro + 1} />}
        {icon && (
          <Icon
            name={icon}
            size={iconSize}
            color={color}
            overlay={overlay}
            position={stack ? [0, height * 0.14, 0.004] : label ? [-width / 2 + height * 0.42 + iconSize * 0.15, 0, 0.004] : [0, 0, 0.004]}
          />
        )}
        {label && (
          <Text
            font={FONT_BOLD}
            material={overlay ? textMatOverlay : textMat}
            renderOrder={ro + 2}
            position={stack ? [0, -height * 0.25, 0.005] : [textX, 0, 0.005]}
            fontSize={fs}
            maxWidth={width * 0.9 - (icon && !stack ? iconSize * 1.4 : 0)}
            textAlign="center"
            color={color}
            anchorX={icon && !stack ? 'left' : 'center'}
            anchorY="middle"
          >
            {label}
          </Text>
        )}
      </group>
    </group>
  )
}

/** Back-compat name used by older panels. */
export function Tile(props: { label: string; active?: boolean; onPress: () => void; position: [number, number, number]; width?: number; height?: number; icon?: IconName }) {
  return <Button {...props} />
}

export function Label({ text, position, size = UI.type.body, color = UI.text, bold = false, anchorX = 'left' as 'left' | 'center' | 'right', maxWidth, overlay = false }: {
  text: string
  position: [number, number, number]
  size?: number
  color?: string
  bold?: boolean
  anchorX?: 'left' | 'center' | 'right'
  maxWidth?: number
  overlay?: boolean
}) {
  return (
    <Text font={bold ? FONT_BOLD : FONT} material={overlay ? textMatOverlay : textMat} renderOrder={overlay ? 3002 : 0} position={position} fontSize={size} color={color} anchorX={anchorX} anchorY="middle" maxWidth={maxWidth} lineHeight={1.25}>
      {text}
    </Text>
  )
}

/** iOS/Quest-style switch with an animated knob. */
export function Toggle3D({ label, value, onChange, position, width = 2.1 }: {
  label: string
  value: boolean
  onChange: (v: boolean) => void
  position: [number, number, number]
  width?: number
}) {
  const { hover, bind } = useHover()
  const knob = useRef<Mesh>(null)
  const poke = usePoke()
  useFrame((_, dt) => {
    const m = knob.current
    if (m) m.position.x += ((value ? 0.12 : -0.12) - m.position.x) * Math.min(1, dt * 14)
  })
  return (
    <group position={position}>
      <Label text={label} position={[-width / 2, 0, 0.005]} />
      <group position={[width / 2 - 0.25, 0, 0]}>
        <group ref={poke.face}>
          <mesh
            geometry={roundedRect(0.5, 0.26, 0.13)}
            material={uiMat(value ? (hover ? UI.accentHover : UI.accent) : hover ? UI.plateHover : '#2a3f48')}
            {...bind}
            onPointerMove={poke.onMove}
            onPointerLeave={poke.release}
            onClick={(e) => {
              e.stopPropagation()
              pressFeedback()
              poke.release()
              onChange(!value)
            }}
          />
          <mesh ref={knob} geometry={roundedRect(0.2, 0.2, 0.1)} material={uiMat('#ffffff')} position={[value ? 0.12 : -0.12, 0, 0.005]} />
        </group>
      </group>
    </group>
  )
}

export function Slider3D({ label, value, min, max, format, onChange, position, width = 2.1, disabled = false, disabledText = 'on the surface' }: {
  label: string
  value: number
  min: number
  max: number
  format: (v: number) => string
  onChange: (v: number) => void
  position: [number, number, number]
  width?: number
  disabled?: boolean
  disabledText?: string
}) {
  const track = useRef<Mesh>(null)
  const dragging = useRef(false)
  const tmp = useRef(new Vector3())
  const trackW = width - 0.1
  const t = (value - min) / (max - min)
  const update = (e: ThreeEvent<PointerEvent>) => {
    const m = track.current
    if (!m || disabled) return
    const local = m.worldToLocal(tmp.current.copy(e.point))
    const f = Math.min(1, Math.max(0, local.x / trackW + 0.5))
    onChange(+(min + f * (max - min)).toFixed(3))
  }
  const fillW = Math.max(0.06, trackW * t)
  return (
    <group position={position}>
      <Label text={label} position={[-width / 2, 0.14, 0.005]} color={disabled ? UI.muted : UI.text} />
      <Label text={disabled ? disabledText : format(value)} position={[width / 2, 0.14, 0.005]} anchorX="right" color={disabled ? UI.muted : UI.accentHover} size={UI.type.small} />
      <mesh geometry={roundedRect(trackW, 0.06, 0.03)} material={uiMat('#2a3f48')} position={[0, -0.08, 0]} />
      <mesh geometry={roundedRect(fillW, 0.06, 0.03)} material={uiMat(disabled ? '#3d5554' : UI.accent)} position={[-trackW / 2 + fillW / 2, -0.08, 0.002]} />
      <mesh geometry={roundedRect(0.16, 0.16, 0.08)} material={uiMat('#ffffff')} position={[-trackW / 2 + trackW * t, -0.08, 0.004]} />
      {/* tall invisible hit strip: easy to poke, click or drag */}
      <mesh
        ref={track}
        position={[0, -0.08, 0.006]}
        onPointerDown={(e) => {
          e.stopPropagation()
          dragging.current = true
          update(e)
        }}
        onPointerMove={(e) => dragging.current && update(e)}
        onPointerUp={() => (dragging.current = false)}
        onPointerOut={() => (dragging.current = false)}
      >
        <planeGeometry args={[trackW + 0.1, 0.26]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  )
}

/** Segmented control. */
export function Choice3D({ label, value, options, onChange, position, width = 2.1 }: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
  position: [number, number, number]
  width?: number
}) {
  const w = width / options.length
  return (
    <group position={position}>
      <Label text={label} position={[-width / 2, 0.16, 0.005]} />
      <mesh geometry={roundedRect(width + 0.04, 0.3, 0.15)} material={uiMat('#13232b')} position={[0, -0.1, -0.004]} />
      {options.map((o, i) => (
        <Button key={o.value} label={o.label} active={o.value === value} onPress={() => onChange(o.value)} position={[-width / 2 + w * (i + 0.5), -0.1, 0]} width={w - 0.04} height={0.24} />
      ))}
    </group>
  )
}
