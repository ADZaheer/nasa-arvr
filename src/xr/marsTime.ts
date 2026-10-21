/**
 * Mars Sol Date and Coordinated Mars Time (MTC, the Martian equivalent of UTC) from Earth time,
 * following NASA GISS Mars24 (Allison & McEwen 2000): https://www.giss.nasa.gov/tools/mars24/help/algorithm.html
 */
export const MARS24_URL = 'https://www.giss.nasa.gov/tools/mars24/help/algorithm.html'

export function marsTime(date = new Date()) {
  const jdUT = date.getTime() / 86400000 + 2440587.5
  const jdTT = jdUT + 69.184 / 86400 // TT − UTC = 37 leap seconds + 32.184 s
  const msd = (jdTT - 2405522.0028779) / 1.0274912517
  const mtcHours = (((msd % 1) + 1) % 1) * 24
  const h = Math.floor(mtcHours)
  const m = Math.floor((mtcHours - h) * 60)
  return { sol: Math.floor(msd), mtc: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` }
}

export function earthUTC(date = new Date()) {
  return `${date.toISOString().slice(0, 10)} ${date.toISOString().slice(11, 16)} UTC`
}
