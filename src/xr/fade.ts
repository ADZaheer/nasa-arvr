import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Material, Mesh, Object3D } from 'three'

type Fading = { m: Material; opacity: number }

/**
 * Smooth fade-in for things that arrive late (textures, NASA models): instead of popping in, they
 * fade up over ~0.7 s. Materials are made transparent once, before their first render, and stay that way
 * (with depth writes on, so they still sort like solid objects) so the fade never triggers a shader
 * recompile, which would hitch a headset.
 */
export function makeFadeable(root: Object3D, cloneMaterials = true): Fading[] {
  const list: Fading[] = []
  const seen = new Map<Material, Material>()
  root.traverse((o) => {
    const mesh = o as Mesh
    if (!mesh.isMesh) return
    const swap = (m: Material) => {
      let c = seen.get(m)
      if (!c) {
        c = cloneMaterials ? m.clone() : m
        list.push({ m: c, opacity: m.opacity })
        c.transparent = true
        c.depthWrite = true
        c.opacity = 0
        seen.set(m, c)
      }
      return c
    }
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material)
  })
  return list
}

export function useFadeIn(list: Fading[], seconds = 0.7) {
  const t = useRef(0)
  useMemo(() => (t.current = 0), [list])
  useFrame((_, dt) => {
    if (t.current >= 1) return
    t.current = Math.min(1, t.current + Math.min(dt, 0.05) / seconds)
    const e = t.current * t.current * (3 - 2 * t.current)
    for (const f of list) f.m.opacity = f.opacity * e
  })
}

/** Fade a single material (owned by the caller) from 0 to its opacity. */
export function useMaterialFadeIn(m: Material | null, seconds = 0.7) {
  const list = useMemo(() => {
    if (!m) return []
    const opacity = m.opacity
    m.transparent = true
    m.depthWrite = true
    m.opacity = 0
    return [{ m, opacity }]
  }, [m])
  useFadeIn(list, seconds)
}
