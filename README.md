# AR Cosmic Expedition (XR module)

The AR/VR part of the team's NASA Space Apps 2026 entry (Planet X / SPHEREx challenge). It's a standalone React + Vite + TypeScript app. The module itself lives in `src/xr/`, so the team web app can pull it in later.

Stack: three.js via `@react-three/fiber`, `@react-three/xr` (WebXR), `@react-three/drei` and `zustand`.

## Run

```sh
set npm_config_cache=D:\npm-cache   # keep npm on D:
npm install
npm run dev        # HTTPS on https://<LAN-IP>:5173 (self-signed cert: accept the warning on each device)
npm run build      # content check + type-check + production build
npm run check:content
```

Phones and headsets need HTTPS for WebXR and motion sensors, so the dev server uses `@vitejs/plugin-basic-ssl` with `--host`. `XR_HTTP=1 npx vite --port 5174` serves plain HTTP for localhost-only testing.

## What picks which experience (`XRRoot`)

1. If `navigator.xr.isSessionSupported('immersive-vr')` → **Enter VR**. Controllers and hand rays, plus 1.5 s gaze dwell. The info card is drawn in 3D.
2. If `immersive-ar` is supported (Android Chrome + ARCore) → **Enter AR**. Hit-test tabletop placement: a reticle appears, tap to place it, and "Move model" places it again. The info card uses the WebXR DOM overlay.
3. On a touch device with orientation sensors → **Look around (motion)**. This is gyro look-around and asks for permission on iOS. Tap pins, or hold the centre dot on one.
4. Otherwise → desktop OrbitControls with mouse hover and click.

## Routes and shared store

- `/xr` is the Solar System hub. It's labelled "not to scale".
- `/xr/body/:id?band=…&obs=…` is the body explorer. The web viewer can deep-link here.
- `useXRApp` (zustand, `src/xr/store.ts`) holds `bodyId`, `band`, `observation`, `hotspotId`, `mode`, etc. In dev builds it is also available as `window.__xrApp`.

## Events for other modules

- `cosmic:ask-guide` fires on `window` with detail `{ body, hotspotId, guidePrompt }`. This is for the AI guide team; subscribe with `onAskGuide()`.
- `cosmic:back-to-source` fires with detail `{ body, hotspotId, observation }`. It's a stub for the web viewer.

## Content

`content/bodies/<id>.json` has the schema `{ id, name, type, texture?, model?, hotspots[] }`. Each hotspot looks like this:

```json
{ "id": "...", "body": "mars",
  "anchor": { "type": "latlon", "lat": 18.65, "lon": -133.8 }   // or { "type": "mesh", "point": [x,y,z] }
  "title": "...", "short": "≤25 words", "detail": "≤80 words",
  "kind": "fact | illustration | candidate",
  "source": { "label": "...", "url": "https://..." }, "guidePrompt": "..." }
```

- A `mesh` anchor is a direction from the body centre in model space (north = +Y), and it gets snapped onto the mesh surface at runtime.
- `scripts/check-content.mjs` fails the build if any hotspot lacks a source or breaks these limits.

## Assets

| File | Origin |
| --- | --- |
| `public/textures/mars.jpg` | NASA 3D Resources, `Images and Textures/Mars/Mars.jpg` (public domain, 1440×720 equirectangular, centred on 0° lon) |
| `public/models/bennu.glb` | NASA 3D Resources, `3D Printing/Asteroid 101955 Bennu` STL, converted with `scripts/stl-to-glb.mjs` (centred, unit radius, STL +Z → +Y) |

If an asteroid's model file is missing, the explorer shows a procedural lumpy rock labelled "illustration".

Bennu's mesh-anchor directions are approximate. The STL's axis convention isn't documented, so check them against OSIRIS-REx maps before the demo.
