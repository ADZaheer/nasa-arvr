import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Euler, MathUtils, Quaternion, Vector3 } from 'three'
import { useXRApp } from './store'

/**
 * Phone "magic window": the camera follows device orientation (DeviceOrientationEvent).
 * The heading when the first reading arrives becomes "forward", so the scene starts in view.
 */
export function GyroControls() {
  const camera = useThree((s) => s.camera)
  const reading = useRef<{ a: number; b: number; g: number } | null>(null)
  const alpha0 = useRef<number | null>(null)
  const tmp = useMemo(
    () => ({
      euler: new Euler(),
      q0: new Quaternion(),
      q1: new Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)), // camera looks out the back of the device
      zee: new Vector3(0, 0, 1),
    }),
    [],
  )

  useEffect(() => {
    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.alpha == null) return
      reading.current = { a: e.alpha, b: e.beta ?? 0, g: e.gamma ?? 0 }
      if (alpha0.current == null) alpha0.current = e.alpha
    }
    window.addEventListener('deviceorientation', onOrient)
    const timeout = setTimeout(() => {
      if (!reading.current) {
        const s = useXRApp.getState()
        s.setGyroEnabled(false)
        s.showToast('No motion-sensor data, so switched to touch controls')
      }
    }, 2000)
    return () => {
      window.removeEventListener('deviceorientation', onOrient)
      clearTimeout(timeout)
    }
  }, [])

  useFrame(() => {
    const r = reading.current
    if (!r) return
    const orient = MathUtils.degToRad((screen.orientation?.angle ?? 0) as number)
    const { euler, q0, q1, zee } = tmp
    euler.set(MathUtils.degToRad(r.b), MathUtils.degToRad(r.a - (alpha0.current ?? 0)), -MathUtils.degToRad(r.g), 'YXZ')
    camera.quaternion.setFromEuler(euler)
    camera.quaternion.multiply(q1)
    camera.quaternion.multiply(q0.setFromAxisAngle(zee, -orient))
  })

  return null
}
