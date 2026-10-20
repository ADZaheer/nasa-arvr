import { useEffect, useRef } from 'react'
import { matchPath, useLocation, useNavigate } from 'react-router-dom'
import { useXRApp } from './store'

/**
 * Two-way sync between the URL and the shared store so the web viewer can deep-link:
 *   /xr                        → Solar System hub
 *   /xr/body/:id?band=…&obs=…  → body explorer (band / observation passed through to the store)
 */
export function RouteSync() {
  const loc = useLocation()
  const navigate = useNavigate()
  const bodyId = useXRApp((s) => s.bodyId)
  const ready = useRef(false)

  // URL → store
  useEffect(() => {
    if (!loc.pathname.startsWith('/xr')) {
      navigate('/xr' + loc.search, { replace: true })
      return
    }
    const m = matchPath('/xr/body/:id', loc.pathname)
    const sp = new URLSearchParams(loc.search)
    const s = useXRApp.getState()
    s.selectBody(m?.params.id ?? null)
    s.setBand(sp.get('band'))
    s.setObservation(sp.get('obs'))
    ready.current = true
  }, [loc.pathname, loc.search, navigate])

  // store → URL (e.g. picking a body inside VR). Reads the live store value: on first mount the
  // effect above has just set it from the URL, and the rendered `bodyId` is still the stale default.
  useEffect(() => {
    if (!ready.current) return
    const id = useXRApp.getState().bodyId
    const target = id ? `/xr/body/${encodeURIComponent(id)}` : '/xr'
    if (loc.pathname !== target) navigate(target + loc.search)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bodyId])

  return null
}
