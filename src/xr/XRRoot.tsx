import { Suspense, useEffect, useRef, type ReactNode } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { XR, XRDomOverlay, XROrigin, useXR } from '@react-three/xr'
import { xrStore } from './xrStore'
import { useXRApp } from './store'
import { SolarSystemHub } from './SolarSystemHub'
import { BodyExplorer } from './BodyExplorer'
import { GazeDwell } from './GazeDwell'
import { GyroControls } from './GyroControls'
import { ARPlacement } from './ARPlacement'
import { Hud } from './Hud'
import { SurfaceScene } from './surface/SurfaceScene'
import { PERF, PerfHud, PerfProbe } from './PerfMeter'
import { WristMenu } from './WristMenu'
import { QualityGovernor } from './QualityGovernor'
import { HoloBackdrop } from './holo'
import { HandStyler, ScreenEffects, SoundDirector, TransitionVeil } from './polish'
import { MissionTracker } from './MissionTracker'
import { ComfortVignette, LoadingPanelVR, Prefetcher, ProblemPanelVR, SceneLoadTracker, recenterOrigin } from './smooth'
import { viewCamera } from './viewCamera'
import { Vector3, type Group } from 'three'
import { cameraMotion, easeInOutCubic, easeOutCubic, prefersReducedMotion } from './cameraMotion'
import { IntroScreen, useIntro } from './Intro'
import { ErrorBoundary } from './ErrorBoundary'
import { reportProblem, useLoading } from './loading'
import { TourDirector, TourPanelVR, TourStartVR } from './TourUI'
import { ControllerHints } from './ControllerHints'
import { RoomRover } from './RoomRover'
import { TimeVR } from './TimeVR'
import { SpherexTable } from './SpherexTable'
import { AttractOverlay, KioskDirector } from './kiosk'
import { IS_HEADSET } from './xrStore'

/** Rendered instead of a scene that crashed: turns it into the clear "Couldn't load" card. */
function SceneFailed({ what }: { what: string }) {
  useEffect(() => reportProblem('failed', what), [what])
  return null
}
import { useSiteContent } from './content'
import { BODY_BY_ID } from './bodies'
import { useQuality } from './quality'

/** Dev builds: window.__scene for inspection. */
function DebugHandle() {
  const scene = useThree((s) => s.scene)
  const get = useThree((s) => s.get)
  useEffect(() => {
    if (import.meta.env.DEV) Object.assign(window, { __scene: scene, __r3f: get })
  }, [scene])
  return null
}

/** Brightness setting → renderer tone-mapping exposure. */
function ExposureSync() {
  const gl = useThree((s) => s.gl)
  const exposure = useXRApp((s) => s.settings.exposure)
  useEffect(() => {
    gl.toneMappingExposure = exposure
  }, [gl, exposure])
  return null
}

/** Keeps the app's view mode in sync with the WebXR session / gyro toggle. */
function ModeSync() {
  const xrMode = useXR((s) => s.mode)
  const gyro = useXRApp((s) => s.gyroEnabled)
  useEffect(() => {
    const s = useXRApp.getState()
    s.setMode(xrMode === 'immersive-vr' ? 'vr' : xrMode === 'immersive-ar' ? 'ar' : gyro ? 'gyro' : 'desktop')
    if (xrMode !== 'immersive-ar') s.setArAnchor(null)
  }, [xrMode, gyro])
  return null
}

type SceneKind = 'hub' | 'body' | 'surface'

/** VR/AR origin for the Solar System and orbit views: seated/height offset and "Re-centre view". */
function PlayerOrigin({ seated, kind }: { seated: boolean; kind: SceneKind }) {
  const ref = useRef<Group>(null)
  const recenter = useXRApp((s) => s.recenter)
  const height = useXRApp((s) => s.settings.heightOffset)
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)
  useEffect(() => {
    if (recenter && ref.current) recenterOrigin(ref.current, viewCamera(gl, camera), 0, [0, 0])
  }, [recenter]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <XROrigin ref={ref} position={[0, (seated ? 0.5 : 0) + height, 0]}>
      <WristMenu />
      <ControllerHints scene={kind} />
    </XROrigin>
  )
}

/** Camera for non-immersive modes: OrbitControls on desktop, fixed origin for gyro look-around. Surface mode drives its own camera. */
function CameraRig({ kind }: { kind: SceneKind }) {
  const mode = useXRApp((s) => s.mode)
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as unknown as { enabled: boolean } | null
  const hub = kind === 'hub'
  const table = useXRApp((s) => s.bodyId === 'spherex')
  // phone held upright: the on-screen SPHEREx panel covers the bottom, so back off and aim lower
  const narrow = useThree((s) => s.size.width < 640 && s.size.width < s.size.height)
  const sceneKey = useXRApp((s) => `${s.bodyId}:${s.siteId}`)
  const anim = useRef<{ t: number; dur: number; from: Vector3; to: Vector3; look: Vector3; ease: (x: number) => number } | null>(null)
  const pose = useRef({ to: new Vector3(), look: new Vector3() })

  useEffect(() => {
    if (kind === 'surface') return
    if (mode === 'desktop') {
      // the SPHEREx plate lies on a table: look down at it from above, like standing over it
      const to = table ? (narrow ? new Vector3(0, 5.4, 4.6) : new Vector3(0, 3.6, 3.5)) : new Vector3(0, hub ? 2.8 : 0.4, hub ? 6.4 : 3.4)
      const look = new Vector3(0, table ? -0.3 : 0, table && narrow ? 1.3 : 0)
      pose.current = { to, look }
      if (prefersReducedMotion()) {
        camera.position.copy(to)
        camera.lookAt(look)
        return
      }
      // arrive: glide in from further out instead of cutting in
      const from = to.clone().multiplyScalar(1.9).add(new Vector3(0, 0.8, 0))
      camera.position.copy(from)
      camera.lookAt(look)
      anim.current = { t: 0, dur: 1.1, from, to, look, ease: easeOutCubic }
    } else if (mode === 'gyro') {
      camera.position.set(0, 0, 0)
    }
  }, [mode, hub, kind, camera, table, narrow, sceneKey])

  useFrame(({ clock }, dt) => {
    if (mode !== 'desktop' || kind === 'surface') return
    const req = cameraMotion.request
    if (req) {
      cameraMotion.request = null
      const { to, look } = pose.current
      anim.current = { t: 0, dur: req === 'intro' && !prefersReducedMotion() ? 2.6 : 0.7, from: camera.position.clone(), to: to.clone(), look: look.clone(), ease: easeInOutCubic }
    }
    if (useIntro.getState().open && hub) {
      // behind the title card: a slow drift far out in the chart's sky
      const a = clock.elapsedTime * 0.05
      camera.position.set(Math.sin(a) * 26, 12, Math.cos(a) * 26)
      camera.lookAt(0, 0, 0)
      if (controls) controls.enabled = false
      return
    }
    const m = anim.current
    if (!m) return
    m.t = Math.min(1, m.t + Math.min(dt, 0.05) / m.dur)
    camera.position.lerpVectors(m.from, m.to, m.ease(m.t))
    camera.lookAt(m.look)
    if (controls) controls.enabled = m.t >= 1
    if (m.t >= 1) anim.current = null
  })
  return mode === 'desktop' && kind !== 'surface' ? <OrbitControls makeDefault enablePan={false} enableDamping minDistance={1.6} maxDistance={14} autoRotate={hub} autoRotateSpeed={0.25} target={[0, table ? -0.3 : 0, table && narrow ? 1.3 : 0]} /> : null
}

/** Where the scene sits for each mode. Hub/body content is authored with body radius = 1 (hub radius ≈ 3.2);
 *  surface content is in real metres, so it is only moved for the AR tabletop diorama. */
function Stage({ kind, children }: { kind: SceneKind; children: ReactNode }) {
  const mode = useXRApp((s) => s.mode)
  const anchor = useXRApp((s) => s.arAnchor)
  const rover = useXRApp((s) => s.arModel === 'rover')
  const hub = kind === 'hub'
  let position: [number, number, number] = [0, 0, 0]
  let scale = 1
  let visible = true
  if (kind === 'surface') {
    if (mode === 'ar') {
      visible = anchor !== null
      if (anchor) position = [anchor[0], anchor[1] + 0.01, anchor[2]]
    }
  } else if (mode === 'gyro') position = [0, 0, hub ? -6.5 : -3.6]
  else if (mode === 'vr') {
    position = [0, 1.3, hub ? -1.3 : -1.05]
    scale = hub ? 0.3 : 0.36
  } else if (mode === 'ar' && rover) {
    // life-size: real metres, standing on the floor where you placed it
    visible = anchor !== null
    if (anchor) position = [anchor[0], anchor[1], anchor[2]]
  } else if (mode === 'ar') {
    // a headset sees the table from further away than a phone, so the model is bigger there
    scale = IS_HEADSET ? (hub ? 0.12 : 0.2) : hub ? 0.06 : 0.11
    visible = anchor !== null
    if (anchor) position = [anchor[0], anchor[1] + (hub ? 0.06 : scale + 0.04), anchor[2]]
  }
  return (
    <group position={position} scale={scale} visible={visible}>
      {children}
    </group>
  )
}

/**
 * Entry point of the AR/VR module. Picks the best experience per device:
 * Enter VR / Enter AR (WebXR) → phone gyro look-around → desktop OrbitControls.
 * Scenes: Solar System hub → body explorer → standing on the surface.
 */
export function XRRoot() {
  const bodyId = useXRApp((s) => s.bodyId)
  const siteId = useXRApp((s) => s.siteId)
  const mode = useXRApp((s) => s.mode)
  const showFps = useXRApp((s) => s.settings.showFps)
  const q = useQuality()
  const kind: SceneKind = siteId ? 'surface' : bodyId ? 'body' : 'hub'
  const site = useSiteContent(siteId)
  const seated = useXRApp((s) => s.settings.seated)
  const sceneLabel = siteId ? (site?.name ?? 'the surface') : bodyId ? (BODY_BY_ID[bodyId]?.name ?? bodyId) : 'the Solar System'
  const space = kind !== 'surface' && mode !== 'ar'
  const retry = useLoading((s) => s.retry)
  const introOpen = useIntro((s) => s.open)
  const arModel = useXRApp((s) => s.arModel)

  return (
    <div className="xr-root">
      <Canvas
        camera={{ fov: 60, near: 0.01, far: 300, position: [0, 0.4, 3.4] }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
        shadows
        onPointerMissed={() => useXRApp.getState().selectHotspot(null)}
      >
        <XR store={xrStore}>
          <ModeSync />
          <DebugHandle />
          {(PERF || showFps) && <PerfProbe />}
          <ExposureSync />
          <QualityGovernor />
          <HandStyler />
          <MissionTracker />
          <SceneLoadTracker label={sceneLabel} sceneKey={`${kind}:${bodyId ?? ''}:${siteId ?? ''}`} />
          <LoadingPanelVR />
          <ProblemPanelVR />
          <TourDirector />
          <TourPanelVR />
          {mode === 'vr' && kind === 'hub' && (
            <>
              <group position={[0, 1.02, -0.85]} rotation={[-0.35, 0, 0]}>
                <TourStartVR />
              </group>
              <group position={[0.62, 1.0, -0.9]} rotation={[-0.35, -0.45, 0]}>
                <TimeVR />
              </group>
            </>
          )}
          <ComfortVignette />
          <Prefetcher />
          <SoundDirector kind={kind} />
          <ScreenEffects q={q} tier={q.tier} />
          <TransitionVeil sceneKey={`${kind}:${bodyId ?? ''}:${siteId ?? ''}`} />
          {/* the surface VR walker has its own moving origin (with the wrist menu inside it) */}
          {(mode === 'vr' || mode === 'ar') && !(kind === 'surface' && mode === 'vr') && (
            <PlayerOrigin seated={seated} kind={kind} />
          )}
          {/* every space view (Solar System, planets, Moon, Bennu, SPHEREx table) shares the chart's own sky */}
          {space && (
            <>
              <color attach="background" args={['#070b1f']} />
              <HoloBackdrop q={q} />
            </>
          )}
          {(kind !== 'surface' || mode === 'ar') && (
            <>
              <ambientLight intensity={0.35} />
              {/* soft teal/violet fill so night sides read against the chart sky instead of going pure black */}
              {kind === 'body' && <hemisphereLight args={['#4fe3d6', '#3a2a7a', 0.45]} />}
              <directionalLight position={[5, 2, 4]} intensity={2.4} />
            </>
          )}
          <CameraRig kind={kind} />
          {mode === 'gyro' && <GyroControls />}
          {mode === 'ar' && <ARPlacement />}
          <Stage kind={kind}>
            <ErrorBoundary key={`${kind}:${bodyId}:${siteId}:${retry}`} fallback={<SceneFailed what={sceneLabel} />}>
            {mode === 'ar' && arModel === 'rover' ? (
              <Suspense fallback={null}>
                <RoomRover />
              </Suspense>
            ) : kind === 'surface' ? (
              <SurfaceScene key={siteId} siteId={siteId!} mode={mode} />
            ) : bodyId === 'spherex' ? (
              <SpherexTable mode={mode} />
            ) : bodyId ? (
              <BodyExplorer key={bodyId} id={bodyId} vr={mode === 'vr'} />
            ) : (
              <SolarSystemHub tilt={mode === 'vr' || mode === 'gyro' ? 0.35 : 0} />
            )}
            </ErrorBoundary>
          </Stage>
          <GazeDwell enabled={mode !== 'desktop'} distance={mode === 'gyro' ? 1.5 : 0.8} />
          {mode === 'ar' && (
            <XRDomOverlay className="dom-overlay">
              <Hud inAR />
            </XRDomOverlay>
          )}
        </XR>
      </Canvas>
      {/* re-keyed per scene so the HUD's entrance animation plays each time you arrive somewhere */}
      {mode !== 'ar' && !introOpen && <Hud key={`${kind}:${bodyId ?? ''}:${siteId ?? ''}`} />}
      <KioskDirector />
      <AttractOverlay />
      <IntroScreen />
      {(PERF || showFps) && <PerfHud />}
    </div>
  )
}
