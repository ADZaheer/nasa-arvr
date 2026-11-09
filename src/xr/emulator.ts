/**
 * No-headset testing: open any page with ?emulate to install a simulated Meta Quest 3 (IWER, by Meta)
 * with an on-screen panel to move the headset and controllers. Forces install even when the browser
 * already exposes a native navigator.xr (desktop Chrome does, with no headset attached).
 */
export const EMULATE = typeof location !== 'undefined' && new URLSearchParams(location.search).has('emulate')

export async function startEmulator(): Promise<void> {
  const [{ XRDevice, metaQuest3 }, { DevUI }] = await Promise.all([import('iwer'), import('@iwer/devui')])
  const device = new XRDevice(metaQuest3)
  device.installRuntime({ forceInstall: true })
  device.installDevUI(DevUI)
  ;(window as unknown as { __xrDevice: unknown }).__xrDevice = device
  // for automated tests (scripts/smoke-xr.mjs): read loading state and change scenes from outside
  const [{ useLoading }, { useXRApp }] = await Promise.all([import('./loading'), import('./store')])
  ;(window as unknown as { __xrTest: unknown }).__xrTest = { useLoading, useXRApp }
}
