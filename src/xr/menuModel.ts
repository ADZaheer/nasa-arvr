import { useXRApp, type XRSettings } from './store'
import { MARS24_URL, earthUTC, marsTime } from './marsTime'
import { player } from './surface/player'

/** One definition of the expedition menu, rendered as the VR/AR wrist panel and the on-screen ⚙ panel. */
export type MenuTab = 'travel' | 'missions' | 'display' | 'comfort' | 'audio' | 'info'
export const MENU_TABS: { id: MenuTab; label: string }[] = [
  { id: 'travel', label: 'Travel' },
  { id: 'missions', label: 'Missions' },
  { id: 'display', label: 'Visuals' },
  { id: 'comfort', label: 'Comfort' },
  { id: 'audio', label: 'Audio' },
  { id: 'info', label: 'Info' },
]

export interface Destination {
  id: string
  label: string
  go: () => void
  active: (s: { bodyId: string | null; siteId: string | null }) => boolean
}
const app = () => useXRApp.getState()
export const DESTINATIONS: Destination[] = [
  { id: 'hub', label: 'Solar System', go: () => app().selectBody(null), active: (s) => !s.bodyId && !s.siteId },
  { id: 'mars', label: 'Mars (orbit)', go: () => app().selectBody('mars'), active: (s) => s.bodyId === 'mars' && !s.siteId },
  { id: 'bennu', label: 'Bennu (orbit)', go: () => app().selectBody('bennu'), active: (s) => s.bodyId === 'bennu' && !s.siteId },
  { id: 'victoria', label: 'Victoria Crater', go: () => app().selectSite('victoria', 'mars'), active: (s) => s.siteId === 'victoria' },
  { id: 'gale', label: 'Gale Crater', go: () => app().selectSite('gale', 'mars'), active: (s) => s.siteId === 'gale' },
  { id: 'jezero', label: 'Jezero Crater', go: () => app().selectSite('jezero', 'mars'), active: (s) => s.siteId === 'jezero' },
  { id: 'moon', label: 'Moon (orbit)', go: () => app().selectBody('moon'), active: (s) => s.bodyId === 'moon' && !s.siteId },
  { id: 'apollo11', label: 'Apollo 11 site', go: () => app().selectSite('apollo11', 'moon'), active: (s) => s.siteId === 'apollo11' },
  { id: 'bennu-surface', label: 'Bennu surface', go: () => app().selectSite('bennu-nightingale', 'bennu'), active: (s) => s.siteId === 'bennu-nightingale' },
]

export type SliderSpec = { kind: 'slider'; key: keyof XRSettings; label: string; min: number; max: number; format: (v: number) => string; surfaceOnly?: boolean }
export type ToggleSpec = { kind: 'toggle'; key: keyof XRSettings; label: string }
export type ChoiceSpec = { kind: 'choice'; key: keyof XRSettings; label: string; options: { value: string; label: string }[] }
export type ControlSpec = SliderSpec | ToggleSpec | ChoiceSpec

const pct = (v: number) => `${Math.round(v * 100)}%`
const timeLabel = (t: number) => (t < 0.08 ? 'Sunrise' : t > 0.92 ? 'Sunset' : t < 0.42 ? 'Morning' : t < 0.58 ? 'Noon' : 'Afternoon')
export const DISPLAY_CONTROLS: ControlSpec[] = [
  {
    kind: 'choice',
    key: 'quality',
    label: 'Graphics quality',
    options: [
      { value: 'auto', label: 'Auto' },
      { value: 'low', label: 'Low' },
      { value: 'medium', label: 'Med' },
      { value: 'high', label: 'High' },
      { value: 'ultra', label: 'Ultra' },
    ],
  },
  { kind: 'slider', key: 'timeOfDay', label: 'Time of day', min: 0, max: 1, format: timeLabel, surfaceOnly: true },
  { kind: 'slider', key: 'exposure', label: 'Brightness', min: 0.5, max: 1.6, format: pct },
  { kind: 'slider', key: 'haze', label: 'Mars haze', min: 0, max: 2, format: pct, surfaceOnly: true },
  { kind: 'slider', key: 'labels', label: 'Labels', min: 0, max: 1, format: pct },
  { kind: 'toggle', key: 'pins', label: 'Pins & beacons' },
  { kind: 'toggle', key: 'showFps', label: 'FPS meter' },
]
export const COMFORT_CONTROLS: ControlSpec[] = [
  {
    kind: 'choice',
    key: 'turn',
    label: 'Turning (VR)',
    options: [
      { value: 'snap30', label: 'Snap 30°' },
      { value: 'snap45', label: 'Snap 45°' },
      { value: 'smooth', label: 'Smooth' },
    ],
  },
  {
    kind: 'choice',
    key: 'locomotion',
    label: 'Movement (VR)',
    options: [
      { value: 'teleport', label: 'Teleport' },
      { value: 'smooth', label: 'Smooth walk' },
    ],
  },
  { kind: 'slider', key: 'moveSpeed', label: 'Walk speed', min: 0.5, max: 2, format: (v) => `${v.toFixed(1)}×` },
  { kind: 'toggle', key: 'vignette', label: 'Comfort vignette (VR)' },
  { kind: 'toggle', key: 'seated', label: 'Seated mode (VR)' },
  { kind: 'slider', key: 'heightOffset', label: 'Height (VR)', min: -0.3, max: 0.5, format: (v) => (Math.abs(v) < 0.01 ? 'Normal' : `${v > 0 ? '+' : '−'}${Math.round(Math.abs(v) * 100)} cm`) },
]
export const AUDIO_CONTROLS: ControlSpec[] = [
  { kind: 'toggle', key: 'sound', label: 'Sound & music' },
  { kind: 'slider', key: 'musicVolume', label: 'Music', min: 0, max: 1, format: pct },
  { kind: 'slider', key: 'sfxVolume', label: 'Effects & ambience', min: 0, max: 1, format: pct },
]

const CARDINALS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
/** Info tab lines: Earth and Mars time, where you are. */
export function infoLines(where: string, onSurface: boolean): { label: string; value: string }[] {
  const now = new Date()
  const mars = marsTime(now)
  const lines = [
    { label: 'Earth', value: earthUTC(now) },
    { label: 'Mars (MTC)', value: `Sol ${mars.sol.toLocaleString('en-US')} · ${mars.mtc}` },
    { label: 'Location', value: where },
  ]
  if (onSurface) {
    const h = Math.round(player.heading)
    lines.push({ label: 'Heading', value: `${h}° ${CARDINALS[Math.round(h / 45) % 8]}` })
  }
  return lines
}
export const INFO_SOURCE = { label: 'NASA GISS Mars24 (Mars time)', url: MARS24_URL }
