import { useEffect, type RefObject } from 'react'
import type { Object3D } from 'three'

/** Objects that can be selected by looking at them for DWELL_MS (gaze dwell). */
export const DWELL_MS = 1500
export const dwellTargets = new Map<Object3D, () => void>()
/** Objects that block gaze (e.g. the planet body), so pins on the far side cannot be dwell-selected. */
export const dwellOccluders = new Set<Object3D>()

export function useDwellTarget(ref: RefObject<Object3D | null>, onDwell: () => void, enabled = true) {
  useEffect(() => {
    const obj = ref.current
    if (!obj || !enabled) return
    dwellTargets.set(obj, onDwell)
    return () => {
      dwellTargets.delete(obj)
    }
  }, [ref, onDwell, enabled])
}

export function useDwellOccluder(ref: RefObject<Object3D | null>) {
  useEffect(() => {
    const obj = ref.current
    if (!obj) return
    dwellOccluders.add(obj)
    return () => {
      dwellOccluders.delete(obj)
    }
  })
}
