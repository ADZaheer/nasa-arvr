import { useEffect, useRef } from 'react'
import { matchPath, useLocation, useNavigate } from 'react-router-dom'
import { useXRApp } from './store'
import { loadSiteContent } from './content'

/**
 * Two-way sync between the URL and the shared store so the web viewer can deep-link:
 *   /xr                        → Solar System hub
 *   /xr/body/:id?band=…&obs=…  → body explorer (band / observation passed through to the store)
 *   /xr/surface/:siteId        → stand on the surface (content/sites/<siteId>.json)
 */
export function RouteSync() {
  const loc = useLocation()
  const navigate = useNavigate()
  const bodyId = useXRApp((s) => s.bodyId)
  const siteId = useXRApp((s) => s.siteId)
  const ready = useRef(false)

  // URL → store
  useEffect(() => {
    if (!loc.pathname.startsWith('/xr')) {
      navigate('/xr' + loc.search, { replace: true })
      return
    }
    const body = matchPath('/xr/body/:id', loc.pathname)
    const surface = matchPath('/xr/surface/:siteId', loc.pathname)
    const sp = new URLSearchParams(loc.search)
    const s = useXRApp.getState()
    const sid = surface?.params.siteId
    if (sid) {
      if (s.siteId !== sid) {
        s.selectSite(sid, s.bodyId ?? '')
        loadSiteContent(sid).then((site) => {
          if (site && useXRApp.getState().siteId === sid) useXRApp.setState({ bodyId: site.body })
        })
      }
    } else s.selectBody(body?.params.id ?? null)
    s.setBand(sp.get('band'))
    s.setObservation(sp.get('obs'))
    ready.current = true
  }, [loc.pathname, loc.search, navigate])

  // store → URL (e.g. picking a body inside VR). Reads the live store value: on first mount the
  // effect above has just set it from the URL, and the rendered values are still the stale defaults.
  useEffect(() => {
    if (!ready.current) return
    const { bodyId: id, siteId: site } = useXRApp.getState()
    const target = site ? `/xr/surface/${encodeURIComponent(site)}` : id ? `/xr/body/${encodeURIComponent(id)}` : '/xr'
    if (loc.pathname !== target) navigate(target + loc.search)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bodyId, siteId])

  return null
}
