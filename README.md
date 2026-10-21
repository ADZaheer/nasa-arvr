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

## Testing in VR

1. **No headset (laptop):** open `https://localhost:5173/xr?emulate`.
   - It installs a simulated Meta Quest 3 (Meta's IWER emulator), and **Enter VR** / **Enter AR** appear.
   - The on-screen panels move the headset and controllers, and have buttons for trigger and sticks.
2. **Meta Quest (standalone):**
   - Put the headset on the same Wi-Fi as the laptop.
   - In Quest Browser, open `https://<laptop-LAN-IP>:5173/xr` and accept the certificate warning (Advanced → Proceed).
   - Tap **Enter VR**.
3. **PC VR** (Quest Link / Air Link / SteamVR): open `https://localhost:5173/xr` in Chrome or Edge on the PC, then press **Enter VR**.

Use **`npm run vr`** for headset testing. It builds and serves the optimized production bundle on `https://<LAN-IP>:4173`. The dev server (`npm run dev`, port 5173) runs unminified React and three.js in dev mode, which is noticeably slower in a headset.

Add **`?perf`** to any URL to show fps / target Hz / CPU ms / draw calls / triangles, including inside VR. The Quest should hold 72 fps at 72 Hz. The app requests 72 Hz with maximum foveation (`src/xr/xrStore.ts`).

If the headset can't reach the laptop (e.g. campus Wi-Fi that isolates devices), connect the Quest by USB and run `adb reverse tcp:4173 tcp:4173`. Then open `https://localhost:4173/xr` in Quest Browser.

VR controls:
- Point the controller ray and press trigger to select, or look at a pin for 1.5 s (gaze dwell).
- On the surface: left stick walks, right stick snap-turns, and pushing the right stick forward aims a teleport arc.

## What picks which experience (`XRRoot`)

1. If `navigator.xr.isSessionSupported('immersive-vr')` → **Enter VR**. Controllers and hand rays, plus 1.5 s gaze dwell. The info card is drawn in 3D.
2. If `immersive-ar` is supported (Android Chrome + ARCore) → **Enter AR**. Hit-test tabletop placement: a reticle appears, tap to place it, and "Move model" places it again. The info card uses the WebXR DOM overlay.
3. On a touch device with orientation sensors → **Look around (motion)**. This is gyro look-around and asks for permission on iOS. Tap pins, or hold the centre dot on one.
4. Otherwise → desktop OrbitControls with mouse hover and click.

## Stand on the surface (`src/xr/surface/`)

From the Mars globe, pick **Stand on the surface → Victoria Crater / Gale Crater floor**, or press **Stand here** on the Gale Crater hotspot. You land at human scale on terrain built from NASA elevation models.

- **Victoria Crater** (Meridiani Planum): you stand on the rim next to NASA's Opportunity rover model, looking down into the ~800 m crater.
- **Gale Crater floor**: Mount Sharp rises about 5 km, roughly 40 km away.

How you move depends on the device:

| Device | Moving around |
| --- | --- |
| Desktop | `W A S D` / arrows to walk, `Shift` to run, `Space` to jump (Mars gravity is 3.71 m/s², so jumps last much longer), drag to look |
| Phone | "Look around (motion)" turns your view with the phone; hold **▲ Walk** to walk where you look; **Jump** button |
| VR | Real scale. Left stick walks, right stick snap-turns; push the right stick forward to aim a teleport arc. A "suit computer" panel follows below your gaze |
| AR | A 60 cm tabletop diorama of the whole site, with heights exaggerated and labelled |

Other features:
- **Astronaut HUD:** visor vignette, compass, suit readout (gravity, air, temperature, day length, from NASA Mars Facts), and distance from the landing spot.
- **Beacons:** glowing markers that stay readable at any distance. "Walk there" moves you next to one.

### How it's built
- **Heightmaps:** `scripts/stl-to-heightmap.mjs` rasterises NASA's 3D-print terrain STLs into 16-bit heightmaps in `public/terrain/*.bin`.
- **Real-world scales:** set per site in `content/sites/<id>.json`:
  - Victoria is scaled to its ~800 m width.
  - Gale is scaled so Mount Sharp is ~5 km tall.
  - Gale's flat 3D-print label tab (top-right corner) was masked out.
- **Terrain mesh:** a radial "clipmap" that's dense at your feet and reaches the horizon. It rebuilds in ~20 ms after you walk 40 m. Procedural fine relief, rocks, colours and the dusty sky are artistic, and an "illustration" beacon in each site says so.
- **Site schema:** `{ id, body, name, region, terrain{…scales}, spawn{x,z,lookAt}, sun, fogDensity, rover?, conditions[], hotspots[] }`. Hotspots use `anchor: { "type": "site", "x", "z", "y"? }` in metres (x east, z south of the terrain centre).
- **Linking from orbit:** a body hotspot can link to a site with `"site": "<id>"`.
- **Approximate placement:** the STLs' compass orientation isn't documented, so site-hotspot positions (e.g. Cape Verde) and the Gale spawn are approximate and are described that way in the text.

## Routes and shared store

- `/xr` is the Solar System hub. It's labelled "not to scale".
- `/xr/body/:id?band=…&obs=…` is the body explorer. The web viewer can deep-link here.
- `/xr/surface/:siteId` stands you on a surface site (`victoria`, `gale`).
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
| `public/terrain/victoria.bin`, `gale.bin` | NASA 3D Resources, `3D Printing/Mars - Victoria Crater` and `3D Printing/Curiosity Landing Site` STLs, rasterised with `scripts/stl-to-heightmap.mjs` |
| `public/models/opportunity.glb` | NASA 3D Resources, `3D Models/Mars Exploration Rover - Opportunity (MER-B)` |
| `public/models/bennu.glb` | NASA 3D Resources, `3D Printing/Asteroid 101955 Bennu` STL, converted with `scripts/stl-to-glb.mjs` (centred, unit radius, STL +Z → +Y) |

If an asteroid's model file is missing, the explorer shows a procedural lumpy rock labelled "illustration".

Bennu's mesh-anchor directions are approximate. The STL's axis convention isn't documented, so check them against OSIRIS-REx maps before the demo.
