import { create } from 'zustand'
import type { GuideRequest, ViewMode } from './types'

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

  selectBody: (id: string | null) => void
  setBand: (band: string | null) => void
  setObservation: (obs: string | null) => void
  selectSite: (id: string, body: string) => void
  selectHotspot: (id: string | null) => void
  requestGoTo: (p: { x: number; z: number; exact?: boolean } | null) => void
  setHovered: (id: string | null) => void
  setMode: (mode: ViewMode) => void
  setGyroEnabled: (on: boolean) => void
  setArAnchor: (p: [number, number, number] | null) => void
  setLastGuideRequest: (r: GuideRequest) => void
  showToast: (msg: string | null) => void
}

let toastTimer: ReturnType<typeof setTimeout> | undefined

export const useXRApp = create<XRAppState>((set) => ({
  bodyId: null,
  siteId: null,
  goTo: null,
  headingOffset: 0,
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
