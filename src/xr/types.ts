export type HotspotKind = 'fact' | 'illustration' | 'candidate'

export type HotspotAnchor =
  | { type: 'latlon'; lat: number; lon: number }
  /** Direction from the body centre in model space (north = +Y); snapped onto the mesh surface at runtime. */
  | { type: 'mesh'; point: [number, number, number] }
  /** Surface sites: metres east (x) / south (z) of the terrain centre; y = metres above the ground. */
  | { type: 'site'; x: number; z: number; y?: number }

export interface Hotspot {
  id: string
  body: string
  anchor: HotspotAnchor
  title: string
  /** ≤ 25 words */
  short: string
  /** ≤ 80 words */
  detail: string
  kind: HotspotKind
  source: { label: string; url: string }
  guidePrompt: string
  /** Optional surface site id (content/sites/<id>.json) the user can "stand" at from this hotspot. */
  site?: string
}

export interface SiteTerrain {
  url: string
  gridW: number
  gridH: number
  widthUnits: number
  depthUnits: number
  zMinUnits: number
  zMaxUnits: number
  metersPerUnit: number
  verticalMetersPerUnit: number
  /** amplitude (m) of procedural fine relief added near the viewer */
  detailAmplitude: number
  /** how far (m) the terrain mesh, fog and far plane reach */
  viewRadius: number
}

export interface SiteModel {
  name: string
  model: string
  x: number
  z: number
  yawDeg: number
  sizeM: number
  /** metres above the ground (e.g. a hovering spacecraft) */
  y?: number
  credit: string
}
export type WorldKind = 'mars' | 'moon' | 'asteroid'
export interface SiteEnvironment {
  kind: WorldKind
  /** m/s² */
  gravity: number
  sky: 'mars' | 'space'
  /** size multiplier for scattered rocks / boulders */
  rockScale: number
}
export const DEFAULT_ENVIRONMENT: SiteEnvironment = { kind: 'mars', gravity: 3.71, sky: 'mars', rockScale: 1 }

/** A place on a body's surface the user can stand on (content/sites/<id>.json). */
export interface SiteContent {
  id: string
  body: string
  name: string
  region: string
  terrain: SiteTerrain
  terrainCredit: string
  spawn: { x: number; z: number; lookAt: { x: number; z: number } }
  sun: { azimuthDeg: number; elevationDeg: number }
  fogDensity: number
  dioramaExaggeration: number
  rover?: SiteModel
  /** NASA models placed in the scene (rovers, landers, spacecraft) */
  models?: SiteModel[]
  /** what kind of world this is: gravity, sky and ground colours */
  environment?: SiteEnvironment
  conditions: { label: string; value: string }[]
  conditionsSource: { label: string; url: string }
  hotspots: Hotspot[]
}

export interface BodyContent {
  id: string
  name: string
  type: 'planet' | 'asteroid' | 'star' | 'moon'
  texture?: string
  textureCredit?: string
  model?: string
  modelCredit?: string
  hotspots: Hotspot[]
}

export type ViewMode = 'desktop' | 'gyro' | 'vr' | 'ar'

export interface GuideRequest {
  body: string
  hotspotId: string
  guidePrompt: string
}
