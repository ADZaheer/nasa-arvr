import { useEffect, useState } from 'react'
import { BufferAttribute, BufferGeometry, CanvasTexture, Color, PlaneGeometry, RepeatWrapping, SRGBColorSpace } from 'three'
import type { SiteContent, SiteTerrain } from '../types'

/** Ground height in metres at world (x east, z south), terrain centred on the origin. */
export interface HeightField {
  width: number
  depth: number
  /** raw elevation-model height (bilinear), no added detail */
  baseAt(x: number, z: number): number
  /** elevation + procedural fine relief; `detail` (0..1) fades the relief out with distance */
  heightAt(x: number, z: number, detail?: number): number
}

// ---- deterministic value noise -------------------------------------------------------------
function hash(i: number, j: number) {
  let h = Math.imul(i, 374761393) + Math.imul(j, 668265263)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}
export function vnoise(x: number, z: number) {
  const i = Math.floor(x), j = Math.floor(z)
  const fx = x - i, fz = z - j
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz)
  const a = hash(i, j), b = hash(i + 1, j), c = hash(i, j + 1), d = hash(i + 1, j + 1)
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1
}
/** fbm in roughly [-1, 1]: wavelengths from ~14 m down to ~1 m */
export function fbm(x: number, z: number) {
  let s = 0, amp = 0.5, f = 1 / 14
  for (let o = 0; o < 5; o++) {
    s += amp * vnoise(x * f + o * 17.3, z * f - o * 9.1)
    amp *= 0.5
    f *= 2.03
  }
  return s / 0.97
}

export function makeHeightField(t: SiteTerrain, data: Uint16Array): HeightField {
  const W = t.gridW, H = t.gridH
  const width = t.widthUnits * t.metersPerUnit
  const depth = t.depthUnits * t.metersPerUnit
  const range = ((t.zMaxUnits - t.zMinUnits) * t.verticalMetersPerUnit) / 65535
  const baseAt = (x: number, z: number) => {
    const fx = Math.min(W - 1, Math.max(0, (x / width + 0.5) * (W - 1)))
    const fz = Math.min(H - 1, Math.max(0, (z / depth + 0.5) * (H - 1)))
    const i = Math.min(W - 2, Math.floor(fx)), j = Math.min(H - 2, Math.floor(fz))
    const u = fx - i, v = fz - j
    const k = j * W + i
    const a = data[k], b = data[k + 1], c = data[k + W], d = data[k + W + 1]
    return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * range
  }
  return {
    width,
    depth,
    baseAt,
    heightAt: (x, z, detail = 1) => baseAt(x, z) + (detail > 0 ? fbm(x, z) * t.detailAmplitude * detail : 0),
  }
}

const hfCache = new Map<string, Promise<HeightField>>()
export function loadHeightField(t: SiteTerrain): Promise<HeightField> {
  let p = hfCache.get(t.url)
  if (!p) {
    p = fetch(t.url)
      .then((r) => {
        if (!r.ok) throw new Error(`terrain ${t.url}: ${r.status}`)
        return r.arrayBuffer()
      })
      .then((buf) => makeHeightField(t, new Uint16Array(buf)))
    hfCache.set(t.url, p)
  }
  return p
}

export function useHeightField(site: SiteContent | null | undefined): HeightField | null {
  const [hf, setHf] = useState<{ url: string; hf: HeightField } | null>(null)
  useEffect(() => {
    if (!site) return
    let alive = true
    loadHeightField(site.terrain)
      .then((h) => alive && setHf({ url: site.terrain.url, hf: h }))
      .catch((e) => console.warn('[surface]', e))
    return () => {
      alive = false
    }
  }, [site])
  return site && hf?.url === site.terrain.url ? hf.hf : null
}

// ---- meshes -------------------------------------------------------------------------------
const DUST = new Color('#b8714a')
const ROCK = new Color('#7a432c')
const DARK = new Color('#5b3324')

const detailFade = (r: number) => 1 - Math.min(1, Math.max(0, (r - 120) / 280))

/**
 * Radial "clipmap": rings get exponentially wider away from the viewer, so ground near your feet is
 * finely detailed while the same mesh reaches the horizon (tens of km at Gale). Rebuilt when you walk away.
 */
export function buildRadialTerrain(hf: HeightField, cx: number, cz: number, rMax: number, rings = 170, segs = 256): BufferGeometry {
  const r0 = 0.35
  const k = Math.pow(rMax / r0, 1 / (rings - 1))
  const count = 1 + rings * segs
  const pos = new Float32Array(count * 3)
  const uv = new Float32Array(count * 2)
  const put = (idx: number, x: number, z: number, r: number) => {
    pos[idx * 3] = x
    pos[idx * 3 + 1] = hf.heightAt(x, z, detailFade(r))
    pos[idx * 3 + 2] = z
    uv[idx * 2] = x / 3
    uv[idx * 2 + 1] = z / 3
  }
  put(0, cx, cz, 0)
  for (let i = 0; i < rings; i++) {
    const r = r0 * Math.pow(k, i)
    for (let s = 0; s < segs; s++) {
      const a = (s / segs) * Math.PI * 2 + (i % 2) * (Math.PI / segs) // stagger rings for nicer triangles
      put(1 + i * segs + s, cx + r * Math.cos(a), cz + r * Math.sin(a), r)
    }
  }
  const index: number[] = []
  for (let s = 0; s < segs; s++) index.push(0, 1 + ((s + 1) % segs), 1 + s)
  for (let i = 0; i < rings - 1; i++) {
    for (let s = 0; s < segs; s++) {
      const p00 = 1 + i * segs + s, p01 = 1 + i * segs + ((s + 1) % segs)
      const p10 = 1 + (i + 1) * segs + s, p11 = 1 + (i + 1) * segs + ((s + 1) % segs)
      index.push(p00, p01, p10, p01, p11, p10) // counter-clockwise seen from above → normals up
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(pos, 3))
  g.setAttribute('uv', new BufferAttribute(uv, 2))
  g.setIndex(index)
  g.computeVertexNormals()
  colorize(g)
  g.computeBoundingSphere()
  return g
}

/** Small uniform-grid copy of the whole terrain for the AR tabletop diorama (fits in `size` metres). */
export function buildDiorama(hf: HeightField, size: number, exaggeration: number): BufferGeometry {
  const s = size / Math.max(hf.width, hf.depth)
  const g = new PlaneGeometry(hf.width * s, hf.depth * s, 200, Math.round((200 * hf.depth) / hf.width))
  g.rotateX(-Math.PI / 2)
  const p = g.attributes.position
  let lo = Infinity
  for (let i = 0; i < p.count; i++) lo = Math.min(lo, hf.baseAt(p.getX(i) / s, p.getZ(i) / s))
  for (let i = 0; i < p.count; i++) p.setY(i, (hf.baseAt(p.getX(i) / s, p.getZ(i) / s) - lo) * s * exaggeration)
  g.computeVertexNormals()
  colorize(g)
  return g
}

function colorize(g: BufferGeometry) {
  const p = g.attributes.position, n = g.attributes.normal
  const col = new Float32Array(p.count * 3)
  const c = new Color()
  for (let i = 0; i < p.count; i++) {
    const slope = 1 - n.getY(i) // 0 flat … 1 vertical
    const x = p.getX(i), z = p.getZ(i)
    const patch = vnoise(x / 37, z / 37) * 0.5 + 0.5
    c.copy(DUST).lerp(DARK, patch * 0.45).lerp(ROCK, Math.min(1, slope * 2.2))
    const grain = 0.92 + vnoise(x / 5.3, z / 5.3) * 0.08
    col[i * 3] = c.r * grain
    col[i * 3 + 1] = c.g * grain
    col[i * 3 + 2] = c.b * grain
  }
  g.setAttribute('color', new BufferAttribute(col, 3))
}

let groundTex: CanvasTexture | null = null
/** Tiling grey "regolith" detail texture, multiplied with vertex colours. Generated, no download. */
export function getGroundTexture(): CanvasTexture {
  if (groundTex) return groundTex
  const N = 256
  const cv = document.createElement('canvas')
  cv.width = cv.height = N
  const ctx = cv.getContext('2d')!
  const img = ctx.createImageData(N, N)
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      // tileable: sample noise on a torus
      const a = (x / N) * Math.PI * 2, b = (y / N) * Math.PI * 2
      const tx = Math.cos(a) * 6, ty = Math.sin(a) * 6, tz = Math.cos(b) * 6, tw = Math.sin(b) * 6
      const n1 = vnoise(tx + tz * 1.7, ty + tw * 1.3) * 0.5 + vnoise(tx * 3 + tw * 2.1, ty * 3 - tz * 1.9) * 0.3
      const speck = hash(x, y) > 0.985 ? -0.35 : hash(x + 7, y) > 0.99 ? 0.25 : 0
      const v = Math.max(0, Math.min(255, 205 + (n1 + speck) * 60))
      const k = (y * N + x) * 4
      img.data[k] = img.data[k + 1] = img.data[k + 2] = v
      img.data[k + 3] = 255
    }
  ctx.putImageData(img, 0, 0)
  groundTex = new CanvasTexture(cv)
  groundTex.wrapS = groundTex.wrapT = RepeatWrapping
  groundTex.colorSpace = SRGBColorSpace
  groundTex.anisotropy = 8
  return groundTex
}

/** Sun direction from azimuth (deg clockwise from north) and elevation (deg). North = -Z. */
export function sunDirection(azimuthDeg: number, elevationDeg: number): [number, number, number] {
  const az = (azimuthDeg * Math.PI) / 180, el = (elevationDeg * Math.PI) / 180
  return [Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)]
}
