import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Billboard, Stars } from '@react-three/drei'
import { AdditiveBlending, BackSide, Color, ShaderMaterial, SRGBColorSpace, TextureLoader, Vector3, type Mesh, type Texture } from 'three'
import { viewCamera } from './viewCamera'
import type { TierParams } from './quality'

/**
 * Space backdrop: NASA SVS "Deep Star Maps 2020" (public domain) — the real Milky Way and stars —
 * at 1k/2k/4k depending on quality. Procedural stars show while it loads (or if it can't load).
 */
export function StarSky({ size, radius = 150 }: { size: TierParams['stars']; radius?: number }) {
  const [tex, setTex] = useState<Texture | null>(null)
  const ref = useRef<Mesh>(null)
  useEffect(() => {
    let alive = true
    new TextureLoader()
      .loadAsync(`/textures/space/starmap_${size}.jpg`)
      .then((t) => {
        t.colorSpace = SRGBColorSpace
        if (alive) setTex(t)
      })
      .catch(() => alive && setTex(null))
    return () => {
      alive = false
    }
  }, [size])
  useEffect(() => () => tex?.dispose(), [tex])
  useFrame(({ camera, gl }) => {
    if (ref.current) viewCamera(gl, camera).getWorldPosition(ref.current.position)
  })
  if (!tex) return <Stars radius={80} depth={40} count={3000} factor={4} saturation={0} fade />
  return (
    <mesh ref={ref} scale={[-radius, radius, radius]} renderOrder={-1000} frustumCulled={false}>
      <sphereGeometry args={[1, 64, 32]} />
      <meshBasicMaterial map={tex} side={BackSide} depthWrite={false} depthTest={false} fog={false} toneMapped={false} color="#d8d8d8" />
    </mesh>
  )
}

// --------------------------------------------------------------------------------------------
const noiseGLSL = /* glsl */ `
  float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float noise(vec3 x) {
    vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
`

/** The Sun: boiling granulation with limb darkening, plus a soft animated corona (artistic). */
export function Sun({ radius }: { radius: number }) {
  const surface = useMemo(
    () =>
      new ShaderMaterial({
        toneMapped: false,
        uniforms: { uTime: { value: 0 } },
        vertexShader: /* glsl */ `
          varying vec3 vN; varying vec3 vP; varying vec3 vV;
          void main() {
            vN = normalize(normalMatrix * normal);
            vP = position;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vV = normalize(-mv.xyz);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          uniform float uTime;
          varying vec3 vN; varying vec3 vP; varying vec3 vV;
          ${noiseGLSL}
          void main() {
            vec3 p = normalize(vP) * 6.0;
            float g = fbm(p + vec3(uTime * 0.05, uTime * 0.03, 0.0));
            float spots = smoothstep(0.62, 0.7, fbm(p * 0.35 + 11.0));
            vec3 col = mix(vec3(1.0, 0.55, 0.12), vec3(1.0, 0.95, 0.75), g);
            col *= 1.0 - spots * 0.5;
            float mu = max(dot(normalize(vN), normalize(vV)), 0.0);
            col *= mix(0.45, 1.15, pow(mu, 0.45)); // limb darkening
            gl_FragColor = vec4(col * 1.6, 1.0);
          }`,
      }),
    [],
  )
  const corona = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        toneMapped: false,
        uniforms: { uTime: { value: 0 } },
        vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform float uTime; varying vec2 vUv;
          ${noiseGLSL}
          void main() {
            vec2 c = vUv - 0.5; float r = length(c) * 2.0; float a = atan(c.y, c.x);
            float rays = fbm(vec3(cos(a) * 3.0, sin(a) * 3.0, uTime * 0.08)) * 0.8 + 0.2;
            float glow = pow(max(0.0, 1.0 - r), 3.0) * (0.55 + rays * 0.6);
            float inner = smoothstep(0.28, 0.2, r);
            gl_FragColor = vec4(vec3(1.0, 0.7, 0.35) * glow * (1.0 - inner * 0.7), 1.0);
          }`,
      }),
    [],
  )
  useEffect(() => () => (surface.dispose(), corona.dispose()), [surface, corona])
  useFrame(({ clock }) => {
    surface.uniforms.uTime.value = clock.elapsedTime
    corona.uniforms.uTime.value = clock.elapsedTime
  })
  return (
    <group>
      <mesh material={surface}>
        <sphereGeometry args={[radius, 48, 32]} />
      </mesh>
      <Billboard>
        <mesh material={corona} renderOrder={2}>
          <planeGeometry args={[radius * 7, radius * 7]} />
        </mesh>
      </Billboard>
    </group>
  )
}

// --------------------------------------------------------------------------------------------
/** Thin atmosphere glow around a planet's limb, brighter on the sunlit side. */
export function Atmosphere({ radius = 1, color = '#e8a27a', intensity = 1, sunDir = [5, 2, 4] as [number, number, number] }) {
  const material = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        toneMapped: false,
        uniforms: { uColor: { value: new Color(color) }, uSun: { value: new Vector3(...sunDir).normalize() }, uIntensity: { value: intensity } },
        vertexShader: /* glsl */ `
          varying vec3 vN; varying vec3 vV; varying vec3 vWN;
          void main() {
            vN = normalize(normalMatrix * normal);
            vWN = normalize(mat3(modelMatrix) * normal);
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vV = normalize(-mv.xyz);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor; uniform vec3 uSun; uniform float uIntensity;
          varying vec3 vN; varying vec3 vV; varying vec3 vWN;
          void main() {
            float rim = pow(1.0 - max(dot(normalize(vN), normalize(vV)), 0.0), 5.0);
            float lit = clamp(dot(normalize(vWN), uSun) * 0.8 + 0.35, 0.05, 1.0);
            gl_FragColor = vec4(uColor * rim * lit * uIntensity, 1.0);
          }`,
      }),
    [color, intensity, sunDir],
  )
  useEffect(() => () => material.dispose(), [material])
  return (
    <mesh material={material} scale={radius * 1.022} renderOrder={1}>
      <sphereGeometry args={[1, 64, 48]} />
    </mesh>
  )
}

// --------------------------------------------------------------------------------------------
/**
 * The Sun seen from an airless world: a small, white, very bright disc with a tight glare (no
 * atmospheric scattering, so the sky stays black around it). Placed far away along the sun direction.
 */
export function SpaceSun({ dir, distance }: { dir: [number, number, number]; distance: number }) {
  const ref = useRef<Mesh>(null)
  const material = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        fog: false,
        blending: AdditiveBlending,
        toneMapped: false,
        vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          varying vec2 vUv;
          void main() {
            float r = length(vUv - 0.5) * 2.0;
            float disc = smoothstep(0.09, 0.075, r);
            float glare = pow(max(0.0, 1.0 - r), 6.0) * 0.6;
            gl_FragColor = vec4(vec3(1.0, 0.98, 0.94) * (disc * 3.0 + glare), 1.0);
          }`,
      }),
    [],
  )
  useEffect(() => () => material.dispose(), [material])
  useFrame(({ camera, gl }) => {
    const m = ref.current
    if (!m) return
    viewCamera(gl, camera).getWorldPosition(m.position)
    m.position.addScaledVector(new Vector3(...dir).normalize(), distance)
    m.lookAt(viewCamera(gl, camera).getWorldPosition(new Vector3()))
  })
  const size = distance * 0.12
  return (
    <mesh ref={ref} material={material} renderOrder={-900} frustumCulled={false}>
      <planeGeometry args={[size, size]} />
    </mesh>
  )
}

/**
 * Earth hanging in the black lunar sky (about 2° across, as seen from the Moon), lit from the sun's
 * direction so it shows the right phase. Procedural oceans/clouds: an artistic stand-in, not a photo.
 */
export function EarthInSky({ dir, sunDir, distance }: { dir: [number, number, number]; sunDir: [number, number, number]; distance: number }) {
  const ref = useRef<Mesh>(null)
  const material = useMemo(
    () =>
      new ShaderMaterial({
        fog: false,
        toneMapped: false,
        uniforms: { uSun: { value: new Vector3(...sunDir).normalize() }, uTime: { value: 0 } },
        vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vP; void main() { vN = normalize(mat3(modelMatrix) * normal); vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uSun; uniform float uTime; varying vec3 vN; varying vec3 vP;
          ${noiseGLSL}
          void main() {
            vec3 p = normalize(vP);
            float land = smoothstep(0.52, 0.56, fbm(p * 2.2 + 3.1));
            float cloud = smoothstep(0.5, 0.75, fbm(p * 4.0 + vec3(uTime * 0.01, 0.0, 0.0)));
            vec3 col = mix(vec3(0.05, 0.16, 0.42), vec3(0.28, 0.36, 0.2), land);
            col = mix(col, vec3(0.95), cloud * 0.85);
            float lit = smoothstep(-0.05, 0.25, dot(normalize(vN), uSun));
            gl_FragColor = vec4(col * (0.03 + 1.2 * lit), 1.0);
            #include <colorspace_fragment>
          }`,
      }),
    [sunDir],
  )
  useEffect(() => () => material.dispose(), [material])
  useFrame(({ camera, gl, clock }) => {
    const m = ref.current
    if (!m) return
    material.uniforms.uTime.value = clock.elapsedTime
    viewCamera(gl, camera).getWorldPosition(m.position)
    m.position.addScaledVector(new Vector3(...dir).normalize(), distance)
  })
  return (
    <mesh ref={ref} material={material} renderOrder={-899} frustumCulled={false} scale={distance * Math.tan((0.95 * Math.PI) / 180)}>
      <sphereGeometry args={[1, 48, 32]} />
    </mesh>
  )
}
