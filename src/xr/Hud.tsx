import { useEffect, useRef, useState } from 'react'
import { useStore } from 'zustand'
import { IS_HEADSET, enterImmersive, xrErrorMessage, xrStore } from './xrStore'
import { useXRApp } from './store'
import { requestGyroPermission, useDeviceCaps } from './device'
import { BODIES, BODY_BY_ID, KIND_COLORS } from './bodies'
import { hasContent, useBodyContent, useSiteContent, useSitesForBody } from './content'
import { InfoCardPanel, KIND_LABEL } from './InfoCard'
import { MenuPanel } from './MenuPanel'
import { retryScene, useLoading } from './loading'
import { PROBLEM_TEXT } from './smooth'
import { t, useT } from './i18n'
import { TourCaption } from './TourUI'
import { ROOM_CHOICES } from './menuModel'
import { input, player } from './surface/player'
import type { HotspotKind, SiteContent } from './types'

/**
 * DOM heads-up display. Rendered normally on desktop/gyro, and inside the WebXR DOM overlay in
 * handheld AR (a separate React root), so it must not use router hooks; navigation goes via the store.
 */
export function Hud({ inAR = false }: { inAR?: boolean }) {
  const caps = useDeviceCaps()
  const session = useStore(xrStore, (s) => s.session)
  const bodyId = useXRApp((s) => s.bodyId)
  const siteId = useXRApp((s) => s.siteId)
  const mode = useXRApp((s) => s.mode)
  const gyroEnabled = useXRApp((s) => s.gyroEnabled)
  const placed = useXRApp((s) => s.arAnchor !== null)
  const toast = useXRApp((s) => s.toast)
  const noHitTest = useXRApp((s) => s.arNoHitTest)
  const content = useBodyContent(siteId ? null : bodyId)
  const site = useSiteContent(siteId)
  const sites = useSitesForBody(siteId ? null : bodyId)
  const root = useRef<HTMLDivElement>(null)
  useT() // re-render everything below on language change

  // Taps on overlay buttons must not also trigger an XR "select" (which would re-place the model).
  useEffect(() => {
    const el = root.current
    if (!el || !inAR) return
    const stop = (e: Event) => e.preventDefault()
    el.addEventListener('beforexrselect', stop)
    return () => el.removeEventListener('beforexrselect', stop)
  }, [inAR])

  const app = useXRApp.getState
  const startGyro = async () => {
    if (await requestGyroPermission()) app().setGyroEnabled(true)
    else app().showToast('Motion access was denied, so using touch controls')
  }
  const enter = (m: 'vr' | 'ar') => {
    app().setGyroEnabled(false)
    enterImmersive(m).catch((e) => {
      console.warn('[xr] could not start', m, e)
      app().showToast(t(xrErrorMessage(e, m)), 9000)
    })
  }

  const surface = !!siteId
  const name = site?.name ?? (bodyId ? (content?.name ?? BODY_BY_ID[bodyId]?.name ?? bodyId) : null)
  const shapeIsIllustration = useXRApp((s) => s.shapeIsIllustration)
  const credit = surface
    ? [site?.terrainCredit, site?.rover?.credit].filter(Boolean).join(' · ')
    : (content?.textureCredit ?? (shapeIsIllustration ? 'Shape: procedural illustration (no model file found)' : content?.modelCredit))

  return (
    <div className={`hud${inAR ? ' hud--ar' : ''}${surface && !inAR ? ' hud--surface' : ''}`} ref={root}>
      {surface && !inAR && <div className="visor" aria-hidden />}
      <header className="hud__bar">
        <div className="hud__title">
          {surface ? (
            <button className="btn btn--ghost" onClick={() => app().selectBody(site?.body ?? bodyId)}>
              {t('◂ Back to orbit')}
            </button>
          ) : bodyId ? (
            <button className="btn btn--ghost" onClick={() => app().selectBody(null)}>
              {t('◂ Solar System')}
            </button>
          ) : (
            <span className="brand">AR Cosmic Expedition</span>
          )}
          {name && <span className="crumb">{t(name)}</span>}
        </div>
        <div className="hud__modes">
          {!session && !inAR && <TourButton />}
          {!session && caps.vr && (
            <button className="btn btn--primary" onClick={() => enter('vr')}>
              {t('Enter VR')}
            </button>
          )}
          {!session && caps.ar && (
            <button className="btn btn--primary" onClick={() => enter('ar')}>
              {IS_HEADSET ? t('View in my room') : t('Enter AR')}
            </button>
          )}
          {!session && caps.gyro && !gyroEnabled && (
            <button className="btn" onClick={startGyro}>
              {t('Look around (motion)')}
            </button>
          )}
          {!session && gyroEnabled && (
            <button className="btn" onClick={() => app().setGyroEnabled(false)}>
              {t('Touch controls')}
            </button>
          )}
          {inAR && placed && (
            <button className="btn" onClick={() => app().setArAnchor(null)}>
              {t('Move model')}
            </button>
          )}
          {session && (
            <button className="btn" onClick={() => session.end()}>
              {t(mode === 'ar' ? 'Exit AR' : 'Exit VR')}
            </button>
          )}
        </div>
      </header>

      {caps.checked && caps.secure && !caps.ar && !caps.vr && caps.gyro && !session && !gyroEnabled && (
        <p className="notice">{t('This device can’t do AR in the browser. Use Look around instead.')}</p>
      )}
      {!caps.secure && <p className="notice notice--warn">Open this page over HTTPS: WebXR and motion sensors are disabled on insecure pages.</p>}
      {inAR && !placed && <p className="notice">{noHitTest ? t('Tap to place the model in front of you.') : t('Point your phone at a table and tap to place the model.')}</p>}
      {inAR && <RoomChoices />}

      {!bodyId && !surface && !inAR && (
        <nav className="body-chips" aria-label="Destinations">
          <span className="badge">{t('Not to scale')}</span>
          {BODIES.map((b) => (
            <button key={b.id} className={`chip${hasContent(b.id) ? ' chip--live' : ''}`} onClick={() => app().selectBody(b.id)}>
              {b.name}
            </button>
          ))}
        </nav>
      )}

      {bodyId && !surface && !inAR && (
        <>
          {sites.length > 0 && (
            <nav className="land" aria-label="Stand on the surface">
              <span>{t('Stand on the surface:')}</span>
              {sites.map((s) => (
                <button key={s.id} className="btn btn--accent" onClick={() => app().selectSite(s.id, s.body)}>
                  {s.name}
                </button>
              ))}
            </nav>
          )}
          <div className="legend">
            {(Object.keys(KIND_COLORS) as HotspotKind[]).map((k) => (
              <span key={k}>
                <i style={{ background: KIND_COLORS[k] }} /> {t(KIND_LABEL[k])}
              </span>
            ))}
            {credit && <small className="credit">{credit}</small>}
          </div>
        </>
      )}

      {surface && site && !inAR && <SuitReadout site={site} credit={credit} />}
      {surface && !inAR && !session && (caps.gyro || navigator.maxTouchPoints > 0) && <TouchMoveButtons />}

      {mode === 'desktop' && !inAR && (
        <p className="hint">
          {surface
            ? t('W A S D walk · Q/E turn · Shift run · {jump} · drag to look · grab rocks · click a beacon', { jump: jumpHint(site?.environment?.gravity ?? 3.71) })
            : bodyId
              ? t('Drag to rotate · scroll to zoom · click a glowing pin')
              : t('Drag to rotate · click a body (● = has hotspots)')}
        </p>
      )}
      {mode === 'gyro' && <p className="hint">{t('Move your phone to look around · tap a pin or hold the centre dot on it')}</p>}
      {surface && inAR && <p className="notice">Tabletop model of {site?.name}. Exit AR and use Enter VR or Look around to stand on it.</p>}

      {(!session || inAR) && <MenuPanel />}
      <LoadingCard />
      <ProblemCard />
      {!inAR && <TourCaption />}
      <OfflinePill />
      <MissionBanner />
      <InfoCardPanel />
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  )
}

const CARDINALS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']

/** Astronaut suit readout: location, conditions, compass and distance walked. */
function SuitReadout({ site, credit }: { site: SiteContent; credit?: string }) {
  const [state, setState] = useState({ heading: 0, walked: 0, air: false })
  useEffect(() => {
    const t = setInterval(() => {
      if (xrStore.getState().session) return // not visible inside the headset
      setState({
        heading: Math.round(player.heading),
        walked: Math.round(Math.hypot(player.x - site.spawn.x, player.z - site.spawn.z)),
        air: player.airborne,
      })
    }, 150)
    return () => clearInterval(t)
  }, [site])
  const ticks = []
  for (let d = -90; d <= 90; d += 15) {
    const deg = (state.heading + d + 360) % 360
    const snapped = Math.round(deg / 15) * 15
    ticks.push({ off: d - (deg - snapped), label: snapped % 45 === 0 ? CARDINALS[(snapped / 45) % 8] : '' })
  }
  return (
    <>
      <div className="compass" aria-label={`Heading ${state.heading} degrees`}>
        {ticks.map((t, i) => (
          <span key={i} style={{ left: `${50 + (t.off / 180) * 100}%` }} className={t.label ? 'compass__major' : ''}>
            {t.label || '·'}
          </span>
        ))}
        <b>{state.heading}°</b>
      </div>
      <aside className="suit" aria-label="Suit readout">
        <h3>{t(site.region)}</h3>
        <dl>
          {site.conditions.map((c) => (
            <div key={c.label}>
              <dt>{t(c.label)}</dt>
              <dd>{t(c.value)}</dd>
            </div>
          ))}
          <div>
            <dt>{t('From landing spot')}</dt>
            <dd>
              {state.walked} m{state.air ? ` · ${t('airborne!')}` : ''}
            </dd>
          </div>
        </dl>
        <small>
          {t('Source:')}{' '}
          <a href={site.conditionsSource.url} target="_blank" rel="noopener noreferrer">
            {site.conditionsSource.label}
          </a>
          {credit ? ` · ${credit}` : ''}
        </small>
      </aside>
    </>
  )
}

function TouchMoveButtons() {
  const hold = (key: 'forward' | 'back') => ({
    onPointerDown: (e: React.PointerEvent) => {
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
      input[key] = true
    },
    onPointerUp: () => (input[key] = false),
    onPointerCancel: () => (input[key] = false),
  })
  return (
    <div className="move-pad">
      <button className="btn btn--pad" {...hold('forward')} aria-label={t('Walk forward')}>
        {t('▲ Walk')}
      </button>
      <button className="btn btn--pad" {...hold('back')} aria-label={t('Walk back')}>
        ▼
      </button>
      <button className="btn btn--pad" onPointerDown={() => (input.jump = true)} aria-label={t('Jump')}>
        {t('Jump')}
      </button>
    </div>
  )
}

/** On-screen mission card (desktop / phone / phone AR). */
function MissionBanner() {
  const card = useXRApp((s) => s.missionCard)
  if (!card) return null
  return (
    <div className={`mission-card${card.done ? ' mission-card--done' : ''}`} role="status">
      <small>
        {card.done ? t('Mission goal complete ✓') : t('Mission')} · {t(card.mission)} · {card.progress}
      </small>
      <strong>{t(card.goal)}</strong>
      <span>{card.hint}</span>
    </div>
  )
}

/** Desktop hint for jumping, matched to the site's gravity. */
function jumpHint(g: number) {
  if (g < 0.05) return t('no jumping here (you would reach escape speed!)')
  return t("Space jump ({n}% of Earth's gravity)", { n: Math.round((g / 9.81) * 100) })
}

const LOADING_TIPS = [
  'Tip: point at a glowing pin and select it to learn about it.',
  'Tip: on the surface, grab a loose rock and throw it in low gravity.',
  'Tip: open the menu (left palm up in VR, or ⚙ Menu) for missions and travel.',
  'Fact: Mars’ gravity is 38% of Earth’s; the Moon’s is 17%.',
  'Fact: Bennu is so small that a gentle toss can send a pebble into space.',
]

/** On-screen loading card with progress while a scene is prepared. */
function LoadingCard() {
  const active = useLoading((s) => s.active)
  const label = useLoading((s) => s.label)
  const progress = useLoading((s) => s.progress)
  const [tip] = useState(() => LOADING_TIPS[Math.floor(Math.random() * LOADING_TIPS.length)])
  const what = t(label)
  if (!active) return null
  return (
    <div className="loading-card" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} aria-label={t('Preparing {x}…', { x: what })}>
      <div className="loading-spinner" aria-hidden />
      <strong>{t('Preparing {x}…', { x: what })}</strong>
      <div className="loading-bar">
        <i style={{ width: `${Math.max(3, progress * 100)}%` }} />
      </div>
      <small>{t(tip)}</small>
    </div>
  )
}

/** Something went wrong or is very slow: say what, and offer Retry and a way home (never an empty scene). */
function ProblemCard() {
  const problem = useLoading((s) => s.problem)
  if (!problem) return null
  const text = PROBLEM_TEXT[problem.kind]
  return (
    <div className="problem-card" role="alert">
      <strong>{text.title(problem.what)}</strong>
      <p>{text.body()}</p>
      <div className="problem-card__actions">
        <button className="btn btn--primary" onClick={retryScene}>
          {t('Retry')}
        </button>
        <button className="btn" onClick={() => useXRApp.getState().selectBody(null)}>
          {t('Solar System')}
        </button>
      </div>
    </div>
  )
}

function OfflinePill() {
  const offline = useLoading((s) => s.offline)
  const problem = useLoading((s) => s.problem)
  if (!offline || problem) return null
  return (
    <div className="offline-pill" role="status">
      {t('Offline · places you have visited still work')}
    </div>
  )
}

/** "Guided tour" for first-time visitors: starts at the Solar System and visits Mars, Victoria, Gale and Jezero. */
function TourButton() {
  const running = useXRApp((s) => s.tourStep !== null)
  if (running) return null
  return (
    <button className="btn btn--accent" onClick={() => useXRApp.getState().setTourStep(0)} title={t('Start the guided tour')}>
      ▶ {t('Guided tour')}
    </button>
  )
}

/** In AR (phone): what to place in the room. */
function RoomChoices() {
  const bodyId = useXRApp((s) => s.bodyId)
  const siteId = useXRApp((s) => s.siteId)
  const model = useXRApp((s) => s.arModel)
  const app = useXRApp.getState
  const pick = (body: string | null) => {
    app().setArModel('scene')
    app().selectBody(body)
  }
  return (
    <nav className="body-chips room-chips" aria-label={t('Place in your room')}>
      {ROOM_CHOICES.map((c) => {
        const on = c.id === 'rover' ? model === 'rover' : model === 'scene' && !siteId && bodyId === c.body
        return (
          <button key={c.id} className={`chip${on ? ' chip--live' : ''}`} aria-pressed={on} onClick={() => (c.id === 'rover' ? app().setArModel('rover') : pick(c.body))}>
            {t(c.label)}
          </button>
        )
      })}
    </nav>
  )
}
