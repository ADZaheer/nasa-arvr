/// <reference lib="webworker" />
// Builds the radial terrain mesh off the main thread so walking never freezes the headset.
import { buildRadialTerrain, loadHeightField, type HeightField } from './terrain'
import type { SiteTerrain } from '../types'

export type TerrainBuildRequest = { id: number; terrain: SiteTerrain; cx: number; cz: number; rMax: number; rings: number; segs: number }
export type TerrainBuildResult = { id: number; position: Float32Array; normal: Float32Array; uv: Float32Array; color: Float32Array; index: Uint32Array }

let hf: { url: string; field: Promise<HeightField> } | null = null

self.onmessage = async (e: MessageEvent<TerrainBuildRequest>) => {
  const { id, terrain, cx, cz, rMax, rings, segs } = e.data
  if (!hf || hf.url !== terrain.url) hf = { url: terrain.url, field: loadHeightField({ ...terrain, url: new URL(terrain.url, self.location.origin).href }) }
  const g = buildRadialTerrain(await hf.field, cx, cz, rMax, rings, segs)
  const out: TerrainBuildResult = {
    id,
    position: g.attributes.position.array as Float32Array,
    normal: g.attributes.normal.array as Float32Array,
    uv: g.attributes.uv.array as Float32Array,
    color: g.attributes.color.array as Float32Array,
    index: Uint32Array.from(g.index!.array),
  }
  ;(self as unknown as Worker).postMessage(out, [out.position.buffer, out.normal.buffer, out.uv.buffer, out.color.buffer, out.index.buffer])
}
