import { useEffect, useState } from 'react'
import { useXRApp } from './store'
import { BODY_BY_ID } from './bodies'
import { useSiteContent, useSitesForBody } from './content'
import { requestGyroPermission, type DeviceCaps } from './device'
import { IS_HEADSET, enterImmersive, xrErrorMessage } from './xrStore'
import { t } from './i18n'

/**
 * "How do you want to explore?" — every way in, in plain words: what it is, what you need, and where it
 * takes you. Options the device can't do stay visible but greyed out with the reason, so nobody wonders
 * where a button went. Each option's action matches its label (e.g. "Walk on Mars in VR" lands you on Mars).
 */
type Option = {
  id: 'screen' | 'vr' | 'ar' | 'look'
  icon: string
  title: string
  desc: string
  primary?: boolean
  disabled?: string
  run: () => void
}

const SEEN_KEY = 'cosmic-xr-modes-seen'

/** Where "walk on…" options take you from here: this site, a site on this body, else Victoria Crater on Mars. */
function useWalkTarget(): { id: string; body: string; name: string } {
  const bodyId = useXRApp((s) => s.bodyId)
  const siteId = useXRApp((s) => s.siteId)
  const site = useSiteContent(siteId)
  const sites = useSitesForBody(siteId ? null : bodyId)
  if (siteId && site) return { id: site.id, body: site.body, name: t(site.name) }
  const first = sites[0]
  if (first) return { id: first.id, body: first.body, name: t(first.name) }
  return { id: 'victoria', body: 'mars', name: t('Mars') }
}

export function ModePicker({ caps, onClose }: { caps: DeviceCaps; onClose: () => void }) {
  useXRApp((s) => s.settings.lang)
  const bodyId = useXRApp((s) => s.bodyId)
  const siteId = useXRApp((s) => s.siteId)
  const walk = useWalkTarget()
  const app = useXRApp.getState
  // AR shows the place you're looking at as a table-top model; from the Solar System that is Mars
  const arBody = bodyId ?? 'mars'
  const arName = siteId ? walk.name : t(BODY_BY_ID[arBody]?.name ?? arBody)
  const viewHere = !!bodyId && !siteId
  const hereName = bodyId ? t(BODY_BY_ID[bodyId]?.name ?? bodyId) : ''

  const go = (fn: () => void) => () => {
    onClose()
    fn()
  }
  const failed = (m: 'vr' | 'ar') => (e: unknown) => {
    console.warn('[xr] could not start', m, e)
    app().showToast(t(xrErrorMessage(e, m)), 9000)
  }
  const insecure = caps.secure ? undefined : t('Needs a secure link (https://)')

  const options: Option[] = [
    {
      id: 'screen',
      icon: '🖥️',
      title: t('Walk on {x} on screen', { x: walk.name }),
      desc: t('Use mouse and keys, or touch. Works on any device.'),
      primary: true,
      run: go(() => {
        app().setGyroEnabled(false)
        app().selectSite(walk.id, walk.body)
      }),
    },
    {
      id: 'vr',
      icon: '🥽',
      // in an orbit view or the SPHEREx table, VR shows this same view; elsewhere it puts you on the ground
      title: viewHere ? t('View {x} in VR', { x: hereName }) : t('Walk on {x} in VR', { x: walk.name }),
      desc: viewHere ? t('See it in 3D all around you with a VR headset such as Meta Quest.') : t('Stand there in full 360° with a VR headset such as Meta Quest.'),
      disabled: insecure ?? (caps.vr ? undefined : t('No VR headset on this device')),
      run: go(() => {
        app().setGyroEnabled(false)
        if (!viewHere) app().selectSite(walk.id, walk.body)
        enterImmersive('vr').catch(failed('vr'))
      }),
    },
    {
      id: 'ar',
      icon: IS_HEADSET ? '🏠' : '📱',
      title: IS_HEADSET ? t('{x} in my room', { x: arName }) : t('{x} on your table (AR)', { x: arName }),
      desc: IS_HEADSET
        ? t('See a 3D model in your real room, or a life-size rover, with passthrough.')
        : t('Point your camera at a table to place a small 3D model of it. You stay in your room.'),
      disabled: insecure ?? (caps.ar ? undefined : t('This device’s browser can’t do AR')),
      run: go(() => {
        app().setGyroEnabled(false)
        if (!siteId) app().selectBody(arBody)
        app().setArModel('scene')
        enterImmersive('ar').catch(failed('ar'))
      }),
    },
    {
      id: 'look',
      icon: '🔄',
      title: t('Look around {x} with your phone', { x: walk.name }),
      desc: t('Turn your phone in any direction to look around, no headset needed.'),
      disabled: insecure ?? (caps.gyro ? undefined : t('Needs a phone or tablet with motion sensors')),
      run: go(async () => {
        app().selectSite(walk.id, walk.body)
        if (await requestGyroPermission()) app().setGyroEnabled(true)
        else app().showToast(t('Motion access was denied, so using touch controls'))
      }),
    },
  ]
  return (
    <section className="mode-picker" aria-label={t('How do you want to explore?')}>
      <header>
        <strong>{t('How do you want to explore?')}</strong>
        <button className="icon-btn" aria-label={t('Close')} onClick={onClose}>
          ×
        </button>
      </header>
      <div className="mode-list">
        {options.map((o) => (
          <button key={o.id} className={`mode${o.primary ? ' mode--primary' : ''}`} disabled={!!o.disabled} onClick={o.run}>
            <span className="mode__icon" aria-hidden>
              {o.icon}
            </span>
            <span className="mode__text">
              <b>{o.title}</b>
              <small>{o.disabled ?? o.desc}</small>
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}

/** Header button + the picker, open by default on a first visit to the Solar System. */
export function ModePickerToggle({ caps }: { caps: DeviceCaps }) {
  const atHub = useXRApp((s) => !s.bodyId && !s.siteId)
  const [open, setOpen] = useState(() => {
    try {
      return atHub && !sessionStorage.getItem(SEEN_KEY)
    } catch {
      return atHub
    }
  })
  useEffect(() => {
    if (!open) return
    try {
      sessionStorage.setItem(SEEN_KEY, '1')
    } catch {
      /* private mode */
    }
  }, [open])
  return (
    <>
      <button className="btn btn--primary" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {t('Ways to explore')} ▾
      </button>
      {open && caps.checked && <ModePicker caps={caps} onClose={() => setOpen(false)} />}
    </>
  )
}
