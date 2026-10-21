/** Shared, non-reactive player/input state for surface mode (read by the HUD on a timer, not every frame). */
export const player = {
  x: 0,
  z: 0,
  /** metres above the elevation model's lowest point */
  ground: 0,
  /** heading in degrees clockwise from north */
  heading: 0,
  airborne: false,
}

export const input = {
  forward: false,
  back: false,
  left: false,
  right: false,
  run: false,
  jump: false,
  turnLeft: false,
  turnRight: false,
}

/** Mars surface gravity, m/s² */
export const MARS_G = 3.71
export const EYE_HEIGHT = 1.7
