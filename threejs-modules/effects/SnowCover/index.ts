/**
 * VỊ TRÍ   — threejs-modules/effects/SnowCover/index.ts
 * VAI TRÒ  — Tuyết ĐỌNG trên nền: 1 mặt phẳng phủ ngang TRÊN ground, trắng, opacity theo noise + mức tích
 *            lũy (accum 0→1) → tuyết "mọc" từ mảng loang ra phủ kín. OVERLAY độc lập — KHÔNG sửa material nào
 *            (an toàn với building-kit/Factory). 1 draw, 1 mesh, không CPU/frame (chỉ ghi uniform accum khi đổi).
 * LIÊN HỆ  — effects/ tự chứa (không import ../). Caller (archplan) tạo khi mode='snow', ramp accum dần trong
 *            onUpdate, dispose khi tắt. Đặt size = phủ lô, groundY = mặt nền. Giới hạn: phẳng — KHÔNG bám mái
 *            (cần geometry mái) và KHÔNG né mặt hồ (phủ phẳng cả lô). Mái/loại-trừ-hồ = Phase sau.
 *
 * CÁCH DÙNG: const s = new SnowCover({ size: 80 }); scene.add(s.getMesh()); s.setAccum(0..1)
 * DISPOSE: dispose() giải phóng geometry + material + gỡ mesh khỏi parent.
 */

import * as THREE from 'three'
import type Node from 'three/src/nodes/core/Node.js'
import type { ShaderNodeObject } from 'three/tsl'
import { float, mx_noise_float, positionWorld, smoothstep, uniform, vec3 } from 'three/tsl'
import { MeshStandardNodeMaterial } from 'three/webgpu'

type TSLNode = ShaderNodeObject<Node>

export interface SnowCoverOptions {
  /** Cạnh mặt phủ (m) — nên ≥ lô. Default: 80 */
  size?: number
  /** Cao độ nền world (m) — mặt tuyết đặt cao hơn 2cm né z-fight. Default: 0 */
  groundY?: number
  /** Màu tuyết. Default: 0xfdfdff (trắng hơi xanh) */
  color?: THREE.ColorRepresentation
  /** Tần số mảng loang (1/m world) — thấp = mảng to. Default: 0.06 */
  patchScale?: number
  /** Opacity tối đa khi phủ kín [0..1]. Default: 0.92 */
  maxOpacity?: number
}

export class SnowCover {
  private mesh: THREE.Mesh | null = null
  private geometry: THREE.PlaneGeometry | null = null
  private material: MeshStandardNodeMaterial | null = null
  private isDisposed = false

  private readonly uAccum = uniform(0) // 0 = chưa có tuyết .. 1 = phủ kín
  private readonly uMaxOpacity = uniform(0.92)
  private readonly uColor = uniform(new THREE.Color(0xfdfdff)) // .value = Color (có .set)

  constructor(opts: SnowCoverOptions = {}) {
    const size = opts.size ?? 80
    const freq = opts.patchScale ?? 0.06
    this.uMaxOpacity.value = opts.maxOpacity ?? 0.92
    if (opts.color !== undefined) this.uColor.value.set(opts.color)

    this.geometry = new THREE.PlaneGeometry(size, size)
    this.material = this._buildMaterial(freq)
    const mesh = new THREE.Mesh(this.geometry, this.material)
    mesh.rotation.x = -Math.PI / 2 // nằm ngang (mặt +Y)
    mesh.position.y = (opts.groundY ?? 0) + 0.02 // 2cm trên nền → né z-fight
    mesh.receiveShadow = true // bắt bóng nhà/cây (sun yếu lúc tuyết → nhẹ, vô hại nếu backend bỏ qua)
    mesh.renderOrder = 1 // sau ground opaque
    this.mesh = mesh
  }

  // opacity = maxOpacity × patch; patch "mọc" theo accum: ngưỡng noise hạ dần khi accum tăng → mảng lan ra kín.
  private _buildMaterial(freq: number): MeshStandardNodeMaterial {
    // noise world-XZ ∈ ~[0,1] — mảng loang neo theo world (mặt tĩnh nên không trượt).
    const p = positionWorld.xz.mul(float(freq)) as TSLNode
    const noise01 = mx_noise_float(vec3(p.x, p.y, float(0)))
      .mul(float(0.5))
      .add(float(0.5)) as TSLNode
    const edge = float(1).sub(this.uAccum) as TSLNode // accum 0 → ngưỡng 1 (không mảng nào đạt) .. accum 1 → 0 (mọi mảng)
    const patch = smoothstep(edge, edge.add(float(0.25)), noise01) as TSLNode

    const mat = new MeshStandardNodeMaterial() // perf-ok: gọi 1 lần trong constructor (không per-frame/rebuild)
    mat.colorNode = this.uColor
    mat.roughness = 0.9
    mat.metalness = 0
    mat.opacityNode = patch.mul(this.uMaxOpacity)
    mat.transparent = true
    mat.depthWrite = false
    return mat
  }

  /** Mức tích lũy tuyết [0..1] — 0 trống, 1 phủ kín. LIVE (uniform). */
  setAccum(v: number): void {
    if (!this.isDisposed) this.uAccum.value = Math.max(0, Math.min(1, v))
  }

  /** Màu tuyết. LIVE. */
  setColor(c: THREE.ColorRepresentation): void {
    if (!this.isDisposed) this.uColor.value.set(c)
  }

  getMesh(): THREE.Mesh {
    if (!this.mesh) throw new Error('SnowCover: đã dispose')
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
