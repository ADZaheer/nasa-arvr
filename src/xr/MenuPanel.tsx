import { useEffect, useState } from 'react'
import { useXRApp } from './store'
import { BODY_BY_ID } from './bodies'
import { useSiteContent } from './content'
import { ALL_GOALS } from './missions'
import { activeMissions } from './MissionTracker'
import { LANGS, t, useT } from './i18n'
import { resetControllerHints } from './ControllerHints'
import { saveForOffline, useOffline } from './offline'
import { useKiosk } from './kiosk'
import { AUDIO_CONTROLS, COMFORT_CONTROLS, DESTINATIONS, DISPLAY_CONTROLS, INFO_SOURCE, MENU_TABS, infoLines, type ControlSpec, type MenuTab } from './menuModel'

/** On-screen version of the wrist menu (desktop, phone, phone AR via the DOM overlay). Same options. */
export function MenuPanel() {
  const open = useXRApp((s) => s.menuOpen)
  const [tab, setTab] = useState<MenuTab>('travel')
  const lang = useXRApp((s) => s.settings.lang)
  const t = useT()
  const app = useXRApp.getState
  if (!open) {
    return (
      <button className="btn menu-fab" aria-label={t('Open menu')} onClick={() => app().setMenuOpen(true)}>
        ⚙ {t('Menu')}
      </button>
    )
  }
  return (
    <aside className="menu-panel" aria-label={t('Expedition Menu')}>
      <header>
        <strong>{t('Expedition Menu')}</strong>
        <div className="seg seg--lang" role="group" aria-label={t('Language')}>
          {LANGS.map((l) => (
            <button key={l.value} className={lang === l.value ? 'on' : ''} aria-pressed={lang === l.value} onClick={() => app().setSetting('lang', l.value)}>
              {l.value.toUpperCase()}
            </button>
          ))}
        </div>
        <button className="icon-btn" aria-label={t('Close menu')} onClick={() => app().setMenuOpen(false)}>
          ×
        </button>
      </header>
      <nav className="menu-tabs" role="tablist">
        {MENU_TABS.map((m) => (
          <button key={m.id} role="tab" aria-selected={tab === m.id} className={tab === m.id ? 'on' : ''} onClick={() => setTab(m.id)}>
            {t(m.label)}
          </button>
        ))}
      </nav>
      {tab === 'travel' && <Travel />}
      {tab === 'missions' && <Missions />}
      {tab === 'display' && <Controls controls={DISPLAY_CONTROLS} />}
      {tab === 'comfort' && <Controls controls={COMFORT_CONTROLS} />}
      {tab === 'audio' && <Controls controls={AUDIO_CONTROLS} />}
      {tab === 'info' && <Info />}
      <p className="menu-tip">{t('In VR: turn your left palm toward your face, or press Y on the left controller.')}</p>
    </aside>
  )
}

function Missions() {
  const done = useXRApp((s) => s.goalsDone)
  const bodyId = useXRApp((s) => s.bodyId)
  const siteId = useXRApp((s) => s.siteId)
  const list = activeMissions(done, bodyId, siteId)
  const count = ALL_GOALS.filter((g) => done[g.id]).length
  return (
    <div className="menu-missions">
      {list.length === 0 && <p>{t('No missions here: explore freely!')}</p>}
      {list.map((m) => (
        <section key={m.id}>
          <h4>{t(m.title)}</h4>
          <ul>
            {m.goals.map((g) => (
              <li key={g.id} className={done[g.id] ? 'done' : ''} title={t(g.hint)}>
                <span aria-hidden>{done[g.id] ? '✓' : '○'}</span> {t(g.title)}
                {!done[g.id] && <small>{t(g.hint)}</small>}
              </li>
            ))}
          </ul>
        </section>
      ))}
      <footer>
        <span>{t('All missions: {n}/{total}', { n: count, total: ALL_GOALS.length })}</span>
        <button className="btn" onClick={() => {
            useXRApp.getState().resetMissions()
            resetControllerHints()
          }}>
          {t('Restart training')}
        </button>
      </footer>
    </div>
  )
}

function Travel() {
  const bodyId = useXRApp((s) => s.bodyId)
  const siteId = useXRApp((s) => s.siteId)
  return (
    <div className="menu-list">
      {DESTINATIONS.map((d) => (
        <button key={d.id} className={d.active({ bodyId, siteId }) ? 'on' : ''} onClick={d.go}>
          {t(d.label)}
        </button>
      ))}
      <button className="on" onClick={() => useXRApp.getState().setTourStep(0)}>
        ▶ {t('Guided tour')}
      </button>
    </div>
  )
}

function Controls({ controls }: { controls: ControlSpec[] }) {
  const settings = useXRApp((s) => s.settings)
  const onSurface = useXRApp((s) => !!s.siteId)
  const set = useXRApp.getState().setSetting
  return (
    <div className="menu-controls">
      {controls.map((c) => {
        if (c.kind === 'slider') {
          const v = settings[c.key] as number
          const disabled = c.surfaceOnly && !onSurface
          return (
            <label key={c.key} className={disabled ? 'off' : ''}>
              <span>
                {t(c.label)} <em>{disabled ? t('on the surface') : t(c.format(v))}</em>
              </span>
              <input type="range" min={c.min} max={c.max} step={(c.max - c.min) / 100} value={v} disabled={disabled} onChange={(e) => set(c.key, Number(e.target.value) as never)} />
            </label>
          )
        }
        if (c.kind === 'toggle')
          return (
            <label key={c.key} className="row">
              <span>{t(c.label)}</span>
              <input type="checkbox" checked={settings[c.key] as boolean} onChange={(e) => set(c.key, e.target.checked as never)} />
            </label>
          )
        return (
          <div key={c.key}>
            <span>{t(c.label)}</span>
            <div className="seg">
              {c.options.map((o) => (
                <button key={o.value} className={settings[c.key] === o.value ? 'on' : ''} onClick={() => set(c.key, o.value as never)}>
                  {t(o.label)}
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Info() {
  const bodyId = useXRApp((s) => s.bodyId)
  const siteId = useXRApp((s) => s.siteId)
  const site = useSiteContent(siteId)
  const [, tick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [])
  const where = siteId ? (site ? `${site.name}, ${BODY_BY_ID[site.body]?.name ?? site.body}` : t('Mars surface')) : bodyId ? (BODY_BY_ID[bodyId]?.name ?? bodyId) : t('Solar System')
  return (
    <dl className="menu-info">
      {infoLines(where, !!siteId).map((l) => (
        <div key={l.label}>
          <dt>{t(l.label)}</dt>
          <dd>{l.value}</dd>
        </div>
      ))}
      <OfflineSave />
      <KioskToggle />
      <small>
        {t('Time source: {x}', { x: '' })}
        <a href={INFO_SOURCE.url} target="_blank" rel="noopener noreferrer">
          {INFO_SOURCE.label}
        </a>
      </small>
    </dl>
  )
}

/** Download everything now, so the expedition works even if the venue Wi-Fi drops. */
function OfflineSave() {
  const { supported, progress, ready, error, sizeMB } = useOffline()
  if (!supported) return null
  return (
    <div className="offline-save">
      <button className="btn" disabled={progress !== null} onClick={() => void saveForOffline()}>
        {progress !== null ? t('Saving… {n}%', { n: Math.round(progress * 100) }) : ready ? `✓ ${t('Saved for offline')}` : t('Save for offline')}
      </button>
      <small>{error ? t('Saving stopped. Check your connection and try again.') : t('Keeps the whole expedition on this device ({n} MB) so it works without internet.', { n: sizeMB ?? '~40' })}</small>
    </div>
  )
}

/** Exhibition stand mode: resets for the next visitor after 2 minutes idle and plays a looping preview. */
function KioskToggle() {
  const on = useKiosk((s) => s.enabled)
  return (
    <label className="row kiosk-toggle">
      <span>
        {t('Kiosk mode (exhibition stand)')}
        <small>{t('After 2 minutes idle: reset for the next visitor and play a looping preview.')}</small>
      </span>
      <input type="checkbox" checked={on} onChange={(e) => useKiosk.getState().setEnabled(e.target.checked)} />
    </label>
  )
}
