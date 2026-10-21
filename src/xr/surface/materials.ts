import { useEffect, useMemo, useState } from 'react'
import { MeshStandardMaterial, RepeatWrapping, SRGBColorSpace, TextureLoader, Vector2, type Texture } from 'three'
import type { TierParams } from '../quality'
import { getGroundTexture } from './terrain'

/**
 * PBR materials for the Mars surface. Source photos are CC0 scans from Poly Haven (rock_ground_02 gravel,
 * red_sand dust, rock_boulder_dry rock), converted to greyscale detail by scripts/build-assets.mjs and
 * tinted here with the Mars vertex colours — so the colour stays Mars, the texture adds real-world grit.
 */
type Size = NonNullable<TierParams['textures']>
const loader = new TextureLoader()
const cache = new Map<string, Promise<Texture>>()

function load(url: string, srgb: boolean): Promise<Texture> {
  const key = `${url}|${srgb}`
  let p = cache.get(key)
  if (!p) {
    p = loader.loadAsync(url).then((t) => {
      t.wrapS = t.wrapT = RepeatWrapping
      t.anisotropy = 8
      if (srgb) t.colorSpace = SRGBColorSpace
      return t
    })
    cache.set(key, p)
  }
  return p
}

interface SetTextures {
  albedo: Texture
  normal: Texture
  rough: Texture
}
/** albedoAsColor: true for use as a material colour map (sRGB); false = raw 0..1 detail for the ground shader */
const loadSet = (name: string, size: Size, albedoAsColor = false): Promise<SetTextures> =>
  Promise.all([
    load(`/textures/ground/${name}_albedo_${size}.jpg`, albedoAsColor),
    load(`/textures/ground/${name}_normal_${size}.jpg`, false),
    load(`/textures/ground/${name}_rough_${size}.jpg`, false),
  ]).then(([albedo, normal, rough]) => ({ albedo, normal, rough }))

function useSets(size: Size | null, albedoAsColor = false) {
  const [sets, setSets] = useState<{ size: Size; gravel: SetTextures; dust: SetTextures; rock: SetTextures } | null>(null)
  useEffect(() => {
    if (!size) return
    let alive = true
    Promise.all([loadSet('gravel', size, albedoAsColor), loadSet('dust', size, albedoAsColor), loadSet('rock', size, albedoAsColor)])
      .then(([gravel, dust, rock]) => alive && setSets({ size, gravel, dust, rock }))
      .catch((e) => console.warn('[surface] textures unavailable, using procedural ground', e))
    return () => {
      alive = false
    }
  }, [size, albedoAsColor])
  return size && sets?.size === size ? sets : null
}

/** Ground material: vertex colours × blended gravel / dust / rock detail, gravel normal + roughness maps. */
export function useGroundMaterial(size: Size | null): MeshStandardMaterial {
  const sets = useSets(size)
  const material = useMemo(() => {
    if (!sets) return new MeshStandardMaterial({ vertexColors: true, map: getGroundTexture(), roughness: 1, metalness: 0 })
    const m = new MeshStandardMaterial({
      vertexColors: true,
      roughness: 1,
      metalness: 0,
      normalMap: sets.gravel.normal,
      normalScale: new Vector2(1.1, 1.1),
      roughnessMap: sets.gravel.rough,
    })
    m.onBeforeCompile = (shader) => {
      shader.uniforms.tGravel = { value: sets.gravel.albedo }
      shader.uniforms.tDust = { value: sets.dust.albedo }
      shader.uniforms.tRock = { value: sets.rock.albedo }
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          attribute vec2 mask;
          varying vec2 vMask;
          varying vec2 vGUv;
          varying vec3 vWPos;
          varying vec3 vWNrm;`,
        )
        .replace(
          '#include <worldpos_vertex>',
          `#include <worldpos_vertex>
          vMask = mask;
          vGUv = uv;
          vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
          vWNrm = normalize(mat3(modelMatrix) * objectNormal);`,
        )
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform sampler2D tGravel;
          uniform sampler2D tDust;
          uniform sampler2D tRock;
          varying vec2 vMask;
          varying vec2 vGUv;
          varying vec3 vWPos;
          varying vec3 vWNrm;`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          // two scales of gravel break up visible tiling
          float gravel = mix(texture2D(tGravel, vGUv).r, texture2D(tGravel, vGUv * 0.173 + 0.31).r, 0.35);
          float dust = texture2D(tDust, vGUv * 0.6).r;
          // triplanar rock so steep crater walls don't stretch
          vec3 bw = abs(normalize(vWNrm)); bw /= (bw.x + bw.y + bw.z);
          float rock = texture2D(tRock, vWPos.zy * 0.25).r * bw.x + texture2D(tRock, vWPos.xz * 0.25).r * bw.y + texture2D(tRock, vWPos.xy * 0.25).r * bw.z;
          float detail = mix(mix(gravel, dust, vMask.x), rock, vMask.y);
          // fade detail to its average far away (avoids shimmering)
          float far = smoothstep(60.0, 420.0, length(vWPos - cameraPosition));
          detail = mix(detail, 0.5, far);
          diffuseColor.rgb *= 0.42 + 1.16 * detail;`,
        )
    }
    m.customProgramCacheKey = () => 'mars-ground-v1'
    return m
  }, [sets])
  useEffect(() => () => material.dispose(), [material])
  return material
}

/** Rock material: scanned boulder detail (greyscale) tinted basalt-red, with its normal and roughness maps. */
export function useRockMaterial(size: Size | null): MeshStandardMaterial {
  const sets = useSets(size, true)
  const material = useMemo(() => {
    if (!sets) return new MeshStandardMaterial({ color: '#5e3b2b', roughness: 1, flatShading: true })
    return new MeshStandardMaterial({
      color: '#8f6048',
      map: sets.rock.albedo,
      normalMap: sets.rock.normal,
      normalScale: new Vector2(1.4, 1.4),
      roughnessMap: sets.rock.rough,
      roughness: 1,
      metalness: 0,
    })
  }, [sets])
  useEffect(() => () => material.dispose(), [material])
  return material
}
