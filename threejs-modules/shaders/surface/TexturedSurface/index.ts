/**
 * VỊ TRÍ   — threejs-modules/shaders/surface/TexturedSurface/index.ts
 * VAI TRÒ  — Surface PBR từ texture ảnh, TRIPLANAR (world-space) → đúng MỌI HƯỚNG mặt (sàn ngang, tường dọc,
 *            đáy hồ, MÁI NGHIÊNG) mà KHÔNG cần UV. "Unified" material: 1 cái cho slab/fence/pond-bottom/roof.
 * LIÊN HỆ  — Anh em PhotoGround (PhotoGround = world-XZ phẳng +Y, rẻ hơn cho ground ngang; TexturedSurface =
 *            triplanar, đắt hơn 3× sample nhưng đúng mọi hướng). Caller LOAD texture (manifest assets/textures)
 *            rồi BƠM vào (module độc lập, KHÔNG hardcode URL).
 *
 * Thuật toán (triplanar): sample texture theo 3 mặt phẳng world (YZ/XZ/XY), blend theo |normalWorld| (mặt nào
 * đối diện phẳng nhất thì trội). color/roughness/ao = `triplanarTexture` built-in. normal = WHITEOUT blend
 * (Ben Golus): unpack tangent normal mỗi mặt → ghép hướng world → blend → transformNormalToView. (Blend RGB
 * thuần SAI ở mặt xiên; whiteout đúng cho cả mái nghiêng.)
 *
 * CÁCH DÙNG: const s = new TexturedSurface({ maps:{baseColor,normal,roughness,ao}, tileSizeMeters:2 })
 *            mesh.material = s.getMaterial()   // textures do CALLER load + set wrap=Repeat/colorSpace/anisotropy
 * DISPOSE: dispose() giải phóng NodeMaterial. KHÔNG dispose texture (caller sở hữu — như TriplanarMapping).
 */

import type * as THREE from 'three'
import type Node from 'three/src/nodes/core/Node.js'
import type { ShaderNodeObject } from 'three/tsl'
import {
  float,
  normalWorld,
  positionWorld,
  texture,
  transformNormalToView,
  triplanarTexture,
  uniform,
  vec3,
} from 'three/tsl'
import { MeshStandardNodeMaterial } from 'three/webgpu'

type TSLNode = ShaderNodeObject<Node>

/** Bộ map PBR (THREE.Texture đã load + cấu hình bởi caller). baseColor=sRGB; còn lại=linear. */
export interface TexturedSurfaceMaps {
  baseColor: THREE.Texture
  normal?: THREE.Texture
  roughness?: THREE.Texture
  ao?: THREE.Texture
}

export interface TexturedSurfaceOptions {
  maps: TexturedSurfaceMaps
  /** Kích thước lát vật lý (m) — texture lặp mỗi `tileSizeMeters` world. Default: 2 */
  tileSizeMeters?: number
  /** Cường độ normal. Âm = flip. Default: 1 */
  normalScale?: number
  /** Nhân roughness map. Default: 1 */
  roughnessScale?: number
}

export class TexturedSurface {
  private material: MeshStandardNodeMaterial | null = null
  private isDisposed = false

  private readonly uScale: ReturnType<typeof uniform>
  private readonly uNormalScale: ReturnType<typeof uniform>
  private readonly uRoughScale: ReturnType<typeof uniform>

  constructor(opts: TexturedSurfaceOptions) {
    const m = opts.maps
    // triplanar scale = 1/tile (sample posWorld*scale → lặp mỗi tile mét). Lớn = texture nhỏ hơn.
    this.uScale = uniform(1 / Math.max(0.01, opts.tileSizeMeters ?? 2))
    this.uNormalScale = uniform(opts.normalScale ?? 1)
    this.uRoughScale = uniform(opts.roughnessScale ?? 1)

    const mat = new MeshStandardNodeMaterial()
    mat.colorNode = this._tri(m.baseColor) // sRGB (caller set) → auto-linear
    if (m.roughness) mat.roughnessNode = this._tri(m.roughness).r.mul(this.uRoughScale) as TSLNode
    if (m.ao) mat.aoNode = this._tri(m.ao).r as TSLNode
    if (m.normal) mat.normalNode = this._normalNode(m.normal)
    mat.metalness = 0
    this.material = mat
  }

  /** Kích thước lát (m). Min 0.01. */
  setTileSizeMeters(v: number): void {
    if (this.isDisposed) return
    this.uScale.value = 1 / Math.max(0.01, v)
  }

  /** Cường độ normal [-2, 2]. Âm = flip. */
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
    if (!this.material) throw new Error('TexturedSurface: already disposed')
    return this.material
  }

  dispose(): void {
    if (this.isDisposed) return
    this.material?.dispose()
    this.material = null
    this.isDisposed = true
    // Texture KHÔNG dispose ở đây — caller sở hữu (giống TriplanarMapping).
  }

  // triplanarTexture built-in (blend |n|/dot) — world position/normal → đúng mọi hướng. Pass cùng 1 node
  // cho X/Y/Z (TS không cho null; = hành vi default "reuse textureX" cho cả 3 mặt).
  private _tri(tex: THREE.Texture): TSLNode {
    const t = texture(tex)
    return triplanarTexture(t, t, t, this.uScale, positionWorld, normalWorld) as TSLNode
  }

  // WHITEOUT triplanar normal (đúng cả mặt xiên): unpack tangent normal mỗi mặt → ghép hướng world → blend → view.
  private _normalNode(normalTex: THREE.Texture): TSLNode {
    const s = this.uScale
    const nw = normalWorld
    const ns = this.uNormalScale
    // sample + unpack [-1,1] mỗi mặt; scale cường độ trên tangent xy.
    const sx = texture(normalTex, positionWorld.zy.mul(s)).xyz.mul(float(2)).sub(float(1))
    const sy = texture(normalTex, positionWorld.xz.mul(s)).xyz.mul(float(2)).sub(float(1))
    const sz = texture(normalTex, positionWorld.xy.mul(s)).xyz.mul(float(2)).sub(float(1))
    const nx = vec3(sx.xy.mul(ns).add(nw.zy), sx.z.abs().mul(nw.x))
    const ny = vec3(sy.xy.mul(ns).add(nw.xz), sy.z.abs().mul(nw.y))
    const nz = vec3(sz.xy.mul(ns).add(nw.xy), sz.z.abs().mul(nw.z))
    // weights = |n| normalized (khớp blend của triplanarTexture).
    const bw = nw.abs()
    const w = bw.div(bw.x.add(bw.y).add(bw.z))
    const worldN = nx.zyx.mul(w.x).add(ny.xzy.mul(w.y)).add(nz.xyz.mul(w.z)).normalize()
    return transformNormalToView(worldN) as TSLNode
  }
}
