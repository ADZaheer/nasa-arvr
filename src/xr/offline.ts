import { create } from 'zustand'

/**
 * Offline support (production builds): registers the service worker, which keeps what you've already used
 * on the device, and offers "Save for offline" to download everything at once before an event, so the
 * expedition keeps working if the venue Wi-Fi drops.
 */
interface OfflineState {
  supported: boolean
  /** 0..1 while saving, null otherwise */
  progress: number | null
  ready: boolean
  error: string | null
  sizeMB: number | null
}
const READY_KEY = 'cosmic-xr-offline-ready'
const readyFlag = () => {
  try {
    return localStorage.getItem(READY_KEY) === '1'
  } catch {
    return false
  }
}
export const useOffline = create<OfflineState>(() => ({
  supported: typeof navigator !== 'undefined' && 'serviceWorker' in navigator && import.meta.env.PROD,
  progress: null,
  ready: readyFlag(),
  error: null,
  sizeMB: null,
}))

export function registerServiceWorker() {
  if (!useOffline.getState().supported) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((e) => console.warn('[offline] service worker failed', e))
    fetch('/offline-manifest.json', { cache: 'no-store' })
      .then((r) => r.json())
      .then((m: { bytes: number }) => useOffline.setState({ sizeMB: Math.round(m.bytes / 1e6) }))
      .catch(() => {})
  })
}

export async function saveForOffline() {
  const reg = await navigator.serviceWorker.ready
  const sw = reg.active
  if (!sw) return
  useOffline.setState({ progress: 0, error: null })
  const channel = new MessageChannel()
  channel.port1.onmessage = (e: MessageEvent<{ done?: number; total?: number; finished?: boolean; error?: string }>) => {
    const d = e.data
    if (d.error) return useOffline.setState({ progress: null, error: d.error })
    if (d.total) useOffline.setState({ progress: (d.done ?? 0) / d.total })
    if (d.finished) {
      try {
        localStorage.setItem(READY_KEY, '1')
      } catch {
        /* ignore */
      }
      useOffline.setState({ progress: null, ready: true })
    }
  }
  sw.postMessage({ type: 'precache' }, [channel.port2])
}
