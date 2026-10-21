import { BufferGeometry, Mesh } from 'three'
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh'

/**
 * Fast raycasts (three-mesh-bvh). Every XR pointer (controller rays, teleport arc, gaze) tests the scene
 * each frame; on a big mesh a plain raycast checks every triangle (~1.5 ms per ray on a laptop for the
 * 87k-triangle terrain, several times slower on a Quest). With a BVH it is ~0.005 ms.
 * Meshes without a bounds tree fall back to the normal raycast automatically.
 */
declare module 'three' {
  interface BufferGeometry {
    boundsTree?: import('three-mesh-bvh').MeshBVH
    computeBoundsTree: typeof computeBoundsTree
    disposeBoundsTree: typeof disposeBoundsTree
  }
}

BufferGeometry.prototype.computeBoundsTree = computeBoundsTree
BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree
Mesh.prototype.raycast = acceleratedRaycast

/** Build the BVH once for a geometry that pointers or gaze can hit. Returns the geometry for chaining. */
export function withBVH<T extends BufferGeometry>(g: T): T {
  if (!g.boundsTree) g.computeBoundsTree()
  return g
}
