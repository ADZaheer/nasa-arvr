import { useEffect, useState } from 'react'

export interface DeviceCaps {
  checked: boolean
  vr: boolean
  ar: boolean
  /** Device has orientation sensors worth offering (phone/tablet). */
  gyro: boolean
  /** iOS 13+ needs an explicit permission prompt from a user gesture. */
  gyroNeedsPermission: boolean
  secure: boolean
}

type DOEWithPermission = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<'granted' | 'denied'> }

async function supported(mode: XRSessionMode): Promise<boolean> {
  try {
    return (await navigator.xr?.isSessionSupported(mode)) ?? false
  } catch {
    return false
  }
}

export async function detectCaps(): Promise<DeviceCaps> {
  const [vr, ar] = await Promise.all([supported('immersive-vr'), supported('immersive-ar')])
  const hasDOE = typeof window !== 'undefined' && 'DeviceOrientationEvent' in window
  const touch = navigator.maxTouchPoints > 0 || matchMedia('(pointer: coarse)').matches
  return {
    checked: true,
    vr,
    ar,
    gyro: hasDOE && touch,
    gyroNeedsPermission: hasDOE && typeof (DeviceOrientationEvent as DOEWithPermission).requestPermission === 'function',
    secure: window.isSecureContext,
  }
}

export function useDeviceCaps(): DeviceCaps {
  const [caps, setCaps] = useState<DeviceCaps>({ checked: false, vr: false, ar: false, gyro: false, gyroNeedsPermission: false, secure: true })
  useEffect(() => {
    let alive = true
    detectCaps().then((c) => alive && setCaps(c))
    // headsets can report support late (e.g. after a device is plugged in)
    const onChange = () => detectCaps().then((c) => alive && setCaps(c))
    navigator.xr?.addEventListener?.('devicechange', onChange)
    return () => {
      alive = false
      navigator.xr?.removeEventListener?.('devicechange', onChange)
    }
  }, [])
  return caps
}

/** Must be called from a user gesture on iOS. */
export async function requestGyroPermission(): Promise<boolean> {
  const DOE = (window as unknown as { DeviceOrientationEvent?: DOEWithPermission }).DeviceOrientationEvent
  if (!DOE) return false
  if (typeof DOE.requestPermission !== 'function') return true
  try {
    return (await DOE.requestPermission()) === 'granted'
  } catch {
    return false
  }
}
