export type HotspotKind = 'fact' | 'illustration' | 'candidate'

export type HotspotAnchor =
  | { type: 'latlon'; lat: number; lon: number }
  /** Direction from the body centre in model space (north = +Y); snapped onto the mesh surface at runtime. */
  | { type: 'mesh'; point: [number, number, number] }

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
