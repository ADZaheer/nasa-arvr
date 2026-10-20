import { BufferGeometry, IcosahedronGeometry, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three'

/**
 * Lat/lon (degrees, east-positive longitude) → point on a sphere, matching three.js SphereGeometry
 * UVs for an equirectangular map centred on 0° longitude.
 */
export function latLonToVec3(lat: number, lon: number, radius = 1): Vector3 {
  const phi = ((lon + 180) / 360) * Math.PI * 2
  const theta = ((90 - lat) * Math.PI) / 180
  return new Vector3(-Math.cos(phi) * Math.sin(theta), Math.cos(theta), Math.sin(phi) * Math.sin(theta)).multiplyScalar(radius)
}

/** Projects a direction onto the outer surface of a geometry (model space, centred near origin). */
export function snapToSurface(geometry: BufferGeometry, dir: [number, number, number]): { point: Vector3; normal: Vector3 } {
  const d = new Vector3(...dir).normalize()
  const probe = new Mesh(geometry, new MeshBasicMaterial())
  const ray = new Raycaster(d.clone().multiplyScalar(5), d.clone().negate(), 0, 10)
  const hit = ray.intersectObject(probe, false)[0]
  if (!hit) return { point: d.clone().multiplyScalar(0.9), normal: d }
  const normal = hit.face ? hit.face.normal.clone() : d
  return { point: hit.point, normal: normal.dot(d) > 0 ? normal : d }
}

/** Procedural "lumpy rock" placeholder for asteroids without a model. Deterministic. */
export function makeLumpyGeometry(seed = 1): BufferGeometry {
  const g = new IcosahedronGeometry(1, 5)
  const p = g.attributes.position
  const v = new Vector3()
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize()
    const n =
      0.14 * Math.sin(2.1 * v.x + seed) * Math.cos(1.7 * v.y + 2 * seed) +
      0.08 * Math.sin(4.3 * v.z + 1.3 * seed) * Math.sin(3.1 * v.x) +
      0.04 * Math.sin(9.7 * v.y + 7.1 * v.z + seed) +
      0.02 * Math.cos(17.3 * v.x - 11.2 * v.z)
    v.multiplyScalar(0.85 + n)
    v.y *= 0.88
    p.setXYZ(i, v.x, v.y, v.z)
  }
  g.computeVertexNormals()
  return g
}
