// Builds terrain heightmaps + models for the extra walkable sites from NASA sources (kept outside the repo).
// Usage: node scripts/build-sites.mjs <sourceDir>
//   <sourceDir>/nasa/megt44n000hb.img   MGS MOLA MEGDR 128 px/deg tile, 0–44°N, 0–90°E (NASA PDS)  → Jezero
//   <sourceDir>/bennu.stl               OSIRIS-REx shape model (NASA 3D Resources)                → Bennu surface patch
//   <sourceDir>/nasa/curiosity.stl      Curiosity rover 3D-print model (NASA 3D Resources)        → simplified GLB
// Prints the metadata to paste into content/sites/<id>.json.
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { BufferAttribute, BufferGeometry, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { computeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh'
import { MeshoptSimplifier } from 'meshoptimizer'

const src = process.argv[2]
if (!src) throw new Error('usage: node scripts/build-sites.mjs <sourceDir>')
BufferGeometry.prototype.computeBoundsTree = computeBoundsTree
Mesh.prototype.raycast = acceleratedRaycast
const u16 = (vals, lo, hi) => Uint16Array.from(vals, (v) => Math.round(((v - lo) / (hi - lo)) * 65535))
const range = (a) => a.reduce(([lo, hi], v) => [Math.min(lo, v), Math.max(hi, v)], [Infinity, -Infinity])

// ---- Jezero: crop MOLA 128 px/deg around the crater, bilinear-resample to 384×384 (metres)
{
  const W = 11520, H = 5632, PPD = 128
  const raw = readFileSync(join(src, 'nasa', 'megt44n000hb.img'))
  const at = (row, col) => raw.readInt16BE((Math.min(H - 1, Math.max(0, row)) * W + Math.min(W - 1, Math.max(0, col))) * 2)
  const lat0 = 18.38, lon0 = 77.58, span = 1.3 // degrees
  const N = 384
  const out = new Float64Array(N * N)
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const lat = lat0 + span / 2 - (j / (N - 1)) * span
      const lon = lon0 - span / 2 + (i / (N - 1)) * span
      const r = (44 - lat) * PPD - 0.5, c = lon * PPD - 0.5
      const r0 = Math.floor(r), c0 = Math.floor(c), fr = r - r0, fc = c - c0
      out[j * N + i] = (at(r0, c0) * (1 - fc) + at(r0, c0 + 1) * fc) * (1 - fr) + (at(r0 + 1, c0) * (1 - fc) + at(r0 + 1, c0 + 1) * fc) * fr
    }
  const [lo, hi] = range(out)
  writeFileSync('public/terrain/jezero.bin', Buffer.from(u16(out, lo, hi).buffer))
  const R = 3389500, deg = (Math.PI * R) / 180
  console.log('jezero', JSON.stringify({ gridW: N, gridH: N, widthUnits: +(span * deg * Math.cos((lat0 * Math.PI) / 180)).toFixed(1), depthUnits: +(span * deg).toFixed(1), zMinUnits: lo, zMaxUnits: hi }))
}

// ---- Bennu: real-size surface patch around Nightingale (56°N, 43°E in our model frame), by raycasting the shape model
{
  const geom = new STLLoader().parse(readFileSync(join(src, 'bennu.stl')).buffer)
  geom.computeBoundingBox()
  const c = geom.boundingBox.getCenter(new Vector3())
  geom.translate(-c.x, -c.y, -c.z)
  // STL +Z → +Y (north up), as in stl-to-glb.mjs
  const p = geom.attributes.position
  let maxR = 0
  for (let k = 0; k < p.count; k++) {
    const x = p.getX(k), y = p.getY(k), z = p.getZ(k)
    p.setXYZ(k, x, z, -y)
    maxR = Math.max(maxR, Math.hypot(x, y, z))
  }
  const SCALE = 282 / maxR // Bennu's longest radius ≈ 282 m
  geom.scale(SCALE, SCALE, SCALE)
  geom.computeBoundsTree()
  const mesh = new Mesh(geom, new MeshBasicMaterial())
  const lat = (56 * Math.PI) / 180, lon = (43 * Math.PI) / 180
  const phi = ((lon * 180) / Math.PI + 180) / 360 * Math.PI * 2, theta = Math.PI / 2 - lat
  const up = new Vector3(-Math.cos(phi) * Math.sin(theta), Math.cos(theta), Math.sin(phi) * Math.sin(theta)).normalize()
  const east = new Vector3(0, 1, 0).cross(up).normalize()
  const north = up.clone().cross(east).normalize()
  const ray = new Raycaster()
  const N = 256, SPAN = 360 // metres across the patch
  const h = new Float64Array(N * N)
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const x = (i / (N - 1) - 0.5) * SPAN, z = (j / (N - 1) - 0.5) * SPAN // x east, z south
      const o = up.clone().multiplyScalar(600).addScaledVector(east, x).addScaledVector(north, -z)
      ray.set(o, up.clone().negate())
      const hit = ray.intersectObject(mesh, false)[0]
      // height above the tangent plane through the patch centre; misses fall away (beyond the limb)
      h[j * N + i] = hit ? hit.point.dot(up) - 600 + 600 : -150
    }
  const centre = h[(N >> 1) * N + (N >> 1)]
  for (let k = 0; k < h.length; k++) h[k] -= centre
  const [lo, hi] = range(h)
  writeFileSync('public/terrain/bennu-nightingale.bin', Buffer.from(u16(h, lo, hi).buffer))
  console.log('bennu', JSON.stringify({ gridW: N, gridH: N, widthUnits: SPAN, depthUnits: SPAN, zMinUnits: lo, zMaxUnits: hi }))
}

// ---- Curiosity: weld + simplify the 3D-print STL into a light GLB (positions + normals)
{
  await MeshoptSimplifier.ready
  const geom = new STLLoader().parse(readFileSync(join(src, 'nasa', 'curiosity.stl')).buffer)
  const pos = geom.attributes.position.array
  // weld identical vertices
  const map = new Map(), verts = [], index = new Uint32Array(pos.length / 3)
  for (let k = 0; k < pos.length / 3; k++) {
    const key = `${pos[k * 3].toFixed(3)},${pos[k * 3 + 1].toFixed(3)},${pos[k * 3 + 2].toFixed(3)}`
    let id = map.get(key)
    if (id === undefined) {
      id = verts.length / 3
      map.set(key, id)
      verts.push(pos[k * 3], pos[k * 3 + 2], -pos[k * 3 + 1]) // Z-up → Y-up
    }
    index[k] = id
  }
  const vp = new Float32Array(verts)
  const target = 60000 * 3
  const [simplified] = MeshoptSimplifier.simplify(index, vp, 3, target, 0.01)
  // de-index for flat normals, normalise size to 1 (scaled in the scene)
  const g = new BufferGeometry()
  const flat = new Float32Array(simplified.length * 3)
  for (let k = 0; k < simplified.length; k++) flat.set(vp.subarray(simplified[k] * 3, simplified[k] * 3 + 3), k * 3)
  g.setAttribute('position', new BufferAttribute(flat, 3))
  g.computeBoundingBox()
  const bc = g.boundingBox.getCenter(new Vector3()), bs = g.boundingBox.getSize(new Vector3())
  g.translate(-bc.x, -g.boundingBox.min.y, -bc.z)
  const s = 1 / Math.max(bs.x, bs.z)
  g.scale(s, s, s)
  g.computeVertexNormals()
  writeGLB('public/models/curiosity.glb', g, [0.82, 0.8, 0.76])
  console.log('curiosity', simplified.length / 3, 'triangles')
}

for (const [from, to] of [['nasa/perseverance.glb', 'perseverance.glb'], ['nasa/lunar-module.glb', 'lunar-module.glb'], ['nasa/osiris-rex.glb', 'osiris-rex.glb']]) copyFileSync(join(src, from), join('public/models', to))
copyFileSync(join(src, 'nasa/moon.jpg'), 'public/textures/moon.jpg')
console.log('models + moon texture copied')

function writeGLB(path, g, rgb) {
  const P = g.attributes.position.array, Nn = g.attributes.normal.array
  const n = P.length / 3
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]
  for (let k = 0; k < n; k++) for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], P[k * 3 + a]); mx[a] = Math.max(mx[a], P[k * 3 + a]) }
  const bin = Buffer.concat([Buffer.from(new Float32Array(P).buffer), Buffer.from(new Float32Array(Nn).buffer)])
  const json = {
    asset: { version: '2.0', generator: 'cosmic-expedition build-sites' },
    scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [...rgb, 1], metallicFactor: 0.3, roughnessFactor: 0.6 } }],
    buffers: [{ byteLength: bin.length }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: n * 12 }, { buffer: 0, byteOffset: n * 12, byteLength: n * 12 }],
    accessors: [{ bufferView: 0, componentType: 5126, count: n, type: 'VEC3', min: mn, max: mx }, { bufferView: 1, componentType: 5126, count: n, type: 'VEC3' }],
  }
  const pad = (b, f) => (b.length % 4 ? Buffer.concat([b, Buffer.alloc(4 - (b.length % 4), f)]) : b)
  const js = pad(Buffer.from(JSON.stringify(json)), 0x20), bp = pad(bin, 0)
  const hdr = Buffer.alloc(12); hdr.writeUInt32LE(0x46546c67, 0); hdr.writeUInt32LE(2, 4); hdr.writeUInt32LE(12 + 8 + js.length + 8 + bp.length, 8)
  const ch = (len, t) => { const b = Buffer.alloc(8); b.writeUInt32LE(len, 0); b.writeUInt32LE(t, 4); return b }
  writeFileSync(path, Buffer.concat([hdr, ch(js.length, 0x4e4f534a), js, ch(bp.length, 0x004e4942), bp]))
}
