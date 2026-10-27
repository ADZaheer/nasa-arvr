import { create } from 'zustand'
import type { Lang } from './i18n'

/**
 * Tour narration with the browser's own speech synthesis (free, works offline, nothing to download).
 * Only speaks when Sound is on and narration isn't muted. Tracks how far the voice has read so the
 * caption can highlight the words as they are spoken. If the device has no voice for the language, it
 * stays silent (captions still work) rather than reading Indonesian with an English voice.
 */
interface NarrationState {
  /** characters of the current caption spoken so far (-1 = not speaking) */
  spoken: number
  speaking: boolean
  text: string
}
export const useNarration = create<NarrationState>(() => ({ spoken: -1, speaking: false, text: '' }))

const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined

function voiceFor(lang: Lang): SpeechSynthesisVoice | null {
  const voices = synth?.getVoices() ?? []
  const want = lang === 'id' ? /^(id|in)\b/i : /^en\b/i
  const matches = voices.filter((v) => want.test(v.lang))
  // prefer a local (offline) voice, then a Google/Microsoft natural one
  return matches.find((v) => v.localService) ?? matches.find((v) => /natural|google|microsoft/i.test(v.name)) ?? matches[0] ?? null
}

export function hasVoice(lang: Lang) {
  return !!voiceFor(lang)
}

export function speak(text: string, lang: Lang) {
  stopSpeaking()
  if (!synth || !text) return
  const voice = voiceFor(lang)
  if (!voice) return
  const u = new SpeechSynthesisUtterance(text)
  u.voice = voice
  u.lang = voice.lang
  u.rate = 0.98
  u.pitch = 1
  useNarration.setState({ text, spoken: 0, speaking: true })
  u.onboundary = (e) => {
    if (useNarration.getState().text === text) useNarration.setState({ spoken: e.charIndex + (e.charLength || 0) })
  }
  const done = () => {
    if (useNarration.getState().text === text) useNarration.setState({ spoken: text.length, speaking: false })
  }
  u.onend = done
  u.onerror = done
  synth.speak(u)
}

export function stopSpeaking() {
  synth?.cancel()
  useNarration.setState({ spoken: -1, speaking: false, text: '' })
}

// voices load asynchronously in Chrome
synth?.addEventListener?.('voiceschanged', () => {})
