import { useEffect, useRef } from 'react'
import { useStore } from 'zustand'
import { xrStore } from './xrStore'
import { useXRApp } from './store'
import { requestGyroPermission, useDeviceCaps } from './device'
import { BODIES, BODY_BY_ID, KIND_COLORS } from './bodies'
import { hasContent, useBodyContent } from './content'
import { InfoCardPanel, KIND_LABEL } from './InfoCard'
import type { HotspotKind } from './types'

/**
 * DOM heads-up display. Rendered normally on desktop/gyro, and inside the WebXR DOM overlay in
 * handheld AR (a separate React root), so it must not use router hooks; navigation goes via the store.
 */
export function Hud({ inAR = false }: { inAR?: boolean }) {
  const caps = useDeviceCaps()
  const session = useStore(xrStore, (s) => s.session)
  const bodyId = useXRApp((s) => s.bodyId)
  const mode = useXRApp((s) => s.mode)
  const gyroEnabled = useXRApp((s) => s.gyroEnabled)
  const placed = useXRApp((s) => s.arAnchor !== null)
  const toast = useXRApp((s) => s.toast)
  const content = useBodyContent(bodyId)
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

  const name = bodyId ? (content?.name ?? BODY_BY_ID[bodyId]?.name ?? bodyId) : null
  const shapeIsIllustration = useXRApp((s) => s.shapeIsIllustration)
  const credit = content?.textureCredit ?? (shapeIsIllustration ? 'Shape: procedural illustration (no model file found)' : content?.modelCredit)

  return (
    <div className={`hud${inAR ? ' hud--ar' : ''}`} ref={root}>
      <header className="hud__bar">
        <div className="hud__title">
          {bodyId ? (
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

      {!bodyId && !inAR && (
        <nav className="body-chips" aria-label="Destinations">
          <span className="badge">Not to scale</span>
          {BODIES.map((b) => (
            <button key={b.id} className={`chip${hasContent(b.id) ? ' chip--live' : ''}`} onClick={() => app().selectBody(b.id)}>
              {b.name}
            </button>
          ))}
        </nav>
      )}

      {bodyId && !inAR && (
        <div className="legend">
          {(Object.keys(KIND_COLORS) as HotspotKind[]).map((k) => (
            <span key={k}>
              <i style={{ background: KIND_COLORS[k] }} /> {KIND_LABEL[k]}
            </span>
          ))}
          {credit && <small className="credit">{credit}</small>}
        </div>
      )}

      {mode === 'desktop' && !inAR && <p className="hint">{bodyId ? 'Drag to rotate · scroll to zoom · click a glowing pin' : 'Drag to rotate · click a body (● = has hotspots)'}</p>}
      {mode === 'gyro' && <p className="hint">Move your phone to look around · tap a pin or hold the centre dot on it</p>}

      <InfoCardPanel />
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  )
}
