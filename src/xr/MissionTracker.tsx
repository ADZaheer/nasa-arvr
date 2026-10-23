import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import { useStore } from 'zustand'
import { MeshBasicMaterial, Vector3, type Group } from 'three'
import { useXRApp } from './store'
import { xrStore } from './xrStore'
import { viewCamera } from './viewCamera'
import { FONT, FONT_BOLD } from './font'
import { GlassPanel, Icon, UI } from './ui3d'
import { MISSIONS, missionContext, missionsFor, type Mission } from './missions'
import { playChime } from './feedback'
import { player } from './surface/player'

const noFog = new MeshBasicMaterial({ fog: false, toneMapped: false, transparent: true })

/** Active missions right now: the training until it's finished, then the current scene's missions. */
export function activeMissions(done: Record<string, true>, bodyId: string | null, siteId: string | null): Mission[] {
  const training = MISSIONS[0]
  const trainingDone = training.goals.every((g) => done[g.id])
  return [...(trainingDone ? [] : [training]), ...missionsFor(bodyId, siteId)]
}

function progressOf(m: Mission, done: Record<string, true>) {
  return `${m.goals.filter((g) => done[g.id]).length}/${m.goals.length}`
}

/**
 * Evaluates mission goals ~4×/s, celebrates completions (chime, buzz, card), and shows the scene's
 * mission card when a scene opens. Inside <Canvas> so it can read the camera.
 */
export function MissionTracker() {
  const bodyId = useXRApp((s) => s.bodyId)
  const siteId = useXRApp((s) => s.siteId)
  const st = useRef({ last: 0, looked: 0, prevYaw: NaN, hideAt: 0 })
  const dir = useMemo(() => new Vector3(), [])

  // scene intro card
  useEffect(() => {
    const s = useXRApp.getState()
    st.current.looked = 0
    st.current.prevYaw = NaN
    const list = activeMissions(s.goalsDone, bodyId, siteId)
    const m = list[0]
    const next = m?.goals.find((g) => !s.goalsDone[g.id])
    if (m && next) {
      s.setMissionCard({ mission: m.title, goal: next.title, hint: next.hint, done: false, progress: progressOf(m, s.goalsDone) })
      st.current.hideAt = performance.now() + 9000
    }
  }, [bodyId, siteId])

  useFrame(({ camera, gl }) => {
    const s = st.current
    const now = performance.now()
    if (s.hideAt && now > s.hideAt) {
      s.hideAt = 0
      useXRApp.getState().setMissionCard(null)
    }
    if (now - s.last < 250) return
    s.last = now
    viewCamera(gl, camera).getWorldDirection(dir)
    const yaw = Math.atan2(dir.x, -dir.z)
    if (!Number.isNaN(s.prevYaw)) {
      let d = Math.abs(yaw - s.prevYaw)
      if (d > Math.PI) d = 2 * Math.PI - d
      s.looked += (d * 180) / Math.PI
    }
    s.prevYaw = yaw
    const heading = useXRApp.getState().siteId ? player.heading : ((yaw * 180) / Math.PI + 360) % 360
    const ctx = missionContext(s.looked, heading)
    const app = useXRApp.getState()
    for (const m of activeMissions(app.goalsDone, app.bodyId, app.siteId)) {
      for (const g of m.goals) {
        if (app.goalsDone[g.id] || !g.check(ctx)) continue
        app.completeGoal(g.id)
        playChime()
        const after = useXRApp.getState().goalsDone
        const next = m.goals.find((x) => !after[x.id])
        app.setMissionCard({
          mission: m.title,
          goal: g.title,
          hint: next ? `Next: ${next.title}` : `${m.title} complete!`,
          done: true,
          progress: progressOf(m, after),
        })
        s.hideAt = now + 5000
        return // one celebration at a time
      }
    }
  })

  const session = useStore(xrStore, (x) => x.session)
  return session ? <MissionCard3D /> : null
}

/** In-headset mission card: floats up and to the left of your view, follows gently, fades in and out. */
function MissionCard3D() {
  const card = useXRApp((s) => s.missionCard)
  const g = useRef<Group>(null)
  const [shown, setShown] = useState(card)
  const fade = useRef(0)
  const v = useMemo(() => ({ head: new Vector3(), fwd: new Vector3(), right: new Vector3(), up: new Vector3(0, 1, 0), target: new Vector3() }), [])
  useEffect(() => {
    if (card) setShown(card)
  }, [card])
  useFrame(({ camera, gl }, dt) => {
    const o = g.current
    if (!o) return
    fade.current = Math.min(1, Math.max(0, fade.current + (card ? dt : -dt) * 3))
    o.visible = fade.current > 0.01
    o.scale.setScalar(0.85 + 0.15 * fade.current)
    noFog.opacity = fade.current
    const cam = viewCamera(gl, camera)
    cam.getWorldPosition(v.head)
    cam.getWorldDirection(v.fwd)
    v.fwd.y = 0
    v.fwd.normalize()
    v.right.crossVectors(v.fwd, v.up)
    v.target.copy(v.head).addScaledVector(v.fwd, 1.4).addScaledVector(v.up, 0.32).addScaledVector(v.right, -0.25)
    o.position.lerp(v.target, 1 - Math.exp(-dt * 3))
    o.lookAt(v.head)
  })
  if (!shown) return null
  return (
    <group ref={g} renderOrder={3000}>
      <GlassPanel width={0.62} height={0.2} radius={0.035} rim={0.003} overlay tint={shown.done ? '#0f3d2c' : UI.glass} />
      <Icon name={shown.done ? 'check' : 'missions'} size={0.03} color={shown.done ? UI.good : UI.accent} position={[-0.27, 0.068, 0.001]} overlay />
      <Text font={FONT} material={noFog} position={[-0.245, 0.068, 0]} fontSize={0.022} color={shown.done ? '#5ee39a' : '#8fd9d3'} anchorX="left" anchorY="middle" renderOrder={3002}>
        {`${shown.done ? 'MISSION GOAL COMPLETE ✓' : 'MISSION'} · ${shown.mission} · ${shown.progress}`}
      </Text>
      <Text font={FONT_BOLD} material={noFog} position={[-0.285, 0.02, 0]} fontSize={0.036} maxWidth={0.56} color="#ffffff" anchorX="left" anchorY="middle" renderOrder={3002}>
        {shown.goal}
      </Text>
      <Text font={FONT} material={noFog} position={[-0.285, -0.045, 0]} fontSize={0.02} maxWidth={0.56} color="#c3d6d4" anchorX="left" anchorY="middle" renderOrder={3002}>
        {shown.hint}
      </Text>
    </group>
  )
}
