// Rasterises the top surface of a binary STL terrain tile (e.g. NASA 3D-printing DEM models) into a
// Uint16 heightmap, plus a PNG preview for eyeballing. Rows run north → south (STL +Y = north).
// Usage: node scripts/stl-to-heightmap.mjs <in.stl> <out.bin> <gridW> [preview.png]
// Prints the metadata (grid size, extents and z range in model units) to paste into content/sites/<id>.json.
import { readFileSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const [, , inPath, outPath, gridArg, previewPath] = process.argv
if (!inPath || !outPath) {
  console.error('usage: node scripts/stl-to-heightmap.mjs <in.stl> <out.bin> <gridW> [preview.png]')
  process.exit(1)
}
const buf = readFileSync(inPath)
const n = buf.readUInt32LE(80)
if (84 + n * 50 !== buf.length) throw new Error('not a binary STL')
const tri = new Float32Array(n * 9)
for (let t = 0; t < n; t++) for (let k = 0; k < 9; k++) tri[t * 9 + k] = buf.readFloatLE(84 + t * 50 + 12 + k * 4)

let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity
for (let i = 0; i < tri.length; i += 3) {
  minX = Math.min(minX, tri[i]); maxX = Math.max(maxX, tri[i])
  minY = Math.min(minY, tri[i + 1]); maxY = Math.max(maxY, tri[i + 1])
  minZ = Math.min(minZ, tri[i + 2]); maxZ = Math.max(maxZ, tri[i + 2])
}
const W = Number(gridArg ?? 512)
const H = Math.max(2, Math.round((W * (maxY - minY)) / (maxX - minX)))
const cell = (maxX - minX) / (W - 1)
const grid = new Float32Array(W * H).fill(-Infinity)

for (let t = 0; t < n; t++) {
  const o = t * 9
  const ax = tri[o], ay = tri[o + 1], az = tri[o + 2]
  const bx = tri[o + 3], by = tri[o + 4], bz = tri[o + 5]
  const cx = tri[o + 6], cy = tri[o + 7], cz = tri[o + 8]
  const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
  if (Math.abs(d) < 1e-12) continue // vertical wall or degenerate
  const i0 = Math.max(0, Math.ceil((Math.min(ax, bx, cx) - minX) / cell))
  const i1 = Math.min(W - 1, Math.floor((Math.max(ax, bx, cx) - minX) / cell))
  const j0 = Math.max(0, Math.ceil((maxY - Math.max(ay, by, cy)) / cell))
  const j1 = Math.min(H - 1, Math.floor((maxY - Math.min(ay, by, cy)) / cell))
  for (let j = j0; j <= j1; j++) {
    const py = maxY - j * cell
    for (let i = i0; i <= i1; i++) {
      const px = minX + i * cell
      const l1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / d
      const l2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / d
      const l3 = 1 - l1 - l2
      if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue
      const z = l1 * az + l2 * bz + l3 * cz
      if (z > grid[j * W + i]) grid[j * W + i] = z
    }
  }
}
// fill any holes from neighbours
for (let pass = 0; pass < 8; pass++) {
  let holes = 0
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    if (grid[j * W + i] !== -Infinity) continue
    let s = 0, c = 0
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const v = grid[(j + dj) * W + (i + di)]
      if (i + di >= 0 && i + di < W && j + dj >= 0 && j + dj < H && v !== -Infinity) { s += v; c++ }
    }
    if (c) grid[j * W + i] = s / c
    else holes++
  }
  if (!holes) break
}
let zLo = Infinity, zHi = -Infinity
for (const v of grid) if (v !== -Infinity) { zLo = Math.min(zLo, v); zHi = Math.max(zHi, v) }
const out = new Uint16Array(W * H)
for (let k = 0; k < out.length; k++) out[k] = Math.round(((Math.max(grid[k], zLo) - zLo) / (zHi - zLo)) * 65535)
writeFileSync(outPath, Buffer.from(out.buffer))

// simple stats to help pick real-world scales
const at = (fx, fy) => grid[Math.round(fy * (H - 1)) * W + Math.round(fx * (W - 1))]
const centre = []
for (let j = Math.floor(H * 0.4); j < H * 0.6; j++) for (let i = Math.floor(W * 0.4); i < W * 0.6; i++) centre.push(grid[j * W + i])
centre.sort((a, b) => a - b)
let peak = { z: -Infinity, i: 0, j: 0 }
for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (grid[j * W + i] > peak.z) peak = { z: grid[j * W + i], i, j }
console.log(JSON.stringify({
  gridW: W, gridH: H, widthUnits: +(maxX - minX).toFixed(3), depthUnits: +(maxY - minY).toFixed(3),
  zMinUnits: +zLo.toFixed(3), zMaxUnits: +zHi.toFixed(3),
  stats: { centreMedian: +centre[centre.length >> 1].toFixed(3), centreMin: +centre[0].toFixed(3), cornerNW: +at(0.02, 0.02).toFixed(3), peak },
}))

if (previewPath) {
  const crcTable = Array.from({ length: 256 }, (_, k) => { let c = k; for (let b = 0; b < 8; b++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
  const chunk = (type, data) => { const l = Buffer.alloc(4); l.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]) }
  const raw = Buffer.alloc((W + 1) * H)
  for (let j = 0; j < H; j++) { raw[j * (W + 1)] = 0; for (let i = 0; i < W; i++) raw[j * (W + 1) + 1 + i] = out[j * W + i] >> 8 }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 0
  writeFileSync(previewPath, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]))
}
