import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, BackSide, BufferAttribute, BufferGeometry, Color, ShaderMaterial, Vector3, type Group } from 'three'
import type { TierParams } from './quality'

/**
 * The Solar System's own look: a "holographic mission-control" chart rather than a photo. Stylised planets
 * (toon-banded light, gas-giant stripes, polar caps, a soft rim glow in the UI's teal), glowing orbit rings
 * with tick marks, and a deep-blue to violet sky with a few constellation lines and drifting motes.
 * Everything is a handful of cheap shaders and line/point draws, so it stays light on a headset.
 */
export const HOLO = {
  teal: '#4fe3d6',
  amber: '#ffb54a',
  violet: '#8f7cff',
  skyTop: '#141046',
  skyMid: '#0a1230',
  skyLow: '#1d0f3f',
}

/** Per-body art direction (colours are stylised, chosen to keep each body recognisable). */
export interface HoloStyle {
  color: string
  color2: string
  bands?: number
  bandFreq?: number
  cap?: number
  patches?: number
  rim?: string
  facets?: boolean
}
export const HOLO_STYLES: Record<string, HoloStyle> = {
  mercury: { color: '#9c938a', color2: '#5e5852', patches: 0.5 },
  venus: { color: '#f2c98a', color2: '#d99a5b', bands: 0.35, bandFreq: 5 },
  earth: { color: '#2f7ae0', color2: '#4fbf7a', patches: 1, cap: 0.8 },
  moon: { color: '#c9c4bc', color2: '#7d7871', patches: 0.6 },
  bennu: { color: '#8a837a', color2: '#4d4842', patches: 0.6, facets: true, rim: HOLO.amber },
  mars: { color: '#e0612a', color2: '#9c3415', patches: 0.6, cap: 1, rim: HOLO.amber },
  jupiter: { color: '#e8c39a', color2: '#b27548', bands: 0.85, bandFreq: 18 },
  saturn: { color: '#f0dca4', color2: '#c4a36a', bands: 0.6, bandFreq: 16 },
  uranus: { color: '#9fe6ee', color2: '#6cc4d6', bands: 0.15, bandFreq: 8 },
  neptune: { color: '#4f74f0', color2: '#2c47b8', bands: 0.3, bandFreq: 10 },
}

/** Shared: where the Sun is in world space (the stage origin), updated once per frame. */
export const holoUniforms = { uSun: { value: new Vector3() }, uTime: { value: 0 } }

const NOISE = /* glsl */ `
  float h3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float n3(vec3 x) {
    vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z);
  }`

export function makeHoloPlanetMaterial(s: HoloStyle) {
  return new ShaderMaterial({
    uniforms: {
      ...holoUniforms,
      uColor: { value: new Color(s.color) },
      uColor2: { value: new Color(s.color2) },
      uRim: { value: new Color(s.rim ?? HOLO.teal) },
      uBands: { value: s.bands ?? 0 },
      uBandFreq: { value: s.bandFreq ?? 10 },
      uCap: { value: s.cap ?? 0 },
      uPatches: { value: s.patches ?? 0 },
      uHover: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vW; varying vec3 vO;
      void main() {
        vO = position;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSun, uColor, uColor2, uRim;
      uniform float uBands, uBandFreq, uCap, uPatches, uHover, uTime;
      varying vec3 vN; varying vec3 vW; varying vec3 vO;
      ${NOISE}
      void main() {
        vec3 N = normalize(vN);
        vec3 L = normalize(uSun - vW);
        float lam = dot(N, L);
        // three soft toon steps: night side, terminator, day side
        float lit = 0.16 + 0.5 * smoothstep(-0.2, 0.05, lam) + 0.34 * smoothstep(0.35, 0.6, lam);
        vec3 o = normalize(vO);
        float lat = o.y;
        vec3 base = uColor;
        base = mix(base, uColor2, uBands * (0.5 + 0.5 * sin(lat * uBandFreq + n3(o * 3.0) * 1.6)));
        base = mix(base, uColor2, uPatches * smoothstep(0.52, 0.6, n3(o * 2.4 + 1.7)));
        base = mix(base, vec3(0.96), uCap * smoothstep(0.8, 0.88, abs(lat)));
        vec3 V = normalize(cameraPosition - vW);
        float fres = pow(1.0 - max(dot(N, V), 0.0), 2.2);
        vec3 col = base * lit + uRim * fres * (0.55 + 0.7 * uHover);
        // faint latitude lines and a slow scan sweep: the hologram feel
        col += uRim * 0.07 * smoothstep(0.965, 1.0, abs(sin(lat * 3.14159 * 6.0)));
        col += uRim * 0.12 * uHover * smoothstep(0.98, 1.0, sin(lat * 8.0 - uTime * 3.0));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  })
}

/** Stylised Sun: a hot amber core with layered additive halos. */
export function HoloSun({ radius }: { radius: number }) {
  const core = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: holoUniforms,
        vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vW; varying vec3 vO;
          void main() { vO = position; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`,
        fragmentShader: /* glsl */ `uniform float uTime; varying vec3 vN; varying vec3 vW; varying vec3 vO;
          ${NOISE}
          void main() {
            vec3 V = normalize(cameraPosition - vW);
            float c = max(dot(normalize(vN), V), 0.0);
            float g = n3(normalize(vO) * 4.0 + uTime * 0.15) * 0.5 + n3(normalize(vO) * 9.0 - uTime * 0.1) * 0.5;
            vec3 col = mix(vec3(1.0, 0.36, 0.07), vec3(1.0, 0.74, 0.32), pow(c, 0.8) * 0.75 + g * 0.4);
            gl_FragColor = vec4(col * 0.92, 1.0);
            #include <colorspace_fragment>
          }`,
      }),
    [],
  )
  const halo = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: holoUniforms,
        vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`,
        fragmentShader: /* glsl */ `varying vec3 vN; varying vec3 vW;
          void main() {
            float c = max(dot(normalize(vN), normalize(cameraPosition - vW)), 0.0);
            float a = pow(c, 2.6);
            gl_FragColor = vec4(vec3(1.0, 0.55, 0.18) * a * 0.55, a * 0.7);
          }`,
      }),
    [],
  )
  useEffect(() => () => (core.dispose(), halo.dispose()), [core, halo])
  return (
    <group>
      <mesh material={core}>
        <sphereGeometry args={[radius, 40, 28]} />
      </mesh>
      <mesh material={halo} scale={1.9}>
        <sphereGeometry args={[radius, 32, 20]} />
      </mesh>
      <mesh material={halo} scale={3.1}>
        <sphereGeometry args={[radius, 24, 16]} />
      </mesh>
    </group>
  )
}

/** A glowing orbit ring with tick marks every 15°, brighter when its planet is hovered. */
export function HoloOrbit({ radius, color = HOLO.teal, active = false }: { radius: number; color?: string; active?: boolean }) {
  const geom = useMemo(() => {
    const pts: number[] = []
    const N = 160
    for (let i = 0; i < N; i++) {
      const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2
      pts.push(Math.cos(a0) * radius, 0, Math.sin(a0) * radius, Math.cos(a1) * radius, 0, Math.sin(a1) * radius)
    }
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2, len = i % 6 === 0 ? 0.06 : 0.025
      pts.push(Math.cos(a) * radius, 0, Math.sin(a) * radius, Math.cos(a) * (radius + len), 0, Math.sin(a) * (radius + len))
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(pts), 3))
    return g
  }, [radius])
  useEffect(() => () => geom.dispose(), [geom])
  return (
    <lineSegments geometry={geom}>
      <lineBasicMaterial color={color} transparent opacity={active ? 0.85 : 0.3} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
    </lineSegments>
  )
}

function rand(seed: number) {
  let s = seed >>> 0
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296)
}

/**
 * The chart's sky: a deep-blue to violet gradient dome, sparse stars, a few constellation-like line
 * figures. Star count follows the quality tier.
 */
export function HoloBackdrop({ q }: { q: TierParams }) {
  const g = useRef<Group>(null)
  const sky = useMemo(
    () =>
      new ShaderMaterial({
        side: BackSide,
        depthWrite: false,
        fog: false,
        uniforms: { uTop: { value: new Color(HOLO.skyTop) }, uMid: { value: new Color(HOLO.skyMid) }, uLow: { value: new Color(HOLO.skyLow) }, uTeal: { value: new Color(HOLO.teal) }, uViolet: { value: new Color(HOLO.violet) } },
        vertexShader: /* glsl */ `varying vec3 vD; void main() { vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `uniform vec3 uTop, uMid, uLow, uTeal, uViolet; varying vec3 vD;
          ${NOISE}
          void main() {
            float y = vD.y;
            vec3 col = y > 0.0 ? mix(uMid, uTop, smoothstep(0.0, 0.8, y)) : mix(uMid, uLow, smoothstep(0.0, -0.8, y));
            // soft nebula wisps along a tilted band, teal fading to violet
            float band = exp(-pow((vD.y + vD.x * 0.35) * 3.0, 2.0));
            float neb = n3(vD * 3.0) * 0.6 + n3(vD * 7.0) * 0.4;
            col += mix(uViolet, uTeal, smoothstep(-0.6, 0.6, vD.x)) * band * neb * 0.16;
            gl_FragColor = vec4(col, 1.0);
            #include <colorspace_fragment>
          }`,
      }),
    [],
  )
  const count = q.stars === '1k' ? 500 : q.stars === '2k' ? 900 : 1500
  const { stars, lines } = useMemo(() => {
    const r = rand(7)
    const pos = new Float32Array(count * 3)
    const size = new Float32Array(count)
    const dirs: Vector3[] = []
    for (let i = 0; i < count; i++) {
      const v = new Vector3(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1).normalize()
      dirs.push(v)
      pos.set([v.x * 90, v.y * 90, v.z * 90], i * 3)
      size[i] = r() < 0.06 ? 3.2 : 1 + r() * 1.3
    }
    const s = new BufferGeometry()
    s.setAttribute('position', new BufferAttribute(pos, 3))
    s.setAttribute('size', new BufferAttribute(size, 1))
    // constellation figures: from a few bright seed stars, chain to near neighbours
    const lp: number[] = []
    for (let k = 0; k < 9; k++) {
      let cur = dirs[Math.floor(r() * count)]
      for (let step = 0; step < 4; step++) {
        let best: Vector3 | null = null, bestD = Infinity
        for (const d of dirs) {
          const dd = d.distanceToSquared(cur)
          if (dd > 0.003 && dd < 0.05 && dd < bestD && r() < 0.6) (best = d), (bestD = dd)
        }
        if (!best) break
        lp.push(cur.x * 89, cur.y * 89, cur.z * 89, best.x * 89, best.y * 89, best.z * 89)
        cur = best
      }
    }
    const l = new BufferGeometry()
    l.setAttribute('position', new BufferAttribute(new Float32Array(lp), 3))
    return { stars: s, lines: l }
  }, [count])
  const starMat = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        fog: false,
        uniforms: holoUniforms,
        vertexShader: /* glsl */ `attribute float size; uniform float uTime; varying float vA;
          void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
            vA = 0.55 + 0.45 * sin(uTime * (0.6 + fract(position.x) * 1.5) + position.y);
            gl_PointSize = size * 1.6; }`,
        fragmentShader: /* glsl */ `varying float vA; void main() { float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(vec3(0.85, 0.92, 1.0), (1.0 - d * 2.0) * vA); }`,
      }),
    [],
  )
  useEffect(() => () => [sky, starMat, stars, lines].forEach((x) => x.dispose()), [sky, starMat, stars, lines])
  useFrame(({ clock }) => {
    holoUniforms.uTime.value = clock.elapsedTime
    if (g.current) g.current.rotation.y = clock.elapsedTime * 0.004
  })
  return (
    <>
      <group ref={g}>
        <mesh material={sky} renderOrder={-100} frustumCulled={false}>
          <sphereGeometry args={[100, 32, 16]} />
        </mesh>
        <points geometry={stars} material={starMat} frustumCulled={false} />
        <lineSegments geometry={lines} frustumCulled={false}>
          <lineBasicMaterial color={HOLO.teal} transparent opacity={0.22} depthWrite={false} fog={false} toneMapped={false} />
        </lineSegments>
      </group>
    </>
  )
}

/** Slowly drifting motes among the planets (inside the hub, so they scale with it). Skipped on Low. */
export function HoloMotes({ q }: { q: TierParams }) {
  const geo = useMemo(() => {
    if (q.stars === '1k') return null
    const r = rand(11)
    const n = 160
    const p = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) p.set([(r() * 2 - 1) * 3.4, (r() * 2 - 1) * 0.9, (r() * 2 - 1) * 3.4], i * 3)
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(p, 3))
    return g
  }, [q.stars])
  const mat = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: holoUniforms,
        vertexShader: /* glsl */ `uniform float uTime;
          void main() { vec3 p = position; p.y += sin(uTime * 0.3 + p.x * 2.0) * 0.08; p.x += sin(uTime * 0.2 + p.z) * 0.05;
            vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = clamp(12.0 / -mv.z, 1.0, 5.0); }`,
        fragmentShader: /* glsl */ `void main() { float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(0.45, 0.9, 0.85, (1.0 - d * 2.0) * 0.35); }`,
      }),
    [],
  )
  useEffect(() => () => (geo?.dispose(), mat.dispose()), [geo, mat])
  return geo ? <points geometry={geo} material={mat} frustumCulled={false} /> : null
}
