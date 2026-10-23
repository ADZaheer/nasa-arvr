import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Billboard, Text } from '@react-three/drei'
import { XRSpace, useXRInputSourceState } from '@react-three/xr'
import { MeshBasicMaterial, type Group } from 'three'
import { useXRApp } from './store'
import { t } from './i18n'
import { FONT, FONT_BOLD } from './font'
import { UI, roundedRect, uiMat } from './ui3d'

/**
 * Controller button hints (like Quest's first-run tips): small labels beside each controller saying what
 * the trigger, grip, stick and face buttons do here. Each one fades away once you've used that control,
 * and stays gone (remembered on this device).
 */
type Control = 'trigger' | 'squeeze' | 'thumbstick' | 'a' | 'b' | 'x' | 'y'
const KEY = 'cosmic-xr-hints-used'
const used: Record<string, true> = (() => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}')
  } catch {
    return {}
  }
})()
function markUsed(id: string) {
  if (used[id]) return
  used[id] = true
  try {
    localStorage.setItem(KEY, JSON.stringify(used))
  } catch {
    /* private mode */
  }
}
/** "Show controller hints again" (e.g. for the next visitor). */
export function resetControllerHints() {
  for (const k of Object.keys(used)) delete used[k]
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

const GAMEPAD: Record<Control, string> = {
  trigger: 'xr-standard-trigger',
  squeeze: 'xr-standard-squeeze',
  thumbstick: 'xr-standard-thumbstick',
  a: 'a-button',
  b: 'b-button',
  x: 'x-button',
  y: 'y-button',
}

function hintsFor(hand: 'left' | 'right', scene: 'surface' | 'body' | 'hub', teleport: boolean): { id: Control; key: string; label: string }[] {
  const list: { id: Control; key: string; label: string }[] = [{ id: 'trigger', key: t('Trigger'), label: t('Select') }]
  if (scene === 'surface') list.push({ id: 'squeeze', key: t('Grip'), label: t('Grab rocks') })
  if (scene === 'body') list.push({ id: 'squeeze', key: t('Grip'), label: t('Grab & turn the planet') })
  if (hand === 'right') {
    if (scene === 'surface') list.push({ id: 'thumbstick', key: t('Stick'), label: teleport ? t('Push forward to teleport, sideways to turn') : t('Turn') })
    if (scene === 'surface') list.push({ id: 'a', key: 'A', label: t('Jump') })
  } else {
    if (scene === 'surface' && !teleport) list.push({ id: 'thumbstick', key: t('Stick'), label: t('Walk') })
    list.push({ id: 'y', key: 'Y', label: t('Menu') })
    if (scene === 'surface') list.push({ id: 'x', key: 'X', label: t('Jump') })
  }
  return list
}

export function ControllerHints({ scene }: { scene: 'surface' | 'body' | 'hub' }) {
  return (
    <>
      <HandHints hand="left" scene={scene} />
      <HandHints hand="right" scene={scene} />
    </>
  )
}

function HandHints({ hand, scene }: { hand: 'left' | 'right'; scene: 'surface' | 'body' | 'hub' }) {
  const state = useXRInputSourceState('controller', hand)
  const teleport = useXRApp((s) => s.settings.locomotion === 'teleport')
  useXRApp((s) => s.settings.lang)
  const space = state?.inputSource.gripSpace
  if (!state || !space) return null
  return (
    <XRSpace space={space}>
      <HintList hand={hand} items={hintsFor(hand, scene, teleport)} state={state} />
    </XRSpace>
  )
}

type ControllerState = NonNullable<ReturnType<typeof useXRInputSourceState<'controller'>>>

function HintList({ hand, items, state }: { hand: 'left' | 'right'; items: { id: Control; key: string; label: string }[]; state: ControllerState }) {
  const side = hand === 'right' ? 1 : -1
  const fades = useRef<Record<string, number>>({})
  const rows = useRef<Record<string, Group | null>>({})
  const mats = useMemo(() => Object.fromEntries(items.map((i) => [i.id, new MeshBasicMaterial({ color: '#ffffff', transparent: true, fog: false, toneMapped: false, depthTest: false })])), [items])
  useFrame((_, dt) => {
    for (const it of items) {
      const id = `${hand}:${it.id}`
      const b = state.gamepad?.[GAMEPAD[it.id]] as { state?: string; xAxis?: number; yAxis?: number } | undefined
      if (b && (b.state === 'pressed' || Math.hypot(b.xAxis ?? 0, b.yAxis ?? 0) > 0.6)) markUsed(id)
      const target = used[id] ? 0 : 1
      const f = (fades.current[id] ??= target)
      fades.current[id] = f + (target - f) * Math.min(1, dt * 2.5)
      const g = rows.current[it.id]
      if (g) {
        g.visible = fades.current[id] > 0.02
        g.scale.setScalar(0.85 + 0.15 * fades.current[id])
      }
      mats[it.id].opacity = fades.current[id]
    }
  })
  if (items.every((i) => used[`${hand}:${i.id}`])) return null
  return (
    <Billboard position={[side * 0.07, 0.03, 0.02]}>
      {items.map((it, i) => (
        <group key={it.id} ref={(g) => void (rows.current[it.id] = g)} position={[0, -i * 0.026, 0]}>
          <mesh geometry={roundedRect(0.034, 0.02, 0.006)} material={uiMat(UI.accent, 0.9, true)} position={[side * 0.017, 0, 0]} renderOrder={3000} />
          <Text font={FONT_BOLD} material={mats[it.id]} renderOrder={3001} position={[side * 0.017, 0, 0.001]} fontSize={0.0085} color={UI.accentText} anchorX="center" anchorY="middle">
            {it.key}
          </Text>
          <Text font={FONT} material={mats[it.id]} renderOrder={3001} position={[side * 0.04, 0, 0.001]} fontSize={0.0105} maxWidth={0.16} color="#ffffff" outlineWidth={0.0012} outlineColor="#000000" anchorX={side > 0 ? 'left' : 'right'} anchorY="middle">
            {it.label}
          </Text>
        </group>
      ))}
    </Billboard>
  )
}
