import { useXRApp } from './store'
import { player } from './surface/player'

/**
 * Guided missions: a first-run astronaut training and small goals per scene. Progress is saved on the
 * device, shown in the wrist menu / ⚙ menu (Missions tab) and as a mission card when a scene opens.
 * Checks are evaluated a few times per second by <MissionTracker> using this context.
 */
export interface MissionContext {
  bodyId: string | null
  siteId: string | null
  hotspotId: string | null
  menuOpen: boolean
  /** degrees the view has turned since the scene opened */
  lookedAround: number
  /** metres walked from the landing spot */
  walked: number
  /** distance (m) from the player to a site point */
  distTo: (x: number, z: number) => number
  /** heading difference (deg) between where you look and a site point */
  facing: (x: number, z: number) => number
  airborne: boolean
  /** counters from events (rocks thrown far, Bennu pebble bursts seen, …) */
  events: Record<string, number>
}

export interface Goal {
  id: string
  title: string
  hint: string
  check: (c: MissionContext) => boolean
}
export interface Mission {
  id: string
  title: string
  /** which scene it belongs to: 'tutorial' runs first anywhere */
  scene: 'tutorial' | 'hub' | `body:${string}` | `site:${string}`
  goals: Goal[]
}

const hot = (id: string) => (c: MissionContext) => c.hotspotId === id

export const MISSIONS: Mission[] = [
  {
    id: 'training',
    title: 'Astronaut training',
    scene: 'tutorial',
    goals: [
      { id: 't-look', title: 'Look around', hint: 'Turn your head, drag the view, or move your phone.', check: (c) => c.lookedAround > 70 },
      { id: 't-pin', title: 'Select something', hint: 'Point at a glowing pin or planet and select it (trigger, pinch, tap, or look at it for 1.5 s).', check: (c) => !!c.hotspotId || !!c.bodyId },
      { id: 't-menu', title: 'Open your menu', hint: 'VR: turn your left palm to your face or press Y. Screen: tap ⚙ Menu.', check: (c) => c.menuOpen },
      { id: 't-mars', title: 'Travel to Mars', hint: 'Pick Mars in the Solar System or in the menu’s Travel tab.', check: (c) => c.bodyId === 'mars' },
    ],
  },
  {
    id: 'hub',
    title: 'Grand tour',
    scene: 'hub',
    goals: [
      { id: 'h-mars', title: 'Visit Mars', hint: 'Select the red planet.', check: (c) => c.bodyId === 'mars' },
      { id: 'h-bennu', title: 'Visit asteroid Bennu', hint: 'Select Bennu, between Earth and Mars.', check: (c) => c.bodyId === 'bennu' },
      { id: 'h-moon', title: 'Visit the Moon', hint: 'Select the Moon, next to Earth.', check: (c) => c.bodyId === 'moon' },
    ],
  },
  {
    id: 'mars-orbit',
    title: 'Survey Mars from orbit',
    scene: 'body:mars',
    goals: [
      { id: 'm-olympus', title: 'Find the tallest volcano', hint: 'Look for Olympus Mons.', check: hot('olympus-mons') },
      { id: 'm-life', title: 'Find the possible sign of ancient life', hint: 'A rock in Jezero Crater.', check: hot('jezero-cheyava-falls') },
      { id: 'm-land', title: 'Land on the surface', hint: 'Use “Stand on the surface” or a pin’s “Stand here”.', check: (c) => !!c.siteId },
      { id: 'm-jezero', title: 'Visit Perseverance in Jezero Crater', hint: 'Menu → Travel → Jezero Crater.', check: (c) => c.siteId === 'jezero' },
    ],
  },
  {
    id: 'bennu',
    title: 'Asteroid detective',
    scene: 'body:bennu',
    goals: [
      { id: 'b-sample', title: 'Find where the sample was taken', hint: 'The Nightingale site.', check: hot('nightingale') },
      { id: 'b-pebbles', title: 'Spot Bennu throwing pebbles', hint: 'Watch the asteroid: bright specks sometimes fly off it.', check: (c) => (c.events['bennu-burst-seen'] ?? 0) > 0 },
      { id: 'b-chem', title: 'Learn what the sample contained', hint: 'Find the “Ingredients for life” pin.', check: hot('sample-chemistry') },
      { id: 'b-land', title: 'Stand on Bennu', hint: 'Press “Stand here” on the Nightingale pin.', check: (c) => c.siteId === 'bennu-nightingale' },
    ],
  },
  {
    id: 'moon-orbit',
    title: 'Moon from orbit',
    scene: 'body:moon',
    goals: [
      { id: 'mo-a11', title: 'Find Tranquility Base', hint: 'The Apollo 11 landing site.', check: hot('moon-apollo11') },
      { id: 'mo-land', title: 'Land at the Apollo 11 site', hint: 'Press “Stand here” on its pin.', check: (c) => c.siteId === 'apollo11' },
    ],
  },
  {
    id: 'apollo11',
    title: 'Apollo 11 moonwalk',
    scene: 'site:apollo11',
    goals: [
      { id: 'a-eagle', title: 'Walk to the lunar module Eagle', hint: 'It stands a few metres in front of you.', check: (c) => c.distTo(-963, 1543) < 9 },
      { id: 'a-jump', title: 'Jump in Moon gravity', hint: 'Space bar, Jump button or A/X: one sixth of Earth’s pull.', check: (c) => c.airborne },
      { id: 'a-crater', title: 'Reach the large crater’s rim', hint: 'Head east toward the beacon, about 400 m away.', check: (c) => c.distTo(-563, 1543) < 120 },
    ],
  },
  {
    id: 'bennu-surface',
    title: 'Life on a tiny asteroid',
    scene: 'site:bennu-nightingale',
    goals: [
      { id: 'bs-craft', title: 'Look up at OSIRIS-REx', hint: 'Select the spacecraft hovering above the sample site.', check: hot('bn-spacecraft') },
      { id: 'bs-escape', title: 'Throw a rock into space', hint: 'Grab a rock and toss it gently: Bennu can’t hold on to it.', check: (c) => (c.events['rock-escaped'] ?? 0) > 0 },
      { id: 'bs-boulders', title: 'Learn about Bennu’s boulders', hint: 'Find the boulder beacon.', check: hot('bn-boulders') },
    ],
  },
  {
    id: 'jezero',
    title: 'Jezero Crater expedition',
    scene: 'site:jezero',
    goals: [
      { id: 'j-ingenuity', title: 'Find the Ingenuity helicopter', hint: 'It sits beside Perseverance.', check: (c) => c.distTo(-6236, -2838) < 4 },
      { id: 'j-delta', title: 'Face the ancient river delta', hint: 'Turn west toward the delta beacon.', check: (c) => c.facing(-8460, -2700) < 12 },
      { id: 'j-life', title: 'Learn about the potential biosignature', hint: 'Find the Cheyava Falls beacon.', check: hot('jezero-biosignature') },
    ],
  },
  {
    id: 'victoria',
    title: 'Victoria Crater expedition',
    scene: 'site:victoria',
    goals: [
      { id: 'v-rover', title: 'Walk to the Opportunity rover', hint: 'It’s parked a few metres away on the rim.', check: (c) => c.distTo(-273, -280) < 5 },
      { id: 'v-jump', title: 'Jump in Mars gravity', hint: 'Space bar or the Jump button: you’ll fly 2.6× higher than on Earth.', check: (c) => c.airborne },
      { id: 'v-throw', title: 'Throw a rock', hint: 'Grab a loose rock near you and throw it: watch it fly in 38% gravity.', check: (c) => (c.events['rock-thrown'] ?? 0) > 0 },
      { id: 'v-cape', title: 'Reach the Cape Verde promontory', hint: 'Follow the rim north to the beacon.', check: (c) => c.distTo(-23, -405) < 25 },
    ],
  },
  {
    id: 'gale',
    title: 'Gale Crater expedition',
    scene: 'site:gale',
    goals: [
      { id: 'g-sharp', title: 'Face Mount Sharp', hint: 'Turn toward the big mountain on the horizon.', check: (c) => c.facing(1075, 23683) < 12 },
      { id: 'g-organics', title: 'Find the organic molecules', hint: 'A beacon ~450 m east of the landing spot.', check: hot('organics') },
      { id: 'g-walk', title: 'Walk 100 metres', hint: 'Explore the crater floor.', check: (c) => c.walked > 100 },
    ],
  },
]

export function sceneKeyOf(bodyId: string | null, siteId: string | null): Mission['scene'] {
  return siteId ? `site:${siteId}` : bodyId ? `body:${bodyId}` : 'hub'
}

export function missionsFor(bodyId: string | null, siteId: string | null): Mission[] {
  const key = sceneKeyOf(bodyId, siteId)
  return MISSIONS.filter((m) => m.scene === key)
}

export const ALL_GOALS = MISSIONS.flatMap((m) => m.goals)

/** Event counters fed by scene code (e.g. a rock landing far away). */
export const missionEvents: Record<string, number> = {}
export function missionEvent(name: string) {
  missionEvents[name] = (missionEvents[name] ?? 0) + 1
}

/** Context for the checks, built from the store, the player and the camera. */
export function missionContext(lookedAround: number, heading: number): MissionContext {
  const s = useXRApp.getState()
  return {
    bodyId: s.bodyId,
    siteId: s.siteId,
    hotspotId: s.hotspotId,
    menuOpen: s.menuOpen,
    lookedAround,
    walked: s.siteId ? Math.hypot(player.x - player.spawnX, player.z - player.spawnZ) : 0,
    distTo: (x, z) => (s.siteId ? Math.hypot(player.x - x, player.z - z) : Infinity),
    facing: (x, z) => {
      if (!s.siteId) return 180
      const b = ((Math.atan2(x - player.x, -(z - player.z)) * 180) / Math.PI + 360) % 360
      const d = Math.abs(b - heading) % 360
      return d > 180 ? 360 - d : d
    },
    airborne: player.airborne,
    events: missionEvents,
  }
}
