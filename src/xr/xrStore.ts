import { createXRStore } from '@react-three/xr'

/** Preferred headset refresh rate. Quest 3 supports 72/80/90/120 Hz; the library default picks the highest
 *  (120 Hz = 8.3 ms per frame), which a browser scene misses and then judders. 72 Hz gives 13.9 ms. */
export const TARGET_HZ = 72

/**
 * Single WebXR store. Controllers + hands give ray pointers in VR, screenInput/transientPointer
 * give screen taps in handheld AR, and the default gaze pointer covers gaze-only headsets.
 * Our own 1.5 s dwell (GazeDwell) works on top of these in every immersive mode.
 */
export const xrStore = createXRStore({
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
  anchors: false,
  layers: false,
})
