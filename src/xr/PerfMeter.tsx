import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import { useStore } from 'zustand'
import { MeshBasicMaterial, Vector3, type Group } from 'three'
import { xrStore } from './xrStore'
import { viewCamera } from './viewCamera'
import { FONT } from './font'

/** Add ?perf to the URL to show frame stats (in the headset too). */
export const PERF = typeof location !== 'undefined' && new URLSearchParams(location.search).has('perf')

/** Latest stats, refreshed twice a second. cpu = time from the start of the frame's updates to the end of rendering. */
export const perfStats = { fps: 0, cpuMs: 0, maxCpuMs: 0, calls: 0, triangles: 0, hz: 0 }

const noFog = new MeshBasicMaterial({ fog: false, toneMapped: false, depthTest: false })

/** Inside <Canvas>: measures, and in VR shows a small panel near the top-left of your view. */
export function PerfProbe() {
  const gl = useThree((s) => s.gl)
  const t = useRef({ start: 0, frames: 0, cpuSum: 0, cpuMax: 0, windowStart: performance.now() })
  const hz = useStore(xrStore, (s) => s.frameRate)
  const session = useStore(xrStore, (s) => s.session)

  // time the renderer: end of gl.render marks the end of the frame's CPU work
  useEffect(() => {
    const original = gl.render.bind(gl)
    gl.render = (scene, camera) => {
      original(scene, camera)
      const s = t.current
      const cpu = performance.now() - s.start
      s.cpuSum += cpu
      s.cpuMax = Math.max(s.cpuMax, cpu)
      s.frames++
    }
    return () => {
      gl.render = original
    }
  }, [gl])

  // runs before every other frame callback
  useFrame(() => {
    const s = t.current
    const now = performance.now()
    s.start = now
    if (now - s.windowStart >= 500 && s.frames > 0) {
      perfStats.fps = Math.round((s.frames * 1000) / (now - s.windowStart))
      perfStats.cpuMs = +(s.cpuSum / s.frames).toFixed(1)
      perfStats.maxCpuMs = +s.cpuMax.toFixed(1)
      perfStats.calls = gl.info.render.calls
      perfStats.triangles = Number.isFinite(gl.info.render.triangles) ? gl.info.render.triangles : 0
      perfStats.hz = hz ?? 0
      s.frames = 0
      s.cpuSum = 0
      s.cpuMax = 0
      s.windowStart = now
    }
  }, -1000)

  return session ? <PerfPanelVR /> : null
}

function statsLine() {
  const p = perfStats
  return `${p.fps} fps${p.hz ? ` / ${p.hz} Hz` : ''} · CPU ${p.cpuMs} ms (max ${p.maxCpuMs}) · ${p.calls} draws · ${Math.round(p.triangles / 1000)}k tris`
}

function PerfPanelVR() {
  const g = useRef<Group>(null)
  const [line, setLine] = useState('…')
  const tmp = useMemo(() => ({ head: new Vector3(), fwd: new Vector3(), up: new Vector3(), left: new Vector3() }), [])
  const last = useRef(0)
  useFrame(({ camera, gl, clock }) => {
    const o = g.current
    if (!o) return
    const cam = viewCamera(gl, camera)
    cam.getWorldPosition(tmp.head)
    cam.getWorldDirection(tmp.fwd)
    tmp.up.set(0, 1, 0).applyQuaternion(cam.getWorldQuaternion(o.quaternion))
    tmp.left.crossVectors(tmp.up, tmp.fwd).normalize()
    o.position.copy(tmp.head).addScaledVector(tmp.fwd, 1).addScaledVector(tmp.up, 0.32).addScaledVector(tmp.left, 0.25)
    if (clock.elapsedTime - last.current > 0.5) {
      last.current = clock.elapsedTime
      setLine(statsLine())
    }
  })
  return (
    <group ref={g} renderOrder={2000}>
      <Text font={FONT} material={noFog} fontSize={0.022} color="#7CFF9B" outlineWidth={0.002} outlineColor="#000" anchorX="center" anchorY="middle" renderOrder={2000}>
        {line}
      </Text>
    </group>
  )
}

/** Outside the canvas (desktop / phone): small text box. */
export function PerfHud() {
  const [line, setLine] = useState('…')
  useEffect(() => {
    const id = setInterval(() => setLine(statsLine()), 500)
    return () => clearInterval(id)
  }, [])
  return <div className="perf">{line}</div>
}
