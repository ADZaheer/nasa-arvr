import { useMemo } from 'react'
import { Billboard, Text, useGLTF } from '@react-three/drei'
import { Box3, Vector3 } from 'three'
import { makeFadeable, useFadeIn } from './fade'
import { FONT, FONT_BOLD } from './font'
import { SceneReady } from './smooth'
import { t } from './i18n'
import { useXRApp } from './store'

/** Opportunity's real size (NASA): 2.3 m wide, 1.6 m long, 1.5 m tall at the mast. */
const SPAN_M = 2.3

/**
 * "View in my room": NASA's Opportunity rover at real size, standing on your floor where you placed it,
 * with a soft contact shadow so it sits on the ground, and a label with its story.
 */
export function RoomRover() {
  useXRApp((s) => s.settings.lang)
  const { scene } = useGLTF('/models/opportunity.glb')
  const rover = useMemo(() => {
    const c = scene.clone(true)
    const size = new Box3().setFromObject(c).getSize(new Vector3())
    c.scale.setScalar(SPAN_M / Math.max(size.x, size.z))
    const b = new Box3().setFromObject(c)
    c.position.set(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2)
    const height = b.max.y - b.min.y
    return { c, height, fading: makeFadeable(c) }
  }, [scene])
  useFadeIn(rover.fading, 1.2)
  return (
    <group rotation={[0, -0.6, 0]}>
      {/* soft room-like light so the rover reads well against your real surroundings */}
      <hemisphereLight args={["#ffffff", "#8a7a6a", 1.6]} />
      <directionalLight position={[2, 4, 3]} intensity={1.6} />
      <primitive object={rover.c} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]} scale={[1.25, 1, 1]} renderOrder={-1}>
        <circleGeometry args={[1.05, 40]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.32} depthWrite={false} />
      </mesh>
      <Billboard position={[0, rover.height + 0.25, 0]}>
        <Text font={FONT_BOLD} fontSize={0.09} color="#ffffff" outlineWidth={0.006} outlineColor="#000000" anchorY="bottom">
          {t('Opportunity rover · real size')}
        </Text>
        <Text font={FONT} position={[0, -0.02, 0]} fontSize={0.05} maxWidth={1.6} textAlign="center" color="#dfe9ee" outlineWidth={0.004} outlineColor="#000000" anchorY="top">
          {t('About 2.3 m wide and 1.5 m tall. Landed on Mars in 2004, planned for 90 days, drove more than 45 km in nearly 15 years.')}
        </Text>
      </Billboard>
      <SceneReady />
    </group>
  )
}
