import { useEffect, useState } from 'react'
import { Text } from '@react-three/drei'
import { useXRApp } from './store'
import { useBodyContent, useSiteContent } from './content'
import { askGuide, backToSource } from './events'
import { KIND_COLORS } from './bodies'
import { FONT, FONT_BOLD } from './font'
import { Button3D } from './Button3D'
import type { Hotspot, HotspotKind } from './types'

export const KIND_LABEL: Record<HotspotKind, string> = {
  fact: 'Fact',
  illustration: 'Illustration',
  candidate: 'Candidate (unconfirmed)',
}

function useSelectedHotspot(): Hotspot | null {
  const bodyId = useXRApp((s) => s.bodyId)
  const siteId = useXRApp((s) => s.siteId)
  const hotspotId = useXRApp((s) => s.hotspotId)
  const body = useBodyContent(siteId ? null : bodyId)
  const site = useSiteContent(siteId)
  return (siteId ? site : body)?.hotspots.find((h) => h.id === hotspotId) ?? null
}

/** Extra action: from orbit, stand on the surface here; on the surface, walk to the beacon. */
function placeAction(h: Hotspot): { label: string; run: () => void } | null {
  const s = useXRApp.getState()
  if (h.anchor.type === 'site') {
    const { x, z } = h.anchor
    return { label: 'Walk there', run: () => s.requestGoTo({ x, z }) }
  }
  if (h.site && !s.siteId) {
    const site = h.site
    return { label: 'Stand here', run: () => s.selectSite(site, h.body) }
  }
  return null
}

const ask = (h: Hotspot) => askGuide({ body: h.body, hotspotId: h.id, guidePrompt: h.guidePrompt })

/** DOM card for desktop, phone gyro and handheld AR (inside the WebXR DOM overlay). */
export function InfoCardPanel() {
  const h = useSelectedHotspot()
  const [expanded, setExpanded] = useState(false)
  useEffect(() => setExpanded(false), [h?.id])
  if (!h) return null
  const action = placeAction(h)
  return (
    <aside className="info-card" role="dialog" aria-label={h.title}>
      <div className="info-card__top">
        <span className="kind-tag" style={{ borderColor: KIND_COLORS[h.kind], color: KIND_COLORS[h.kind] }}>
          {KIND_LABEL[h.kind]}
        </span>
        <button className="icon-btn" aria-label="Close" onClick={() => useXRApp.getState().selectHotspot(null)}>
          ×
        </button>
      </div>
      <h2>{h.title}</h2>
      <p className="info-card__short">{h.short}</p>
      <button className="link-btn" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
        {expanded ? 'Less ▴' : 'More detail ▾'}
      </button>
      {expanded && <p className="info-card__detail">{h.detail}</p>}
      <p className="info-card__source">
        Source:{' '}
        <a href={h.source.url} target="_blank" rel="noopener noreferrer">
          {h.source.label}
        </a>
      </p>
      <div className="info-card__actions">
        <button className="btn btn--primary" onClick={() => ask(h)}>
          Ask the guide
        </button>
        <button className="btn" onClick={() => backToSource(h.body, h.id)}>
          Back to source image
        </button>
        {action && (
          <button className="btn btn--accent" onClick={action.run}>
            {action.label}
          </button>
        )}
      </div>
    </aside>
  )
}

/** In-world card for VR (DOM is not visible inside a headset). Units are stage-local (body radius = 1). */
export function InfoCard3D({
  position = [1.55, 0.25, 0.25],
  rotation = [0, -0.45, 0],
}: {
  position?: [number, number, number]
  rotation?: [number, number, number]
}) {
  const h = useSelectedHotspot()
  const [expanded, setExpanded] = useState(false)
  useEffect(() => setExpanded(false), [h?.id])
  if (!h) return null
  const action = placeAction(h)

  const W = 1.3
  const pad = 0.08
  const left = -W / 2 + pad
  const H = expanded ? 1.9 : 1.25
  let y = H / 2 - pad
  const at = (dy: number) => {
    const cur = y
    y -= dy
    return cur
  }
  const yKind = at(0.1)
  const yTitle = at(0.24)
  const yShort = at(0.36)
  const yMore = at(0.12)
  const yDetail = expanded ? at(0.66) : 0
  const ySource = at(0.14)
  const yButtons = at(0.12) - 0.05
  const yAction = yButtons - 0.15

  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0, action ? -0.08 : 0, -0.005]}>
        <planeGeometry args={[W, H + (action ? 0.16 : 0)]} />
        <meshBasicMaterial color="#0b1020" transparent opacity={0.92} />
      </mesh>
      <Text font={FONT_BOLD} position={[left, yKind, 0]} fontSize={0.045} color={KIND_COLORS[h.kind]} anchorX="left" anchorY="top">
        {KIND_LABEL[h.kind].toUpperCase()}
      </Text>
      <Button3D label="×" position={[W / 2 - 0.08, yKind - 0.03, 0]} width={0.09} height={0.09} onClick={() => useXRApp.getState().selectHotspot(null)} />
      <Text font={FONT_BOLD} position={[left, yTitle, 0]} fontSize={0.08} maxWidth={W - 2 * pad} color="#ffffff" anchorX="left" anchorY="top" lineHeight={1.15}>
        {h.title}
      </Text>
      <Text font={FONT} position={[left, yShort, 0]} fontSize={0.052} maxWidth={W - 2 * pad} color="#d7def0" anchorX="left" anchorY="top" lineHeight={1.3}>
        {h.short}
      </Text>
      <Button3D
        label={expanded ? 'Less' : 'More detail'}
        position={[left + 0.2, yMore - 0.05, 0]}
        width={0.4}
        height={0.09}
        color="#121a33"
        onClick={() => setExpanded((v) => !v)}
      />
      {expanded && (
        <Text font={FONT} position={[left, yDetail, 0]} fontSize={0.041} maxWidth={W - 2 * pad} color="#c3cbe0" anchorX="left" anchorY="top" lineHeight={1.3}>
          {h.detail}
        </Text>
      )}
      <Text font={FONT} position={[left, ySource, 0]} fontSize={0.036} maxWidth={W - 2 * pad} color="#8fb4ff" anchorX="left" anchorY="top">
        {`Source: ${h.source.label}\n${h.source.url}`}
      </Text>
      <Button3D label="Ask the guide" position={[-W / 4 + 0.02, yButtons, 0]} width={0.56} height={0.11} color="#2f6fed" onClick={() => ask(h)} />
      <Button3D label="Back to source image" position={[W / 4 - 0.02, yButtons, 0]} width={0.56} height={0.11} onClick={() => backToSource(h.body, h.id)} />
      {action && <Button3D label={action.label} position={[0, yAction, 0]} width={W - 0.16} height={0.11} color="#b5562b" onClick={action.run} />}
    </group>
  )
}
