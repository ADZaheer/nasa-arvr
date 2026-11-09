import { useEffect, useState } from 'react'
import { useXRApp } from './store'
import { MAX_DATE, MESSAGE_SPEEDUP, MIN_DATE, currentDate, formatLightTime, sendMessageToMars, useTime } from './timeMachine'
import { LIGHT_SECONDS_PER_AU, MOMENTS, earthMarsAU } from './ephemeris'
import { t } from './i18n'

const DAY = 86400000
const YEAR = 365.25 * DAY

export function formatDate(ms: number, lang: string) {
  return new Date(ms).toLocaleDateString(lang === 'id' ? 'id-ID' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

/** Ticks a few times a second while time is moving, so the readouts stay current without per-frame renders. */
function useTick(active: boolean) {
  const [, set] = useState(0)
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => set((n) => n + 1), 250)
    return () => clearInterval(id)
  }, [active])
}

/**
 * Time machine for the Solar System (on screen): the planets sit where they really are on the chosen date.
 * Collapsed it is a small date pill; open it to scrub years, play time forward, jump to famous moments,
 * and send a message to Mars that travels at (sped-up) light speed.
 */
export function TimePanel() {
  const lang = useXRApp((s) => s.settings.lang)
  const date = useTime((s) => s.date)
  const playing = useTime((s) => s.playing)
  const message = useTime((s) => s.message)
  const [open, setOpen] = useState(false)
  useTick(playing || !!message)
  const now = currentDate()
  const live = date === null
  const au = earthMarsAU(now)
  const lightSeconds = au * LIGHT_SECONDS_PER_AU
  const { setDate, setPlaying } = useTime.getState()

  if (!open) {
    return (
      <button className="time-pill" onClick={() => setOpen(true)} aria-expanded={false}>
        <span className="time-pill__dot" data-live={live} aria-hidden />
        {live ? t('Today') : formatDate(now, lang)} · {t('Time machine')} ▴
      </button>
    )
  }
  return (
    <section className="time-panel" aria-label={t('Time machine')}>
      <header>
        <strong>{t('Time machine')}</strong>
        <span className={`time-live${live ? ' on' : ''}`}>{live ? t('Live') : formatDate(now, lang)}</span>
        <button className="menu-close" aria-label={t('Close')} onClick={() => setOpen(false)}>
          ×
        </button>
      </header>
      <p className="time-note">{t('Planets are where they really are on this date (NASA JPL orbits). Sizes and distances are not to scale.')}</p>
      <input
        className="time-range"
        type="range"
        min={MIN_DATE}
        max={MAX_DATE}
        step={DAY}
        value={now}
        aria-label={t('Date')}
        style={{ ['--pct' as string]: `${((now - MIN_DATE) / (MAX_DATE - MIN_DATE)) * 100}%` }}
        onChange={(e) => {
          setPlaying(false)
          setDate(Number(e.target.value))
        }}
      />
      <div className="time-buttons">
        <button className="chip-btn" onClick={() => setDate(now - YEAR)}>
          −1 {t('yr')}
        </button>
        <button className="chip-btn" onClick={() => setPlaying(!playing)} aria-pressed={playing}>
          {playing ? `❚❚ ${t('Pause')}` : `▶ ${t('Play')}`}
        </button>
        <button className="chip-btn" onClick={() => setDate(now + YEAR)}>
          +1 {t('yr')}
        </button>
        <button className="chip-btn" disabled={live} onClick={() => (setPlaying(false), setDate(null))}>
          {t('Today')}
        </button>
      </div>
      <div className="time-moments" role="list">
        {MOMENTS.map((m) => (
          <button key={m.id} role="listitem" className="chip" onClick={() => (setPlaying(false), setDate(Date.parse(m.date)))}>
            {t(m.label)} · {new Date(m.date).getUTCFullYear()}
          </button>
        ))}
      </div>
      <div className="light-time">
        <div>
          <b>
            {t('Earth ↔ Mars')}: {au.toFixed(2)} AU
          </b>
          <small>{t('A radio signal takes {x} one way.', { x: formatLightTime(lightSeconds) })}</small>
        </div>
        <button className="chip-btn" disabled={!!message} onClick={sendMessageToMars}>
          📡 {t('Send a message to Mars')}
        </button>
      </div>
      {message && (
        <small className="time-note" role="status">
          {t('Message on its way: {x} in reality, shown {n}× faster.', { x: formatLightTime(message.lightSeconds), n: MESSAGE_SPEEDUP })}
        </small>
      )}
    </section>
  )
}
