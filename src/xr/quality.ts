import { useXRApp } from './store'

/** Graphics quality tiers. "auto" picks one from the device and steps down if the frame rate can't keep up. */
export type Tier = 'low' | 'medium' | 'high' | 'ultra'
export type QualitySetting = 'auto' | Tier
export const TIER_ORDER: Tier[] = ['low', 'medium', 'high', 'ultra']

export interface TierParams {
  /** surface terrain mesh: rings × segments around the viewer */
  terrainRings: number
  terrainSegs: number
  /** scattered rocks and their shape detail (icosahedron subdivisions) */
  rocks: number
  rockDetail: number
  /** PBR ground/rock texture size; null = procedural colours only */
  textures: '512' | '1k' | '2k' | null
  /** sun shadow map size; 0 = no real-time shadows */
  shadow: number
  /** wind-blown dust particles near the viewer */
  dust: number
  /** dust devils on the plains */
  devils: number
  /** footstep / landing dust puffs, Bennu ejecta */
  bursts: boolean
  /** star map texture */
  stars: '1k' | '2k' | '4k'
  /** Mars globe relief (MOLA normal map) */
  marsRelief: '1k' | '2k' | null
  /** desktop-only screen effects (bloom, SMAA, vignette) */
  post: boolean
  /** max device pixel ratio outside XR */
  dpr: number
}

const TIERS: Record<Tier, TierParams> = {
  low: { terrainRings: 90, terrainSegs: 112, rocks: 250, rockDetail: 0, textures: null, shadow: 0, dust: 0, devils: 0, bursts: false, stars: '1k', marsRelief: null, post: false, dpr: 1 },
  medium: { terrainRings: 120, terrainSegs: 160, rocks: 600, rockDetail: 0, textures: '512', shadow: 0, dust: 600, devils: 1, bursts: true, stars: '2k', marsRelief: '1k', post: false, dpr: 1.5 },
  high: { terrainRings: 150, terrainSegs: 224, rocks: 900, rockDetail: 1, textures: '1k', shadow: 1024, dust: 2000, devils: 2, bursts: true, stars: '4k', marsRelief: '2k', post: true, dpr: 2 },
  ultra: { terrainRings: 180, terrainSegs: 288, rocks: 1400, rockDetail: 2, textures: '2k', shadow: 2048, dust: 6000, devils: 3, bursts: true, stars: '4k', marsRelief: '2k', post: true, dpr: 2 },
}

/**
 * In a headset every frame is drawn twice (once per eye) at a fixed 72 Hz, and screen-space
 * effects aren't practical in the browser — so VR caps the heaviest options of each tier.
 */
function forVR(p: TierParams, tier: Tier): TierParams {
  return {
    ...p,
    terrainRings: Math.min(p.terrainRings, 130),
    terrainSegs: Math.min(p.terrainSegs, 176),
    rocks: Math.min(p.rocks, 700),
    rockDetail: Math.min(p.rockDetail, 1),
    textures: p.textures === '2k' ? '1k' : p.textures,
    shadow: tier === 'high' || tier === 'ultra' ? 1024 : 0,
    dust: Math.round(p.dust * 0.4),
    devils: Math.min(p.devils, 2),
    post: false,
  }
}

export function tierParams(tier: Tier, xr: boolean): TierParams {
  return xr ? forVR(TIERS[tier], tier) : TIERS[tier]
}

/** Best guess for this device (used by "auto"). */
export function detectTier(): Tier {
  if (typeof navigator === 'undefined') return 'medium'
  const ua = navigator.userAgent
  // Headsets: Medium keeps a steady 72 fps on Quest 2/3 (measured); High adds real-time shadows — pick it in the menu if it stays smooth
  if (/OculusBrowser|Quest|Pico|Vision/i.test(ua)) return 'medium'
  const mobile = /Android|iPhone|iPad|Mobile/i.test(ua) || (navigator.maxTouchPoints > 1 && matchMedia('(pointer: coarse)').matches)
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8
  if (mobile) return mem >= 6 && (navigator.hardwareConcurrency ?? 4) >= 8 ? 'medium' : 'low'
  let gpu = ''
  try {
    const gl = document.createElement('canvas').getContext('webgl')
    const ext = gl?.getExtension('WEBGL_debug_renderer_info')
    gpu = ext ? String(gl!.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : ''
  } catch {
    /* ignore */
  }
  if (/RTX|RX [67]\d{3}|RX 9\d{3}|Radeon Pro|Apple M[2-9] (Pro|Max|Ultra)/i.test(gpu)) return 'ultra'
  if (/GeForce|Radeon|Apple M|Arc A/i.test(gpu)) return 'high'
  if (/SwiftShader|llvmpipe|Software/i.test(gpu)) return 'low'
  return 'medium' // integrated graphics (Intel UHD/Iris, AMD APUs) and unknown
}

/** Current tier: the user's choice, or the auto tier (detected, then lowered by the frame-rate governor). */
export function useTier(): Tier {
  const q = useXRApp((s) => s.settings.quality)
  const auto = useXRApp((s) => s.autoTier)
  return q === 'auto' ? auto : q
}

export function useQuality(): TierParams & { tier: Tier } {
  const tier = useTier()
  const xr = useXRApp((s) => s.mode === 'vr' || s.mode === 'ar')
  return { ...tierParams(tier, xr), tier }
}
