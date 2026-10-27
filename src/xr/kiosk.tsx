import { useEffect } from 'react'
import { create } from 'zustand'
import { useStore } from 'zustand'
import { DEFAULT_SETTINGS, useXRApp } from './store'
import { xrStore } from './xrStore'
import { resetControllerHints } from './ControllerHints'
import { stopSpeaking } from './narration'
import { TOUR } from './tour'
import { t } from './i18n'

/**
 * Kiosk mode for an exhibition stand. Turn it on in the menu (Info tab) or open the page with ?kiosk.
 * After 2 minutes without anyone using it, everything resets for the next visitor (missions, settings,
 * controller hints, the headset view) and an "attract" loop plays: the guided tour runs on its own, muted,
 * behind a big "Touch to explore" card. The first touch, key or controller press stops it.
 */
export const IDLE_MS = 120_000
const KEY = 'cosmic-xr-kiosk'

interface KioskState {
  enabled: boolean
  attract: boolean
  setEnabled: (on: boolean) => void
}
const initial = (() => {
  try {
    return new URLSearchParams(location.search).has('kiosk') || localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
})()
export const useKiosk = create<KioskState>((set) => ({
  enabled: initial,
  attract: false,
  setEnabled: (enabled) => {
    try {
      localStorage.setItem(KEY, enabled ? '1' : '0')
    } catch {
      /* ignore */
    }
    set({ enabled, attract: false })
  },
}))

let lastActive = Date.now()
export function markActive() {
  lastActive = Date.now()
  if (useKiosk.getState().attract) stopAttract()
}

function resetForNextVisitor() {
  stopSpeaking()
  void xrStore.getState().session?.end()
  const app = useXRApp.getState()
  const lang = app.settings.lang
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) app.setSetting(k as never, v as never)
  app.setSetting('lang', lang) // the stand's language stays as set up
  app.setSetting('sound', false)
  app.resetMissions()
  resetControllerHints()
  app.setMenuOpen(false)
  app.selectHotspot(null)
  app.setGyroEnabled(false)
  app.setArAnchor(null)
  app.selectBody(null)
  try {
    sessionStorage.removeItem('cosmic-xr-modes-seen')
  } catch {
    /* ignore */
  }
}

function startAttract() {
  resetForNextVisitor()
  useKiosk.setState({ attract: true })
  useXRApp.getState().setTourStep(0)
}

function stopAttract() {
  useKiosk.setState({ attract: false })
  const app = useXRApp.getState()
  app.setTourStep(null)
  app.selectBody(null)
}

/** Watches for activity; starts the attract loop after IDLE_MS of nothing. Loops the tour while attracting. */
export function KioskDirector() {
  const enabled = useKiosk((s) => s.enabled)
  const session = useStore(xrStore, (s) => s.session)
  const attract = useKiosk((s) => s.attract)
  const tourStep = useXRApp((s) => s.tourStep)

  useEffect(() => {
    if (!enabled) return
    const events = ['pointerdown', 'keydown', 'touchstart', 'wheel'] as const
    events.forEach((e) => window.addEventListener(e, markActive, { passive: true }))
    lastActive = Date.now()
    const id = setInterval(() => {
      if (!useKiosk.getState().attract && Date.now() - lastActive > IDLE_MS) startAttract()
    }, 2000)
    return () => {
      events.forEach((e) => window.removeEventListener(e, markActive))
      clearInterval(id)
    }
  }, [enabled])

  // in a headset, any controller/hand select or squeeze counts as activity
  useEffect(() => {
    if (!enabled || !session) return
    const on = () => markActive()
    for (const e of ['selectstart', 'squeezestart'] as const) session.addEventListener(e, on)
    return () => {
      for (const e of ['selectstart', 'squeezestart'] as const) session.removeEventListener(e, on)
    }
  }, [enabled, session])

  // attract loop: when the tour reaches its closing card, start again
  useEffect(() => {
    if (attract && tourStep === TOUR.length) {
      const id = setTimeout(() => useXRApp.getState().setTourStep(0), 6000)
      return () => clearTimeout(id)
    }
  }, [attract, tourStep])
  return null
}

/** The big "Touch to explore" card over the attract loop. */
export function AttractOverlay() {
  const attract = useKiosk((s) => s.attract)
  useXRApp((s) => s.settings.lang)
  if (!attract) return null
  return (
    <button className="attract" onClick={markActive} aria-label={t('Touch to explore')}>
      <span className="attract__title">AR Cosmic Expedition</span>
      <span className="attract__cta">{t('Touch to explore')}</span>
      <span className="attract__sub">{t('Walk on Mars, the Moon and asteroid Bennu with real NASA data. On screen, in VR or in AR.')}</span>
    </button>
  )
}

// Debug handle in dev builds: window.__kiosk.startAttract()
if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as { __kiosk: unknown }).__kiosk = { startAttract, stopAttract, useKiosk }
