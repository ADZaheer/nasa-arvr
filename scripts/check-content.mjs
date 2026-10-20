// Fails (exit 1) if any hotspot in content/bodies or content/sites is missing a source or breaks the schema limits.
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'content')
const dir = join(root, 'bodies')
const siteDir = join(root, 'sites')
const siteIds = new Set(readdirSync(siteDir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)))
const KINDS = new Set(['fact', 'illustration', 'candidate'])
const words = (s) => String(s ?? '').trim().split(/\s+/).filter(Boolean).length
const errors = []
let count = 0

const files = [
  ...readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => ({ file: f, path: join(dir, f), site: false })),
  ...readdirSync(siteDir).filter((f) => f.endsWith('.json')).map((f) => ({ file: 'sites/' + f, path: join(siteDir, f), site: true })),
]
for (const { file, path, site } of files) {
  let body
  try {
    body = JSON.parse(readFileSync(path, 'utf8'))
  } catch (e) {
    errors.push(`${file}: invalid JSON (${e.message})`)
    continue
  }
  const ids = new Set()
  for (const [i, h] of (body.hotspots ?? []).entries()) {
    const at = `${file} hotspot[${i}] ${h.id ?? '(no id)'}`
    count++
    if (!h.id) errors.push(`${at}: missing id`)
    else if (ids.has(h.id)) errors.push(`${at}: duplicate id`)
    ids.add(h.id)
    const owner = site ? body.body : body.id
    if (h.body !== owner) errors.push(`${at}: body "${h.body}" does not match "${owner}"`)
    if (h.site !== undefined && !siteIds.has(h.site)) errors.push(`${at}: site "${h.site}" has no content/sites/${h.site}.json`)
    if (!h.source || !h.source.label || !/^https?:\/\//.test(h.source.url ?? '')) errors.push(`${at}: missing source {label,url}`)
    if (!h.title) errors.push(`${at}: missing title`)
    if (!h.short || words(h.short) > 25) errors.push(`${at}: short must be 1-25 words (has ${words(h.short)})`)
    if (!h.detail || words(h.detail) > 80) errors.push(`${at}: detail must be 1-80 words (has ${words(h.detail)})`)
    if (!KINDS.has(h.kind)) errors.push(`${at}: kind must be fact|illustration|candidate`)
    if (!h.guidePrompt) errors.push(`${at}: missing guidePrompt`)
    const a = h.anchor ?? {}
    if (a.type === 'latlon') {
      if (typeof a.lat !== 'number' || typeof a.lon !== 'number') errors.push(`${at}: latlon anchor needs numeric lat/lon`)
    } else if (a.type === 'mesh') {
      if (!Array.isArray(a.point) || a.point.length !== 3) errors.push(`${at}: mesh anchor needs point [x,y,z]`)
    } else if (a.type === 'site') {
      if (!site) errors.push(`${at}: site anchors are only allowed in content/sites`)
      if (typeof a.x !== 'number' || typeof a.z !== 'number') errors.push(`${at}: site anchor needs numeric x/z (metres)`)
    } else errors.push(`${at}: anchor.type must be latlon|mesh|site`)
  }
}

if (errors.length) {
  console.error(`check-content: ${errors.length} problem(s)\n  ` + errors.join('\n  '))
  process.exit(1)
}
console.log(`check-content: ${count} hotspots OK`)
