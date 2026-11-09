import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Billboard, Text } from '@react-three/drei'
import { AdditiveBlending, BufferAttribute, BufferGeometry, DoubleSide, IcosahedronGeometry, MeshBasicMaterial, SphereGeometry, Vector3, type Group, type Mesh } from 'three'
import { BODIES, type BodyInfo } from './bodies'
import { hasContent } from './content'
import { useXRApp } from './store'
import { useDwellTarget } from './dwell'
import { FONT, FONT_BOLD } from './font'
import { SceneReady } from './smooth'
import { useT } from './i18n'
import { useQuality } from './quality'
import { currentDate, PLAY_DAYS_PER_SECOND, useTime } from './timeMachine'
import { helioLongitude } from './ephemeris'
import { HOLO, HOLO_STYLES, HoloMotes, HoloOrbit, HoloSun, holoUniforms, makeHoloPlanetMaterial } from './holo'

const MOON_OFFSET = new Vector3(0.17, 0.04, 0.05)
const TWO_PI = Math.PI * 2

/**
 * Each planet is drawn at its REAL direction from the Sun on the chosen date (JPL elements, ./ephemeris);
 * distances stay compressed and sizes exaggerated, as the label says. Viewed from above ecliptic north:
 * longitude grows counter-clockwise.
 */
function hubXZ(radius: number, lon: number): [number, number] {
  return [Math.cos(lon) * radius, -Math.sin(lon) * radius]
}

/** Body picker, drawn as a stylised mission-control chart. Sizes and distances are deliberately NOT to scale. */
export function SolarSystemHub({ tilt = 0 }: { tilt?: number }) {
  const t = useT()
  const q = useQuality()
  const root = useRef<Group>(null)
  const hovered = useXRApp((s) => s.hoveredId)
  const groups = useRef<Record<string, Group | null>>({})
  // shown angle per body, easing toward the real one so scrubbing the date glides instead of jumping
  const shown = useRef<Record<string, number>>({})

  useFrame(({ clock }, dt) => {
    // the Sun sits at the hub centre: planets are lit from there
    root.current?.getWorldPosition(holoUniforms.uSun.value)
    const time = useTime.getState()
    if (time.playing && time.date !== null) time.setDate(time.date + Math.min(dt, 0.1) * PLAY_DAYS_PER_SECOND * 86400000)
    const date = currentDate()
    BODIES.forEach((b) => {
      const g = groups.current[b.id]
      if (!g || b.parent || b.orbit === 0) return
      const target = helioLongitude(b.id, date) ?? 0
      let cur = shown.current[b.id]
      if (cur === undefined || time.playing) cur = target
      else {
        let d = (target - cur) % TWO_PI
        if (d > Math.PI) d -= TWO_PI
        if (d < -Math.PI) d += TWO_PI
        cur += d * Math.min(1, dt * 6)
      }
      shown.current[b.id] = cur
      const [x, z] = hubXZ(b.orbit, cur)
      g.position.set(x, 0, z)
    })
    void clock
    for (const b of BODIES) {
      const g = groups.current[b.id]
      const p = b.parent ? groups.current[b.parent] : null
      if (g && p) g.position.copy(p.position).add(MOON_OFFSET)
    }
  })

  return (
    <group ref={root} rotation={[tilt, 0, 0]}>
      <SceneReady />
      {BODIES.filter((b) => b.orbit > 0 && !b.parent).map((b) => (
        <HoloOrbit key={`orbit-${b.id}`} radius={b.orbit} color={b.kind === 'asteroid' ? HOLO.amber : hasContent(b.id) ? HOLO.teal : HOLO.violet} active={hovered === `hub:${b.id}`} />
      ))}
      <HoloMotes q={q} />
      <MessagePulse groups={groups} />
      {BODIES.map((b, i) => (
        <group key={b.id} ref={(g) => void (groups.current[b.id] = g)}>
          <HubBody b={b} order={i} />
        </group>
      ))}
      <Billboard position={[0, 0.95, 0]}>
        <Text font={FONT_BOLD} fontSize={0.2} letterSpacing={0.04} color="#ffffff" anchorY="bottom" outlineWidth={0.004} outlineColor="#000">
          {t('Choose a destination')}
        </Text>
        <Text font={FONT} position={[0, -0.04, 0]} fontSize={0.085} color={HOLO.amber} anchorY="top">
          {t('Not to scale: sizes and distances are exaggerated')}
        </Text>
      </Billboard>
    </group>
  )
}

const unitSphere = new SphereGeometry(1, 48, 32)
/** Bennu as a faceted little rubble pile, so it reads as an asteroid at a glance. */
const facetRock = (() => {
  const g = new IcosahedronGeometry(1, 1).toNonIndexed()
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i)
    const k = 0.85 + 0.15 * Math.sin(x * 5.1 + y * 3.7 + z * 4.3)
    p.setXYZ(i, x * k, y * k * 0.92, z * k)
  }
  g.computeVertexNormals()
  return g
})()

/** Rotating dashed ring: "you can go here". */
function ExploreMarker({ radius }: { radius: number }) {
  const ref = useRef<Group>(null)
  const geom = useMemo(() => {
    const pts: number[] = []
    const N = 24
    for (let i = 0; i < N; i++) {
      const a0 = (i / N) * Math.PI * 2, a1 = ((i + 0.55) / N) * Math.PI * 2
      pts.push(Math.cos(a0) * radius, 0, Math.sin(a0) * radius, Math.cos(a1) * radius, 0, Math.sin(a1) * radius)
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(pts), 3))
    return g
  }, [radius])
  useEffect(() => () => geom.dispose(), [geom])
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.5
  })
  return (
    <group ref={ref} rotation={[0.25, 0, 0]}>
      <lineSegments geometry={geom}>
        <lineBasicMaterial color={HOLO.teal} transparent opacity={0.9} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
      </lineSegments>
    </group>
  )
}

/** easeOutBack: a little overshoot, so bodies "pop" into place */
const backOut = (x: number) => 1 + 2.4 * Math.pow(x - 1, 3) + 1.4 * Math.pow(x - 1, 2)
const REDUCED = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

function HubBody({ b, order }: { b: BodyInfo; order: number }) {
  const born = useRef(-1)
  const t = useT()
  const [hover, setHover] = useState(false)
  const labels = useXRApp((s) => s.settings.labels)
  const hit = useRef<Mesh>(null)
  const spin = useRef<Group>(null)
  const explorable = hasContent(b.id)
  const select = useCallback(() => useXRApp.getState().selectBody(b.id), [b.id])
  useDwellTarget(hit, select, b.id !== 'sun')
  const style = HOLO_STYLES[b.id]
  const material = useMemo(() => (style ? makeHoloPlanetMaterial(style) : null), [style])
  useEffect(() => () => material?.dispose(), [material])
  const scale = useRef(1)
  useFrame(({ clock }, dt) => {
    const s = spin.current
    if (!s) return
    if (born.current < 0) born.current = clock.elapsedTime
    s.rotation.y += dt * 0.3
    scale.current += ((hover ? 1.25 : 1) - scale.current) * Math.min(1, dt * 10)
    // staggered entrance (Sun first, then outward) and a gentle idle float
    const k = REDUCED ? 1 : Math.min(1, Math.max(0, (clock.elapsedTime - born.current - 0.15 - order * 0.07) / 0.55))
    s.scale.setScalar(scale.current * (k >= 1 ? 1 : Math.max(0.0001, backOut(k))))
    s.position.y = REDUCED ? 0 : Math.sin(clock.elapsedTime * 0.7 + order * 1.3) * 0.012
    if (material) material.uniforms.uHover.value += ((hover ? 1 : 0) - material.uniforms.uHover.value) * Math.min(1, dt * 8)
  })
  const r = Math.max(b.size, 0.05)

  return (
    <group>
      {b.kind === 'star' && <HoloSun radius={b.size} />}
      <group ref={spin}>
        {material && <mesh geometry={style?.facets ? facetRock : unitSphere} material={material} scale={b.size} />}
        {b.rings && (
          <mesh rotation={[-Math.PI / 2 + 0.4, 0, 0]}>
            <ringGeometry args={[b.size * 1.3, b.size * 2.1, 64]} />
            <meshBasicMaterial color="#e8d3a0" side={DoubleSide} transparent opacity={0.45} toneMapped={false} />
          </mesh>
        )}
      </group>
      {explorable && <ExploreMarker radius={r * 1.7} />}
      <mesh
        ref={hit}
        onPointerOver={(e) => {
          e.stopPropagation()
          setHover(true)
          useXRApp.getState().setHovered(`hub:${b.id}`)
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => {
          setHover(false)
          if (useXRApp.getState().hoveredId === `hub:${b.id}`) useXRApp.getState().setHovered(null)
          document.body.style.cursor = ''
        }}
        onClick={(e) => {
          e.stopPropagation()
          select()
        }}
      >
        <sphereGeometry args={[Math.max(b.size * 1.5, 0.11), 12, 12]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <Billboard position={[0, -r - 0.06, 0]}>
        <Text
          font={FONT_BOLD}
          fillOpacity={hover ? 1 : labels}
          outlineOpacity={hover ? 1 : labels}
          visible={hover || labels > 0.02}
          fontSize={hover ? 0.1 : 0.075}
          letterSpacing={0.08}
          color={explorable ? HOLO.teal : '#c7cde6'}
          anchorY="top"
          outlineWidth={0.004}
          outlineColor="#000"
        >
          {t(b.name).toUpperCase()}
        </Text>
        {explorable && (
          <Text font={FONT} position={[0, -0.075, 0]} fillOpacity={hover ? 1 : labels * 0.85} visible={hover || labels > 0.02} fontSize={0.042} color="#e9f7f5" anchorY="top" outlineWidth={0.003} outlineColor="#000">
            {hover ? `▶ ${t('explore')}` : t('explore')}
          </Text>
        )}
      </Billboard>
    </group>
  )
}

/** "Send a message to Mars": a glowing pulse travels from Earth to Mars (shown 60× faster than light). */
function MessagePulse({ groups }: { groups: React.RefObject<Record<string, Group | null>> }) {
  const dot = useRef<Mesh>(null)
  const ring = useRef<Mesh>(null)
  const v = useMemo(() => new Vector3(), [])
  useFrame(() => {
    const m = useTime.getState().message
    const d = dot.current, r = ring.current
    if (!d || !r) return
    const earth = groups.current?.earth, mars = groups.current?.mars
    if (!m || !earth || !mars) {
      d.visible = r.visible = false
      return
    }
    const k = (performance.now() - m.sentAt) / m.durationMs
    d.visible = k < 1
    if (k < 1) d.position.copy(v.copy(earth.position).lerp(mars.position, k))
    // arrival flash on Mars, then clear
    r.visible = k >= 1 && k < 1.6
    if (r.visible) {
      r.position.copy(mars.position)
      r.scale.setScalar(0.05 + (k - 1) * 0.4)
      ;(r.material as MeshBasicMaterial).opacity = 1 - (k - 1) / 0.6
    }
    if (k >= 1.6) useTime.setState({ message: null })
  })
  return (
    <>
      <mesh ref={dot} visible={false}>
        <sphereGeometry args={[0.022, 12, 8]} />
        <meshBasicMaterial color={HOLO.teal} toneMapped={false} />
      </mesh>
      <mesh ref={ring} visible={false} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.8, 1, 32]} />
        <meshBasicMaterial color={HOLO.teal} transparent toneMapped={false} depthWrite={false} side={DoubleSide} />
      </mesh>
    </>
  )
}
