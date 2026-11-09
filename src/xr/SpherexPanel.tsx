import { useEffect, useState } from 'react'
import { useXRApp } from './store'
import { isHit, loadBlinkMeta, movedArcsec, useSpherex } from './spherexState'
import { SPHEREX_IMAGES, revealBlink } from './SpherexTable'
import { t } from './i18n'

/** True on a phone held upright, where the 3D console would be too small to read. */
function useNarrow() {
  const q = '(max-width: 639px) and (orientation: portrait)'
  const [narrow, set] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(q).matches)
  useEffect(() => {
    const m = matchMedia(q)
    const on = () => set(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return narrow
}

/** On-screen controls for the SPHEREx table on phones (same game state as the 3D console). */
export function SpherexPanel() {
  const narrow = useNarrow()
  const session = useXRApp((s) => s.mode !== 'desktop')
  const { view, blinking, flags, revealed, meta, setView, setBlinking, reset } = useSpherex()
  useEffect(() => void loadBlinkMeta(), [])
  if (!narrow || session) return null
  const images = SPHEREX_IMAGES()
  const image = images.find((i) => i.id === view)
  const found = meta ? flags.some((f) => isHit(f, meta)) : false
  return (
    <section className="spherex-panel" aria-label={t('Spot what moved')}>
      <div className="segmented spherex-panel__views" role="radiogroup">
        {[{ id: 'blink', label: t('Spot what moved') }, ...images.map((i) => ({ id: i.id, label: t(i.label) }))].map((o) => (
          <button key={o.id} role="radio" aria-checked={view === o.id} className={view === o.id ? 'on' : ''} onClick={() => setView(o.id)}>
            {o.label}
          </button>
        ))}
      </div>
      {view === 'blink' ? (
        <>
          <p className={revealed && found ? 'good' : ''}>
            {revealed
              ? found
                ? t('You found it! That dot is asteroid {x}: it moved {n}″ in {h} hours.', { x: meta?.target.name ?? '', n: Math.round(meta ? movedArcsec(meta) : 0), h: meta?.gapHours ?? '' })
                : t('The moving dot is asteroid {x} (known, from NASA JPL). Your other flags stay unverified.', { x: meta?.target.name ?? '' })
              : t('Two real SPHEREx images of the same sky, 1.8 hours apart. Stars stay put. Tap the dot that jumps.')}
          </p>
          <div className="spherex-panel__actions">
            <button className="chip-btn" onClick={() => setBlinking(!blinking)}>
              {blinking ? `❚❚ ${t('Pause blink')}` : `▶ ${t('Blink')}`}
            </button>
            <button className="chip-btn primary" disabled={revealed} onClick={revealBlink}>
              ✓ {t('Reveal')}
            </button>
            <button className="chip-btn" onClick={reset}>
              ↺ {t('Start over')}
            </button>
          </div>
        </>
      ) : (
        <p>{t('NASA’s released SPHEREx images to explore. Only NASA-identified objects are marked.')}</p>
      )}
      <small>{t(view === 'blink' ? (meta?.credit ?? '') : (image?.credit ?? ''))}</small>
    </section>
  )
}
