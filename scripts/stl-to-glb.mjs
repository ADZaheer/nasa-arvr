// Converts a binary STL (e.g. NASA's Bennu 3D-print model) into a minimal GLB
// (positions + normals), centred and scaled to unit radius, with STL +Z mapped to +Y (north up).
// Usage: node scripts/stl-to-glb.mjs <in.stl> <out.glb>
import { readFileSync, writeFileSync } from 'node:fs'

const [, , inPath, outPath] = process.argv
if (!inPath || !outPath) {
  console.error('usage: node scripts/stl-to-glb.mjs <in.stl> <out.glb>')
  process.exit(1)
}
const buf = readFileSync(inPath)
const triCount = buf.readUInt32LE(80)
if (84 + triCount * 50 !== buf.length) throw new Error('not a binary STL')

const pos = new Float32Array(triCount * 9)
for (let t = 0; t < triCount; t++) {
  const o = 84 + t * 50 + 12 // skip facet normal, recompute below
  for (let v = 0; v < 3; v++) {
    const x = buf.readFloatLE(o + v * 12)
    const y = buf.readFloatLE(o + v * 12 + 4)
    const z = buf.readFloatLE(o + v * 12 + 8)
    const i = t * 9 + v * 3
    pos[i] = x; pos[i + 1] = z; pos[i + 2] = -y
  }
}
// centre on bounding-box centre, scale so max radius = 1
const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) {
  min[k] = Math.min(min[k], pos[i + k]); max[k] = Math.max(max[k], pos[i + k])
}
const c = min.map((m, k) => (m + max[k]) / 2)
let r = 0
for (let i = 0; i < pos.length; i += 3) {
  for (let k = 0; k < 3; k++) pos[i + k] -= c[k]
  r = Math.max(r, Math.hypot(pos[i], pos[i + 1], pos[i + 2]))
}
for (let i = 0; i < pos.length; i++) pos[i] /= r
// flat normals
const nrm = new Float32Array(pos.length)
for (let t = 0; t < triCount; t++) {
  const i = t * 9
  const ax = pos[i + 3] - pos[i], ay = pos[i + 4] - pos[i + 1], az = pos[i + 5] - pos[i + 2]
  const bx = pos[i + 6] - pos[i], by = pos[i + 7] - pos[i + 1], bz = pos[i + 8] - pos[i + 2]
  let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx
  const l = Math.hypot(nx, ny, nz) || 1
  nx /= l; ny /= l; nz /= l
  for (let v = 0; v < 3; v++) { nrm[i + v * 3] = nx; nrm[i + v * 3 + 1] = ny; nrm[i + v * 3 + 2] = nz }
}
const pmin = [Infinity, Infinity, Infinity], pmax = [-Infinity, -Infinity, -Infinity]
for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) {
  pmin[k] = Math.min(pmin[k], pos[i + k]); pmax[k] = Math.max(pmax[k], pos[i + k])
}
const bin = Buffer.concat([Buffer.from(pos.buffer), Buffer.from(nrm.buffer)])
const vcount = triCount * 3
const gltf = {
  asset: { version: '2.0', generator: 'cosmic-expedition stl-to-glb' },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0, name: 'body' }],
  meshes: [{ name: 'body', primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, material: 0 }] }],
  materials: [{ name: 'regolith', pbrMetallicRoughness: { baseColorFactor: [0.42, 0.4, 0.38, 1], metallicFactor: 0, roughnessFactor: 1 } }],
  buffers: [{ byteLength: bin.length }],
  bufferViews: [
    { buffer: 0, byteOffset: 0, byteLength: pos.byteLength, target: 34962 },
    { buffer: 0, byteOffset: pos.byteLength, byteLength: nrm.byteLength, target: 34962 },
  ],
  accessors: [
    { bufferView: 0, componentType: 5126, count: vcount, type: 'VEC3', min: pmin, max: pmax },
    { bufferView: 1, componentType: 5126, count: vcount, type: 'VEC3' },
  ],
}
const pad = (b, fill) => (b.length % 4 ? Buffer.concat([b, Buffer.alloc(4 - (b.length % 4), fill)]) : b)
const json = pad(Buffer.from(JSON.stringify(gltf)), 0x20)
const binP = pad(bin, 0)
const header = Buffer.alloc(12)
header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4)
header.writeUInt32LE(12 + 8 + json.length + 8 + binP.length, 8)
const chunk = (len, type) => { const h = Buffer.alloc(8); h.writeUInt32LE(len, 0); h.writeUInt32LE(type, 4); return h }
writeFileSync(outPath, Buffer.concat([header, chunk(json.length, 0x4e4f534a), json, chunk(binP.length, 0x004e4942), binP]))
console.log(`wrote ${outPath}: ${triCount} triangles, source radius ${r.toFixed(3)}`)
