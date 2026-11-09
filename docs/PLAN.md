# AR Cosmic Expedition: next-level plan

Written to be executed step by step (also by a smaller model). Each task names the files to touch, what "done"
means, and roughly how long it takes. Do the phases in order; inside a phase, tasks are independent unless
marked. Keep the house rules: everything on D:, NASA public-domain / CC0 assets only (credit every one),
English + Indonesian for every new string (`src/xr/i18n.ts`), 72 fps on Quest 3 at Medium, respect
"reduce motion", commit after each task, deploy to Vercel at the end of each phase.

## Where we are (Nov 2026)

Solar System hub (stylised chart look), orbit views of Mars / Moon / Bennu with NASA layers, eight walkable
sites from NASA elevation data (Victoria, Gale, Jezero, Gusev, Meridiani, Apollo 11, Bennu), rovers and
landers as NASA models, SPHEREx sky table, guided tour with narration, missions, EN/ID, VR (Quest 3) with
wrist menu, teleport, hand grab, AR on phones and Quest passthrough, offline mode, kiosk mode, intro and
loading screens, mobile-first UI. Live at https://nasa-arvr.vercel.app, private repo ADZaheer/nasa-arvr.

## Reference points (what the best in this space do)

- **NASA's Eyes on the Solar System** (eyes.nasa.gov): real ephemeris, time slider, every spacecraft
  where it really is today. Lesson: *real time and real positions* make it feel alive.
- **Access Mars** (Google + JPL, WebXR, 2017): walk Curiosity's real sites built from real rover imagery,
  narrated by a scientist. Lesson: *real photos of the actual ground* beat generated terrain up close.
- **Mission: ISS** / **Apollo 11 VR**: you *do* the job (dock, drive, sample), not just look. Lesson: verbs.
- **Mozilla Hubs / Spatial / Rec Room**: room code, avatars with heads and hands, spatial voice, a host who
  moves everyone. Lesson for our multiplayer: *field trip mode* (a guide leads a group).
- **Citizen-science sites (Zooniverse, Backyard Worlds: Planet 9)**: ordinary people flagging moving objects
  in real survey images. Lesson: our SPHEREx table can be a *real* blink-comparator task, which fits the
  Planet X / SPHEREx challenge exactly.

## Phase A: make it feel real (biggest wow per hour)

A1. **Real planet positions + time machine** (1 day). Compute heliocentric positions from the JPL
  "Keplerian elements for approximate positions of the major planets" (public, no API key; the formulas are
  short) in `src/xr/ephemeris.ts`. The hub shows true angles (sizes stay exaggerated, distances
  log-compressed, keep the "not to scale" label). A date slider in the hub (DOM + VR) with "Today",
  ±1 year, and named moments: "Perseverance launch 30 Jul 2020", "Apollo 11 landing 20 Jul 1969".
  Done: planets match NASA Eyes for today's date within a few degrees.

A2. **Light-time to Mars** (0.5 day). Show the current Earth–Mars distance and one-way light delay (from A1).
  "Send a message to Mars": type or pick a phrase, watch a pulse travel there in real light time
  (scaled), with an honest label. Done: the delay matches NASA's figure for the date.

A3. **Real 360° ground photos at the rover sites** (1–2 days). For Jezero, Gale, Meridiani and Gusev, use NASA
  public-domain Mastcam-Z / Mastcam / Pancam panoramas as a "photo sky" you can switch on when standing at
  the landing spot (`content/sites/*.json` gets `panorama: { url, credit, headingDeg }`). Blend: panorama on
  the horizon, our terrain under your feet. Done: toggle in the suit panel, credit visible, 72 fps.

A4. **Real sounds of Mars** (0.5 day). Perseverance recorded wind and Ingenuity's rotors (NASA public).
  Add as the Jezero ambience (behind the existing Sound toggle), with a "this is the real recording" card.

A5. **Real traverse paths** (1 day). Draw the actual drive routes of Curiosity / Perseverance / Opportunity
  as glowing lines on the ground and on the orbit globe (NASA/JPL public traverse data). "Walk the route"
  teleports you along waypoints with sol numbers. Done: route lines up with the landing pin and hotspots.

A6. **Thermal / infrared vision** (0.5 day). A "see in infrared" toggle (a shader colour ramp) on Mars and
  the SPHEREx scenes, tied to the SPHEREx story (SPHEREx sees 102 infrared colours). Label it as a
  visualisation.

## Phase B: give people things to do

B1. **SPHEREx blink comparator, real version** (1–2 days). Replace the demo A/B with real SPHEREx data: two
  epochs of the same sky from IRSA (cutouts, public), aligned; "blink" button flips A/B; the visitor taps
  anything that moved; we reveal known catalogued objects (asteroids from the Minor Planet Center
  ephemeris for that date) and keep everything else labelled "unverified". This is the challenge's core
  idea made playable. Keep the honesty rules from `SpherexTable.tsx`.

B2. **Drive a rover** (1–2 days). Get into Perseverance at Jezero: stick/WASD drives, real-ish top speed
  shown, mast-camera view, hazard warning on steep slopes (we have the heightfield). Short goal: drive to
  the delta beacon.

B3. **Sample collection mission** (1 day). Pick rocks (existing Grabbables), "seal in a tube", get a card
  explaining what that rock type tells scientists. Ties into Mars Sample Return.

B4. **Photo mode + mission patch** (1 day). Freeze, hide UI, frame, add a frame with date/site, download or
  QR code (data URL, no server). End-of-tour "mission patch" generated from what you did.

B5. **Badges and a passport** (0.5 day). Stamps for each site visited and mission finished, stored locally,
  shown in the menu. Kiosk mode clears it.

## Phase C: polish and robustness

C1. **Asset diet** (1 day). KTX2 (Basis) textures with `KTX2Loader`, meshopt-compressed GLBs, 1k/2k
  variants picked by quality tier. Target: first load under 8 MB on phones.

C2. **Fly between worlds** (1 day). Replace fade-to-black travel on screen with a short camera flight from
  the hub to the planet and down to the site (keep the fade in VR for comfort).

C3. **Automated checks** (1 day). Playwright tests (Chromium + WebKit iPhone + Pixel profiles): intro →
  explore sheet fully on screen → menu sheet → each site loads without errors → EN/ID switch. Screenshot
  diffs for the mobile layouts (the iPhone popup bug would have been caught). A perf budget check
  (bundle size).

C4. **Accessibility pass** (0.5 day). Larger-text setting, high-contrast option, screen-reader labels for
  the HUD, captions on by default for the tour, one-handed mode in VR.

C5. **AI guide hookup** (when the teammates' agent API is ready). `askGuide` in `src/xr/events.ts` already
  sends `{ body, hotspotId, guidePrompt }`; show the answer in the info card (DOM) and the VR card, with
  voice if narration is on.

## Phase D: get ready for multiplayer (do before building it)

D1. **Split state into shared vs local** (0.5 day). In `src/xr/store.ts`, mark which fields would be shared
  in a room (scene: `bodyId`, `siteId`, `tourStep`, selected `hotspotId`, rocks) and which stay local
  (settings, menu, language, quality). Put shared changes through small action functions only
  (no direct `setState` from components) so they can later be sent over the network.

D2. **Event log** (0.5 day). Every shared action becomes an event `{ type, payload, at }` in
  `src/xr/net/events.ts`. Locally it just applies; later the network sends the same events.

D3. **Deterministic world** (0.5 day). Make everything random seeded by site id (rocks, dust devils already
  mostly are) so two people see the same world without sending it.

## Phase E: multiplayer (the plan for later)

Goal: a classroom or judging table explores together. Everything works without accounts: a 4-letter room
code or QR code.

**Hosting.** Vercel can't keep WebSocket rooms open, so the room server lives elsewhere. Recommended:
**PartyKit / Cloudflare Durable Objects** (one small TypeScript file per room, generous free tier, low
latency in Asia via Cloudflare). Alternatives: Colyseus on Fly.io (more control, you run it), Liveblocks
(hosted presence/storage, paid beyond free), plain WebRTC (no server for data but harder NAT issues).
Voice: **LiveKit Cloud** (WebRTC SFU, free tier) or skip voice at first (people are in the same room).

**Milestones**
1. *Presence* (2 days): join with a code, see others as small astronaut avatars (head + two hands in VR,
   a floating helmet + pointer on phones/desktop), names, colours. Send transforms 15 Hz, interpolate.
2. *Field trip mode* (2 days): a "guide" (host) controls scene changes and the tour; everyone follows with
   the normal transition; guide can "summon" everyone to their spot and point at a hotspot (a beam everyone
   sees). Students can still look around freely.
3. *Shared objects* (2 days): rocks and samples are owned by whoever grabs them; positions synced; throw
   events broadcast. The SPHEREx blink task becomes co-op (flags shared, votes count).
4. *Spectator / projector view* (1 day): a page that shows the guide's view or a free camera for a big
   screen, no controls. This is also what judges watch while one person wears the Quest.
5. *Voice* (1–2 days, optional): spatial voice via LiveKit, push-to-talk in VR, mute for kiosks.

**Netcode rules.** Host-authoritative for scene/tour; owner-authoritative for grabbed objects; last-writer
wins for settings-like shared fields; reconnect restores from the room's latest snapshot; rooms expire
after 2 hours idle. Rate-limit and validate every message on the server; no personal data stored.

**Safety for kids/events.** Room codes expire, the host can remove people, names are picked from a list
(or filtered), voice off by default.

## Suggested order and model use

- Opus for planning/architecture (this file, Phase D design, Phase E server design).
- Sonnet for execution: A1 → A2 → A4 → A6 → B1 → C3 → A3 → A5 → B2 → B3 → B4 → B5 → C1 → C2 → C4 → D → E.
- After each phase: `npm run build`, `npm run check:content`, test at 360×800 / 390×844 / desktop / ?emulate,
  commit, deploy with `npx vercel@65.0.0 deploy --prod --yes`, then `git push`.
