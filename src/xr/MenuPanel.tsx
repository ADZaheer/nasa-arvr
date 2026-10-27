import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useXRApp } from './store'
import { BODY_BY_ID } from './bodies'
import { useSiteContent } from './content'
import { ALL_GOALS, type Mission } from './missions'
import { activeMissions } from './MissionTracker'
import { LANGS, t, useT } from './i18n'
import { resetControllerHints } from './ControllerHints'
import { saveForOffline, useOffline } from './offline'
import { useKiosk } from './kiosk'
import { AUDIO_CONTROLS, COMFORT_CONTROLS, DESTINATIONS, DISPLAY_CONTROLS, INFO_SOURCE, MENU_TABS, infoLines, type ControlSpec, type Destination, type MenuTab } from './menuModel'

/**
 * On-screen Expedition menu (desktop, tablet, phone, phone AR via the DOM overlay). Same options as the
 * wrist menu in VR. Desktop/tablet: a glass side panel. Phones: a bottom sheet with a drag handle — swipe it
 * down (or tap outside) to close. Icon tabs with a sliding highlight, place cards, custom switches/sliders.
 */

// ---- tiny inline icon set (stroke icons, inherit currentColor) ----
const PATHS: Record<string, string> = {
  travel: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-9 9h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z',
  missions: 'M5 21V4m0 0h11l-2 4 2 4H5',
  display: 'M12 5a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm0-3v2m0 16v2m10-10h-2M4 12H2m17.1-7.1-1.4 1.4M6.3 17.7l-1.4 1.4m14.2 0-1.4-1.4M6.3 6.3 4.9 4.9',
  comfort: 'M12 6.5a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4ZM5 9h14M12 9v6m0 0-3 6m3-6 3 6',
  audio: 'M4 9v6h4l5 4V5L8 9H4Zm12.5-.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-11v6m0-9.5v.5',
  close: 'M6 6l12 12M18 6 6 18',
  play: 'M7 4v16l13-8L7 4Z',
  orbit: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM2.5 12c0-2.2 4.3-4 9.5-4s9.5 1.8 9.5 4-4.3 4-9.5 4-9.5-1.8-9.5-4Z',
  walk: 'M13 4.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM9 22l2-7 3 3v4m-5-11 3-3 3 3 3 1M8 13l1-4',
  table: 'M3 9h18l-2 3H5L3 9Zm3 3-1 8m14-8 1 8M8 5h8v4H8z',
  check: 'M5 12.5 10 17l9-10',
  download: 'M12 4v11m0 0-4-4m4 4 4-4M5 20h14',
  kiosk: 'M4 4h16v11H4zM9 20h6m-3-5v5',
  globe: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20Z',
  reset: 'M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4',
}
export function UiIcon({ name, size = 18 }: { name: keyof typeof PATHS | string; size?: number }) {
  return (
    <svg className="ui-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={PATHS[name] ?? PATHS.info} />
    </svg>
  )
}
const TAB_ICON: Record<MenuTab, string> = { travel: 'travel', missions: 'missions', display: 'display', comfort: 'comfort', audio: 'audio', info: 'info' }

const isPhone = () => typeof matchMedia !== 'undefined' && matchMedia('(max-width: 640px)').matches

export function MenuPanel() {
  const open = useXRApp((s) => s.menuOpen)
  const [tab, setTab] = useState<MenuTab>('travel')
  const lang = useXRApp((s) => s.settings.lang)
  const t = useT()
  const app = useXRApp.getState
  const sheet = useRef<HTMLElement>(null)
  const tabs = useRef<HTMLElement>(null)
  const ink = useRef<HTMLElement>(null)
  const drag = useRef<{ y0: number; dy: number; id: number } | null>(null)
  const [closing, setClosing] = useState(false)

  const close = () => {
    setClosing(true)
    setTimeout(() => {
      setClosing(false)
      app().setMenuOpen(false)
    }, 220)
  }

  // sliding highlight under the active tab
  useLayoutEffect(() => {
    const nav = tabs.current, bar = ink.current
    if (!nav || !bar) return
    const btn = nav.querySelector<HTMLElement>('[aria-selected="true"]')
    if (!btn) return
    bar.style.transform = `translateX(${btn.offsetLeft}px)`
    bar.style.width = `${btn.offsetWidth}px`
    btn.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [tab, open, lang])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) {
    return (
      <button className="menu-fab" aria-label={t('Open menu')} onClick={() => app().setMenuOpen(true)}>
        <span className="menu-fab__icon" aria-hidden>
          <i />
          <i />
          <i />
        </span>
        <span className="menu-fab__label">{t('Menu')}</span>
      </button>
    )
  }

  // swipe the sheet down to close (phones)
  const onDown = (e: React.PointerEvent) => {
    if (!isPhone()) return
    drag.current = { y0: e.clientY, dy: 0, id: e.pointerId }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || !sheet.current) return
    d.dy = Math.max(0, e.clientY - d.y0)
    sheet.current.style.transition = 'none'
    sheet.current.style.translate = `0 ${d.dy}px`
  }
  const onUp = () => {
    const d = drag.current
    drag.current = null
    const el = sheet.current
    if (!d || !el) return
    el.style.transition = ''
    el.style.translate = ''
    if (d.dy > 90) close()
  }

  return (
    <>
      <div className={`menu-backdrop${closing ? ' is-closing' : ''}`} onClick={close} aria-hidden />
      <aside ref={sheet} className={`menu-panel${closing ? ' is-closing' : ''}`} aria-label={t('Expedition Menu')} role="dialog">
        <div className="menu-panel__grab" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          <span className="menu-panel__handle" aria-hidden />
          <header className="menu-panel__head">
            <span className="menu-panel__logo" aria-hidden>
              <UiIcon name="orbit" size={20} />
            </span>
            <div className="menu-panel__title">
              <strong>{t('Expedition')}</strong>
              <Where />
            </div>
            <div className="lang-switch" role="group" aria-label={t('Language')}>
              {LANGS.map((l) => (
                <button key={l.value} className={lang === l.value ? 'on' : ''} aria-pressed={lang === l.value} onClick={() => app().setSetting('lang', l.value)}>
                  {l.value.toUpperCase()}
                </button>
              ))}
            </div>
            <button className="menu-close" aria-label={t('Close menu')} onClick={close}>
              <UiIcon name="close" />
            </button>
          </header>
        </div>
        <nav className="menu-tabs" role="tablist" ref={tabs}>
          <i className="menu-tabs__ink" ref={ink} aria-hidden />
          {MENU_TABS.map((m) => (
            <button key={m.id} role="tab" aria-selected={tab === m.id} className={tab === m.id ? 'on' : ''} onClick={() => setTab(m.id)}>
              <UiIcon name={TAB_ICON[m.id]} />
              <span>{t(m.label)}</span>
              <TabBadge tab={m.id} />
            </button>
          ))}
        </nav>
        <div className="menu-panel__body" key={tab}>
          {tab === 'travel' && <Travel />}
          {tab === 'missions' && <Missions />}
          {tab === 'display' && <Controls controls={DISPLAY_CONTROLS} />}
          {tab === 'comfort' && <Controls controls={COMFORT_CONTROLS} />}
          {tab === 'audio' && <Controls controls={AUDIO_CONTROLS} />}
          {tab === 'info' && <Info />}
        </div>
        <p className="menu-tip">{t('In VR: turn your left palm toward your face, or press Y on the left controller.')}</p>
      </aside>
    </>
  )
}

/** Small state hints on tabs: missions left, sound on/off. */
function TabBadge({ tab }: { tab: MenuTab }) {
  const done = useXRApp((s) => s.goalsDone)
  const sound = useXRApp((s) => s.settings.sound)
  const bodyId = useXRApp((s) => s.bodyId)
  const siteId = useXRApp((s) => s.siteId)
  if (tab === 'missions') {
    const left = activeMissions(done, bodyId, siteId).flatMap((m) => m.goals).filter((g) => !done[g.id]).length
    return left ? <b className="tab-badge">{left}</b> : null
  }
  if (tab === 'audio') return <b className={`tab-dot${sound ? ' on' : ''}`} aria-label={sound ? t('Sound on') : t('Sound off')} />
  return null
}

function Where() {
  const bodyId = useXRApp((s) => s.bodyId)
  const siteId = useXRApp((s) => s.siteId)
  const site = useSiteContent(siteId)
  const where = siteId ? (site ? t(site.name) : '…') : bodyId ? t(BODY_BY_ID[bodyId]?.name ?? bodyId) : t('Solar System')
  return <small>{where}</small>
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="menu-section">
      <h4>{title}</h4>
      {children}
    </section>
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
      <div className="mission-total">
        <div>
          <strong>{t('All missions: {n}/{total}', { n: count, total: ALL_GOALS.length })}</strong>
          <Progress value={count / ALL_GOALS.length} />
        </div>
        <button
          className="chip-btn"
          onClick={() => {
            useXRApp.getState().resetMissions()
            resetControllerHints()
          }}
        >
          <UiIcon name="reset" size={15} /> {t('Restart training')}
        </button>
      </div>
      {list.length === 0 && <p className="empty">{t('No missions here: explore freely!')}</p>}
      {list.map((m) => (
        <MissionCard key={m.id} m={m} done={done} />
      ))}
    </div>
  )
}

function MissionCard({ m, done }: { m: Mission; done: Record<string, true> }) {
  const n = m.goals.filter((g) => done[g.id]).length
  return (
    <section className="mission">
      <header>
        <h4>{t(m.title)}</h4>
        <span>
          {n}/{m.goals.length}
        </span>
      </header>
      <Progress value={n / m.goals.length} />
      <ul>
        {m.goals.map((g) => (
          <li key={g.id} className={done[g.id] ? 'done' : ''}>
            <span className="tick" aria-hidden>
              {done[g.id] && <UiIcon name="check" size={13} />}
            </span>
            <span>
              {t(g.title)}
              {!done[g.id] && <small>{t(g.hint)}</small>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Progress({ value }: { value: number }) {
  return (
    <span className="progress" aria-hidden>
      <i style={{ transform: `scaleX(${Math.max(0.001, Math.min(1, value))})` }} />
    </span>
  )
}

const SPACE = new Set(['hub', 'mars', 'bennu', 'moon', 'spherex'])
const placeIcon = (d: Destination) => (d.id === 'spherex' ? 'table' : SPACE.has(d.id) ? 'orbit' : 'walk')

function Travel() {
  const bodyId = useXRApp((s) => s.bodyId)
  const siteId = useXRApp((s) => s.siteId)
  const space = DESTINATIONS.filter((d) => SPACE.has(d.id))
  const surface = DESTINATIONS.filter((d) => !SPACE.has(d.id))
  const card = (d: Destination) => {
    const on = d.active({ bodyId, siteId })
    return (
      <button key={d.id} className={`place${on ? ' on' : ''}`} aria-current={on} onClick={d.go}>
        <span className="place__icon">
          <UiIcon name={placeIcon(d)} />
        </span>
        <span className="place__name">{t(d.label)}</span>
        {on && <span className="place__here">{t('You are here')}</span>}
      </button>
    )
  }
  return (
    <>
      <button className="tour-cta" onClick={() => useXRApp.getState().setTourStep(0)}>
        <span className="tour-cta__icon">
          <UiIcon name="play" size={16} />
        </span>
        <span>
          <b>{t('Guided tour')}</b>
          <small>{t('Mars orbit → Victoria → Opportunity → Gale → Jezero')}</small>
        </span>
      </button>
      <Section title={t('In space')}>
        <div className="places">{space.map(card)}</div>
      </Section>
      <Section title={t('Walk on the surface')}>
        <div className="places">{surface.map(card)}</div>
      </Section>
    </>
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
          const pct = ((v - c.min) / (c.max - c.min)) * 100
          return (
            <label key={c.key} className={`ctl ctl--slider${disabled ? ' off' : ''}`}>
              <span className="ctl__row">
                <span>{t(c.label)}</span>
                <em>{disabled ? t('on the surface') : t(c.format(v))}</em>
              </span>
              <input
                type="range"
                min={c.min}
                max={c.max}
                step={(c.max - c.min) / 100}
                value={v}
                disabled={disabled}
                style={{ ['--pct' as string]: `${pct}%` }}
                onChange={(e) => set(c.key, Number(e.target.value) as never)}
              />
            </label>
          )
        }
        if (c.kind === 'toggle') {
          const on = settings[c.key] as boolean
          return (
            <label key={c.key} className="ctl ctl--toggle">
              <span>{t(c.label)}</span>
              <input type="checkbox" role="switch" className="switch" checked={on} onChange={(e) => set(c.key, e.target.checked as never)} />
            </label>
          )
        }
        return (
          <div key={c.key} className="ctl">
            <span className="ctl__row">
              <span>{t(c.label)}</span>
            </span>
            <div className="segmented" role="radiogroup" aria-label={t(c.label)}>
              {c.options.map((o) => (
                <button key={o.value} role="radio" aria-checked={settings[c.key] === o.value} className={settings[c.key] === o.value ? 'on' : ''} onClick={() => set(c.key, o.value as never)}>
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
    <>
      <Section title={t('Where and when')}>
        <dl className="info-grid">
          {infoLines(where, !!siteId).map((l) => (
            <div key={l.label}>
              <dt>{t(l.label)}</dt>
              <dd>{l.value}</dd>
            </div>
          ))}
        </dl>
        <small className="fine">
          {t('Time source: {x}', { x: '' })}
          <a href={INFO_SOURCE.url} target="_blank" rel="noopener noreferrer">
            {INFO_SOURCE.label}
          </a>
        </small>
      </Section>
      <Section title={t('Event setup')}>
        <OfflineSave />
        <KioskToggle />
      </Section>
    </>
  )
}

/** Download everything now, so the expedition works even if the venue Wi-Fi drops. */
function OfflineSave() {
  const { supported, progress, ready, error, sizeMB } = useOffline()
  if (!supported) return null
  return (
    <div className="setting-card">
      <span className="setting-card__icon">
        <UiIcon name={ready ? 'check' : 'download'} />
      </span>
      <span className="setting-card__text">
        <b>{ready ? t('Saved for offline') : t('Save for offline')}</b>
        <small>{error ? t('Saving stopped. Check your connection and try again.') : t('Keeps the whole expedition on this device ({n} MB) so it works without internet.', { n: sizeMB ?? '~40' })}</small>
        {progress !== null && <Progress value={progress} />}
      </span>
      <button className="chip-btn" disabled={progress !== null} onClick={() => void saveForOffline()}>
        {progress !== null ? `${Math.round(progress * 100)}%` : ready ? t('Update') : t('Save')}
      </button>
    </div>
  )
}

/** Exhibition stand mode: resets for the next visitor after 2 minutes idle and plays a looping preview. */
function KioskToggle() {
  const on = useKiosk((s) => s.enabled)
  return (
    <label className="setting-card">
      <span className="setting-card__icon">
        <UiIcon name="kiosk" />
      </span>
      <span className="setting-card__text">
        <b>{t('Kiosk mode (exhibition stand)')}</b>
        <small>{t('After 2 minutes idle: reset for the next visitor and play a looping preview.')}</small>
      </span>
      <input type="checkbox" role="switch" className="switch" checked={on} onChange={(e) => useKiosk.getState().setEnabled(e.target.checked)} />
    </label>
  )
}
