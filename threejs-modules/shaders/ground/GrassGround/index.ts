/**
 * VỊ TRÍ   — threejs-modules/shaders/ground/GrassGround/index.ts
 * VAI TRÒ  — Procedural lawn/cỏ ground — world-space XZ, no UV. Tier A material (material-roadmap).
 * LIÊN HỆ  — Nhóm ground/ (cùng AsphaltGround); dùng bởi site-kit (nền cỏ lô) + Doraemon ground.
 *
 * Thuật toán (ground ngang → sample positionWorld.xz):
 *   1. Patch lush↔dry: fbm tần số thấp → mảng cỏ tươi (xanh) ↔ cỏ khô (vàng)
 *   2. Clump shadow: noise tần trung → vệt tối giữa các bụi cỏ (chiều sâu)
 *   3. Blade speckle: noise cao tần → lốm đốm sáng-tối mô phỏng lá cỏ
 *   4. Normal từ blade+clump (screen-space bump + LOD chống lấp lánh); roughness matte cao
 *
 * CÁCH DÙNG: const g = new GrassGround({ scale: 1 }); mesh.material = g.getMaterial()
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
  bladeScale: 55,
  clumpScale: 1.4,
  patchScale: 0.18,
  dryness: 0.45,
  bumpScale: 0.5,
}

export interface GrassGroundOptions {
  /** World-space scale (lớn = feature nhỏ hơn). Default: 1.0 */
  scale?: number
  /** Màu cỏ tươi nền. Default: 0x4e7a32 */
  baseColor?: THREE.ColorRepresentation
  /** Màu cỏ khô (mảng vàng). Default: 0x97a04e */
  dryColor?: THREE.ColorRepresentation
  /** Màu tối giữa bụi cỏ (chiều sâu). Default: 0x2c4d22 */
  darkColor?: THREE.ColorRepresentation
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
}

export class GrassGround {
  private material: MeshStandardNodeMaterial | null = null
  private normalNode: TSLNode | null = null
  private roughnessNode: TSLNode | null = null
  private isDisposed = false

  private readonly uScale: ReturnType<typeof uniform>
  private readonly uBase: ReturnType<typeof uniform>
  private readonly uDry: ReturnType<typeof uniform>
  private readonly uDark: ReturnType<typeof uniform>
  private readonly uBladeScale: ReturnType<typeof uniform>
  private readonly uClumpScale: ReturnType<typeof uniform>
  private readonly uPatchScale: ReturnType<typeof uniform>
  private readonly uDryness: ReturnType<typeof uniform>
  private readonly uBumpScale: ReturnType<typeof uniform>

  constructor(opts: GrassGroundOptions = {}) {
    const o = { ...DEFAULTS, ...opts }
    this.uScale = uniform(o.scale)
    this.uBase = uniform(new THREE.Color(o.baseColor))
    this.uDry = uniform(new THREE.Color(o.dryColor))
    this.uDark = uniform(new THREE.Color(o.darkColor))
    this.uBladeScale = uniform(o.bladeScale)
    this.uClumpScale = uniform(o.clumpScale)
    this.uPatchScale = uniform(o.patchScale)
    this.uDryness = uniform(o.dryness)
    this.uBumpScale = uniform(o.bumpScale)

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
    return positionWorld.x.mul(this.uScale) as TSLNode
  }
  private _pz(): TSLNode {
    return positionWorld.z.mul(this.uScale) as TSLNode
  }

  private _blade(): TSLNode {
    return triNoise3D(
      vec3(this._px().mul(this.uBladeScale), this._pz().mul(this.uBladeScale), float(0)),
      float(0),
      float(0)
    ) as TSLNode
  }

  private _clump(): TSLNode {
    return triNoise3D(
      vec3(this._px().mul(this.uClumpScale), this._pz().mul(this.uClumpScale), float(0)),
      float(0),
      float(0)
    ) as TSLNode
  }

  // Height = lá cỏ cao tần (LOD-fade ở xa chống shimmer) + bụi cỏ tần trung.
  private _heightNode(): TSLNode {
    const fw = positionWorld.fwidth()
    const cyc = fw.x.max(fw.z).mul(this.uBladeScale.mul(float(2.0)))
    const lod = float(1).sub(smoothstep(float(0.4), float(1.0), cyc))
    const blade = this._blade().sub(float(0.5)).mul(lod)
    const clump = this._clump().sub(float(0.5)).mul(float(0.4))
    return blade.add(clump) as TSLNode
  }

  private _buildNormalNode(): TSLNode {
    return this._perturbNormal(this._heightNode())
  }

  // Matte cao (~0.92), hơi biến thiên theo lá cỏ.
  private _buildRoughnessNode(): TSLNode {
    const grain = this._blade().sub(float(0.5)).mul(float(0.12))
    return float(0.92).add(grain).clamp(float(0.8), float(1.0)) as TSLNode
  }

  private _buildColorNode(): TSLNode {
    const px = this._px()
    const pz = this._pz()
    // Mảng cỏ tươi ↔ khô (fbm tần thấp)
    const patch = mx_fractal_noise_float(
      vec3(px.mul(this.uPatchScale), pz.mul(this.uPatchScale), float(0)),
      int(4),
      float(2.0),
      float(0.5)
    )
      .mul(float(0.5))
      .add(float(0.5))
    let col = mix(
      this.uBase,
      this.uDry,
      smoothstep(float(0.5), float(0.85), patch).mul(this.uDryness)
    ) as TSLNode
    // Vệt tối giữa bụi cỏ → chiều sâu
    col = mix(
      col,
      this.uDark,
      smoothstep(float(0.5), float(0.95), this._clump()).mul(float(0.5))
    ) as TSLNode
    // Lá cỏ lốm đốm sáng-tối
    return col.mul(float(0.82).add(this._blade().mul(float(0.36)))) as TSLNode
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
