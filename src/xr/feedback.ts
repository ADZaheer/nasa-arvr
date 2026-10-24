import { Vector3 } from 'three'
import { useXRApp } from './store'
import { xrStore } from './xrStore'

/**
 * Sound, music and haptics — everything is synthesised live with the Web Audio API (no audio files).
 *
 * Mix:  music bus ─┐
 *       ambience ──┼─ compressor ─ master ─ speakers        (+ a shared reverb send)
 *       effects ───┘
 * - Music: generative pads + soft bells, a different mood per world (space / Mars / Moon / asteroid).
 * - Ambience: Mars wind (thin air: quiet, high frequencies muffled); in orbit a soft hum; on airless
 *   worlds (Moon, Bennu) there is no outside sound at all — you hear your own suit: breathing and its fan.
 * - Spatial: rovers/landers and dust devils are positioned in 3D around your head (HRTF panning).
 * - Effects: footsteps, landing thumps, UI clicks, mission chime.
 * Off by default (setting "Sound"); the AudioContext starts from the tap that turns it on.
 */
export type Mood = 'space' | 'mars' | 'moon' | 'asteroid'
export type AmbienceKind = 'hub' | 'body' | 'surface' | 'none'

let ctx: AudioContext | null = null
let master: GainNode | null = null
let musicBus: GainNode | null = null
let ambBus: GainNode | null = null
let sfxBus: GainNode | null = null
let reverb: ConvolverNode | null = null
let noise: AudioBuffer | null = null
let windGain: GainNode | null = null
let humGain: GainNode | null = null
let suitGain: GainNode | null = null
let marsFilter: BiquadFilterNode | null = null

const on = () => useXRApp.getState().settings.sound

function impulse(c: AudioContext, seconds: number, decay: number) {
  const len = Math.floor(c.sampleRate * seconds)
  const buf = c.createBuffer(2, len, c.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch)
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay)
  }
  return buf
}

function ensure(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    const c = (ctx = new AC())
    const comp = c.createDynamicsCompressor()
    comp.threshold.value = -18
    comp.ratio.value = 3
    master = c.createGain()
    master.gain.value = 0
    comp.connect(master).connect(c.destination)
    musicBus = c.createGain()
    ambBus = c.createGain()
    sfxBus = c.createGain()
    musicBus.connect(comp)
    ambBus.connect(comp)
    sfxBus.connect(comp)
    reverb = c.createConvolver()
    reverb.buffer = impulse(c, 3.2, 2.6)
    const wet = c.createGain()
    wet.gain.value = 0.55
    reverb.connect(wet).connect(comp)
    noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate)
    const d = noise.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1

    // Mars wind: noise → wandering band-pass → gusting gain → "thin air" low-pass (muffled)
    marsFilter = c.createBiquadFilter()
    marsFilter.type = 'lowpass'
    marsFilter.frequency.value = 1800
    marsFilter.connect(ambBus)
    const src = c.createBufferSource()
    src.buffer = noise
    src.loop = true
    const band = c.createBiquadFilter()
    band.type = 'bandpass'
    band.frequency.value = 380
    band.Q.value = 0.6
    const lfo = c.createOscillator()
    lfo.frequency.value = 0.07
    const lfoAmt = c.createGain()
    lfoAmt.gain.value = 200
    lfo.connect(lfoAmt).connect(band.frequency)
    const gust = c.createOscillator()
    gust.frequency.value = 0.13
    const gustAmt = c.createGain()
    gustAmt.gain.value = 0.04
    windGain = c.createGain()
    windGain.gain.value = 0
    gust.connect(gustAmt).connect(windGain.gain)
    src.connect(band).connect(windGain).connect(marsFilter)
    src.start()
    lfo.start()
    gust.start()

    // orbit hum
    humGain = c.createGain()
    humGain.gain.value = 0
    for (const f of [55, 55.7, 82.4]) {
      const o = c.createOscillator()
      o.frequency.value = f
      const g = c.createGain()
      g.gain.value = f > 60 ? 0.12 : 0.3
      o.connect(g).connect(humGain)
      o.start()
    }
    humGain.connect(ambBus)

    // spacesuit: fan (filtered noise) + slow breathing (noise through a formant-ish band-pass, swelling)
    suitGain = c.createGain()
    suitGain.gain.value = 0
    suitGain.connect(ambBus)
    const fan = c.createBufferSource()
    fan.buffer = noise
    fan.loop = true
    const fanF = c.createBiquadFilter()
    fanF.type = 'lowpass'
    fanF.frequency.value = 500
    const fanG = c.createGain()
    fanG.gain.value = 0.05
    fan.connect(fanF).connect(fanG).connect(suitGain)
    fan.start()
    const breath = c.createBufferSource()
    breath.buffer = noise
    breath.loop = true
    const bF = c.createBiquadFilter()
    bF.type = 'bandpass'
    bF.frequency.value = 900
    bF.Q.value = 1.2
    const bG = c.createGain()
    bG.gain.value = 0
    const bL = c.createOscillator()
    bL.frequency.value = 0.22 // ~13 breaths a minute
    const bAmt = c.createGain()
    bAmt.gain.value = 0.09
    bL.connect(bAmt).connect(bG.gain)
    breath.connect(bF).connect(bG).connect(suitGain)
    breath.start()
    bL.start()

    applyMix()
  }
  if (ctx.state === 'suspended') {
    void ctx.resume()
    // browsers only allow audio after a user gesture (e.g. Sound was already on from a previous visit)
    const resume = () => {
      void ctx?.resume()
      window.removeEventListener('pointerdown', resume)
      window.removeEventListener('keydown', resume)
    }
    window.addEventListener('pointerdown', resume)
    window.addEventListener('keydown', resume)
  }
  return ctx
}

/** Music / effects volume and master on/off from the settings. */
export function applyMix() {
  if (!ctx || !master || !musicBus || !sfxBus || !ambBus) return
  const s = useXRApp.getState().settings
  const t = ctx.currentTime
  master.gain.setTargetAtTime(s.sound ? 0.9 : 0, t, 0.25)
  musicBus.gain.setTargetAtTime(s.musicVolume * 0.5, t, 0.3)
  sfxBus.gain.setTargetAtTime(s.sfxVolume, t, 0.1)
  ambBus.gain.setTargetAtTime(s.sfxVolume, t, 0.3)
}

// ---------------------------------------------------------------------------------------------
// Generative music, per mood: slow pad chords over a soft bass, bells, and in the B sections a gentle
// arpeggio. A 2.5–3.5-minute form (A A B A' B) so it doesn't feel like a short loop; then it repeats.
const MIDI = (n: number) => 440 * Math.pow(2, (n - 69) / 12)
const PROGRESSIONS: Record<Mood, number[][]> = {
  space: [[48, 55, 62, 64, 71], [45, 52, 59, 60, 67], [41, 48, 55, 57, 64], [43, 50, 57, 59, 62]], // Cmaj9 Am9 Fmaj9 G6/9
  mars: [[50, 57, 60, 64, 69], [46, 53, 57, 62, 65], [43, 50, 53, 58, 62], [45, 52, 55, 61, 64]], // Dm9 Bbmaj7 Gm9 A7sus-ish
  moon: [[40, 47, 55, 59], [36, 43, 52, 55], [38, 45, 50, 57], [40, 47, 54, 59]], // Em add9, Cmaj7, D sus, Em
  asteroid: [[37, 44, 49, 50], [39, 46, 50, 51], [36, 43, 47, 49], [38, 44, 49, 52]], // clustered, uneasy
}
/** Contrasting second section for each mood. */
const B_SECTIONS: Record<Mood, number[][]> = {
  space: [[41, 48, 55, 57, 64], [43, 50, 55, 59, 62], [40, 47, 55, 59, 62], [45, 52, 57, 60, 64]], // Fmaj9 G6/9 Em7 Am9
  mars: [[43, 50, 57, 58, 62], [41, 48, 55, 57, 60], [46, 53, 57, 60, 65], [45, 52, 57, 61, 64]], // Gm9 Fadd9 Bbmaj7 A
  moon: [[36, 43, 50, 55], [43, 50, 55, 59], [45, 52, 55, 59], [38, 45, 52, 57]], // C G Am D
  asteroid: [[35, 42, 47, 48], [37, 44, 48, 49], [34, 41, 46, 47], [36, 43, 47, 49]],
}
type Section = 'A' | 'A2' | 'B' | 'rest'
const FORM: Section[] = ['A', 'A', 'B', 'A2', 'B']
function chordAt(m: Mood, i: number): { notes: number[]; section: Section } | null {
  const section = FORM[Math.floor(i / 4) % FORM.length]
  if (section === 'rest') return { notes: [], section }
  const k = i % 4
  if (section === 'B') return { notes: B_SECTIONS[m][k], section }
  const a = PROGRESSIONS[m][k]
  // A': the top voice lifts an octave, so the theme returns brighter
  return { notes: section === 'A2' ? [...a.slice(0, -1), a[a.length - 1] + 12] : a, section }
}

let mood: Mood | null = null
let timer: ReturnType<typeof setInterval> | null = null
let step = 0
let nextChord = 0
let nextBell = 0

function pad(c: AudioContext, freq: number, at: number, dur: number, bright: number) {
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, at)
  g.gain.exponentialRampToValueAtTime(0.06, at + 3)
  g.gain.setValueAtTime(0.06, at + dur - 3)
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur + 1.5)
  const f = c.createBiquadFilter()
  f.type = 'lowpass'
  f.frequency.value = 500 + bright * 900
  f.Q.value = 0.4
  for (const [type, detune] of [['triangle', -6], ['sawtooth', 7]] as const) {
    const o = c.createOscillator()
    o.type = type
    o.frequency.value = freq
    o.detune.value = detune
    const og = c.createGain()
    og.gain.value = type === 'sawtooth' ? 0.35 : 1
    o.connect(og).connect(f)
    o.start(at)
    o.stop(at + dur + 2)
  }
  f.connect(g)
  g.connect(musicBus!)
  g.connect(reverb!)
}

/** Soft plucked note for the arpeggio. */
function pluck(c: AudioContext, freq: number, at: number, level: number) {
  const o = c.createOscillator()
  o.type = 'triangle'
  o.frequency.value = freq
  const f = c.createBiquadFilter()
  f.type = 'lowpass'
  f.frequency.value = 1800
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, at)
  g.gain.exponentialRampToValueAtTime(level, at + 0.015)
  g.gain.exponentialRampToValueAtTime(0.0001, at + 1.6)
  o.connect(f).connect(g)
  g.connect(musicBus!)
  g.connect(reverb!)
  o.start(at)
  o.stop(at + 1.7)
}

function bell(c: AudioContext, freq: number, at: number) {
  const o = c.createOscillator()
  o.type = 'sine'
  o.frequency.value = freq
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, at)
  g.gain.exponentialRampToValueAtTime(0.05, at + 0.02)
  g.gain.exponentialRampToValueAtTime(0.0001, at + 3)
  const p = c.createStereoPanner()
  p.pan.value = Math.random() * 1.6 - 0.8
  o.connect(g).connect(p)
  p.connect(musicBus!)
  p.connect(reverb!)
  o.start(at)
  o.stop(at + 3.2)
}

function schedule() {
  const c = ctx
  if (!c || !mood || !on()) return
  const now = c.currentTime
  const chordLen = mood === 'moon' ? 12 : 9
  if (nextChord < now + 0.5) {
    const at = Math.max(now + 0.05, nextChord)
    const cur = chordAt(mood, step)!
    const bright = (mood === 'mars' ? 0.5 : mood === 'space' ? 0.8 : 0.25) + (cur.section === 'A2' ? 0.25 : 0)
    for (const n of cur.notes) pad(c, MIDI(n), at, chordLen, bright)
    // soft bass an octave under the root (not in the rests)
    if (cur.notes.length) pad(c, MIDI(cur.notes[0] - 12), at, chordLen, 0.05)
    // B sections: a slow arpeggio through the chord, rising then falling
    if (cur.section === 'B' && mood !== 'asteroid') {
      const tones = [...cur.notes.slice(1), ...cur.notes.slice(1, -1).reverse()]
      const gap = mood === 'moon' ? 1.1 : 0.75
      for (let i = 0; i * gap < chordLen - 1.5; i++) pluck(c, MIDI(tones[i % tones.length] + 12), at + 0.5 + i * gap, 0.022)
    }
    step++
    nextChord = at + chordLen - 1.5 // overlap for smooth crossfades
  }
  const ringing = chordAt(mood, Math.max(0, step - 1))!
  if (nextBell < now + 0.5 && mood !== 'asteroid' && ringing.notes.length) {
    const n = ringing.notes[Math.floor(Math.random() * ringing.notes.length)] + (Math.random() < 0.5 ? 24 : 12)
    bell(c, MIDI(n), Math.max(now + 0.05, nextBell))
    nextBell = now + (mood === 'moon' ? 5 : 2.5) + Math.random() * 4
  }
}

/** Switch the soundtrack mood (or stop it). */
export function setMood(m: Mood | null) {
  if (m === mood) return
  mood = m
  step = 0
  if (!m) {
    if (timer) clearInterval(timer)
    timer = null
    return
  }
  if (!timer) timer = setInterval(schedule, 250)
}

/** Called whenever the scene, world kind or the sound setting changes. */
export function setAmbience(kind: AmbienceKind, world: Mood = 'space') {
  if (!on()) {
    applyMix()
    setMood(null)
    return
  }
  const c = ensure()
  if (!c || !windGain || !humGain || !suitGain) return
  applyMix()
  const t = c.currentTime
  const airless = kind === 'surface' && (world === 'moon' || world === 'asteroid')
  windGain.gain.setTargetAtTime(kind === 'surface' && world === 'mars' ? 0.11 : 0, t, 0.8)
  humGain.gain.setTargetAtTime(kind === 'hub' || kind === 'body' ? 0.05 : 0, t, 0.8)
  suitGain.gain.setTargetAtTime(airless ? 1 : 0, t, 0.8)
  setMood(kind === 'none' ? null : kind === 'surface' ? world : 'space')
}

// ---------------------------------------------------------------------------------------------
// Spatial emitters: register a position each frame; the listener follows the camera.
type EmitterKind = 'machine' | 'devil'
const emitters = new Map<string, { kind: EmitterKind; pos: Vector3; seen: number; node?: { panner: PannerNode; gain: GainNode; stop: () => void } }>()

export function updateEmitter(id: string, kind: EmitterKind, x: number, y: number, z: number) {
  let e = emitters.get(id)
  if (!e) emitters.set(id, (e = { kind, pos: new Vector3(), seen: 0 }))
  e.pos.set(x, y, z)
  e.seen = performance.now()
}

function makeEmitterNode(c: AudioContext, kind: EmitterKind) {
  const panner = c.createPanner()
  panner.panningModel = 'HRTF'
  panner.distanceModel = 'inverse'
  panner.refDistance = kind === 'devil' ? 40 : 2
  panner.maxDistance = kind === 'devil' ? 900 : 60
  panner.rolloffFactor = kind === 'devil' ? 1.2 : 1.6
  const gain = c.createGain()
  gain.gain.value = 0
  const stops: (() => void)[] = []
  if (kind === 'machine') {
    // soft electronics hum + cooling-fan hiss (artistic)
    for (const f of [92, 138, 276]) {
      const o = c.createOscillator()
      o.frequency.value = f
      const g = c.createGain()
      g.gain.value = f === 276 ? 0.01 : 0.025
      o.connect(g).connect(gain)
      o.start()
      stops.push(() => o.stop())
    }
    const n = c.createBufferSource()
    n.buffer = noise
    n.loop = true
    const f = c.createBiquadFilter()
    f.type = 'highpass'
    f.frequency.value = 2500
    const g = c.createGain()
    g.gain.value = 0.012
    n.connect(f).connect(g).connect(gain)
    n.start()
    stops.push(() => n.stop())
  } else {
    // dust devil: swirling band-passed noise
    const n = c.createBufferSource()
    n.buffer = noise
    n.loop = true
    const f = c.createBiquadFilter()
    f.type = 'bandpass'
    f.frequency.value = 600
    f.Q.value = 0.8
    const l = c.createOscillator()
    l.frequency.value = 0.6
    const la = c.createGain()
    la.gain.value = 350
    l.connect(la).connect(f.frequency)
    const g = c.createGain()
    g.gain.value = 0.25
    n.connect(f).connect(g).connect(gain)
    n.start()
    l.start()
    stops.push(() => (n.stop(), l.stop()))
  }
  gain.connect(panner)
  panner.connect(marsFilter ?? ambBus!)
  return { panner, gain, stop: () => stops.forEach((s) => s()) }
}

const fwd = new Vector3()
const up = new Vector3()
/** Each frame: move the listener with the head, update / create / retire emitter nodes. */
export function updateListener(pos: Vector3, forward: Vector3, upVec: Vector3, airless: boolean) {
  const c = ctx
  if (!c || !on()) return
  const L = c.listener
  fwd.copy(forward)
  up.copy(upVec)
  if (L.positionX) {
    L.positionX.value = pos.x
    L.positionY.value = pos.y
    L.positionZ.value = pos.z
    L.forwardX.value = fwd.x
    L.forwardY.value = fwd.y
    L.forwardZ.value = fwd.z
    L.upX.value = up.x
    L.upY.value = up.y
    L.upZ.value = up.z
  } else {
    L.setPosition(pos.x, pos.y, pos.z)
    L.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z)
  }
  const now = performance.now()
  for (const [id, e] of emitters) {
    const stale = now - e.seen > 1500
    if (stale) {
      e.node?.gain.gain.setTargetAtTime(0, c.currentTime, 0.2)
      if (now - e.seen > 4000) {
        e.node?.stop()
        emitters.delete(id)
      }
      continue
    }
    if (!e.node) e.node = makeEmitterNode(c, e.kind)
    const p = e.node.panner
    if (p.positionX) {
      p.positionX.value = e.pos.x
      p.positionY.value = e.pos.y
      p.positionZ.value = e.pos.z
    } else p.setPosition(e.pos.x, e.pos.y, e.pos.z)
    // no air, no sound from outside (Moon, Bennu)
    e.node.gain.gain.setTargetAtTime(airless ? 0 : 1, c.currentTime, 0.3)
  }
}

// ---------------------------------------------------------------------------------------------
// One-shot effects
function burst(duration: number, freq: number, gain: number, type: BiquadFilterType = 'lowpass') {
  if (!on()) return
  const c = ensure()
  if (!c || !noise || !sfxBus) return
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
  src.connect(f).connect(g).connect(sfxBus)
  src.start(t, Math.random(), duration + 0.05)
}

let airlessSteps = false
/** On airless worlds footsteps are felt through the suit: lower and duller. */
export function setAirlessSteps(v: boolean) {
  airlessSteps = v
}
export const playStep = () => (airlessSteps ? burst(0.12, 260, 0.22) : burst(0.09, 900, 0.18))
export const playLand = () => burst(0.35, airlessSteps ? 160 : 260, 0.5)

export function playClick() {
  if (!on()) return
  const c = ensure()
  if (!c || !sfxBus) return
  const o = c.createOscillator()
  const g = c.createGain()
  const t = c.currentTime
  o.frequency.setValueAtTime(1300, t)
  o.frequency.exponentialRampToValueAtTime(700, t + 0.06)
  g.gain.setValueAtTime(0.12, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08)
  o.connect(g).connect(sfxBus)
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

/** Mission-complete chime: a bright arpeggio, plus a stronger buzz. */
export function playChime() {
  haptic(0.6, 60)
  if (!on()) return
  const c = ensure()
  if (!c || !sfxBus) return
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
    o.connect(g).connect(sfxBus!)
    if (reverb) g.connect(reverb)
    o.start(t)
    o.stop(t + 0.65)
  })
}

/** Debug/tests: current audio engine state. */
export function audioState() {
  return { context: ctx?.state ?? 'none', mood, emitters: emitters.size, sampleRate: ctx?.sampleRate ?? 0 }
}
if (import.meta.env.DEV) (window as unknown as { __audio: typeof audioState }).__audio = audioState
