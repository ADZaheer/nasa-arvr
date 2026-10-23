import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { useStore } from 'zustand'
import { Vector3, type Group, type Mesh } from 'three'
import { useXRApp } from './store'
import { xrStore } from './xrStore'
import { viewCamera } from './viewCamera'
import { useLoading } from './loading'
import { TOUR, TOUR_END } from './tour'
import { t } from './i18n'
import { Appear, Button, GlassPanel, Icon, Label, UI, roundedRect, uiMat } from './ui3d'
import { playChime } from './feedback'

/** Moves to each tour stop when the step changes, and advances automatically once you've had time to read. */
export function TourDirector() {
  const step = useXRApp((s) => s.tourStep)
  const timer = useRef(0)
  useEffect(() => {
    timer.current = 0
    if (step !== null && step < TOUR.length) TOUR[step].go()
    if (step === TOUR.length) playChime()
  }, [step])
  useFrame((_, dt) => {
    const s = useXRApp.getState()
    if (s.tourStep === null || s.tourStep >= TOUR.length || s.tourPaused || useLoading.getState().active) return
    timer.current += Math.min(dt, 0.1)
    tourProgress.value = timer.current / TOUR[s.tourStep].seconds
    if (tourProgress.value >= 1) s.setTourStep(s.tourStep + 1)
  })
  return null
}

/** 0..1 through the current stop's reading time (read every frame by the progress bars). */
export const tourProgress = { value: 0 }

function useTourText() {
  const step = useXRApp((s) => s.tourStep)
  const lang = useXRApp((s) => s.settings.lang)
  if (step === null) return null
  const stop = step < TOUR.length ? TOUR[step] : null
  return {
    step,
    last: step >= TOUR.length,
    title: (stop ?? TOUR_END).title[lang],
    caption: (stop ?? TOUR_END).caption[lang],
  }
}

const tourActions = {
  back: () => {
    const s = useXRApp.getState()
    if (s.tourStep) s.setTourStep(s.tourStep - 1)
  },
  next: () => {
    const s = useXRApp.getState()
    if (s.tourStep !== null) s.setTourStep(s.tourStep >= TOUR.length ? null : s.tourStep + 1)
  },
  exit: () => useXRApp.getState().setTourStep(null),
  pause: () => useXRApp.setState((s) => ({ tourPaused: !s.tourPaused })),
}

/** On-screen caption bar (desktop, phone): title, caption, stop dots, Back / Pause / Next / Exit. */
export function TourCaption() {
  const text = useTourText()
  const paused = useXRApp((s) => s.tourPaused)
  const bar = useRef<HTMLElement>(null)
  useEffect(() => {
    let id = 0
    const loop = () => {
      if (bar.current) bar.current.style.width = `${Math.min(100, tourProgress.value * 100)}%`
      id = requestAnimationFrame(loop)
    }
    id = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(id)
  }, [])
  if (!text) return null
  return (
    <section className="tour-caption" aria-live="polite" aria-label={t('Guided tour')}>
      <div className="tour-caption__top">
        <small>
          {t('Guided tour')} · {Math.min(text.step + 1, TOUR.length)}/{TOUR.length}
        </small>
        <div className="tour-dots" aria-hidden>
          {TOUR.map((s, i) => (
            <i key={s.id} className={i < text.step ? 'done' : i === text.step ? 'on' : ''} />
          ))}
        </div>
      </div>
      <strong>{text.title}</strong>
      <p>{text.caption}</p>
      {!text.last && (
        <div className="tour-progress">
          <i ref={bar} />
        </div>
      )}
      <div className="tour-caption__actions">
        <button className="btn" onClick={tourActions.back} disabled={!text.step}>
          ◂ {t('Back')}
        </button>
        {!text.last && (
          <button className="btn" onClick={tourActions.pause} aria-pressed={paused}>
            {paused ? t('Resume') : t('Pause')}
          </button>
        )}
        <button className="btn btn--primary" onClick={tourActions.next}>
          {text.last ? t('Explore freely') : `${t('Next')} ▸`}
        </button>
        {!text.last && (
          <button className="btn btn--ghost" onClick={tourActions.exit}>
            {t('Exit tour')}
          </button>
        )}
      </div>
    </section>
  )
}

/** In a headset: the caption floats below your gaze (lazily following, like the suit computer). */
export function TourPanelVR() {
  const session = useStore(xrStore, (s) => s.session)
  const text = useTourText()
  const paused = useXRApp((s) => s.tourPaused)
  const g = useRef<Group>(null)
  const bar = useRef<Mesh>(null)
  const v = useMemo(() => ({ head: new Vector3(), fwd: new Vector3(), target: new Vector3(), placed: false }), [])
  const [, force] = useState(0)
  useEffect(() => {
    v.placed = false
    force((n) => n + 1)
  }, [text?.step, v])
  useFrame(({ camera, gl }, dt) => {
    const o = g.current
    if (!o) return
    const cam = viewCamera(gl, camera)
    cam.getWorldPosition(v.head)
    cam.getWorldDirection(v.fwd)
    v.fwd.y = 0
    v.fwd.normalize()
    v.target.copy(v.head).addScaledVector(v.fwd, 0.95)
    v.target.y = v.head.y + 0.22
    if (!v.placed) o.position.copy(v.target)
    else o.position.lerp(v.target, 1 - Math.exp(-dt * 1.2))
    v.placed = true
    o.lookAt(v.head)
    const b = bar.current
    if (b) {
      const p = Math.min(1, tourProgress.value)
      b.scale.x = Math.max(0.001, p)
      b.position.x = -1.1 + 1.1 * p
    }
  })
  if (!session || !text) return null
  return (
    <group ref={g}>
      <Appear key={text.step}>
        <group scale={0.14}>
          <GlassPanel width={2.8} height={1.62} radius={0.16} />
          <Icon name="play" size={0.16} color={UI.accent} position={[-1.22, 0.62, 0.004]} />
          <Label text={`${t('Guided tour')} · ${Math.min(text.step + 1, TOUR.length)}/${TOUR.length}`} position={[-1.08, 0.62, 0.005]} size={UI.type.small} color={UI.accentHover} />
          <Label text={text.title} position={[-1.25, 0.42, 0.005]} size={UI.type.title} bold maxWidth={2.5} />
          <Label text={text.caption} position={[-1.25, 0.0, 0.005]} size={0.092} color="#d6e4ea" maxWidth={2.5} />
          {!text.last && (
            <>
              <mesh geometry={roundedRect(2.2, 0.035, 0.0175)} material={uiMat('#2a3f48')} position={[0, -0.38, 0.002]} />
              <mesh ref={bar} geometry={roundedRect(2.2, 0.035, 0.0175)} material={uiMat(UI.accent)} position={[-1.1, -0.38, 0.003]} scale={[0.001, 1, 1]} />
            </>
          )}
          <Button label={t('Back')} icon="back" onPress={tourActions.back} disabled={!text.step} position={[-0.98, -0.6, 0]} width={0.62} height={0.24} />
          {!text.last && <Button label={paused ? t('Resume') : t('Pause')} icon={paused ? 'play' : 'pause'} onPress={tourActions.pause} position={[-0.3, -0.6, 0]} width={0.66} height={0.24} />}
          <Button label={text.last ? t('Explore freely') : t('Next')} icon="next" tone="accent" onPress={tourActions.next} position={text.last ? [0.4, -0.6, 0] : [0.42, -0.6, 0]} width={text.last ? 1.2 : 0.7} height={0.24} />
          {!text.last && <Button icon="close" onPress={tourActions.exit} position={[1.02, -0.6, 0]} width={0.36} height={0.24} />}
        </group>
      </Appear>
    </group>
  )
}

/** A big "Guided tour" button floating in the VR Solar System view when no tour is running. */
export function TourStartVR() {
  const running = useXRApp((s) => s.tourStep !== null)
  useXRApp((s) => s.settings.lang)
  if (running) return null
  return <Button label={t('Guided tour')} icon="play" tone="accent" onPress={() => useXRApp.getState().setTourStep(0)} position={[0, 0, 0]} width={0.5} height={0.11} />
}
