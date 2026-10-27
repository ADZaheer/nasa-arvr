/**
 * NASA image layers you can switch between on a body (orbit view), each with its own credit and,
 * for data maps, a colour legend. Mars: Viking colour mosaic, and MOLA elevation built from the NASA PDS
 * MEGDR global topography (scripts/build-layers.mjs).
 */
export interface DataLayer {
  id: string
  label: string
  /** texture URL; undefined = the body's own colour texture */
  url?: string
  credit: string
  legend?: { min: string; max: string; stops: string[] }
}

const ELEVATION_STOPS = ['#141e6e', '#1e6ec8', '#3cbebe', '#5abe5a', '#dcd25a', '#dc8232', '#aa4632', '#faf5f0']

export const LAYERS: Record<string, DataLayer[]> = {
  mars: [
    { id: 'colour', label: 'Colour (Viking)', credit: 'NASA Viking orbiter colour mosaic (NASA 3D Resources), public domain' },
    {
      id: 'elevation',
      label: 'Elevation (MOLA)',
      url: '/textures/mars_elevation.jpg',
      credit: 'NASA Mars Global Surveyor MOLA laser altimeter, global topography (NASA PDS), public domain',
      legend: { min: '−8 km', max: '+12 km', stops: ELEVATION_STOPS },
    },
  ],
}

export function layersFor(bodyId: string | null): DataLayer[] {
  return bodyId ? (LAYERS[bodyId] ?? []) : []
}
