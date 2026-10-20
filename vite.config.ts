import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// HTTPS is required for WebXR and DeviceOrientation on phones/headsets joining over LAN.
// XR_HTTP=1 serves plain HTTP (fine on localhost only, e.g. for automated browser checks).
const http = process.env.XR_HTTP === '1'

export default defineConfig({
  plugins: http ? [react()] : [react(), basicSsl()],
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
  build: { chunkSizeWarningLimit: 2500 },
})
