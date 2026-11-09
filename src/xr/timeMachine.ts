import { create } from 'zustand'
import { LIGHT_SECONDS_PER_AU, earthMarsAU } from './ephemeris'

/**
 * The Solar System's date: "now" by default (follows the clock), or any date you scrub to. Playing moves
 * time forward 10 days per second so you can watch the inner planets lap the outer ones.
 */
export const PLAY_DAYS_PER_SECOND = 10
export const MIN_DATE = Date.UTC(1960, 0, 1)
export const MAX_DATE = Date.UTC(2050, 11, 31)

interface TimeState {
  /** chosen date (ms), or null = live "now" */
  date: number | null
  playing: boolean
  /** a "message to Mars" in flight: when it was sent (performance.now) and how long it takes on screen */
  message: { sentAt: number; durationMs: number; lightSeconds: number } | null
  setDate: (ms: number | null) => void
  setPlaying: (p: boolean) => void
}
export const useTime = create<TimeState>((set) => ({
  date: null,
  playing: false,
  message: null,
  setDate: (date) => set({ date: date === null ? null : Math.min(MAX_DATE, Math.max(MIN_DATE, date)) }),
  setPlaying: (playing) => set((s) => ({ playing, date: playing && s.date === null ? Date.now() : s.date })),
}))

export const currentDate = () => useTime.getState().date ?? Date.now()

/** Message pulses are shown 60× faster than light really takes (labelled in the UI). */
export const MESSAGE_SPEEDUP = 60

export function sendMessageToMars() {
  const lightSeconds = earthMarsAU(currentDate()) * LIGHT_SECONDS_PER_AU
  useTime.setState({ message: { sentAt: performance.now(), durationMs: (lightSeconds / MESSAGE_SPEEDUP) * 1000, lightSeconds } })
}

export function formatLightTime(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m} min ${s} s`
}
