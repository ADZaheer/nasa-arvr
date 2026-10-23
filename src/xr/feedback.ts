import { useXRApp } from './store'
import { xrStore } from './xrStore'

/**
 * Sound + haptics. All sounds are synthesised with the Web Audio API (no audio files):
 * - Mars wind: filtered noise, quiet — Mars' thin air carries sound weakly. (Inspired by the wind
 *   Perseverance's microphones recorded; this is not that recording.)
 * - Space: a soft low hum in orbit / Solar System views.
 * - Footsteps, landing thump, UI clicks.
 * Off by default (setting "Sound"); the AudioContext starts on the user's tap that enables it.
 */
let ctx: AudioContext | null = null
let master: GainNode | null = null
let windGain: GainNode | null = null
let humGain: GainNode | null = null
let noise: AudioBuffer | null = null

function ensure(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    ctx = new AC()
    master = ctx.createGain()
    master.gain.value = 0.9
    master.connect(ctx.destination)
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
    const d = noise.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1

    // wind: noise → band-pass with a slowly wandering centre frequency → gain with gusts
    const src = ctx.createBufferSource()
    src.buffer = noise
    src.loop = true
    const band = ctx.createBiquadFilter()
    band.type = 'bandpass'
    band.frequency.value = 420
    band.Q.value = 0.6
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 0.07
    const lfoAmt = ctx.createGain()
    lfoAmt.gain.value = 220
    lfo.connect(lfoAmt).connect(band.frequency)
    const gust = ctx.createOscillator()
    gust.frequency.value = 0.13
    const gustAmt = ctx.createGain()
    gustAmt.gain.value = 0.05
    windGain = ctx.createGain()
    windGain.gain.value = 0
    gust.connect(gustAmt).connect(windGain.gain)
    src.connect(band).connect(windGain).connect(master)
    src.start()
    lfo.start()
    gust.start()

    // space hum: two detuned low sines with a slow tremolo
    humGain = ctx.createGain()
    humGain.gain.value = 0
    for (const f of [55, 55.7, 82.4]) {
      const o = ctx.createOscillator()
      o.frequency.value = f
      const g = ctx.createGain()
      g.gain.value = f > 60 ? 0.12 : 0.3
      o.connect(g).connect(humGain)
      o.start()
    }
    humGain.connect(master)
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

const on = () => useXRApp.getState().settings.sound

/** Called whenever the scene or the sound setting changes. */
export function setAmbience(kind: 'hub' | 'body' | 'surface' | 'none') {
  if (!on()) {
    if (ctx && master) master.gain.setTargetAtTime(0, ctx.currentTime, 0.2)
    return
  }
  const c = ensure()
  if (!c || !windGain || !humGain || !master) return
  master.gain.setTargetAtTime(0.9, c.currentTime, 0.2)
  windGain.gain.setTargetAtTime(kind === 'surface' ? 0.11 : 0, c.currentTime, 0.8)
  humGain.gain.setTargetAtTime(kind === 'hub' || kind === 'body' ? 0.05 : 0, c.currentTime, 0.8)
}

function burst(duration: number, freq: number, gain: number, type: BiquadFilterType = 'lowpass') {
  if (!on()) return
  const c = ensure()
  if (!c || !noise || !master) return
  const src = c.createBufferSource()
  src.buffer = noise
  src.playbackRate.value = 0.8 + Math.random() * 0.4
  const f = c.createBiquadFilter()
  f.type = type
  f.frequency.value = freq
  const g = c.createGain()
  const t = c.currentTime
  g.gain.setValueAtTime(gain, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + duration)
  src.connect(f).connect(g).connect(master)
  src.start(t, Math.random(), duration + 0.05)
}

export const playStep = () => burst(0.09, 900, 0.18)
export const playLand = () => burst(0.35, 260, 0.5)

export function playClick() {
  if (!on()) return
  const c = ensure()
  if (!c || !master) return
  const o = c.createOscillator()
  const g = c.createGain()
  const t = c.currentTime
  o.frequency.setValueAtTime(1300, t)
  o.frequency.exponentialRampToValueAtTime(700, t + 0.06)
  g.gain.setValueAtTime(0.12, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08)
  o.connect(g).connect(master)
  o.start(t)
  o.stop(t + 0.1)
}

/** Short vibration on the XR controllers (no-op elsewhere). */
export function haptic(strength = 0.35, ms = 25) {
  const session = xrStore.getState().session
  if (!session) return
  for (const src of session.inputSources) {
    const act = (src.gamepad as (Gamepad & { hapticActuators?: { pulse?: (v: number, d: number) => Promise<boolean> }[] }) | undefined)?.hapticActuators?.[0]
    void act?.pulse?.(strength, ms)
  }
}

/** Hover feedback: the faintest tick on the controllers (no sound), like Quest system UI. */
export function hoverFeedback() {
  haptic(0.08, 8)
}

/** Menu / button press feedback: click sound + a tiny controller buzz. */
export function pressFeedback() {
  playClick()
  haptic()
}

/** Mission-complete chime: a bright two-note arpeggio, plus a stronger buzz. */
export function playChime() {
  haptic(0.6, 60)
  if (!on()) return
  const c = ensure()
  if (!c || !master) return
  const t0 = c.currentTime
  ;[659.25, 987.77, 1318.5].forEach((f, i) => {
    const o = c.createOscillator()
    const g = c.createGain()
    const t = t0 + i * 0.09
    o.type = 'triangle'
    o.frequency.value = f
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6)
    o.connect(g).connect(master!)
    o.start(t)
    o.stop(t + 0.65)
  })
}
