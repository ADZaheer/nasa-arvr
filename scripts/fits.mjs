// Minimal FITS reader (used by build-blink.mjs): lists HDUs and returns an image HDU's pixels.
// Run directly to print the HDUs of files: node scripts/fits.mjs a.fits b.fits
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export function readFits(path) {
  const b = readFileSync(path)
  const hdus = []
  let off = 0
  while (off + 2880 <= b.length) {
    const cards = {}
    let i = off
    let done = false
    for (; i < b.length; i += 80) {
      const card = b.toString('latin1', i, i + 80)
      const key = card.slice(0, 8).trim()
      if (key === 'END') {
        done = true
        break
      }
      if (card[8] === '=') {
        let v = card.slice(10).split(' /')[0].trim()
        if (v.startsWith("'")) v = v.replace(/^'|'\s*$/g, '').trim()
        else if (!isNaN(+v)) v = +v
        cards[key] = v
      }
    }
    if (!done) break
    const headerLen = Math.ceil((i + 80 - off) / 2880) * 2880
    const bitpix = cards.BITPIX, naxis = cards.NAXIS ?? 0
    let n = naxis ? 1 : 0
    for (let k = 1; k <= naxis; k++) n *= cards['NAXIS' + k]
    const bytes = (Math.abs(bitpix) / 8) * n
    hdus.push({ cards, dataStart: off + headerLen, bytes, buf: b })
    off += headerLen + Math.ceil(bytes / 2880) * 2880
  }
  return hdus
}

export function pixels(h) {
  const { cards, dataStart, buf } = h
  const w = cards.NAXIS1, hgt = cards.NAXIS2, bp = cards.BITPIX
  const out = new Float32Array(w * hgt)
  for (let k = 0; k < w * hgt; k++) {
    const o = dataStart + k * (Math.abs(bp) / 8)
    out[k] = bp === -32 ? buf.readFloatBE(o) : bp === -64 ? buf.readDoubleBE(o) : bp === 16 ? buf.readInt16BE(o) : bp === 32 ? buf.readInt32BE(o) : buf.readUInt8(o)
  }
  return { w, h: hgt, data: out }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const f of process.argv.slice(2)) {
    const hs = readFits(f)
    hs.forEach((h, k) => {
      const c = h.cards
      console.log(f, k, c.EXTNAME, c.BITPIX, c.NAXIS1, c.NAXIS2, 'CTYPE', c.CTYPE1, 'CRVAL', c.CRVAL1, c.CRVAL2, 'CRPIX', c.CRPIX1, c.CRPIX2, 'CD', c.CD1_1, c.CD1_2, c.CD2_1, c.CD2_2, 'MJD', c['MJD-AVG'] ?? c['MJD-OBS'])
    })
  }
}
