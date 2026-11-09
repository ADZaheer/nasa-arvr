/**
 * Where the planets really are on a given date.
 * JPL "Keplerian Elements for Approximate Positions of the Major Planets" (E. M. Standish, JPL Solar System
 * Dynamics, table 1, valid 1800–2050; public): mean elements at J2000 plus their rates per Julian century.
 * Accurate to well under a degree in direction, which is all the hub needs. Positions are heliocentric,
 * ecliptic J2000, in AU.
 */
type Elements = [a: number, e: number, I: number, L: number, peri: number, node: number]
const J2000: Record<string, { el: Elements; rate: Elements }> = {
  mercury: { el: [0.38709927, 0.20563593, 7.00497902, 252.2503235, 77.45779628, 48.33076593], rate: [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081] },
  venus: { el: [0.72333566, 0.00677672, 3.39467605, 181.9790995, 131.60246718, 76.67984255], rate: [0.0000039, -0.00004107, -0.0007889, 58517.81538729, 0.00268329, -0.27769418] },
  earth: { el: [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0], rate: [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0] },
  mars: { el: [1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891], rate: [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343] },
  jupiter: { el: [5.202887, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909], rate: [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106] },
  saturn: { el: [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448], rate: [-0.0012506, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794] },
  uranus: { el: [19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.9542763, 74.01692503], rate: [-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589] },
  neptune: { el: [30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574], rate: [0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.01262724] },
}
/**
 * Asteroid Bennu (101955), osculating elements from the JPL Small-Body Database, epoch 2011-01-01
 * (JD 2455562.5). Propagated as a simple two-body orbit, so its place is approximate (labelled in the UI).
 */
const BENNU = { epochJd: 2455562.5, a: 1.1264, e: 0.2037, I: 6.035, node: 2.061, argPeri: 66.223, M0: 101.704, nDegPerDay: 0.82449 }

const RAD = Math.PI / 180
const jd = (ms: number) => ms / 86400000 + 2440587.5

function solveKepler(M: number, e: number) {
  let E = M + e * Math.sin(M)
  for (let i = 0; i < 6; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E))
  return E
}

/** heliocentric ecliptic position (AU) from elements in degrees */
function toXYZ(a: number, e: number, I: number, node: number, argPeri: number, Mdeg: number): [number, number, number] {
  const M = ((((Mdeg + 180) % 360) + 360) % 360 - 180) * RAD
  const E = solveKepler(M, e)
  const xp = a * (Math.cos(E) - e)
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E)
  const w = argPeri * RAD, O = node * RAD, i = I * RAD
  const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(O), sO = Math.sin(O), ci = Math.cos(i), si = Math.sin(i)
  return [
    (cw * cO - sw * sO * ci) * xp + (-sw * cO - cw * sO * ci) * yp,
    (cw * sO + sw * cO * ci) * xp + (-sw * sO + cw * cO * ci) * yp,
    sw * si * xp + cw * si * yp,
  ]
}

/** Heliocentric ecliptic position in AU of a body on a date, or null if we don't have its orbit. */
export function helioPosition(id: string, ms: number): [number, number, number] | null {
  if (id === 'bennu') {
    const M = BENNU.M0 + BENNU.nDegPerDay * (jd(ms) - BENNU.epochJd)
    return toXYZ(BENNU.a, BENNU.e, BENNU.I, BENNU.node, BENNU.argPeri, M)
  }
  const p = J2000[id]
  if (!p) return null
  const T = (jd(ms) - 2451545.0) / 36525
  const [a, e, I, L, peri, node] = p.el.map((v, k) => v + p.rate[k] * T) as Elements
  return toXYZ(a, e, I, node, peri - node, L - peri)
}

/** Ecliptic longitude (radians) of a body as seen from the Sun: the angle the hub draws it at. */
export function helioLongitude(id: string, ms: number): number | null {
  const p = helioPosition(id, ms)
  return p ? Math.atan2(p[1], p[0]) : null
}

export const AU_KM = 149597870.7
export const LIGHT_SECONDS_PER_AU = 499.004784

/** Earth–Mars distance in AU on a date. */
export function earthMarsAU(ms: number): number {
  const e = helioPosition('earth', ms)!
  const m = helioPosition('mars', ms)!
  return Math.hypot(m[0] - e[0], m[1] - e[1], m[2] - e[2])
}

/** Named moments for the time machine. */
export const MOMENTS: { id: string; label: string; date: string }[] = [
  { id: 'apollo11', label: 'Apollo 11 lands on the Moon', date: '1969-07-20T20:17:00Z' },
  { id: 'opportunity', label: 'Opportunity lands on Mars', date: '2004-01-25T05:05:00Z' },
  { id: 'curiosity', label: 'Curiosity lands on Mars', date: '2012-08-06T05:17:00Z' },
  { id: 'osirisrex', label: 'OSIRIS-REx touches Bennu', date: '2020-10-20T22:08:00Z' },
  { id: 'perseverance', label: 'Perseverance lands on Mars', date: '2021-02-18T20:55:00Z' },
  { id: 'spherex', label: 'SPHEREx launches', date: '2025-03-12T03:10:00Z' },
]
