import { useEffect, useRef, type ReactNode } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
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
import { StarSky } from './space'
import { HandStyler, ScreenEffects, SoundDirector, TransitionVeil } from './polish'
import { MissionTracker } from './MissionTracker'
import { ComfortVignette, LoadingPanelVR, Prefetcher, ProblemPanelVR, SceneLoadTracker, recenterOrigin } from './smooth'
import { viewCamera } from './viewCamera'
import type { Group } from 'three'
import { ErrorBoundary } from './ErrorBoundary'
import { reportProblem, useLoading } from './loading'
import { TourDirector, TourPanelVR, TourStartVR } from './TourUI'

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
  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as { __scene: unknown }).__scene = scene
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
function PlayerOrigin({ seated }: { seated: boolean }) {
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
    </XROrigin>
  )
}

/** Camera for non-immersive modes: OrbitControls on desktop, fixed origin for gyro look-around. Surface mode drives its own camera. */
function CameraRig({ kind }: { kind: SceneKind }) {
  const mode = useXRApp((s) => s.mode)
  const camera = useThree((s) => s.camera)
  const hub = kind === 'hub'
  useEffect(() => {
    if (kind === 'surface') return
    if (mode === 'desktop') {
      camera.position.set(0, hub ? 2.8 : 0.4, hub ? 6.4 : 3.4)
      camera.lookAt(0, 0, 0)
    } else if (mode === 'gyro') {
      camera.position.set(0, 0, 0)
    }
  }, [mode, hub, kind, camera])
  return mode === 'desktop' && kind !== 'surface' ? <OrbitControls makeDefault enablePan={false} enableDamping minDistance={1.6} maxDistance={14} /> : null
}

/** Where the scene sits for each mode. Hub/body content is authored with body radius = 1 (hub radius ≈ 3.2);
 *  surface content is in real metres, so it is only moved for the AR tabletop diorama. */
function Stage({ kind, children }: { kind: SceneKind; children: ReactNode }) {
  const mode = useXRApp((s) => s.mode)
  const anchor = useXRApp((s) => s.arAnchor)
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
    position = [0, 1.3, hub ? -1.3 : -1.25]
    scale = hub ? 0.3 : 0.36
  } else if (mode === 'ar') {
    scale = hub ? 0.06 : 0.11
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
            <group position={[0, 1.02, -0.85]} rotation={[-0.35, 0, 0]}>
              <TourStartVR />
            </group>
          )}
          <ComfortVignette />
          <Prefetcher />
          <SoundDirector kind={kind} />
          <ScreenEffects q={q} tier={q.tier} />
          <TransitionVeil sceneKey={`${kind}:${bodyId ?? ''}:${siteId ?? ''}`} />
          {/* the surface VR walker has its own moving origin (with the wrist menu inside it) */}
          {(mode === 'vr' || mode === 'ar') && !(kind === 'surface' && mode === 'vr') && (
            <PlayerOrigin seated={seated} />
          )}
          {space && (
            <>
              <color attach="background" args={['#05060f']} />
              <StarSky size={q.stars} />
            </>
          )}
          {(kind !== 'surface' || mode === 'ar') && (
            <>
              <ambientLight intensity={0.35} />
              <directionalLight position={[5, 2, 4]} intensity={2.4} />
            </>
          )}
          <CameraRig kind={kind} />
          {mode === 'gyro' && <GyroControls />}
          {mode === 'ar' && <ARPlacement />}
          <Stage kind={kind}>
            <ErrorBoundary key={`${kind}:${bodyId}:${siteId}:${retry}`} fallback={<SceneFailed what={sceneLabel} />}>
            {kind === 'surface' ? (
              <SurfaceScene key={siteId} siteId={siteId!} mode={mode} />
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
      {mode !== 'ar' && <Hud />}
      {(PERF || showFps) && <PerfHud />}
    </div>
  )
}
