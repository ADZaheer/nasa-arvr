import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import type { Plugin } from 'vite'

/** After a build: list every file the app can use, so "Save for offline" can download them all.
 *  Skips the desktop headset emulator (only used for testing) and source maps. */
function offlineManifest(): Plugin {
  return {
    name: 'offline-manifest',
    apply: 'build',
    closeBundle() {
      const out = 'dist'
      const files: string[] = []
      let bytes = 0
      const walk = (dir: string) => {
        for (const name of readdirSync(dir)) {
          const full = join(dir, name)
          const st = statSync(full)
          if (st.isDirectory()) walk(full)
          else {
            const url = '/' + relative(out, full).split(sep).join('/')
            if (/.map$|offline-manifest|sw.js$|(emulate|music_room|living_room|office_large|office_small|meeting_room|meta)-/.test(url)) continue
            files.push(url)
            bytes += st.size
          }
        }
      }
      walk(out)
      writeFileSync(join(out, 'offline-manifest.json'), JSON.stringify({ version: Date.now(), bytes, files }))
    },
  }
}

// HTTPS is required for WebXR and DeviceOrientation on phones/headsets joining over LAN.
// XR_HTTP=1 serves plain HTTP (fine on localhost only, e.g. for automated browser checks).
const http = process.env.XR_HTTP === '1'

export default defineConfig({
  plugins: http ? [react(), offlineManifest()] : [react(), basicSsl(), offlineManifest()],
  // one three.js for everything (the ?emulate dev UI ships an older nested copy that breaks when mixed)
  resolve: { dedupe: ['three'] },
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
  build: { chunkSizeWarningLimit: 2500 },
})
