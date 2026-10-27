// Builds the NASA image layers used in the XR module (sources kept outside the repo).
// Usage: node scripts/build-layers.mjs <sourceDir>
//   <sourceDir>/spherex/PIA26354.jpg   NASA/JPL-Caltech SPHEREx, Vela Molecular Ridge (first public data release, 2 Jul 2025)
//   <sourceDir>/spherex/PIA26280.jpg   NASA/JPL-Caltech SPHEREx, first images (uncalibrated, 27 Mar 2025)
//   <sourceDir>/nasa/megt90n000cb.img  MGS MOLA MEGDR global topography, 4 px/deg (NASA PDS)
// Writes public/spherex/*.jpg and public/textures/mars_elevation.jpg; prints the elevation range.
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'

const src = process.argv[2]
if (!src) throw new Error('usage: node scripts/build-layers.mjs <sourceDir>')
mkdirSync('public/spherex', { recursive: true })

await sharp(join(src, 'spherex', 'PIA26354.jpg')).jpeg({ quality: 86, mozjpeg: true }).toFile('public/spherex/vela.jpg')
await sharp(join(src, 'spherex', 'PIA26280.jpg')).jpeg({ quality: 86, mozjpeg: true }).toFile('public/spherex/first-light.jpg')

// Mars elevation: MOLA heights coloured low (blue) → high (white), with a little hillshade so the shapes read.
const W = 1440, H = 720
const raw = readFileSync(join(src, 'nasa', 'megt90n000cb.img'))
const h = new Float32Array(W * H)
// MOLA starts at 0°E; the Viking colour map (and the globe UVs) start at 180°W, so roll by half a turn
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) h[y * W + ((x + W / 2) % W)] = raw.readInt16BE((y * W + x) * 2)
let lo = Infinity, hi = -Infinity
for (const v of h) (lo = Math.min(lo, v)), (hi = Math.max(hi, v))
// colour stops at fractions of the [-8 km, +12 km] range (peaks above that saturate to white)
const LO = -8000, HI = 12000
const stops = [
  [0, [20, 30, 110]],
  [0.2, [30, 110, 200]],
  [0.35, [60, 190, 190]],
  [0.45, [90, 190, 90]],
  [0.55, [220, 210, 90]],
  [0.68, [220, 130, 50]],
  [0.82, [170, 70, 50]],
  [1, [250, 245, 240]],
]
const colour = (f) => {
  f = Math.min(1, Math.max(0, f))
  for (let k = 1; k < stops.length; k++)
    if (f <= stops[k][0]) {
      const [f0, c0] = stops[k - 1], [f1, c1] = stops[k]
      const t = (f - f0) / (f1 - f0)
      return c0.map((c, j) => c + (c1[j] - c) * t)
    }
  return stops[stops.length - 1][1]
}
const out = Buffer.alloc(W * H * 3)
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    const i = y * W + x
    const dx = h[y * W + ((x + 1) % W)] - h[y * W + ((x - 1 + W) % W)]
    const dy = h[Math.min(H - 1, y + 1) * W + x] - h[Math.max(0, y - 1) * W + x]
    const shade = Math.min(1.25, Math.max(0.6, 1 - (dx + dy) / 6000))
    const c = colour((h[i] - LO) / (HI - LO))
    out[i * 3] = Math.min(255, c[0] * shade)
    out[i * 3 + 1] = Math.min(255, c[1] * shade)
    out[i * 3 + 2] = Math.min(255, c[2] * shade)
  }
await sharp(out, { raw: { width: W, height: H, channels: 3 } }).resize(2048, 1024).jpeg({ quality: 85, mozjpeg: true }).toFile('public/textures/mars_elevation.jpg')
console.log('mars elevation range (m):', lo, hi)
