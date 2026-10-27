/**
 * Camera arrivals (desktop / touch only — never in a headset, where moving the view would cause motion
 * sickness): when a space scene opens, the camera glides in from further out with an ease-out curve instead
 * of cutting in. The intro's "Start" asks for a longer, more cinematic flight from deep space.
 */
export type FlyKind = 'scene' | 'intro'
export const cameraMotion = { request: null as FlyKind | null }

export function flyIn(kind: FlyKind) {
  cameraMotion.request = kind
}

export const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3)
export const easeInOutCubic = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)

export const prefersReducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
