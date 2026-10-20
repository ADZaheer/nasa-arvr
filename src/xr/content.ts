import { useEffect, useState } from 'react'
import type { BodyContent } from './types'

// content/bodies/<id>.json, bundled lazily (one chunk per body)
const loaders = import.meta.glob<BodyContent>('/content/bodies/*.json', { import: 'default' })
const cache = new Map<string, Promise<BodyContent | null>>()

export function hasContent(id: string) {
  return `/content/bodies/${id}.json` in loaders
}

export function loadBodyContent(id: string): Promise<BodyContent | null> {
  let p = cache.get(id)
  if (!p) {
    const loader = loaders[`/content/bodies/${id}.json`]
    p = loader ? loader().catch(() => null) : Promise.resolve(null)
    cache.set(id, p)
  }
  return p
}

/** undefined while loading, null when the body has no content file. */
export function useBodyContent(id: string | null): BodyContent | null | undefined {
  const [state, setState] = useState<{ id: string | null; content: BodyContent | null | undefined }>({ id, content: undefined })
  useEffect(() => {
    if (!id) return
    let alive = true
    loadBodyContent(id).then((content) => alive && setState({ id, content }))
    return () => {
      alive = false
    }
  }, [id])
  if (!id) return null
  return state.id === id ? state.content : undefined
}
