/**
 * VỊ TRÍ   — threejs-modules/shaders/ground/PhotoGround/index.ts
 * VAI TRÒ  — Ground PBR từ TEXTURE ẢNH (scan/photogrammetry) — MeshStandardNodeMaterial map/normal/rough/ao,
 *            lát theo WORLD-XZ (độc lập geometry UV) → tiling đều mọi kích thước lô. Tier B (texture thật).
 * LIÊN HỆ  — Nhóm ground/ (cùng GrassGround procedural). Dùng bởi site-kit (ground key 'grass-tex') — shell
 *            (archplan) LOAD texture theo manifest assets/textures/<name> rồi BƠM vào (module KHÔNG hardcode URL).
 *
 * Thuật toán (ground LUÔN phẳng +Y → khỏi cần tangent geometry):
 *   • uv = positionWorld.xz / tileSizeMeters  (wrap=Repeat do caller set) → lát đều, anchor world-origin.
 *   • color = texture(baseColor) [sRGB→linear auto]; roughness = rough.r; ao = ao.r.
 *   • normal: GL tangent (n=tex*2−1) → world {T=+X, B=+Z, N=+Y}: vec3(n.x*s, n.z, n.y*s) → transformNormalToView.
 *     (NormalMapNode built-in dùng default uv() cho TBN → LỆCH với world-uv; nên dựng tay cho ground phẳng.)
 *
 * CÁCH DÙNG: const g = new PhotoGround({ maps: { baseColor, normal, roughness, ao }, tileSizeMeters: 2 })
 *            mesh.material = g.getMaterial()   // textures do CALLER load + set wrap/colorSpace/anisotropy
 * DISPOSE: dispose() giải phóng NodeMaterial. KHÔNG dispose texture (caller sở hữu — như TriplanarMapping).
 */

import type * as THREE from 'three'
import type Node from 'three/src/nodes/core/Node.js'
import type { ShaderNodeObject } from 'three/tsl'
import {
  float,
  mx_noise_float,
  positionWorld,
  texture,
  transformNormalToView,
  uniform,
  vec3,
} from 'three/tsl'
import { MeshStandardNodeMaterial } from 'three/webgpu'

type TSLNode = ShaderNodeObject<Node>

/** Bộ map PBR (THREE.Texture đã load + cấu hình bởi caller). baseColor=sRGB; còn lại=linear. */
export interface PhotoGroundMaps {
  /** Albedo / base color — colorSpace sRGB. Bắt buộc. */
  baseColor: THREE.Texture
  /** Normal map (tangent-space, hệ GL). colorSpace linear. */
  normal?: THREE.Texture
  /** Roughness (grayscale). colorSpace linear. */
  roughness?: THREE.Texture
  /** Ambient occlusion (grayscale). colorSpace linear. */
  ao?: THREE.Texture
}

export interface PhotoGroundOptions {
  maps: PhotoGroundMaps
  /** Kích thước lát vật lý (m) — texture lặp mỗi `tileSizeMeters` world. Default: 2 */
  tileSizeMeters?: number
  /** Cường độ normal. Âm = flip green (lồi/lõm ngược). Default: 1 */
  normalScale?: number
  /** Nhân roughness map (>1 = mờ hơn). Default: 1 */
  roughnessScale?: number
  /** Micro-relief PROCEDURAL [0..1] — perturbation normal noise tần-số-cao CỘNG lên normal map (phá vẻ "nhựa"
   *  gò nhẵn). Truyền (kể cả 0) = BẬT khả năng (noise ~0.1ms luôn tính); bỏ trống = tắt hẳn (0 cost). LIVE qua
   *  setDetail. Dùng cho `terrain.detail` (site-kit). Default: undefined (tắt) */
  detail?: number
  /** Tần số micro-relief (1/m world). Cao = sần mịn, thấp = gợn to. Đổi cần dựng lại material. Default: 4 */
  detailScale?: number
}

export class PhotoGround {
  private material: MeshStandardNodeMaterial | null = null
  private isDisposed = false

  private readonly uInvTile: ReturnType<typeof uniform>
  private readonly uNormalScale: ReturnType<typeof uniform>
  private readonly uRoughScale: ReturnType<typeof uniform>
  private readonly uDetail: ReturnType<typeof uniform> // cường độ micro-relief procedural — live
  private readonly _detailOn: boolean // có dựng nhánh detail-noise không (option `detail` truyền vào)
  private readonly _detailFreq: number // tần số micro-relief (1/m world)

  constructor(opts: PhotoGroundOptions) {
    const m = opts.maps
    this.uInvTile = uniform(1 / Math.max(0.01, opts.tileSizeMeters ?? 2))
    this.uNormalScale = uniform(opts.normalScale ?? 1)
    this.uRoughScale = uniform(opts.roughnessScale ?? 1)
    this.uDetail = uniform(opts.detail ?? 0)
    this._detailOn = opts.detail !== undefined
    this._detailFreq = opts.detailScale ?? 4

    // UV theo world-XZ ÷ tile → lát đều, độc lập geometry UV (Box LẪN ShapeGeometry đều đúng).
    const uvw = positionWorld.xz.mul(this.uInvTile) as TSLNode

    const mat = new MeshStandardNodeMaterial()
    mat.colorNode = texture(m.baseColor, uvw) // sRGB (caller set colorSpace) → auto-linear
    if (m.roughness)
      mat.roughnessNode = texture(m.roughness, uvw).r.mul(this.uRoughScale) as TSLNode
    if (m.ao) mat.aoNode = texture(m.ao, uvw).r as TSLNode
    // normal: map (nếu có) HOẶC +Y, rồi cộng micro-relief procedural (nếu bật detail). Bỏ qua nếu cả 2 đều không.
    if (m.normal || this._detailOn) mat.normalNode = this._normalNode(m.normal, uvw)
    mat.metalness = 0
    this.material = mat
  }

  /** Kích thước lát (m). Min 0.01. */
  setTileSizeMeters(v: number): void {
    if (this.isDisposed) return
    this.uInvTile.value = 1 / Math.max(0.01, v)
  }

  /** Cường độ normal [-2, 2]. Âm = flip green. */
  setNormalScale(v: number): void {
    if (this.isDisposed) return
    this.uNormalScale.value = Math.max(-2, Math.min(2, v))
  }

  /** Nhân roughness [0, 3]. */
  setRoughnessScale(v: number): void {
    if (this.isDisposed) return
    this.uRoughScale.value = Math.max(0, Math.min(3, v))
  }

  /** Cường độ micro-relief procedural [0, 1] (0 = tắt visual). LIVE — chỉ hiệu lực nếu khởi tạo với option `detail`. */
  setDetail(v: number): void {
    if (this.isDisposed) return
    this.uDetail.value = Math.max(0, Math.min(1, v))
  }

  getMaterial(): MeshStandardNodeMaterial {
    if (!this.material) throw new Error('PhotoGround: already disposed')
    return this.material
  }

  dispose(): void {
    if (this.isDisposed) return
    this.material?.dispose()
    this.material = null
    this.isDisposed = true
    // Texture (opts.maps.*) KHÔNG dispose ở đây — caller sở hữu (giống TriplanarMapping).
  }

  // GL tangent normal → world (ground phẳng +Y: T=+X, B=+Z, N=+Y), CỘNG micro-relief procedural (nếu bật) → view.
  // Map vắng → base = +Y thuần. Khớp world-uv (né TBN-default-uv của NormalMapNode).
  private _normalNode(normalTex: THREE.Texture | undefined, uvw: TSLNode): TSLNode {
    let worldN: TSLNode
    if (normalTex) {
      const n = texture(normalTex, uvw).xyz.mul(float(2)).sub(float(1)) // [-1,1]
      const s = this.uNormalScale
      worldN = vec3(n.x.mul(s), n.z, n.y.mul(s)).normalize() as TSLNode // T→X, N(blue)→Y, B(green)→Z
    } else {
      worldN = vec3(0, 1, 0) as TSLNode
    }
    if (this._detailOn) worldN = this._detailNormal(worldN)
    return transformNormalToView(worldN) as TSLNode
  }

  // Micro-relief PROCEDURAL: gradient mx_noise_float (finite-diff 3 mẫu, world-XZ × freq) tilt worldN.x/z.
  // uDetail=0 → no-op (vẫn tính noise ~0.1ms). CỘNG lên normal map (không thay) → phá vẻ "nhựa" của gò nhẵn.
  private _detailNormal(worldN: TSLNode): TSLNode {
    const p = positionWorld.xz.mul(float(this._detailFreq)) as TSLNode
    const e = float(0.4) // bước finite-diff (p-space)
    const h0 = mx_noise_float(vec3(p.x, p.y, float(0)))
    const hx = mx_noise_float(vec3(p.x.add(e), p.y, float(0)))
    const hz = mx_noise_float(vec3(p.x, p.y.add(e), float(0)))
    const k = this.uDetail.mul(float(2.5)) // slider 0..1 × hệ số nhìn-được
    const gx = hx.sub(h0).mul(k)
    const gz = hz.sub(h0).mul(k)
    return vec3(worldN.x.sub(gx), worldN.y, worldN.z.sub(gz)).normalize() as TSLNode
  }
}
