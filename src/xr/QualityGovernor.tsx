import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useStore } from 'zustand'
import { useXRApp } from './store'
import { xrStore } from './xrStore'
import { TIER_ORDER, useQuality } from './quality'

/**
 * Auto quality: measures frame rate in 2 s windows. If it stays below ~80% of the target
 * (headset refresh rate in XR, 60 fps otherwise) for two windows in a row, the auto tier drops one
 * step (never below Low), then waits 8 s before judging again. It never steps back up by itself,
 * so the picture doesn't keep changing; picking a tier in the menu overrides it.
 * Also caps the canvas pixel ratio per tier outside XR.
 */
export function QualityGovernor() {
  const setDpr = useThree((s) => s.setDpr)
  const { dpr, tier } = useQuality()
  const hz = useStore(xrStore, (s) => s.frameRate)
  const session = useStore(xrStore, (s) => s.session)
  const scene = useXRApp((s) => `${s.bodyId}:${s.siteId}`)
  const st = useRef({ start: performance.now(), frames: 0, slow: 0, cooldownUntil: 0 })

  useEffect(() => {
    if (!session) setDpr(Math.min(window.devicePixelRatio || 1, dpr))
  }, [dpr, session, setDpr])

  // reset the measurement whenever the tier, session or scene changes; loading textures and compiling
  // shaders right after a change causes hitches that shouldn't count against the device
  useEffect(() => {
    st.current = { start: performance.now(), frames: 0, slow: 0, cooldownUntil: performance.now() + 10000 }
  }, [tier, session, scene])

  useFrame(() => {
    const s = st.current
    s.frames++
    const now = performance.now()
    if (now - s.start < 2000) return
    const fps = (s.frames * 1000) / (now - s.start)
    s.start = now
    s.frames = 0
    const app = useXRApp.getState()
    if (app.settings.quality !== 'auto' || document.hidden || now < s.cooldownUntil) return
    const target = session ? (hz ?? 72) : 60
    s.slow = fps < target * 0.8 ? s.slow + 1 : 0
    if (s.slow >= 2) {
      const i = TIER_ORDER.indexOf(app.autoTier)
      if (i > 0) {
        useXRApp.setState({ autoTier: TIER_ORDER[i - 1] })
        app.showToast(`Graphics lowered to ${TIER_ORDER[i - 1]} to keep it smooth`)
      }
      s.slow = 0
      s.cooldownUntil = now + 8000
    }
  })

  return null
}
