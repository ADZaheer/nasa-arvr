// Builds the web-sized, tiered assets in public/ from downloaded source files (kept outside the repo).
// Usage: node scripts/build-assets.mjs <sourceDir>
//   <sourceDir>/polyhaven/<id>_{Diffuse,nor_gl,Rough}_{1k,2k}.jpg   CC0, https://polyhaven.com
//   <sourceDir>/nasa/starmap_2020_4k.exr                            NASA SVS Deep Star Maps 2020 (public domain)
//   <sourceDir>/nasa/megt90n000cb.img                                MGS MOLA MEGDR 4 px/deg topography (NASA PDS)
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js'

const src = process.argv[2]
if (!src) throw new Error('usage: node scripts/build-assets.mjs <sourceDir>')
const out = (p) => join('public', p)
mkdirSync(out('textures/ground'), { recursive: true })
mkdirSync(out('textures/space'), { recursive: true })

// ---- Mars ground materials: grayscale albedo (tinted to Mars colours in the shader), normal, roughness
const SETS = { gravel: 'rock_ground_02', dust: 'red_sand', rock: 'rock_boulder_dry' }
const SIZES = { 512: '1k', 1024: '1k', 2048: '2k' }
for (const [name, id] of Object.entries(SETS)) {
  for (const [size, from] of Object.entries(SIZES)) {
    const s = Number(size)
    const p = (m) => join(src, 'polyhaven', `${id}_${m}_${from}.jpg`)
    const tag = s === 512 ? '512' : s === 1024 ? '1k' : '2k'
    await sharp(p('Diffuse')).resize(s, s).grayscale().normalise().jpeg({ quality: 82, mozjpeg: true }).toFile(out(`textures/ground/${name}_albedo_${tag}.jpg`))
    await sharp(p('nor_gl')).resize(s, s).jpeg({ quality: 88, mozjpeg: true }).toFile(out(`textures/ground/${name}_normal_${tag}.jpg`))
    await sharp(p('Rough')).resize(s, s).grayscale().jpeg({ quality: 80, mozjpeg: true }).toFile(out(`textures/ground/${name}_rough_${tag}.jpg`))
  }
}
console.log('ground textures done')

// ---- Star map: HDR EXR → tone-mapped sRGB JPEGs (4k / 2k / 1k)
{
  const buf = readFileSync(join(src, 'nasa', 'starmap_2020_4k.exr'))
  const exr = new EXRLoader().setDataType(1015 /* FloatType */).parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
  const { width, height, data } = exr
  const ch = data.length / (width * height)
  const rgb = Buffer.alloc(width * height * 3)
  const exposure = 2.2
  for (let i = 0; i < width * height; i++) {
    for (let c = 0; c < 3; c++) {
      const v = data[i * ch + c] * exposure
      const mapped = v / (1 + v) // Reinhard
      rgb[i * 3 + c] = Math.round(255 * Math.pow(Math.min(1, mapped), 1 / 2.2))
    }
  }
  // EXR rows are bottom-up in three's loader
  const flipped = sharp(rgb, { raw: { width, height, channels: 3 } }).flip()
  const base = await flipped.toBuffer()
  for (const [w, tag] of [[4096, '4k'], [2048, '2k'], [1024, '1k']]) {
    await sharp(base, { raw: { width, height, channels: 3 } }).resize(w, w / 2).jpeg({ quality: 86, mozjpeg: true }).toFile(out(`textures/space/starmap_${tag}.jpg`))
  }
  console.log('star map done', width, height)
}

// ---- Mars relief: MOLA heights → tangent-space normal map aligned with mars.jpg (centred on 0° longitude)
{
  const W = 1440, H = 720
  const raw = readFileSync(join(src, 'nasa', 'megt90n000cb.img'))
  const h = new Float32Array(W * H)
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      const si = (i + W / 2) % W // MOLA starts at 0°E; our maps start at 180°W
      h[j * W + i] = raw.readInt16BE((j * W + si) * 2)
    }
  const R = 3389500, exaggeration = 12
  const px = (2 * Math.PI * R) / W
  const at = (i, j) => h[Math.min(H - 1, Math.max(0, j)) * W + ((i + W) % W)]
  const nrm = Buffer.alloc(W * H * 3)
  for (let j = 0; j < H; j++) {
    const lat = (0.5 - (j + 0.5) / H) * Math.PI
    const dx = px * Math.max(0.05, Math.cos(lat))
    for (let i = 0; i < W; i++) {
      const gx = ((at(i + 1, j) - at(i - 1, j)) / (2 * dx)) * exaggeration
      const gy = ((at(i, j - 1) - at(i, j + 1)) / (2 * px)) * exaggeration
      let nx = -gx, ny = -gy, nz = 1
      const l = Math.hypot(nx, ny, nz)
      nx /= l; ny /= l; nz /= l
      const k = (j * W + i) * 3
      nrm[k] = Math.round((nx * 0.5 + 0.5) * 255)
      nrm[k + 1] = Math.round((ny * 0.5 + 0.5) * 255)
      nrm[k + 2] = Math.round((nz * 0.5 + 0.5) * 255)
    }
  }
  for (const [w, tag] of [[2048, '2k'], [1024, '1k']]) {
    await sharp(nrm, { raw: { width: W, height: H, channels: 3 } }).resize(w, w / 2).png({ compressionLevel: 9 }).toFile(out(`textures/mars_normal_${tag}.png`))
  }
  console.log('mars normal map done')
}
