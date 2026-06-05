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
import { float, positionWorld, texture, transformNormalToView, uniform, vec3 } from 'three/tsl'
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
}

export class PhotoGround {
  private material: MeshStandardNodeMaterial | null = null
  private isDisposed = false

  private readonly uInvTile: ReturnType<typeof uniform>
  private readonly uNormalScale: ReturnType<typeof uniform>
  private readonly uRoughScale: ReturnType<typeof uniform>

  constructor(opts: PhotoGroundOptions) {
    const m = opts.maps
    this.uInvTile = uniform(1 / Math.max(0.01, opts.tileSizeMeters ?? 2))
    this.uNormalScale = uniform(opts.normalScale ?? 1)
    this.uRoughScale = uniform(opts.roughnessScale ?? 1)

    // UV theo world-XZ ÷ tile → lát đều, độc lập geometry UV (Box LẪN ShapeGeometry đều đúng).
    const uvw = positionWorld.xz.mul(this.uInvTile) as TSLNode

    const mat = new MeshStandardNodeMaterial()
    mat.colorNode = texture(m.baseColor, uvw) // sRGB (caller set colorSpace) → auto-linear
    if (m.roughness)
      mat.roughnessNode = texture(m.roughness, uvw).r.mul(this.uRoughScale) as TSLNode
    if (m.ao) mat.aoNode = texture(m.ao, uvw).r as TSLNode
    if (m.normal) mat.normalNode = this._normalNode(m.normal, uvw)
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

  // GL tangent normal → world (ground phẳng +Y: T=+X, B=+Z, N=+Y) → view. Khớp world-uv (né TBN-default-uv của NormalMapNode).
  private _normalNode(normalTex: THREE.Texture, uvw: TSLNode): TSLNode {
    const n = texture(normalTex, uvw).xyz.mul(float(2)).sub(float(1)) // [-1,1]
    const s = this.uNormalScale
    const worldN = vec3(n.x.mul(s), n.z, n.y.mul(s)).normalize() // T→X, N(blue)→Y, B(green)→Z
    return transformNormalToView(worldN) as TSLNode
  }
}
