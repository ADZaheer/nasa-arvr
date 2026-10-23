import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import { XRSpace as XRSpaceGroup, useXRInputSourceState } from '@react-three/xr'
import { MeshBasicMaterial, Quaternion, Vector3, type Group } from 'three'
import { useXRApp } from './store'
import { viewCamera } from './viewCamera'
import { BODY_BY_ID } from './bodies'
import { useSiteContent } from './content'
import { FONT, FONT_BOLD } from './font'
import { AUDIO_CONTROLS, COMFORT_CONTROLS, DESTINATIONS, DISPLAY_CONTROLS, INFO_SOURCE, MENU_TABS, infoLines, type ControlSpec, type MenuTab } from './menuModel'
import { Appear, Button, Choice3D, GlassPanel, Icon, Label, Slider3D, TEAL, Tile, Toggle3D, UI, roundedRect, uiMat, type IconName } from './ui3d'

const TAB_ICON: Record<MenuTab, IconName> = { travel: 'travel', missions: 'missions', display: 'visuals', comfort: 'comfort', audio: 'audio', info: 'info' }
import { ALL_GOALS } from './missions'
import { activeMissions } from './MissionTracker'

const noFog = new MeshBasicMaterial({ fog: false, toneMapped: false })

/**
 * Wrist menu (VR and Quest passthrough AR), inspired by hand-tracked arm panels:
 * - Hand tracking: turn your LEFT palm toward your face → the panel appears above your wrist. Poke it with
 *   your right index finger or pinch-aim with the hand ray.
 * - Controllers: press Y (left controller) to open/close, or tilt the left controller's top toward your face.
 *   Click with the right controller's laser.
 * "Keep open" pins it to the wrist until you close it.
 * Must be rendered inside <XROrigin> so the wrist/controller space follows the player.
 */
export function WristMenu() {
  const hand = useXRInputSourceState('hand', 'left')
  const controller = useXRInputSourceState('controller', 'left')
  const space = hand?.inputSource.hand?.get('wrist') ?? controller?.inputSource.gripSpace
  if (!space) return null
  return <WristAnchor key={hand ? 'hand' : 'controller'} space={space} isHand={!!hand} controller={hand ? undefined : controller} />
}

type ControllerState = NonNullable<ReturnType<typeof useXRInputSourceState<'controller'>>>

function WristAnchor({ space, isHand, controller }: { space: XRSpace; isHand: boolean; controller?: ControllerState }) {
  const anchor = useRef<Group>(null)
  const panel = useRef<Group>(null)
  const [shown, setShown] = useState(false)
  const st = useRef({ hold: 0, yWas: false, shown: false })
  const v = useMemo(() => ({ head: new Vector3(), fwd: new Vector3(), wrist: new Vector3(), n: new Vector3(), to: new Vector3(), q: new Quaternion(), target: new Vector3() }), [])

  useFrame(({ camera, gl }, dt) => {
    const a = anchor.current
    if (!a) return
    const s = st.current
    const cam = viewCamera(gl, camera)
    cam.getWorldPosition(v.head)
    cam.getWorldDirection(v.fwd)
    a.getWorldPosition(v.wrist)
    a.getWorldQuaternion(v.q)
    // hand: palm normal is the wrist joint's -Y; controller: the grip's +Y is the top of the controller
    v.n.set(0, isHand ? -1 : 1, 0).applyQuaternion(v.q)
    v.to.copy(v.head).sub(v.wrist)
    const dist = v.to.length()
    v.to.normalize()
    const inView = -v.to.dot(v.fwd) > 0.55 && dist < 0.8
    const facing = v.n.dot(v.to) > (isHand ? 0.45 : 0.8)
    s.hold = inView && facing ? s.hold + dt : 0

    const app = useXRApp.getState()
    if (controller) {
      const y = controller.gamepad?.['y-button']?.state === 'pressed'
      if (y && !s.yWas) app.setMenuOpen(!app.menuOpen)
      s.yWas = y
    }
    const want = app.menuOpen || s.hold > (isHand ? 0.25 : 0.4)
    if (want !== s.shown) {
      s.shown = want
      setShown(want)
    }

    const p = panel.current
    if (p && p.parent && want) {
      // float just above the wrist / controller, always turned toward your eyes
      v.target.copy(v.wrist).addScaledVector(isHand ? v.n : v.to, 0.05).add(v.n.set(0, isHand ? 0.1 : 0.13, 0))
      p.position.copy(p.parent.worldToLocal(v.target))
      p.lookAt(v.head)
    }
  })

  return (
    <>
      <XRSpaceGroup space={space}>
        <group ref={anchor} />
      </XRSpaceGroup>
      <group ref={panel}>
        <Appear open={shown} from={0.6}>
          <MenuPanel3D />
        </Appear>
      </group>
    </>
  )
}

function MenuPanel3D() {
  const [tab, setTab] = useState<MenuTab>('travel')
  const W = 2.6, H = 3.75
  const tabW = (W - 0.2) / MENU_TABS.length
  return (
    <group scale={0.07}>
      <GlassPanel width={W} height={H} radius={0.18} rim={0.014} />
      <Icon name="pin" size={0.16} color={TEAL} position={[-W / 2 + 0.2, H / 2 - 0.2, 0.004]} />
      <Text font={FONT_BOLD} material={noFog} position={[-W / 2 + 0.36, H / 2 - 0.2, 0.005]} fontSize={UI.type.title} color={UI.text} anchorX="left" anchorY="middle">
        Expedition
      </Text>
      <PinButton position={[W / 2 - 0.5, H / 2 - 0.2, 0.005]} />
      <mesh geometry={roundedRect(W - 0.16, 0.5, 0.16)} material={uiMat('#13232b')} position={[0, H / 2 - 0.66, -0.004]} />
      {MENU_TABS.map((t, i) => (
        <Button key={t.id} label={t.label} icon={TAB_ICON[t.id]} stack active={tab === t.id} onPress={() => setTab(t.id)} position={[-W / 2 + 0.1 + tabW * (i + 0.5), H / 2 - 0.66, 0]} width={tabW - 0.04} height={0.44} />
      ))}
      <group position={[0, H / 2 - 1.12, 0]}>
        {tab === 'travel' && <TravelPage />}
        {tab === 'missions' && <MissionsPage />}
        {tab === 'display' && <ControlsPage controls={DISPLAY_CONTROLS} />}
        {tab === 'comfort' && <ControlsPage controls={COMFORT_CONTROLS} />}
        {tab === 'audio' && <ControlsPage controls={AUDIO_CONTROLS} />}
        {tab === 'info' && <InfoPage />}
      </group>
    </group>
  )
}

function PinButton({ position }: { position: [number, number, number] }) {
  const open = useXRApp((s) => s.menuOpen)
  return <Button label={open ? 'Close' : 'Keep open'} icon={open ? 'close' : 'pin'} active={open} onPress={() => useXRApp.getState().setMenuOpen(!open)} position={position} width={0.85} height={0.24} />
}

/** Current missions with checkmarks; overall progress; restart the training. */
function MissionsPage() {
  const done = useXRApp((s) => s.goalsDone)
  const bodyId = useXRApp((s) => s.bodyId)
  const siteId = useXRApp((s) => s.siteId)
  const list = activeMissions(done, bodyId, siteId)
  const total = ALL_GOALS.length
  const count = ALL_GOALS.filter((g) => done[g.id]).length
  let y = 0
  const rows: React.ReactNode[] = []
  for (const m of list) {
    rows.push(<Label key={m.id} text={m.title.toUpperCase()} position={[-1.15, y, 0.005]} size={0.085} color="#8fd9d3" bold />)
    y -= 0.2
    for (const g of m.goals) {
      rows.push(<Label key={g.id} text={`${done[g.id] ? '✓' : '○'}  ${g.title}`} position={[-1.1, y, 0.005]} size={0.095} color={done[g.id] ? '#5ee39a' : '#dff7f5'} />)
      y -= 0.17
    }
    y -= 0.06
  }
  if (!list.length) rows.push(<Label key="none" text="No missions here: explore freely!" position={[-1.15, 0, 0.005]} />)
  return (
    <>
      {rows}
      <Label text={`All missions: ${count}/${total}`} position={[-1.15, -1.95, 0.005]} size={0.09} color="#8fd9d3" />
      <Tile label="Restart training" onPress={() => useXRApp.getState().resetMissions()} position={[0.62, -1.95, 0]} width={0.95} height={0.22} />
    </>
  )
}

function TravelPage() {
  const bodyId = useXRApp((s) => s.bodyId)
  const siteId = useXRApp((s) => s.siteId)
  return (
    <>
      {DESTINATIONS.map((d, i) => (
        <Tile key={d.id} label={d.label} active={d.active({ bodyId, siteId })} onPress={d.go} position={[i % 2 ? 0.58 : -0.58, -Math.floor(i / 2) * 0.33, 0]} width={1.12} height={0.28} />
      ))}
    </>
  )
}

function ControlsPage({ controls }: { controls: ControlSpec[] }) {
  const settings = useXRApp((s) => s.settings)
  const onSurface = useXRApp((s) => !!s.siteId)
  const set = useXRApp.getState().setSetting
  let y = 0
  return (
    <>
      {controls.map((c) => {
        const pos: [number, number, number] = [0, y, 0]
        y -= c.kind === 'toggle' ? 0.32 : 0.46
        if (c.kind === 'slider')
          return (
            <Slider3D
              key={c.key}
              label={c.label}
              value={settings[c.key] as number}
              min={c.min}
              max={c.max}
              format={c.format}
              disabled={c.surfaceOnly && !onSurface}
              onChange={(val) => set(c.key, val as never)}
              position={pos}
            />
          )
        if (c.kind === 'toggle') return <Toggle3D key={c.key} label={c.label} value={settings[c.key] as boolean} onChange={(val) => set(c.key, val as never)} position={pos} />
        return <Choice3D key={c.key} label={c.label} value={settings[c.key] as string} options={c.options} onChange={(val) => set(c.key, val as never)} position={pos} />
      })}
    </>
  )
}

function useWhere(): string {
  const bodyId = useXRApp((s) => s.bodyId)
  const siteId = useXRApp((s) => s.siteId)
  const site = useSiteContent(siteId)
  if (siteId) return site ? `${site.name}, Mars` : 'Mars surface'
  return bodyId ? (BODY_BY_ID[bodyId]?.name ?? bodyId) : 'Solar System'
}

function InfoPage() {
  const where = useWhere()
  const onSurface = useXRApp((s) => !!s.siteId)
  const [, tick] = useState(0)
  const last = useRef(0)
  useFrame(({ clock }) => {
    if (clock.elapsedTime - last.current > 1) {
      last.current = clock.elapsedTime
      tick((n) => n + 1)
    }
  })
  const lines = infoLines(where, onSurface)
  return (
    <>
      {lines.map((l, i) => (
        <group key={l.label} position={[0, -i * 0.34, 0]}>
          <Label text={l.label} position={[-1.05, 0.06, 0.005]} size={0.09} color="#8fd9d3" />
          <Label text={l.value} position={[-1.05, -0.08, 0.005]} size={0.11} />
        </group>
      ))}
      <Label text={`Time source: ${INFO_SOURCE.label}`} position={[-1.05, -lines.length * 0.34 - 0.05, 0.005]} size={0.07} color="#6f8c8b" />
    </>
  )
}
