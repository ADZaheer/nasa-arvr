// Smoke test: open the Solar System with the emulated Meta Quest 3 (?emulate), enter VR and AR from it,
// then (with window animation frames stopped, as in a real headset) visit every place and check it loads.
// Needs a running server (npm run build, then XR_HTTP=1 npx vite preview --port 4173).
// Usage: node scripts/smoke-xr.mjs [baseUrl]   (uses the installed Microsoft Edge or Chrome, no download)
import { chromium } from 'playwright-core'

const base = process.argv[2] ?? 'http://localhost:4173'
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'msedge', args: ['--use-gl=angle', '--ignore-gpu-blocklist'] })
let failed = 0

for (const [label, option] of [
  ['VR', 'Solar System in VR'],
  ['AR', 'Solar System on your table'],
]) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${base}/xr?emulate`)
  // click a button by its visible text (the intro animates, which upsets pointer-based clicks)
  const press = (text) =>
    page.waitForFunction((t) => {
      const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes(t) && !x.disabled)
      if (b) b.click()
      return !!b
    }, text, { timeout: 30000 })
  await press('Start the expedition')
  await page.waitForTimeout(2500)
  // the picker opens by itself on a first visit; open it only if it isn't showing
  const shown = await page.waitForSelector('.mode-picker', { timeout: 5000 }).then(() => true).catch(() => false)
  if (!shown) await press('Explore')
  await press(option)
  // in a running session the app hides the Explore button (and the whole HUD in AR); a failure shows a toast
  const ok = await page
    .waitForFunction(() => ![...document.querySelectorAll('button')].some((b) => b.textContent.includes('Explore')) && !document.querySelector('.toast'), null, { timeout: 15000 })
    .then(() => page.evaluate(() => new Promise((r) => setTimeout(() => r(!document.querySelector('.toast')), 3000))))
    .catch(() => false)
  const toast = await page.locator('.toast').textContent().catch(() => null)
  const pass = ok && !toast && errors.length === 0
  if (!pass) failed++
  console.log(`${pass ? 'PASS' : 'FAIL'} Solar System in ${label}${toast ? ` — toast: ${toast}` : ''}${errors.length ? ` — errors: ${errors.join(' | ')}` : ''}`)
  if (!pass) {
    await page.close()
    continue
  }

  // Inside the session, like a real headset or phone in AR: the window's own animation frames stop
  // (only the XR session's frames run). Then visit every place and check each one finishes loading
  // with no problem card, and that the Solar System stays the Solar System (gaze must not pick the Sun).
  // The emulator (IWER) drives its own XR frames from window.requestAnimationFrame, so those calls still
  // go through: find the emulator's script and only block calls that do not come from it.
  const blocked = await page.evaluate(async () => {
    const scripts = performance.getEntriesByType('resource').map((r) => r.name).filter((n) => n.endsWith('.js'))
    let emu = null
    for (const s of scripts) if ((await (await fetch(s)).text()).includes('deviceFrameHandle')) emu = s.split('/').pop()
    if (!emu) return false
    const raf = window.requestAnimationFrame.bind(window)
    window.requestAnimationFrame = (cb) => (new Error().stack.includes(emu) ? raf(cb) : 0)
    return true
  })
  if (!blocked) {
    failed++
    console.log('FAIL   could not find the emulator script to keep its frames running')
  }
  const places = [null, 'sun', 'mercury', 'venus', 'earth', 'moon', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'bennu', 'spherex', null]
  for (const body of places) {
    const r = await page.evaluate(async (body) => {
      const { useLoading, useXRApp } = window.__xrTest
      useXRApp.getState().selectBody(body)
      const t0 = performance.now()
      while (performance.now() - t0 < 16000) {
        const l = useLoading.getState()
        if (l.problem) return { problem: `${l.problem.kind}: ${l.problem.what}` }
        if (!l.active) break
        await new Promise((res) => setTimeout(res, 250))
      }
      const loading = useLoading.getState().active
      // stay a few seconds looking straight ahead (where the Sun is in the Solar System)
      await new Promise((res) => setTimeout(res, 4000))
      return { loading, now: useXRApp.getState().bodyId, problem: useLoading.getState().problem?.kind ?? null }
    }, body)
    const ok2 = !r.problem && !r.loading && r.now === body
    if (!ok2) failed++
    console.log(`${ok2 ? 'PASS' : 'FAIL'}   ${label} → ${body ?? 'Solar System'}${ok2 ? '' : ` — ${JSON.stringify(r)}`}`)
  }
  if (errors.length) {
    failed++
    console.log(`FAIL   ${label} page errors: ${errors.join(' | ')}`)
  }
  await page.close()
}
await browser.close()
process.exit(failed ? 1 : 0)
