import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import '@fontsource/roboto/400.css'
import '@fontsource/roboto/500.css'
import './styles.css'
import { RouteSync, XRRoot, onAskGuide } from './xr'

// Until the AI guide (another team's module) is wired in, log what it would receive.
onAskGuide((req) => console.info('[ask-guide]', req))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <RouteSync />
      <XRRoot />
    </BrowserRouter>
  </StrictMode>,
)
