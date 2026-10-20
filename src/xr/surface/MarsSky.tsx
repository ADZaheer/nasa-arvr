import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BackSide, Color, ShaderMaterial, Vector3, type Mesh } from 'three'

export const MARS_HORIZON = '#c99a76'

/**
 * Artistic Martian daytime sky: dusty butterscotch overhead, lighter haze at the horizon (matching the fog),
 * a small sun (Mars is ~1.5x farther from the Sun than Earth) with a cooler, bluish glow around it.
 */
export function MarsSky({ sunDir, radius }: { sunDir: [number, number, number]; radius: number }) {
  const ref = useRef<Mesh>(null)
  const material = useMemo(
    () =>
      new ShaderMaterial({
        side: BackSide,
        depthWrite: false,
        depthTest: false,
        fog: false,
        uniforms: {
          sunDir: { value: new Vector3(...sunDir).normalize() },
          zenith: { value: new Color('#8f5f43') },
          horizon: { value: new Color(MARS_HORIZON) },
          glow: { value: new Color('#b8c4d4') },
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
          varying vec3 vDir;
          void main() {
            vec3 d = normalize(vDir);
            float h = d.y;
            vec3 col = h >= 0.0 ? mix(horizon, zenith, pow(h, 0.45)) : mix(horizon, ground, min(1.0, -h * 8.0));
            float s = max(dot(d, normalize(sunDir)), 0.0);
            col = mix(col, glow, pow(s, 24.0) * 0.55);
            col += vec3(1.0, 0.96, 0.9) * pow(s, 600.0) * 0.6;
            col = mix(col, vec3(1.0, 0.99, 0.95), smoothstep(0.99994, 0.99997, s));
            gl_FragColor = vec4(col, 1.0);
            #include <colorspace_fragment>
          }`,
      }),
    [sunDir],
  )

  // Follow the viewer so the sky is "infinitely" far away.
  useFrame(({ camera }) => {
    if (ref.current) camera.getWorldPosition(ref.current.position)
  })

  return (
    <mesh ref={ref} material={material} renderOrder={-1000} frustumCulled={false} scale={radius}>
      <sphereGeometry args={[1, 48, 24]} />
    </mesh>
  )
}
