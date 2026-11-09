# HANDOFF: AR Cosmic Expedition

Read this first. It is written so a new AI agent (Cline + Claude Sonnet) can continue with no other context.
The detailed roadmap is `docs/PLAN.md`; this file says where things stand and how to work.

## What this is

- The AR/VR module of the team's **NASA Space Apps Challenge 2026** entry.
  - Challenge themes: **Planet X** and **SPHEREx**.
  - Masterplan name: **Cosmic Explorer: The Living Sky**.
- A web app that runs on desktop, phones (iPhone, Android such as Galaxy A16) and Meta Quest 3 (WebXR VR and passthrough AR).
- What you can do in it:
  - Explore a stylised Solar System with real planet positions.
  - Orbit Mars, the Moon and Bennu with NASA layers.
  - Walk eight real sites built from NASA elevation data.
  - Play the SPHEREx "spot what moved" game on real SPHEREx images.
- Live: https://nasa-arvr.vercel.app (deep links: `/xr`, `/xr/body/mars`, `/xr/body/spherex`, `/xr/surface/<siteId>`).
- Repo: https://github.com/ADZaheer/nasa-arvr. It is private, the branch is `main`, and the owner is the only collaborator.
- Vercel project `nasa-arvr` on the owner's account. Deploys are manual: there is no Git auto-deploy.

## Stack

- React 19, Vite 6, TypeScript.
- three r186, @react-three/fiber 9, @react-three/drei 10, @react-three/xr 6 (pmndrs).
- zustand 5, react-router.
- `iwer` + `@iwer/devui` for the emulated Quest 3 (`?emulate`).
- `playwright-core` for the smoke test. It uses the installed Microsoft Edge; nothing is downloaded.

## Run it (Windows, everything on D:)

```
cd D:\nasa-arvr
set npm_config_cache=D:\npm-cache        (never let npm use C:)
npm install
npm run dev          # https dev server (self-signed) with --host, for phones/Quest on the LAN
npm run build        # content check + tsc + vite build into dist/
npm run vr           # build, then preview over https for headsets
npm run smoke:xr     # needs a preview server on http://localhost:4173 (see below)
```

- Plain http for local browser testing: set `XR_HTTP=1`. In PowerShell: `$env:XR_HTTP='1'; npx vite --port 5174 --strictPort`, or `npx vite preview --port 4173 --strictPort` after a build.
- Emulated headset: add `?emulate` to any URL.
- Frame-rate meter: `?perf`. Force the intro: `?intro`. Kiosk mode: `?kiosk`.
- Deploy:
  - Command: `npx --yes vercel@65.0.0 deploy --prod --yes` (with `npm_config_cache=D:\npm-cache`).
  - Push with `git push origin main`.
  - Stop local servers afterwards (ports 5174, 4173).

## Folder map

- `src/xr/XRRoot.tsx`: the Canvas, the `<XR>` store, the camera rig, `Stage` (scale/position per mode), and scene switching.
- `src/xr/xrStore.ts`: the WebXR store.
  - `enterImmersive(mode)` falls back through simpler session options on `NotSupportedError`.
  - It waits while the 3D view is still starting ("not connected to three.js").
  - `xrErrorMessage` gives a plain-language failure message.
- `src/xr/ModePicker.tsx`: the "Ways to explore" sheet (screen / VR / AR / look around).
  - At the Solar System it offers **Solar System in VR** and **Solar System on your table (AR)** first.
- Scenes:
  - `SolarSystemHub.tsx` (hub)
  - `BodyExplorer.tsx` (orbit views)
  - `surface/` (walkable sites)
  - `SpherexTable.tsx` (SPHEREx table)
- Hub extras:
  - `ephemeris.ts`: JPL Keplerian elements, `helioPosition`, `MOMENTS`.
  - `timeMachine.ts`: the `useTime` store.
  - `TimePanel.tsx` (DOM) and `TimeVR.tsx` (VR console).
- SPHEREx:
  - `spherexState.ts`: the game state.
  - `SpherexTable.tsx`: 3D plate and console.
  - `SpherexPanel.tsx`: phone bottom panel.
  - `public/spherex/blink-*.png` and `blink.json`: the image pair and its metadata.
  - `scripts/build-blink.mjs` + `scripts/fits.mjs`: rebuild them from FITS cutouts.
- UI:
  - `Hud.tsx`, `MenuPanel.tsx`, `src/menu.css` (menu, phone bottom sheets, time panel, picker), `src/styles.css` (motion tokens `--ease-out`, `--dur-*`).
  - 3D UI kit: `ui3d.tsx`. Holographic look: `holo.tsx`.
- Systems:
  - `quality.ts` + `QualityGovernor.tsx`: quality tiers that drop automatically to hold the frame rate.
  - `i18n.ts`: every string in **English + Indonesian**, used via `t()` / `useT()` keyed by the English text.
  - `offline.ts` + `public/sw.js` + the `offlineManifest` plugin in `vite.config.ts`: offline mode via a service worker.
  - `kiosk.tsx`: event/kiosk mode.
  - `loading.ts`, `LoadingScreen.tsx`, `Intro.tsx`, `cameraMotion.ts`: loading and intro.
  - `WristMenu.tsx`: the VR wrist menu.
  - `tour.ts`, `narration.ts`, `missions.ts`, `MissionTracker.tsx`.
- `content/`: site JSON files, checked by `scripts/check-content.mjs`.
- `docs/PLAN.md`: the roadmap.

## Data sources and licences (credit every one in the UI)

- NASA/JPL/USGS imagery and elevation data (public domain), and NASA 3D models (rovers, landers).
- NASA SVS LROC for the Moon.
- JPL "Keplerian elements for approximate positions of the major planets" (Standish) for planet positions.
- JPL Horizons for the Eunomia positions.
- SPHEREx Level-2 images from NASA/IPAC IRSA (public). Credit: "NASA/JPL-Caltech/IPAC".
- Use only NASA public-domain or CC0 assets.

## Conventions (must keep)

- Everything stays on **D:**. Never write to C:. npm cache is `D:\npm-cache`.
- **Commits are authored by the owner only. No `Co-Authored-By` lines and no AI attribution in commits, PRs or code.**
  - No collaborators, apps, deploy keys or Actions on the repo.
  - Never push secrets or `.env` files.
- Make small commits, one per task.
- Before each deploy:
  - Run `npm run build`.
  - Take screenshots at phone sizes (360×800, 390×844) and desktop.
  - Run `?emulate` and `npm run smoke:xr`.
- Keep 72 fps on Quest 3 at Medium quality.
- Respect `prefers-reduced-motion` and the quality tiers.
- Sound stays off by default.
- Labels must be honest: **Fact / Illustration / Candidate (unconfirmed)**. Never claim a discovery. The SPHEREx game marks only NASA/JPL-known objects, and user flags stay "Unverified".

## Status

Done:
- Hub with real positions and the time machine (A1).
- Earth–Mars light delay and "send a message to Mars" (A2).
- Real SPHEREx blink comparator with asteroid 15 Eunomia (B1).
- Orbit views, eight walkable sites, VR wrist menu, teleport and hand grab.
- AR on phones and Quest passthrough.
- Offline mode, kiosk mode, intro and loading screens, mobile-first menu, EN/ID.

Fixed in the last commit:
- **Problem:** from the Solar System screen, the VR and AR buttons took you to Mars (VR walked on Mars; AR showed a Mars model). There was no way to see the Solar System itself in VR or AR.
- **Fix:** new "Solar System in VR" and "Solar System on your table (AR)" options keep you at the Solar System.
- **Also:** `enterImmersive` now waits while the 3D view is still starting instead of failing immediately.
- **Test:** covered by `scripts/smoke-xr.mjs`.

Verified only in the emulator or at desktop/phone browser sizes. These **still need the owner's real-device test**:
- **Quest 3:**
  - Solar System in VR.
  - The time-machine console in VR.
  - Tapping the SPHEREx plate with a controller.
  - Passthrough "Solar System in my room".
  - Frame rate.
- **iPhone (Safari):** the bottom sheets and the SPHEREx phone panel. iPhone Safari has no WebXR AR, so it uses Look around.
- **Galaxy A16 (Chrome):** "Solar System on your table (AR)" and Mars AR.
  - The session presets fall back if the phone rejects options.
  - The device previously showed "specified configuration is not supported".

Known issues:
- The browser pane used for agent testing does not register the service worker, and its screenshots are often stale. Verify with DOM queries.
- If the in-app browser pane is hidden, the 3D canvas never starts (300×150 canvas), so XR "fails" there. Use the Playwright smoke test instead.
- HMR can leave a stale XR store ("not connected to three.js"). Reload the page or test a production preview.
- Bash heredocs that contain quotes broke often on this Windows machine. Write small `.cjs` scripts instead.

## Next steps (priority order, from docs/PLAN.md)

1. **A4 Real sounds of Mars.**
   - Use Perseverance's wind recording and Ingenuity's rotor recording (NASA public).
   - Make them the Jezero ambience, behind the existing Sound toggle.
   - Add a "this is the real recording" card with the NASA credit.
   - Add EN/ID strings.
2. **A6 Infrared vision.**
   - A toggle with a shader colour ramp on Mars and the SPHEREx scenes.
   - Label it as a visualisation.
3. **A3** Real 360° panoramas at the rover sites (`content/sites/*.json` → `panorama`).
4. **A5** Real rover traverse paths.
5. **B2** Drive a rover.
6. **B3** Sample collection.
7. **B4** Photo mode and mission patch.
8. **B5** Badges / passport.
9. **C1** KTX2/meshopt asset diet.
10. **C2** Fly between worlds.
11. **C3** More Playwright tests: extend `scripts/smoke-xr.mjs` to phone profiles, every site, and EN/ID.
12. **C4** Accessibility pass.
13. **C5** AI guide hookup.
14. **D1–D3** Multiplayer prep: shared vs local state, event log, seeded world.
15. **E** Multiplayer: PartyKit / Cloudflare rooms, field-trip mode, projector view, optional LiveKit voice. **Only start this when the owner says so.**
