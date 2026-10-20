import { useEffect, useState } from 'react'
import type { BodyContent, SiteContent } from './types'

// content/bodies/<id>.json and content/sites/<id>.json, bundled lazily (one chunk each)
const bodyLoaders = import.meta.glob<BodyContent>('/content/bodies/*.json', { import: 'default' })
const siteLoaders = import.meta.glob<SiteContent>('/content/sites/*.json', { import: 'default' })
const cache = new Map<string, Promise<unknown>>()

function load<T>(loaders: Record<string, () => Promise<T>>, key: string): Promise<T | null> {
  let p = cache.get(key) as Promise<T | null> | undefined
  if (!p) {
    const loader = loaders[key]
    p = loader ? loader().catch(() => null) : Promise.resolve(null)
    cache.set(key, p)
  }
  return p
}

export function hasContent(id: string) {
  return `/content/bodies/${id}.json` in bodyLoaders
}

export function loadBodyContent(id: string): Promise<BodyContent | null> {
  return load(bodyLoaders, `/content/bodies/${id}.json`)
}

export function loadSiteContent(id: string): Promise<SiteContent | null> {
  return load(siteLoaders, `/content/sites/${id}.json`)
}

export const SITE_IDS = Object.keys(siteLoaders).map((k) => k.replace(/^.*\/(.+)\.json$/, '$1'))

function useLoaded<T>(id: string | null, loader: (id: string) => Promise<T | null>): T | null | undefined {
  const [state, setState] = useState<{ id: string | null; value: T | null | undefined }>({ id, value: undefined })
  useEffect(() => {
    if (!id) return
    let alive = true
    loader(id).then((value) => alive && setState({ id, value }))
    return () => {
      alive = false
    }
  }, [id, loader])
  if (!id) return null
  return state.id === id ? state.value : undefined
}

/** undefined while loading, null when the body has no content file. */
export function useBodyContent(id: string | null): BodyContent | null | undefined {
  return useLoaded(id, loadBodyContent)
}

export function useSiteContent(id: string | null): SiteContent | null | undefined {
  return useLoaded(id, loadSiteContent)
}

/** All surface sites on a body (loads every site file; they are small). */
export function useSitesForBody(bodyId: string | null): SiteContent[] {
  const [sites, setSites] = useState<SiteContent[]>([])
  useEffect(() => {
    let alive = true
    Promise.all(SITE_IDS.map(loadSiteContent)).then(
      (all) => alive && setSites(all.filter((s): s is SiteContent => !!s && s.body === bodyId)),
    )
    return () => {
      alive = false
    }
  }, [bodyId])
  return bodyId ? sites : []
}
