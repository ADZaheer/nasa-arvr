import { useEffect, useRef, useState } from 'react'
import { useStore } from 'zustand'
import { xrStore } from './xrStore'
import { useXRApp } from './store'
import { requestGyroPermission, useDeviceCaps } from './device'
import { BODIES, BODY_BY_ID, KIND_COLORS } from './bodies'
import { hasContent, useBodyContent, useSiteContent, useSitesForBody } from './content'
import { InfoCardPanel, KIND_LABEL } from './InfoCard'
import { MenuPanel } from './MenuPanel'
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
  const content = useBodyContent(siteId ? null : bodyId)
  const site = useSiteContent(siteId)
  const sites = useSitesForBody(siteId ? null : bodyId)
  const root = useRef<HTMLDivElement>(null)

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
    ;(m === 'vr' ? xrStore.enterVR() : xrStore.enterAR()).catch((e) => app().showToast(`Could not start ${m.toUpperCase()}: ${e?.message ?? e}`))
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
              ◂ Back to orbit
            </button>
          ) : bodyId ? (
            <button className="btn btn--ghost" onClick={() => app().selectBody(null)}>
              ◂ Solar System
            </button>
          ) : (
            <span className="brand">AR Cosmic Expedition</span>
          )}
          {name && <span className="crumb">{name}</span>}
        </div>
        <div className="hud__modes">
          {!session && caps.vr && (
            <button className="btn btn--primary" onClick={() => enter('vr')}>
              Enter VR
            </button>
          )}
          {!session && caps.ar && (
            <button className="btn btn--primary" onClick={() => enter('ar')}>
              Enter AR
            </button>
          )}
          {!session && caps.gyro && !gyroEnabled && (
            <button className="btn" onClick={startGyro}>
              Look around (motion)
            </button>
          )}
          {!session && gyroEnabled && (
            <button className="btn" onClick={() => app().setGyroEnabled(false)}>
              Touch controls
            </button>
          )}
          {inAR && placed && (
            <button className="btn" onClick={() => app().setArAnchor(null)}>
              Move model
            </button>
          )}
          {session && (
            <button className="btn" onClick={() => session.end()}>
              Exit {mode === 'ar' ? 'AR' : 'VR'}
            </button>
          )}
        </div>
      </header>

      {!caps.secure && <p className="notice notice--warn">Open this page over HTTPS: WebXR and motion sensors are disabled on insecure pages.</p>}
      {inAR && !placed && <p className="notice">Point your phone at a table and tap to place the model.</p>}

      {!bodyId && !surface && !inAR && (
        <nav className="body-chips" aria-label="Destinations">
          <span className="badge">Not to scale</span>
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
              <span>Stand on the surface:</span>
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
                <i style={{ background: KIND_COLORS[k] }} /> {KIND_LABEL[k]}
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
            ? 'W A S D walk · Shift run · Space jump (38% gravity!) · drag to look · click a beacon'
            : bodyId
              ? 'Drag to rotate · scroll to zoom · click a glowing pin'
              : 'Drag to rotate · click a body (● = has hotspots)'}
        </p>
      )}
      {mode === 'gyro' && <p className="hint">Move your phone to look around · tap a pin or hold the centre dot on it</p>}
      {surface && inAR && <p className="notice">Tabletop model of {site?.name}. Exit AR and use Enter VR or Look around to stand on it.</p>}

      {(!session || inAR) && <MenuPanel />}
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
        <h3>{site.region}</h3>
        <dl>
          {site.conditions.map((c) => (
            <div key={c.label}>
              <dt>{c.label}</dt>
              <dd>{c.value}</dd>
            </div>
          ))}
          <div>
            <dt>From landing spot</dt>
            <dd>
              {state.walked} m{state.air ? ' · airborne!' : ''}
            </dd>
          </div>
        </dl>
        <small>
          Source:{' '}
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
      <button className="btn btn--pad" {...hold('forward')} aria-label="Walk forward">
        ▲ Walk
      </button>
      <button className="btn btn--pad" {...hold('back')} aria-label="Walk back">
        ▼
      </button>
      <button className="btn btn--pad" onPointerDown={() => (input.jump = true)} aria-label="Jump">
        Jump
      </button>
    </div>
  )
}
