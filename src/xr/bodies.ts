/** Hub layout for the Solar System picker. Distances and sizes are NOT to scale. */
export interface BodyInfo {
  id: string
  name: string
  kind: 'star' | 'planet' | 'asteroid'
  color: string
  /** orbit radius in hub units */
  orbit: number
  /** display radius in hub units */
  size: number
  rings?: boolean
}

export const BODIES: BodyInfo[] = [
  { id: 'sun', name: 'Sun', kind: 'star', color: '#ffcc55', orbit: 0, size: 0.32 },
  { id: 'mercury', name: 'Mercury', kind: 'planet', color: '#a9a39b', orbit: 0.6, size: 0.05 },
  { id: 'venus', name: 'Venus', kind: 'planet', color: '#e8c48a', orbit: 0.85, size: 0.08 },
  { id: 'earth', name: 'Earth', kind: 'planet', color: '#3d7bd9', orbit: 1.1, size: 0.085 },
  { id: 'bennu', name: 'Bennu', kind: 'asteroid', color: '#8a847c', orbit: 1.25, size: 0.035 },
  { id: 'mars', name: 'Mars', kind: 'planet', color: '#c1440e', orbit: 1.42, size: 0.065 },
  { id: 'jupiter', name: 'Jupiter', kind: 'planet', color: '#d6a26b', orbit: 1.9, size: 0.2 },
  { id: 'saturn', name: 'Saturn', kind: 'planet', color: '#e3cf8f', orbit: 2.4, size: 0.17, rings: true },
  { id: 'uranus', name: 'Uranus', kind: 'planet', color: '#8fd4e0', orbit: 2.8, size: 0.11 },
  { id: 'neptune', name: 'Neptune', kind: 'planet', color: '#4a6fe0', orbit: 3.15, size: 0.105 },
]

export const BODY_BY_ID = Object.fromEntries(BODIES.map((b) => [b.id, b])) as Record<string, BodyInfo>

export const KIND_COLORS = {
  fact: '#4fd1ff',
  illustration: '#b18cff',
  candidate: '#ffb347',
} as const
