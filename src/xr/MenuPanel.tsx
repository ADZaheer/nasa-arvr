import { useEffect, useState } from 'react'
import { useXRApp } from './store'
import { BODY_BY_ID } from './bodies'
import { useSiteContent } from './content'
import { ALL_GOALS } from './missions'
import { activeMissions } from './MissionTracker'
import { AUDIO_CONTROLS, COMFORT_CONTROLS, DESTINATIONS, DISPLAY_CONTROLS, INFO_SOURCE, MENU_TABS, infoLines, type ControlSpec, type MenuTab } from './menuModel'

/** On-screen version of the wrist menu (desktop, phone, phone AR via the DOM overlay). Same options. */
export function MenuPanel() {
  const open = useXRApp((s) => s.menuOpen)
  const [tab, setTab] = useState<MenuTab>('travel')
  const app = useXRApp.getState
  if (!open) {
    return (
      <button className="btn menu-fab" aria-label="Open menu" onClick={() => app().setMenuOpen(true)}>
        ⚙ Menu
      </button>
    )
  }
  return (
    <aside className="menu-panel" aria-label="Expedition menu">
      <header>
        <strong>Expedition Menu</strong>
        <button className="icon-btn" aria-label="Close menu" onClick={() => app().setMenuOpen(false)}>
          ×
        </button>
      </header>
      <nav className="menu-tabs" role="tablist">
        {MENU_TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>
      {tab === 'travel' && <Travel />}
      {tab === 'missions' && <Missions />}
      {tab === 'display' && <Controls controls={DISPLAY_CONTROLS} />}
      {tab === 'comfort' && <Controls controls={COMFORT_CONTROLS} />}
      {tab === 'audio' && <Controls controls={AUDIO_CONTROLS} />}
      {tab === 'info' && <Info />}
      <p className="menu-tip">In VR: turn your left palm toward your face, or press Y on the left controller.</p>
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
      {list.length === 0 && <p>No missions here: explore freely!</p>}
      {list.map((m) => (
        <section key={m.id}>
          <h4>{m.title}</h4>
          <ul>
            {m.goals.map((g) => (
              <li key={g.id} className={done[g.id] ? 'done' : ''} title={g.hint}>
                <span aria-hidden>{done[g.id] ? '✓' : '○'}</span> {g.title}
                {!done[g.id] && <small>{g.hint}</small>}
              </li>
            ))}
          </ul>
        </section>
      ))}
      <footer>
        <span>
          All missions: {count}/{ALL_GOALS.length}
        </span>
        <button className="btn" onClick={() => useXRApp.getState().resetMissions()}>
          Restart training
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
          {d.label}
        </button>
      ))}
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
                {c.label} <em>{disabled ? 'on the surface' : c.format(v)}</em>
              </span>
              <input type="range" min={c.min} max={c.max} step={(c.max - c.min) / 100} value={v} disabled={disabled} onChange={(e) => set(c.key, Number(e.target.value) as never)} />
            </label>
          )
        }
        if (c.kind === 'toggle')
          return (
            <label key={c.key} className="row">
              <span>{c.label}</span>
              <input type="checkbox" checked={settings[c.key] as boolean} onChange={(e) => set(c.key, e.target.checked as never)} />
            </label>
          )
        return (
          <div key={c.key}>
            <span>{c.label}</span>
            <div className="seg">
              {c.options.map((o) => (
                <button key={o.value} className={settings[c.key] === o.value ? 'on' : ''} onClick={() => set(c.key, o.value as never)}>
                  {o.label}
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
  const where = siteId ? (site ? `${site.name}, Mars` : 'Mars surface') : bodyId ? (BODY_BY_ID[bodyId]?.name ?? bodyId) : 'Solar System'
  return (
    <dl className="menu-info">
      {infoLines(where, !!siteId).map((l) => (
        <div key={l.label}>
          <dt>{l.label}</dt>
          <dd>{l.value}</dd>
        </div>
      ))}
      <small>
        Mars time:{' '}
        <a href={INFO_SOURCE.url} target="_blank" rel="noopener noreferrer">
          {INFO_SOURCE.label}
        </a>
      </small>
    </dl>
  )
}
