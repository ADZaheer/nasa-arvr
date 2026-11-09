// Smoke test: open the Solar System with the emulated Meta Quest 3 (?emulate), then enter VR and AR
// from the Solar System and check that a session starts with no error toast.
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
  await page.close()
}
await browser.close()
process.exit(failed ? 1 : 0)
