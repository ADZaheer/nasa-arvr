import { createXRStore } from '@react-three/xr'

/**
 * Single WebXR store. Controllers + hands give ray pointers in VR, screenInput/transientPointer
 * give screen taps in handheld AR, and the default gaze pointer covers gaze-only headsets.
 * Our own 1.5 s dwell (GazeDwell) works on top of these in every immersive mode.
 */
export const xrStore = createXRStore({
  // no-headset testing is handled by ./emulator.ts (?emulate), which can override desktop Chrome's navigator.xr
  emulate: false,
  // right controller: push the stick forward to aim a teleport arc (surface mode); left stick walks
  controller: { right: { teleportPointer: true } },
  offerSession: false,
  hitTest: true,
  domOverlay: true,
  // keep the session lean; these are not needed for the expedition
  planeDetection: false,
  meshDetection: false,
  anchors: false,
  layers: false,
})
