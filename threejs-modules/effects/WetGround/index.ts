/**
 * VỊ TRÍ   — threejs-modules/effects/WetGround/index.ts
 * VAI TRÒ  — Nền ƯỚT khi mưa: 1 mặt phẳng overlay TỐI + bóng (roughness thấp → phản chiếu environment/sky =
 *            ánh ướt), opacity theo mức ướt (wetness 0→1) + mảng VŨNG đọng (noise → chỗ phản chiếu gương mạnh).
 *            OVERLAY độc lập — KHÔNG sửa material nào (an toàn building-kit). 1 mesh, 1 draw, 0 CPU/frame.
 * LIÊN HỆ  — effects/ tự chứa (không import ../). Caller (archplan) tạo khi mưa/bão, ramp wetness, dispose khi
 *            tạnh. Phản chiếu = scene.environment (PMREM) qua PBR — KHÔNG phản chiếu geometry thật (cần SSR/
 *            planar). Đủ "ướt" cho archviz. Giới hạn: chỉ NỀN phẳng; tường/mái sẫm-ướt = per-material (sau).
 *
 * CÁCH DÙNG: const w = new WetGround({ size: 80 }); scene.add(w.getMesh()); w.setWetness(0..1)
 * DISPOSE: dispose() giải phóng geometry + material + gỡ mesh khỏi parent.
 */

import * as THREE from 'three'
import type Node from 'three/src/nodes/core/Node.js'
import type { ShaderNodeObject } from 'three/tsl'
import { float, mix, mx_noise_float, positionWorld, smoothstep, uniform, vec3 } from 'three/tsl'
import { MeshStandardNodeMaterial } from 'three/webgpu'

type TSLNode = ShaderNodeObject<Node>

export interface WetGroundOptions {
  /** Cạnh mặt phủ (m) — nên ≥ lô. Default: 80 */
  size?: number
  /** Cao độ nền world (m) — mặt ướt đặt cao hơn 1.5cm né z-fight. Default: 0 */
  groundY?: number
  /** Màu lớp ướt (tối = nền sẫm khi ướt). Default: 0x0a0c12 */
  color?: THREE.ColorRepresentation
  /** Độ nhám lớp ướt [0..1] — thấp = gương/bóng hơn (ướt hơn). Default: 0.08 */
  roughness?: number
  /** Opacity tối đa khi ướt đẫm [0..1]. Default: 0.55 */
  maxOpacity?: number
  /** Tần số mảng vũng (1/m) — thấp = vũng to. Default: 0.05 */
  puddleScale?: number
}

export class WetGround {
  private mesh: THREE.Mesh | null = null
  private geometry: THREE.PlaneGeometry | null = null
  private material: MeshStandardNodeMaterial | null = null
  private isDisposed = false

  private readonly uWet = uniform(0) // 0 = khô .. 1 = ướt đẫm
  private readonly uMaxOpacity = uniform(0.55)
  private readonly uColor = uniform(new THREE.Color(0x0a0c12))

  constructor(opts: WetGroundOptions = {}) {
    const size = opts.size ?? 80
    const freq = opts.puddleScale ?? 0.05
    this.uMaxOpacity.value = opts.maxOpacity ?? 0.55
    if (opts.color !== undefined) this.uColor.value.set(opts.color)

    this.geometry = new THREE.PlaneGeometry(size, size)
    this.material = this._buildMaterial(freq, opts.roughness ?? 0.08)
    const mesh = new THREE.Mesh(this.geometry, this.material)
    mesh.rotation.x = -Math.PI / 2 // nằm ngang (mặt +Y)
    mesh.position.y = (opts.groundY ?? 0) + 0.015 // 1.5cm trên nền → né z-fight
    mesh.renderOrder = 1 // sau ground opaque
    this.mesh = mesh
  }

  // opacity = maxOpacity × wet × (đầm nền + vũng đọng). Roughness thấp + PBR env → ánh phản chiếu = ướt.
  private _buildMaterial(freq: number, roughness: number): MeshStandardNodeMaterial {
    // noise world-XZ ∈ ~[0,1] — vũng neo theo world (mặt tĩnh nên không trượt).
    const p = positionWorld.xz.mul(float(freq)) as TSLNode
    const noise01 = mx_noise_float(vec3(p.x, p.y, float(0)))
      .mul(float(0.5))
      .add(float(0.5)) as TSLNode
    // vũng = chỗ noise cao → phản chiếu mạnh (opacity ~1); nền chung = ẩm nhẹ (0.45).
    const puddle = smoothstep(float(0.55), float(0.78), noise01) as TSLNode
    const cover = mix(float(0.45), float(1), puddle) as TSLNode

    const mat = new MeshStandardNodeMaterial() // perf-ok: gọi 1 lần trong constructor (không per-frame/rebuild)
    mat.colorNode = this.uColor
    mat.roughness = roughness // thấp → phản chiếu sắc = bóng ướt (Fresnel PBR tự mạnh ở góc xiên)
    mat.metalness = 0 // nước = dielectric
    mat.opacityNode = this.uWet.mul(this.uMaxOpacity).mul(cover)
    mat.transparent = true
    mat.depthWrite = false
    return mat
  }

  /** Mức ướt [0..1] — 0 khô, 1 ướt đẫm (vũng phản chiếu). LIVE (uniform). */
  setWetness(v: number): void {
    if (!this.isDisposed) this.uWet.value = Math.max(0, Math.min(1, v))
  }

  /** Màu lớp ướt. LIVE. */
  setColor(c: THREE.ColorRepresentation): void {
    if (!this.isDisposed) this.uColor.value.set(c)
  }

  getMesh(): THREE.Mesh {
    if (!this.mesh) throw new Error('WetGround: đã dispose')
    return this.mesh
  }

  dispose(): void {
    if (this.isDisposed) return
    this.geometry?.dispose()
    this.material?.dispose()
    this.mesh?.parent?.remove(this.mesh)
    this.geometry = null
    this.material = null
    this.mesh = null
    this.isDisposed = true
  }
}
