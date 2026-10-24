// Terrain for the Mars Exploration Rover landing sites, cropped from NASA MGS MOLA MEGDR 128 px/deg tiles.
// Only the rows needed are downloaded (HTTP range requests on the PDS files), e.g. for Gusev:
//   curl -r <row0*23040>-<(row1+1)*23040-1> -o megt00n090hb.rows<row0>-<row1>.bin \
//     https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/meg128/megt00n090hb.img
// Usage: node scripts/build-sites-mer.mjs <sourceDir>   (expects <sourceDir>/nasa/<tile>.rows<a>-<b>.bin)
// Prints the terrain metadata for content/sites/<id>.json.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const src = process.argv[2]
if (!src) throw new Error('usage: node scripts/build-sites-mer.mjs <sourceDir>')
const W = 11520, PPD = 128, R = 3389500
const deg = (Math.PI * R) / 180

/** Crop `span` degrees around (lat0, lon0) and bilinear-resample to N×N heights in metres. */
function crop({ id, file, row0, topLat, leftLon, lat0, lon0, span, N = 384 }) {
  const raw = readFileSync(join(src, 'nasa', file))
  const rows = raw.length / (W * 2)
  const at = (row, col) => raw.readInt16BE((Math.min(rows - 1, Math.max(0, row - row0)) * W + Math.min(W - 1, Math.max(0, col))) * 2)
  const out = new Float64Array(N * N)
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const lat = lat0 + span / 2 - (j / (N - 1)) * span
      const lon = lon0 - span / 2 + (i / (N - 1)) * span
      const r = (topLat - lat) * PPD - 0.5, c = (lon - leftLon) * PPD - 0.5
      const r0 = Math.floor(r), c0 = Math.floor(c), fr = r - r0, fc = c - c0
      out[j * N + i] = (at(r0, c0) * (1 - fc) + at(r0, c0 + 1) * fc) * (1 - fr) + (at(r0 + 1, c0) * (1 - fc) + at(r0 + 1, c0 + 1) * fc) * fr
    }
  let lo = Infinity, hi = -Infinity
  for (const v of out) (lo = Math.min(lo, v)), (hi = Math.max(hi, v))
  writeFileSync(`public/terrain/${id}.bin`, Buffer.from(Uint16Array.from(out, (v) => Math.round(((v - lo) / (hi - lo)) * 65535)).buffer))
  console.log(id, JSON.stringify({ gridW: N, gridH: N, widthUnits: +(span * deg * Math.cos((lat0 * Math.PI) / 180)).toFixed(1), depthUnits: +(span * deg).toFixed(1), zMinUnits: lo, zMaxUnits: hi }))
}

// Spirit (MER-A) landing site, Gusev Crater: 14.5718° S, 175.4785° E (NASA/JPL)
crop({ id: 'gusev', file: 'megt00n090hb.rows1770-1960.bin', row0: 1770, topLat: 0, leftLon: 90, lat0: -14.5718, lon0: 175.4785, span: 1.3 })
// Opportunity (MER-B) landing site, Eagle crater, Meridiani Planum: 1.9483° S, 354.4742° E (NASA/JPL)
crop({ id: 'meridiani', file: 'megt00n270hb.rows150-350.bin', row0: 150, topLat: 0, leftLon: 270, lat0: -1.9483, lon0: 354.4742, span: 1.3 })
