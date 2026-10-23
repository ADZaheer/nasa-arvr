import { create } from 'zustand'
import type { GuideRequest, ViewMode } from './types'
import { detectTier, type QualitySetting, type Tier } from './quality'

/** User settings from the wrist menu (VR/AR) and the on-screen ⚙ menu. */
export interface XRSettings {
  /** label opacity 0..1 (0 hides labels) */
  labels: number
  /** show hotspot pins / surface beacons */
  pins: boolean
  /** tone-mapping exposure (brightness) */
  exposure: number
  /** Mars surface haze multiplier */
  haze: number
  /** movement speed multiplier */
  moveSpeed: number
  /** VR turning: snap degrees, or smooth */
  turn: 'snap30' | 'snap45' | 'smooth'
  /** show the fps meter */
  showFps: boolean
  /** graphics quality: auto or a fixed tier */
  quality: QualitySetting
  /** Mars surface time of day: 0 sunrise … 0.5 noon … 1 sunset */
  timeOfDay: number
  /** ambience + UI sounds (off by default: judging rooms vary) */
  sound: boolean
  /** soundtrack volume 0..1 */
  musicVolume: number
  /** effects + ambience volume 0..1 */
  sfxVolume: number
  /** VR comfort vignette while moving with the stick */
  vignette: boolean
  /** seated play: raises your viewpoint by 0.5 m in VR */
  seated: boolean
}

export const DEFAULT_SETTINGS: XRSettings = { labels: 1, pins: true, exposure: 1, haze: 1, moveSpeed: 1, turn: 'snap30', showFps: false, quality: 'auto', timeOfDay: 0.38, sound: false, musicVolume: 0.6, sfxVolume: 0.8, vignette: true, seated: false }

/**
 * Shared app state for the XR module. The web viewer can read/write the same store
 * (selected body, band, observation) or deep-link via /xr/body/:id?band=…&obs=…
 */
export interface XRAppState {
  /** null = Solar System hub */
  bodyId: string | null
  /** Surface site being stood on (content/sites/<id>.json); bodyId is then that site's body. */
  siteId: string | null
  /** Spectral band selected in the web viewer (e.g. a SPHEREx band); passed through for now. */
  band: string | null
  /** Observation / source-image id selected in the web viewer; passed through for now. */
  observation: string | null

  hotspotId: string | null
  hoveredId: string | null
  mode: ViewMode
  gyroEnabled: boolean
  arAnchor: [number, number, number] | null
  /** True when an asteroid is shown as the procedural placeholder instead of a real shape model. */
  shapeIsIllustration: boolean
  lastGuideRequest: GuideRequest | null
  toast: string | null
  /** Surface mode: request to move the player to a point (consumed by the player controller). */
  goTo: { x: number; z: number; exact?: boolean } | null
  /** Surface mode: yaw (rad) added to phone-gyro heading so the start view faces the scene. */
  headingOffset: number
  settings: XRSettings
  menuOpen: boolean
  /** tier chosen by auto quality (device detection, then lowered by the frame-rate governor) */
  autoTier: Tier
  /** completed mission goals (saved on this device) */
  goalsDone: Record<string, true>
  /** mission card currently shown (scene intro or a just-completed goal) */
  missionCard: { mission: string; goal: string; hint: string; done: boolean; progress: string } | null
  completeGoal: (id: string) => void
  resetMissions: () => void
  setMissionCard: (c: XRAppState['missionCard']) => void

  selectBody: (id: string | null) => void
  setBand: (band: string | null) => void
  setObservation: (obs: string | null) => void
  selectSite: (id: string, body: string) => void
  selectHotspot: (id: string | null) => void
  requestGoTo: (p: { x: number; z: number; exact?: boolean } | null) => void
  setSetting: <K extends keyof XRSettings>(key: K, value: XRSettings[K]) => void
  setMenuOpen: (open: boolean) => void
  setHovered: (id: string | null) => void
  setMode: (mode: ViewMode) => void
  setGyroEnabled: (on: boolean) => void
  setArAnchor: (p: [number, number, number] | null) => void
  setLastGuideRequest: (r: GuideRequest) => void
  showToast: (msg: string | null) => void
}

const SETTINGS_KEY = 'cosmic-xr-settings'
const GOALS_KEY = 'cosmic-xr-goals'
function loadJSON<T>(key: string, fallback: T): T {
  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem(key) ?? '{}') }
  } catch {
    return fallback
  }
}
function saveJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* private mode etc. */
  }
}
function loadSettings(): XRSettings {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

let toastTimer: ReturnType<typeof setTimeout> | undefined

export const useXRApp = create<XRAppState>((set) => ({
  bodyId: null,
  siteId: null,
  goTo: null,
  headingOffset: 0,
  settings: loadSettings(),
  menuOpen: false,
  autoTier: detectTier(),
  goalsDone: loadJSON(GOALS_KEY, {}),
  missionCard: null,
  completeGoal: (id) =>
    set((s) => {
      if (s.goalsDone[id]) return s
      const goalsDone = { ...s.goalsDone, [id]: true as const }
      saveJSON(GOALS_KEY, goalsDone)
      return { goalsDone }
    }),
  resetMissions: () => {
    saveJSON(GOALS_KEY, {})
    set({ goalsDone: {} })
  },
  setMissionCard: (missionCard) => set({ missionCard }),
  band: null,
  observation: null,
  hotspotId: null,
  hoveredId: null,
  mode: 'desktop',
  gyroEnabled: false,
  arAnchor: null,
  shapeIsIllustration: false,
  lastGuideRequest: null,
  toast: null,

  selectBody: (id) =>
    set((s) => (s.bodyId === id && !s.siteId ? s : { bodyId: id, siteId: null, hotspotId: null, hoveredId: null, shapeIsIllustration: false })),
  selectSite: (id, body) => set((s) => (s.siteId === id ? s : { siteId: id, bodyId: body, hotspotId: null, hoveredId: null })),
  requestGoTo: (goTo) => set({ goTo }),
  setSetting: (key, value) =>
    set((s) => {
      const settings = { ...s.settings, [key]: value }
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
      } catch {
        /* private mode etc. */
      }
      return { settings }
    }),
  setMenuOpen: (menuOpen) => set({ menuOpen }),
  setBand: (band) => set({ band }),
  setObservation: (observation) => set({ observation }),
  selectHotspot: (hotspotId) => set({ hotspotId }),
  setHovered: (hoveredId) => set({ hoveredId }),
  setMode: (mode) => set({ mode }),
  setGyroEnabled: (gyroEnabled) => set({ gyroEnabled }),
  setArAnchor: (arAnchor) => set({ arAnchor }),
  setLastGuideRequest: (lastGuideRequest) => set({ lastGuideRequest }),
  showToast: (toast) => {
    clearTimeout(toastTimer)
    set({ toast })
    if (toast) toastTimer = setTimeout(() => set({ toast: null }), 3000)
  },
}))

// Debug handle in dev builds: window.__xrApp.getState()
if (import.meta.env.DEV) (window as unknown as { __xrApp: typeof useXRApp }).__xrApp = useXRApp
