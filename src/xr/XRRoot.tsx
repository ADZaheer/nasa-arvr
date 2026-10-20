import { useEffect, type ReactNode } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, Stars } from '@react-three/drei'
import { XR, XRDomOverlay, useXR } from '@react-three/xr'
import { xrStore } from './xrStore'
import { useXRApp } from './store'
import { SolarSystemHub } from './SolarSystemHub'
import { BodyExplorer } from './BodyExplorer'
import { GazeDwell } from './GazeDwell'
import { GyroControls } from './GyroControls'
import { ARPlacement } from './ARPlacement'
import { Hud } from './Hud'

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

/** Camera for non-immersive modes: OrbitControls on desktop, fixed origin for gyro look-around. */
function CameraRig({ hub }: { hub: boolean }) {
  const mode = useXRApp((s) => s.mode)
  const camera = useThree((s) => s.camera)
  useEffect(() => {
    if (mode === 'desktop') {
      camera.position.set(0, hub ? 2.8 : 0.4, hub ? 6.4 : 3.4)
      camera.lookAt(0, 0, 0)
    } else if (mode === 'gyro') {
      camera.position.set(0, 0, 0)
    }
  }, [mode, hub, camera])
  return mode === 'desktop' ? <OrbitControls makeDefault enablePan={false} enableDamping minDistance={1.6} maxDistance={14} /> : null
}

/** Where the scene sits for each mode. Content is authored with body radius = 1 (hub radius ≈ 3.2). */
function Stage({ hub, children }: { hub: boolean; children: ReactNode }) {
  const mode = useXRApp((s) => s.mode)
  const anchor = useXRApp((s) => s.arAnchor)
  let position: [number, number, number] = [0, 0, 0]
  let scale = 1
  let visible = true
  if (mode === 'gyro') position = [0, 0, hub ? -6.5 : -3.6]
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
 */
export function XRRoot() {
  const bodyId = useXRApp((s) => s.bodyId)
  const mode = useXRApp((s) => s.mode)
  const hub = !bodyId

  return (
    <div className="xr-root">
      <Canvas
        camera={{ fov: 55, near: 0.01, far: 300, position: [0, 0.4, 3.4] }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
        onPointerMissed={() => useXRApp.getState().selectHotspot(null)}
      >
        <XR store={xrStore}>
          <ModeSync />
          {mode !== 'ar' && (
            <>
              <color attach="background" args={['#05060f']} />
              <Stars radius={80} depth={40} count={4000} factor={4} saturation={0} fade />
            </>
          )}
          <ambientLight intensity={0.35} />
          <directionalLight position={[5, 2, 4]} intensity={2.4} />
          <CameraRig hub={hub} />
          {mode === 'gyro' && <GyroControls />}
          {mode === 'ar' && <ARPlacement />}
          <Stage hub={hub}>{bodyId ? <BodyExplorer key={bodyId} id={bodyId} vr={mode === 'vr'} /> : <SolarSystemHub tilt={mode === 'vr' || mode === 'gyro' ? 0.35 : 0} />}</Stage>
          <GazeDwell enabled={mode !== 'desktop'} distance={mode === 'gyro' ? 1.5 : 0.8} />
          {mode === 'ar' && (
            <XRDomOverlay className="dom-overlay">
              <Hud inAR />
            </XRDomOverlay>
          )}
        </XR>
      </Canvas>
      {mode !== 'ar' && <Hud />}
    </div>
  )
}
