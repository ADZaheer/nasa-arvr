import { create } from 'zustand'

/**
 * State of the SPHEREx table, shared by the 3D table (plate + console) and the on-screen panel used on
 * narrow phone screens, so both control the same game.
 */
export type Flag = { u: number; v: number }
export interface BlinkMeta {
  target: { name: string }
  a: { u: number; v: number; mjd: number }
  b: { u: number; v: number; mjd: number }
  gapHours: number
  fieldDeg: number
  detector: string
  credit: string
}
export const HIT_RADIUS = 0.06 // in plate fractions: a flag this close to the object counts as found
const MAX_FLAGS = 6

interface SpherexState {
  view: string
  blinking: boolean
  frame: 0 | 1
  flags: Flag[]
  revealed: boolean
  meta: BlinkMeta | null
  setView: (v: string) => void
  setBlinking: (b: boolean) => void
  flip: () => void
  addFlag: (f: Flag) => void
  reveal: () => void
  reset: () => void
}
export const useSpherex = create<SpherexState>((set) => ({
  view: 'blink',
  blinking: true,
  frame: 0,
  flags: [],
  revealed: false,
  meta: null,
  setView: (view) => set({ view, flags: [], revealed: false }),
  setBlinking: (blinking) => set({ blinking }),
  flip: () => set((s) => ({ frame: s.frame ? 0 : 1 })),
  addFlag: (f) => set((s) => ({ flags: [...s.flags.slice(-(MAX_FLAGS - 1)), f] })),
  reveal: () => set({ revealed: true }),
  reset: () => set({ flags: [], revealed: false }),
}))

let loading: Promise<void> | null = null
export function loadBlinkMeta() {
  loading ??= fetch('/spherex/blink.json')
    .then((r) => r.json())
    .then((meta: BlinkMeta) => useSpherex.setState({ meta }))
    .catch(() => {
      loading = null
    })
  return loading
}

export const isHit = (f: Flag, m: BlinkMeta) => [m.a, m.b].some((p) => Math.hypot(f.u - p.u, f.v - p.v) < HIT_RADIUS)
export const movedArcsec = (m: BlinkMeta) => Math.hypot(m.b.u - m.a.u, m.b.v - m.a.v) * m.fieldDeg * 3600
export const utcOf = (mjd: number) => new Date((mjd - 40587) * 86400000).toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
