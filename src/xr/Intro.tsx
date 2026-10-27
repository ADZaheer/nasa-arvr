import { useEffect, useRef, useState } from 'react'
import { create } from 'zustand'
import { useLoading } from './loading'
import { useXRApp } from './store'
import { t } from './i18n'
import { flyIn } from './cameraMotion'

/**
 * Intro title card, shown the first time someone opens the app (or with ?intro): the logo draws itself,
 * the title rises letter by letter, and "Start the expedition" (which also counts as the browser gesture
 * that unlocks sound and VR) sends the camera on a short flight into the Solar System. "Skip" does the same
 * instantly. Remembered on the device after that.
 */
const SEEN_KEY = 'cosmic-xr-intro-seen'
const forced = typeof location !== 'undefined' && new URLSearchParams(location.search).has('intro')
const seen = (() => {
  try {
    return localStorage.getItem(SEEN_KEY) === '1'
  } catch {
    return false
  }
})()
export const useIntro = create<{ open: boolean }>(() => ({ open: forced || (!seen && typeof location !== 'undefined' && /^\/xr\/?$/.test(location.pathname)) }))

export function closeIntro(cinematic: boolean) {
  try {
    localStorage.setItem(SEEN_KEY, '1')
  } catch {
    /* ignore */
  }
  useIntro.setState({ open: false })
  flyIn(cinematic ? 'intro' : 'scene')
}

const TITLE = 'AR Cosmic Expedition'

export function IntroScreen() {
  const open = useIntro((s) => s.open)
  useXRApp((s) => s.settings.lang)
  const [leaving, setLeaving] = useState(false)
  const [shown, setShown] = useState(open)
  const bar = useRef<HTMLElement>(null)
  const ready = useLoading((s) => !s.active)

  useEffect(() => {
    if (open) return
    setLeaving(true)
    const id = setTimeout(() => setShown(false), 700)
    return () => clearTimeout(id)
  }, [open])

  // first scene's real loading progress drives the thin line under the title
  useEffect(() => {
    if (!shown) return
    let raf = 0
    let cur = 0
    const loop = () => {
      const s = useLoading.getState()
      const target = s.active ? s.progress : 1
      cur += (target - cur) * 0.1
      if (bar.current) bar.current.style.transform = `scaleX(${Math.max(0.03, cur)})`
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [shown])

  if (!shown) return null
  return (
    <div className={`intro${leaving ? ' intro--out' : ''}`} role="dialog" aria-label={TITLE}>
      <button className="intro__skip" onClick={() => closeIntro(false)}>
        {t('Skip')}
      </button>
      <svg className="intro__logo" viewBox="0 0 200 200" aria-hidden>
        <defs>
          <radialGradient id="intro-mars" cx="38%" cy="34%" r="70%">
            <stop offset="0" stopColor="#ffb07a" />
            <stop offset="0.6" stopColor="#d4521d" />
            <stop offset="1" stopColor="#5c1d08" />
          </radialGradient>
        </defs>
        <circle className="intro__planet" cx="100" cy="100" r="42" fill="url(#intro-mars)" />
        <ellipse className="intro__orbit" cx="100" cy="104" rx="84" ry="26" transform="rotate(-14 100 104)" />
        <circle className="intro__moon" cx="0" cy="0" r="5" />
      </svg>
      <h1 className="intro__title" aria-label={TITLE}>
        {TITLE.split('').map((c, i) => (
          <span key={i} style={{ animationDelay: `${300 + i * 28}ms` }} aria-hidden>
            {c === ' ' ? ' ' : c}
          </span>
        ))}
      </h1>
      <p className="intro__tagline">{t('Walk on Mars, the Moon and asteroid Bennu with real NASA data. On screen, in VR or in AR.')}</p>
      <div className="intro__progress" aria-hidden>
        <i ref={bar} />
      </div>
      <button className="intro__start" onClick={() => closeIntro(true)}>
        {ready ? t('Start the expedition') : t('Loading…')} <span aria-hidden>→</span>
      </button>
      <small className="intro__credit">{t('NASA Space Apps Challenge 2026 · images and data: NASA')}</small>
    </div>
  )
}
