import { useEffect, useRef, useState } from 'react'
import { useLoading } from './loading'
import { useXRApp } from './store'
import { t } from './i18n'

export const LOADING_TIPS = [
  'Tip: point at a glowing pin and select it to learn about it.',
  'Tip: on the surface, grab a loose rock and throw it in low gravity.',
  'Tip: open the menu (left palm up in VR, or ⚙ Menu) for missions and travel.',
  'Fact: Mars’ gravity is 38% of Earth’s; the Moon’s is 17%.',
  'Fact: Bennu is so small that a gentle toss can send a pebble into space.',
  'Fact: Olympus Mons on Mars is about three times taller than Mount Everest.',
  'Fact: SPHEREx maps the whole sky in 102 infrared colours.',
]

/**
 * Loading screen in the Solar System's style: a little planet orbiting a glowing ring, a percentage that
 * counts up smoothly, a glowing bar, and a tip that changes every few seconds. It fades out instead of
 * vanishing. The counter is animated by writing to the DOM directly (no React re-render per frame).
 */
export function LoadingScreen() {
  const active = useLoading((s) => s.active)
  const label = useLoading((s) => s.label)
  useXRApp((s) => s.settings.lang)
  const [shown, setShown] = useState(active)
  const [leaving, setLeaving] = useState(false)
  const [tip, setTip] = useState(() => Math.floor(Math.random() * LOADING_TIPS.length))
  const pct = useRef<HTMLSpanElement>(null)
  const bar = useRef<HTMLElement>(null)

  useEffect(() => {
    if (active) {
      setShown(true)
      setLeaving(false)
      return
    }
    if (!shown) return
    setLeaving(true)
    const id = setTimeout(() => setShown(false), 450)
    return () => clearTimeout(id)
  }, [active, shown])

  useEffect(() => {
    if (!shown) return
    const id = setInterval(() => setTip((n) => (n + 1) % LOADING_TIPS.length), 4200)
    return () => clearInterval(id)
  }, [shown])

  // ease the shown percentage toward the real progress
  useEffect(() => {
    if (!shown) return
    let raf = 0
    let cur = 0
    const loop = () => {
      const s = useLoading.getState()
      const target = s.active ? s.progress : 1
      cur += (target - cur) * 0.12
      if (pct.current) pct.current.textContent = `${Math.round(cur * 100)}%`
      if (bar.current) bar.current.style.transform = `scaleX(${Math.max(0.02, cur)})`
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [shown])

  if (!shown) return null
  const what = t(label)
  return (
    <div className={`loading-screen${leaving ? ' loading-screen--out' : ''}`} role="progressbar" aria-label={t('Preparing {x}…', { x: what })}>
      <div className="orbit-loader" aria-hidden>
        <i className="orbit-loader__ring" />
        <i className="orbit-loader__ring orbit-loader__ring--inner" />
        <i className="orbit-loader__sun" />
        <span className="orbit-loader__arm">
          <i className="orbit-loader__planet" />
        </span>
        <span className="orbit-loader__arm orbit-loader__arm--inner">
          <i className="orbit-loader__moon" />
        </span>
      </div>
      <span className="loading-screen__pct" ref={pct}>
        0%
      </span>
      <strong className="loading-screen__label">{t('Preparing {x}…', { x: what })}</strong>
      <div className="loading-screen__bar">
        <i ref={bar} />
      </div>
      <small key={tip} className="loading-screen__tip">
        {t(LOADING_TIPS[tip])}
      </small>
    </div>
  )
}
