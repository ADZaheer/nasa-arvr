// Removes a best-fit plane from a Uint16 heightmap written by stl-to-heightmap.mjs (some 3D-print tiles are
// tilted slabs) and re-normalises it. Prints the new z range in model units for content/sites/<id>.json.
// Usage: node scripts/detrend-heightmap.mjs <file.bin> <gridW> <gridH> <zMinUnits> <zMaxUnits>
import { readFileSync, writeFileSync } from 'node:fs'

const [, , file, wArg, hArg, lo, hi] = process.argv
const W = +wArg, H = +hArg, zMin = +lo, zMax = +hi
const raw = new Uint16Array(readFileSync(file).buffer.slice(0))
const z = Float64Array.from(raw, (v) => zMin + (v / 65535) * (zMax - zMin))
// least squares z = a*i + b*j + c
let Sii = 0, Sij = 0, Sjj = 0, Si = 0, Sj = 0, S = 0, Siz = 0, Sjz = 0, Sz = 0
for (let j = 0; j < H; j++)
  for (let i = 0; i < W; i++) {
    const v = z[j * W + i]
    Sii += i * i; Sij += i * j; Sjj += j * j; Si += i; Sj += j; S += 1
    Siz += i * v; Sjz += j * v; Sz += v
  }
const det = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
const A = [[Sii, Sij, Si], [Sij, Sjj, Sj], [Si, Sj, S]]
const B = [Siz, Sjz, Sz]
const D = det(A)
const col = (k) => det(A.map((row, r) => row.map((v, c) => (c === k ? B[r] : v))))
const a = col(0) / D, b = col(1) / D, c = col(2) / D
let nlo = Infinity, nhi = -Infinity
for (let j = 0; j < H; j++)
  for (let i = 0; i < W; i++) {
    const k = j * W + i
    z[k] -= a * i + b * j + c
    nlo = Math.min(nlo, z[k]); nhi = Math.max(nhi, z[k])
  }
const out = Uint16Array.from(z, (v) => Math.round(((v - nlo) / (nhi - nlo)) * 65535))
writeFileSync(file, Buffer.from(out.buffer))
console.log(JSON.stringify({ zMinUnits: +nlo.toFixed(3), zMaxUnits: +nhi.toFixed(3), removedSlope: { perColumn: +a.toFixed(5), perRow: +b.toFixed(5) } }))
