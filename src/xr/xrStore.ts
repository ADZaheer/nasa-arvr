import { createXRStore } from '@react-three/xr'

/** Preferred headset refresh rate. Quest 3 supports 72/80/90/120 Hz; the library default picks the highest
 *  (120 Hz = 8.3 ms per frame), which a browser scene misses and then judders. 72 Hz gives 13.9 ms. */
export const TARGET_HZ = 72

/**
 * Single WebXR store. Controllers + hands give ray pointers in VR, screenInput/transientPointer
 * give screen taps in handheld AR, and the default gaze pointer covers gaze-only headsets.
 * Our own 1.5 s dwell (GazeDwell) works on top of these in every immersive mode.
 */
type StoreOptions = NonNullable<Parameters<typeof createXRStore>[0]>
const options: StoreOptions = {
  // no-headset testing is handled by ./emulator.ts (?emulate), which can override desktop Chrome's navigator.xr
  emulate: false,
  // performance: steady 72 Hz, maximum fixed foveated rendering (cheaper pixels at the edge of the lenses)
  frameRate: (rates) => {
    const list = Array.from(rates)
    return list.includes(TARGET_HZ) ? TARGET_HZ : (list.filter((r) => r >= 60).sort((a, b) => a - b)[0] ?? false)
  },
  foveation: 1,
  // only the pointers we use: rays everywhere, a teleport arc on the right stick (surface mode).
  // Grab pointers are disabled (each pointer costs scene intersection tests every frame; raycasts use a BVH).
  // Hands keep the touch pointer so you can poke the wrist menu with a fingertip.
  controller: {
    default: { grabPointer: false },
    right: { grabPointer: false, teleportPointer: true },
  },
  hand: { grabPointer: false },
  offerSession: false,
  hitTest: true,
  domOverlay: true,
  // keep the session lean; these are not needed for the expedition
  planeDetection: false,
  meshDetection: false,
  depthSensing: false,
  anchors: false,
  layers: false,
}
export const xrStore = createXRStore(options)

/** A headset browser (Meta Quest), as opposed to a phone: AR is then passthrough "View in my room". */
export const IS_HEADSET = typeof navigator !== 'undefined' && /OculusBrowser|Quest|Pico|Wolvic/i.test(navigator.userAgent)

/**
 * Enter VR, or "View in my room" (passthrough AR). Room features are only requested for AR: plane
 * detection (better placement on tables and floors) and GPU depth sensing, which three.js uses to let
 * real things, such as your hands and furniture, hide virtual objects behind them. The store reads these
 * options when a session starts, so they are switched just before.
 */
export async function enterImmersive(mode: 'vr' | 'ar') {
  // Every extra is optional, but some phones still refuse a session that merely asks for an extra they
  // can't provide (e.g. Chrome on Android rejects GPU depth sensing with "the specified session
  // configuration is not supported"). So try the richest set first and fall back step by step.
  const presets: Partial<StoreOptions>[] =
    mode === 'vr'
      ? [{ planeDetection: false, depthSensing: false, hitTest: true, domOverlay: true, handTracking: true }, BARE]
      : [
          ...(IS_HEADSET ? [{ planeDetection: true, depthSensing: true, hitTest: true, domOverlay: true, handTracking: true }] : []),
          { planeDetection: false, depthSensing: false, hitTest: true, domOverlay: true, handTracking: true },
          { planeDetection: false, depthSensing: false, hitTest: true, domOverlay: false, handTracking: false },
          BARE,
        ]
  let last: unknown
  for (const p of presets) {
    Object.assign(options, p)
    try {
      return await (mode === 'vr' ? xrStore.enterVR() : xrStore.enterAR())
    } catch (e) {
      last = e
      // only "this combination isn't supported" is worth retrying with fewer extras
      if ((e as { name?: string })?.name !== 'NotSupportedError') break
    }
  }
  throw last
}
const BARE: Partial<StoreOptions> = { planeDetection: false, depthSensing: false, hitTest: false, domOverlay: false, handTracking: false }

/** A plain-language explanation (and what to try) for a failed VR/AR start. */
export function xrErrorMessage(e: unknown, mode: 'vr' | 'ar'): string {
  const name = (e as { name?: string })?.name
  if (name === 'NotSupportedError')
    return mode === 'ar'
      ? 'This device’s browser can’t open AR. Try Chrome, and update “Google Play Services for AR” in the Play Store. You can still use Look around.'
      : 'This device’s browser can’t open VR. On Meta Quest, use the built-in Browser.'
  if (name === 'SecurityError' || name === 'NotAllowedError') return 'The browser blocked it. Allow camera and motion access for this site, then try again.'
  if (name === 'InvalidStateError') return 'Another AR or VR view is already open. Close it and try again.'
  return mode === 'ar' ? 'AR could not start on this device. You can still use Look around.' : 'VR could not start on this device.'
}

// Debug handle in dev builds: window.__xrStore
if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as { __xrStore: typeof xrStore }).__xrStore = xrStore
