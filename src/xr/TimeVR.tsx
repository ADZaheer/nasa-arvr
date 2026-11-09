import { useEffect, useState } from 'react'
import { useXRApp } from './store'
import { currentDate, formatLightTime, sendMessageToMars, useTime } from './timeMachine'
import { LIGHT_SECONDS_PER_AU, earthMarsAU } from './ephemeris'
import { formatDate } from './TimePanel'
import { t } from './i18n'
import { Button, GlassPanel, Label, UI } from './ui3d'

const YEAR = 365.25 * 86400000

/** The time machine in a headset: a small glass console beside the Solar System (world metres). */
export function TimeVR() {
  const lang = useXRApp((s) => s.settings.lang)
  const date = useTime((s) => s.date)
  const playing = useTime((s) => s.playing)
  const message = useTime((s) => s.message)
  const [, tick] = useState(0)
  useEffect(() => {
    if (!playing && !message) return
    const id = setInterval(() => tick((n) => n + 1), 250)
    return () => clearInterval(id)
  }, [playing, message])
  const now = currentDate()
  const { setDate, setPlaying } = useTime.getState()
  const light = earthMarsAU(now) * LIGHT_SECONDS_PER_AU
  return (
    <group scale={0.1}>
      <GlassPanel width={3.6} height={1.5} radius={0.16} />
      <Label text={t('Time machine')} position={[-1.65, 0.55, 0.005]} size={UI.type.title} bold />
      <Label text={date === null ? t('Live') : formatDate(now, lang)} position={[1.65, 0.55, 0.005]} size={UI.type.body} color={date === null ? UI.good : '#c9bfff'} anchorX="right" />
      <Label text={`${t('Earth ↔ Mars')}: ${t('A radio signal takes {x} one way.', { x: formatLightTime(light) })}`} position={[-1.65, 0.28, 0.005]} size={UI.type.tiny} color={UI.muted} maxWidth={3.3} />
      <Button label={`−1 ${t('yr')}`} onPress={() => setDate(now - YEAR)} position={[-1.3, -0.08, 0]} width={0.7} height={0.3} />
      <Button label={playing ? t('Pause') : t('Play')} icon={playing ? 'pause' : 'play'} onPress={() => setPlaying(!playing)} position={[-0.45, -0.08, 0]} width={0.85} height={0.3} />
      <Button label={`+1 ${t('yr')}`} onPress={() => setDate(now + YEAR)} position={[0.4, -0.08, 0]} width={0.7} height={0.3} />
      <Button label={t('Today')} onPress={() => (setPlaying(false), setDate(null))} disabled={date === null} position={[1.25, -0.08, 0]} width={0.8} height={0.3} />
      <Button label={t('Send a message to Mars')} icon="next" tone="accent" disabled={!!message} onPress={sendMessageToMars} position={[0, -0.5, 0]} width={3.3} height={0.3} />
    </group>
  )
}
