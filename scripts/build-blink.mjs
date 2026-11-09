// Builds the SPHEREx "spot what moved" pair from two real SPHEREx Level-2 cutouts (NASA/IPAC IRSA, public).
// Both cutouts are reprojected onto ONE north-up sky grid using each image's own WCS (TAN + SIP inverse),
// so stars line up exactly and only things that really moved between the exposures change place.
// The zodiacal-light model (ZODI extension) is subtracted and both frames share one brightness stretch.
//
// Usage: node scripts/build-blink.mjs <dir with cut_A.fits, cut_B.fits, pair.json>
// pair.json: { A: {obs_id, t_min, ra, dec}, B: {...}, center: {ra, dec} } — A/B ra,dec = the asteroid's
// position at each exposure from JPL Horizons. Writes public/spherex/blink-a.png, blink-b.png, blink.json.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import { readFits, pixels } from './fits.mjs'

const dir = process.argv[2]
if (!dir) throw new Error('usage: node scripts/build-blink.mjs <dir>')
const pair = JSON.parse(readFileSync(join(dir, 'pair.json'), 'utf8'))
const RAD = Math.PI / 180
const N = 150 // output pixels
const SCALE = 6.15 / 3600 // deg per output pixel (SPHEREx native ~6.15")

function wcsOf(cards) {
  const pc = [cards.PC1_1 * cards.CDELT1, cards.PC1_2 * cards.CDELT1, cards.PC2_1 * cards.CDELT2, cards.PC2_2 * cards.CDELT2]
  const det = pc[0] * pc[3] - pc[1] * pc[2]
  const inv = [pc[3] / det, -pc[1] / det, -pc[2] / det, pc[0] / det]
  const poly = (prefix, order) => (u, v) => {
    let s = 0
    for (let p = 0; p <= order; p++) for (let q = 0; q <= order - p; q++) s += (cards[`${prefix}_${p}_${q}`] ?? 0) * u ** p * v ** q
    return s
  }
  const AP = poly('AP', cards.AP_ORDER ?? 0), BP = poly('BP', cards.BP_ORDER ?? 0)
  const a0 = cards.CRVAL1 * RAD, d0 = cards.CRVAL2 * RAD
  return (ra, dec) => {
    const a = ra * RAD, d = dec * RAD
    const D = Math.sin(d) * Math.sin(d0) + Math.cos(d) * Math.cos(d0) * Math.cos(a - a0)
    const xi = ((Math.cos(d) * Math.sin(a - a0)) / D) / RAD
    const eta = ((Math.sin(d) * Math.cos(d0) - Math.cos(d) * Math.sin(d0) * Math.cos(a - a0)) / D) / RAD
    const U = inv[0] * xi + inv[1] * eta, V = inv[2] * xi + inv[3] * eta
    return [U + AP(U, V) + cards.CRPIX1 - 1, V + BP(U, V) + cards.CRPIX2 - 1] // 0-based pixel
  }
}

/** sky position of an output pixel (north up, east left) */
function outToSky(i, j) {
  const xi = -(i - (N - 1) / 2) * SCALE * RAD, eta = -(j - (N - 1) / 2) * SCALE * RAD
  const a0 = pair.center.ra * RAD, d0 = pair.center.dec * RAD
  const rho = Math.hypot(xi, eta), c = Math.atan(rho)
  if (rho === 0) return [pair.center.ra, pair.center.dec]
  const dec = Math.asin(Math.cos(c) * Math.sin(d0) + (eta * Math.sin(c) * Math.cos(d0)) / rho)
  const ra = a0 + Math.atan2(xi * Math.sin(c), rho * Math.cos(d0) * Math.cos(c) - eta * Math.sin(d0) * Math.sin(c))
  return [((ra / RAD) + 360) % 360, dec / RAD]
}
function skyToOut(ra, dec) {
  const a0 = pair.center.ra * RAD, d0 = pair.center.dec * RAD, a = ra * RAD, d = dec * RAD
  const D = Math.sin(d) * Math.sin(d0) + Math.cos(d) * Math.cos(d0) * Math.cos(a - a0)
  const xi = (Math.cos(d) * Math.sin(a - a0)) / D, eta = (Math.sin(d) * Math.cos(d0) - Math.cos(d) * Math.sin(d0) * Math.cos(a - a0)) / D
  return [-xi / RAD / SCALE + (N - 1) / 2, -eta / RAD / SCALE + (N - 1) / 2]
}

function reproject(file) {
  const h = readFits(join(dir, file))
  const img = pixels(h.find((x) => x.cards.EXTNAME === 'IMAGE'))
  const zodi = pixels(h.find((x) => x.cards.EXTNAME === 'ZODI'))
  const toPix = wcsOf(h.find((x) => x.cards.EXTNAME === 'IMAGE').cards)
  const out = new Float32Array(N * N).fill(NaN)
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const [x, y] = toPix(...outToSky(i, j))
      const x0 = Math.floor(x), y0 = Math.floor(y)
      if (x0 < 0 || y0 < 0 || x0 + 1 >= img.w || y0 + 1 >= img.h) continue
      const fx = x - x0, fy = y - y0
      const at = (xx, yy) => img.data[yy * img.w + xx] - zodi.data[yy * img.w + xx]
      out[j * N + i] = (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) + (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy
    }
  return { out, mjd: h[1].cards['MJD-AVG'], obs: h[1].cards.OBSID ?? null }
}

const A = reproject('cut_A.fits'), B = reproject('cut_B.fits')
// one stretch for both frames, from A's pixels
const vals = [...A.out].filter((v) => Number.isFinite(v)).sort((a, b) => a - b)
const lo = vals[Math.floor(vals.length * 0.05)], hi = vals[Math.floor(vals.length * 0.998)]
const stretch = (v) => {
  if (!Number.isFinite(v)) return 0
  const t = Math.max(0, (v - lo) / (hi - lo))
  return Math.min(255, Math.round((Math.asinh(t * 10) / Math.asinh(10)) * 255))
}
mkdirSync('public/spherex', { recursive: true })
for (const [name, f] of [['blink-a', A], ['blink-b', B]]) {
  const buf = Buffer.alloc(N * N)
  for (let k = 0; k < N * N; k++) buf[k] = stretch(f.out[k])
  await sharp(buf, { raw: { width: N, height: N, channels: 1 } }).resize(600, 600, { kernel: 'lanczos3' }).png({ compressionLevel: 9 }).toFile(`public/spherex/${name}.png`)
}
const [ax, ay] = skyToOut(pair.A.ra, pair.A.dec), [bx, by] = skyToOut(pair.B.ra, pair.B.dec)
const meta = {
  target: { name: '15 Eunomia', kind: 'asteroid', source: 'JPL Horizons (positions at each exposure)' },
  a: { u: ax / N, v: ay / N, mjd: A.mjd, obsId: pair.A.obs_id },
  b: { u: bx / N, v: by / N, mjd: B.mjd, obsId: pair.B.obs_id },
  gapHours: +((B.mjd - A.mjd) * 24).toFixed(2),
  center: pair.center,
  fieldDeg: +(N * SCALE).toFixed(3),
  detector: 'SPHEREx D3 (near-infrared, about 1.6–2.4 µm)',
  credit: 'NASA/JPL-Caltech/IPAC: SPHEREx Level-2 spectral images (IRSA), reprojected; asteroid positions from JPL Horizons',
}
writeFileSync('public/spherex/blink.json', JSON.stringify(meta, null, 2))
console.log(meta)
