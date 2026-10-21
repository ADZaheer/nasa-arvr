import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BackSide, Color, ShaderMaterial, Vector3, type Mesh } from 'three'
import { viewCamera } from '../viewCamera'

export const MARS_HORIZON = '#c99a76'

const DAY_ZENITH = new Color('#8f5f43')
const DAY_HORIZON = new Color(MARS_HORIZON)
const DUSK_ZENITH = new Color('#2e2321')
const DUSK_HORIZON = new Color('#7d6152')
const BLUE = new Color('#9db8e6')

/**
 * Mars sky for a time of day (0 sunrise … 0.5 noon … 1 sunset). The sun rises in the east and sets in the west.
 * By day the dusty sky is butterscotch; near sunrise/sunset fine dust scatters blue light forward, giving
 * the blue glow around the sun photographed by NASA's rovers. Colours are an artistic approximation.
 */
export function marsSky(timeOfDay: number) {
  const t = Math.min(1, Math.max(0, timeOfDay))
  const elevation = Math.max(1.5, Math.sin(Math.PI * t) * 62) // degrees
  const azimuth = 90 + 180 * t // east → south → west
  const el = (elevation * Math.PI) / 180, az = (azimuth * Math.PI) / 180
  const sunDir: [number, number, number] = [Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)]
  const day = Math.min(1, Math.max(0, (elevation - 2) / 20)) // 0 at the horizon, 1 above ~22°
  const zenith = DUSK_ZENITH.clone().lerp(DAY_ZENITH, day)
  const horizon = DUSK_HORIZON.clone().lerp(DAY_HORIZON, day)
  return {
    sunDir,
    zenith,
    horizon,
    glowStrength: 0.5 + (1 - day) * 0.95,
    glowPower: 24 - (1 - day) * 13,
    light: 0.5 + 1.9 * day,
    ambient: 0.35 + 0.6 * day,
    lightColor: new Color('#fff0dc').lerp(new Color('#e8ecff'), (1 - day) * 0.5),
  }
}
export type MarsSkyState = ReturnType<typeof marsSky>

export function MarsSky({ sky, radius }: { sky: MarsSkyState; radius: number }) {
  const ref = useRef<Mesh>(null)
  const material = useMemo(
    () =>
      new ShaderMaterial({
        side: BackSide,
        depthWrite: false,
        depthTest: false,
        fog: false,
        uniforms: {
          sunDir: { value: new Vector3() },
          zenith: { value: new Color() },
          horizon: { value: new Color() },
          glow: { value: BLUE.clone() },
          glowStrength: { value: 0.55 },
          glowPower: { value: 24 },
          ground: { value: new Color('#7d4a32') },
        },
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz);
            gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 sunDir, zenith, horizon, glow, ground;
          uniform float glowStrength, glowPower;
          varying vec3 vDir;
          void main() {
            vec3 d = normalize(vDir);
            float h = d.y;
            vec3 col = h >= 0.0 ? mix(horizon, zenith, pow(h, 0.45)) : mix(horizon, ground, min(1.0, -h * 8.0));
            float s = max(dot(d, normalize(sunDir)), 0.0);
            col = mix(col, glow, clamp(pow(s, glowPower) * glowStrength, 0.0, 0.9));
            col += vec3(1.0, 0.96, 0.9) * pow(s, 600.0) * 0.6;
            col = mix(col, vec3(1.0, 0.99, 0.95), smoothstep(0.99994, 0.99997, s));
            gl_FragColor = vec4(col, 1.0);
            #include <colorspace_fragment>
          }`,
      }),
    [],
  )
  useEffect(() => {
    const u = material.uniforms
    u.sunDir.value.set(...sky.sunDir)
    u.zenith.value.copy(sky.zenith)
    u.horizon.value.copy(sky.horizon)
    u.glowStrength.value = sky.glowStrength
    u.glowPower.value = sky.glowPower
  }, [material, sky])
  useEffect(() => () => material.dispose(), [material])

  // Follow the viewer so the sky is "infinitely" far away.
  useFrame(({ camera, gl }) => {
    if (ref.current) viewCamera(gl, camera).getWorldPosition(ref.current.position)
  })

  return (
    <mesh ref={ref} material={material} renderOrder={-1000} frustumCulled={false} scale={radius}>
      <sphereGeometry args={[1, 48, 24]} />
    </mesh>
  )
}
