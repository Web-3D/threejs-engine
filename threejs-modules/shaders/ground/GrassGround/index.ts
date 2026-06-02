/**
 * VỊ TRÍ   — threejs-modules/shaders/ground/GrassGround/index.ts
 * VAI TRÒ  — Procedural lawn/cỏ ground — world-space XZ, no UV. Tier A material (material-roadmap).
 * LIÊN HỆ  — Nhóm ground/ (cùng AsphaltGround); dùng bởi site-kit (nền cỏ lô) + Doraemon ground.
 *
 * Thuật toán (ground ngang → sample positionWorld.xz):
 *   1. Patch 3-tông: fbm tần thấp → sage lạnh (patch thấp) ↔ xanh tươi (giữa) ↔ vàng khô (cao)
 *   2. Clump shadow: noise tần trung → vệt tối giữa bụi cỏ (chiều sâu / AO giả)
 *   3. Macro + GIÓ LÙA: vệt nắng/bóng lớn (tĩnh) + dải sáng-tối DI CHUYỂN theo uTime (setTime)
 *   4. Blade detail có HƯỚNG: trộn noise vô hướng + streak dọc thớ cỏ → speckle + bump directional
 *   5. Normal screen-space bump (LOD chống lấp lánh); roughness matte cao
 *
 * CÁCH DÙNG: const g = new GrassGround({ scale: 1 }); mesh.material = g.getMaterial()
 *   Gió: gọi g.setTime(elapsedSeconds) mỗi frame (tùy chọn — không gọi → cỏ tĩnh).
 * DISPOSE: dispose() giải phóng NodeMaterial
 */

import * as THREE from 'three'
import type Node from 'three/src/nodes/core/Node.js'
import type { ShaderNodeObject } from 'three/tsl'
import {
  faceDirection,
  float,
  int,
  mix,
  mx_fractal_noise_float,
  normalView,
  positionView,
  positionWorld,
  smoothstep,
  triNoise3D,
  uniform,
  vec2,
  vec3,
} from 'three/tsl'
import { MeshStandardNodeMaterial } from 'three/webgpu'

type TSLNode = ShaderNodeObject<Node>

const DEFAULTS = {
  scale: 1.0,
  baseColor: 0x4e7a32 as THREE.ColorRepresentation,
  dryColor: 0x97a04e as THREE.ColorRepresentation,
  darkColor: 0x2c4d22 as THREE.ColorRepresentation,
  coolColor: 0x52734f as THREE.ColorRepresentation,
  bladeScale: 55,
  clumpScale: 1.4,
  patchScale: 0.18,
  dryness: 0.45,
  bumpScale: 0.5,
  wind: 0.6,
}

export interface GrassGroundOptions {
  /** World-space scale (lớn = feature nhỏ hơn). Default: 1.0 */
  scale?: number
  /** Màu cỏ tươi nền. Default: 0x4e7a32 */
  baseColor?: THREE.ColorRepresentation
  /** Màu cỏ khô (mảng vàng, patch cao). Default: 0x97a04e */
  dryColor?: THREE.ColorRepresentation
  /** Màu tối giữa bụi cỏ (chiều sâu). Default: 0x2c4d22 */
  darkColor?: THREE.ColorRepresentation
  /** Màu sage lạnh (mảng patch thấp) → chiều sâu hue. Default: 0x52734f */
  coolColor?: THREE.ColorRepresentation
  /** Tần số lá cỏ (1/m). Cao = lá nhỏ/dày. Default: 55 */
  bladeScale?: number
  /** Tần số bụi cỏ (1/m). Default: 1.4 */
  clumpScale?: number
  /** Tần số mảng tươi/khô (1/m). Default: 0.18 */
  patchScale?: number
  /** Tỉ lệ cỏ khô [0–1]. Cao = nhiều mảng vàng. Default: 0.45 */
  dryness?: number
  /** Cường độ normal (lá cỏ). Default: 0.5 */
  bumpScale?: number
  /** Cường độ gió lùa [0–1] (cần setTime để chạy). Default: 0.6 */
  wind?: number
}

export class GrassGround {
  private material: MeshStandardNodeMaterial | null = null
  private normalNode: TSLNode | null = null
  private roughnessNode: TSLNode | null = null
  private isDisposed = false

  // Cache node tái dùng (compiler emit 1 lần) — đỡ tính lại noise ở color/normal/roughness
  private _pxN: TSLNode | null = null
  private _pzN: TSLNode | null = null
  private _bladeN: TSLNode | null = null
  private _streakN: TSLNode | null = null
  private _bladeDetailN: TSLNode | null = null
  private _clumpN: TSLNode | null = null

  private readonly uScale: ReturnType<typeof uniform>
  private readonly uBase: ReturnType<typeof uniform>
  private readonly uDry: ReturnType<typeof uniform>
  private readonly uDark: ReturnType<typeof uniform>
  private readonly uCool: ReturnType<typeof uniform>
  private readonly uBladeScale: ReturnType<typeof uniform>
  private readonly uClumpScale: ReturnType<typeof uniform>
  private readonly uPatchScale: ReturnType<typeof uniform>
  private readonly uDryness: ReturnType<typeof uniform>
  private readonly uBumpScale: ReturnType<typeof uniform>
  private readonly uWind: ReturnType<typeof uniform>
  private readonly uTime: ReturnType<typeof uniform>

  constructor(opts: GrassGroundOptions = {}) {
    const o = { ...DEFAULTS, ...opts }
    this.uScale = uniform(o.scale)
    this.uBase = uniform(new THREE.Color(o.baseColor))
    this.uDry = uniform(new THREE.Color(o.dryColor))
    this.uDark = uniform(new THREE.Color(o.darkColor))
    this.uCool = uniform(new THREE.Color(o.coolColor))
    this.uBladeScale = uniform(o.bladeScale)
    this.uClumpScale = uniform(o.clumpScale)
    this.uPatchScale = uniform(o.patchScale)
    this.uDryness = uniform(o.dryness)
    this.uBumpScale = uniform(o.bumpScale)
    this.uWind = uniform(o.wind)
    this.uTime = uniform(0)

    const mat = new MeshStandardNodeMaterial()
    mat.colorNode = this._buildColorNode()
    mat.normalNode = this.getNormalNode()
    mat.roughnessNode = this.getRoughnessNode()
    mat.metalness = 0
    this.material = mat
  }

  /** World-space scale. Min 0.001. */
  setScale(v: number): void {
    if (this.isDisposed) return
    this.uScale.value = Math.max(0.001, v)
  }

  /** Tỉ lệ cỏ khô [0–1]. */
  setDryness(v: number): void {
    if (this.isDisposed) return
    this.uDryness.value = Math.max(0, Math.min(1, v))
  }

  /** Cường độ normal lá cỏ [0–2]. */
  setBumpScale(v: number): void {
    if (this.isDisposed) return
    this.uBumpScale.value = Math.max(0, Math.min(2, v))
  }

  /** Cường độ gió lùa [0–1]. 0 = tĩnh. */
  setWind(v: number): void {
    if (this.isDisposed) return
    this.uWind.value = Math.max(0, Math.min(1, v))
  }

  /** Thời gian animation (giây elapsed). Gọi mỗi frame để gió chạy. */
  setTime(seconds: number): void {
    if (this.isDisposed) return
    this.uTime.value = seconds
  }

  getMaterial(): MeshStandardNodeMaterial {
    if (!this.material) throw new Error('GrassGround: already disposed')
    return this.material
  }

  getNormalNode(): MeshStandardNodeMaterial['normalNode'] {
    if (this.normalNode === null) this.normalNode = this._buildNormalNode()
    return this.normalNode as MeshStandardNodeMaterial['normalNode']
  }

  getRoughnessNode(): TSLNode {
    return this.roughnessNode ?? (this.roughnessNode = this._buildRoughnessNode())
  }

  dispose(): void {
    if (this.isDisposed) return
    this.material?.dispose()
    this.material = null
    this.normalNode = null
    this.roughnessNode = null
    this.isDisposed = true
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private _px(): TSLNode {
    return (this._pxN ??= positionWorld.x.mul(this.uScale) as TSLNode)
  }
  private _pz(): TSLNode {
    return (this._pzN ??= positionWorld.z.mul(this.uScale) as TSLNode)
  }

  // Lá cỏ vô hướng (noise cao tần đẳng hướng).
  private _blade(): TSLNode {
    return (this._bladeN ??= triNoise3D(
      vec3(this._px().mul(this.uBladeScale), this._pz().mul(this.uBladeScale), float(0)),
      float(0),
      float(0)
    ) as TSLNode)
  }

  // Streak có HƯỚNG: kéo dài theo X (X tần thấp, Z tần cao) → thớ cỏ/vệt cắt.
  private _streak(): TSLNode {
    const s = this.uBladeScale
    return (this._streakN ??= triNoise3D(
      vec3(this._px().mul(s.mul(float(0.35))), this._pz().mul(s.mul(float(1.8))), float(3)),
      float(0),
      float(0)
    ) as TSLNode)
  }

  // Detail lá = trộn vô hướng + streak → grain có hướng nhưng không quá cứng.
  private _bladeDetail(): TSLNode {
    return (this._bladeDetailN ??= mix(this._blade(), this._streak(), float(0.5)) as TSLNode)
  }

  private _clump(): TSLNode {
    return (this._clumpN ??= triNoise3D(
      vec3(this._px().mul(this.uClumpScale), this._pz().mul(this.uClumpScale), float(0)),
      float(0),
      float(0)
    ) as TSLNode)
  }

  // Hệ số sáng: nắng/bóng macro (tĩnh) + GIÓ LÙA (dải di chuyển theo uTime*uWind).
  private _macroLight(): TSLNode {
    const px = this._px()
    const pz = this._pz()
    const macro = triNoise3D(
      vec3(px.mul(float(0.05)), pz.mul(float(0.05)), float(7)),
      float(0),
      float(0)
    )
    const t = this.uTime.mul(this.uWind).mul(float(0.12))
    const gust = triNoise3D(
      vec3(
        px.mul(float(0.6)).add(t.mul(float(0.6))),
        pz.mul(float(0.6)).add(t.mul(float(0.8))),
        float(11)
      ),
      float(0),
      float(0)
    )
      .sub(float(0.5))
      .mul(this.uWind)
      .mul(float(0.2))
    return float(0.86)
      .add(macro.mul(float(0.28)))
      .add(gust) as TSLNode
  }

  // Height = detail lá (LOD-fade ở xa chống shimmer) + bụi cỏ tần trung.
  private _heightNode(): TSLNode {
    const fw = positionWorld.fwidth()
    const cyc = fw.x.max(fw.z).mul(this.uBladeScale.mul(float(2.0)))
    const lod = float(1).sub(smoothstep(float(0.4), float(1.0), cyc))
    const blade = this._bladeDetail().sub(float(0.5)).mul(lod)
    const clump = this._clump().sub(float(0.5)).mul(float(0.4))
    return blade.add(clump) as TSLNode
  }

  private _buildNormalNode(): TSLNode {
    return this._perturbNormal(this._heightNode())
  }

  // Matte cao (~0.92), hơi biến thiên theo lá cỏ.
  private _buildRoughnessNode(): TSLNode {
    const grain = this._bladeDetail().sub(float(0.5)).mul(float(0.12))
    return float(0.92).add(grain).clamp(float(0.8), float(1.0)) as TSLNode
  }

  private _buildColorNode(): TSLNode {
    // Patch fbm tần thấp → 3 tông: sage lạnh (thấp) ↔ tươi (giữa) ↔ khô vàng (cao)
    const patch = mx_fractal_noise_float(
      vec3(this._px().mul(this.uPatchScale), this._pz().mul(this.uPatchScale), float(0)),
      int(4),
      float(2.0),
      float(0.5)
    )
      .mul(float(0.5))
      .add(float(0.5))
    let col = mix(
      this.uBase,
      this.uCool,
      smoothstep(float(0.4), float(0.12), patch).mul(float(0.45))
    ) as TSLNode
    col = mix(
      col,
      this.uDry,
      smoothstep(float(0.55), float(0.85), patch).mul(this.uDryness)
    ) as TSLNode
    // Vệt tối giữa bụi cỏ → chiều sâu (AO giả)
    col = mix(
      col,
      this.uDark,
      smoothstep(float(0.5), float(0.95), this._clump()).mul(float(0.55))
    ) as TSLNode
    // Macro nắng/bóng + gió lùa (nhân)
    col = col.mul(this._macroLight()) as TSLNode
    // Lá cỏ lốm đốm sáng-tối có hướng
    return col.mul(float(0.8).add(this._bladeDetail().mul(float(0.4)))) as TSLNode
  }

  // Port three BumpMapNode.perturbNormalArb: normal view-space từ screen-space dH.
  private _perturbNormal(h: TSLNode): TSLNode {
    const dHdxy = vec2(h.dFdx(), h.dFdy()).mul(this.uBumpScale)
    const sigmaX = positionView.dFdx().normalize()
    const sigmaY = positionView.dFdy().normalize()
    const r1 = sigmaY.cross(normalView)
    const r2 = normalView.cross(sigmaX)
    const fDet = sigmaX.dot(r1).mul(faceDirection)
    const vGrad = fDet.sign().mul(dHdxy.x.mul(r1).add(dHdxy.y.mul(r2)))
    return fDet.abs().mul(normalView).sub(vGrad).normalize() as TSLNode
  }
}
