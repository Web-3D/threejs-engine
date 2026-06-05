/**
 * VỊ TRÍ   — threejs-modules/shaders/fragment/ShojiScreen/index.ts
 * VAI TRÒ  — TSL NodeMaterial: tường SHOJI (障子) Nhật — lưới gỗ KUMIKO (ô đều, dọc+ngang) trên nền GIẤY
 *            WASHI trắng-ấm (mờ) + khung gỗ chia tấm. Lit (nhận sáng/bóng). Triplanar world-space.
 * LIÊN HỆ  — surface shader cho WallMaterial 'jp-shoji' (anh em SeigaihaScreen). Khác: shoji = lưới mảnh +
 *            giấy sáng (cho ánh sáng xuyên cảm giác), fusuma seigaiha = tranh sóng.
 *
 * CÁCH DÙNG: const s = new ShojiScreen({ scale: 1 }); mesh.material = s.getMaterial()  // qua makeSurfaceMaterial
 * DISPOSE: dispose() giải phóng NodeMaterial.
 */

import * as THREE from 'three'
import type Node from 'three/src/nodes/core/Node.js'
import type { ShaderNodeObject } from 'three/tsl'
import {
  float,
  max,
  min,
  mix,
  normalWorld,
  positionWorld,
  smoothstep,
  triNoise3D,
  uniform,
  uv,
  vec3,
} from 'three/tsl'
import { NodeMaterial } from 'three/webgpu'

type TSLNode = ShaderNodeObject<Node>

export interface ShojiScreenOptions {
  /** World scale (lớn = ô nhỏ). Default: 1 */
  scale?: number
  /** Giấy washi trắng-ấm (mờ). Default: 0xf3ecd6 */
  paperColor?: THREE.ColorRepresentation
  /** Gỗ kumiko + khung. Default: nâu sẫm 0x4a3826 */
  woodColor?: THREE.ColorRepresentation
  /** Bề rộng ô kumiko (m, world). Default: 0.11 */
  cellW?: number
  /** Cao ô kumiko (m, world). Default: 0.14 */
  cellH?: number
  /** Ô = KÍNH thay giấy: roughness thấp (bóng/phản chiếu env) qua getRoughnessNode. Default: false */
  glass?: boolean
  /** Koshita (腰板): tỉ lệ phần DƯỚI tường làm GỖ ĐẶC (no lattice) — uv.y < koshita. 0 = tắt. Default: 0.33 */
  koshita?: number
  /** (glass) Độ phản chiếu ô kính [0–1] — cao = mịn/bóng (roughness thấp). Default: 0.6 */
  reflect?: number
  /** (glass) Độ mờ ô kính [0–1] — thấp = trong (thấy xuyên), cao = đục. Default: 0.45 */
  opacity?: number
}

export class ShojiScreen {
  private material: NodeMaterial | null = null
  private isDisposed = false

  private readonly uScale: ReturnType<typeof uniform>
  private readonly uPaper: ReturnType<typeof uniform>
  private readonly uWood: ReturnType<typeof uniform>
  private readonly uCellW: ReturnType<typeof uniform>
  private readonly uCellH: ReturnType<typeof uniform>
  private readonly uKoshita: ReturnType<typeof uniform>
  private readonly uReflect: ReturnType<typeof uniform>
  private readonly uOpacity: ReturnType<typeof uniform>
  private readonly _glass: boolean
  private _woodnessNode: TSLNode | null = null // GỖ-NESS triplanar — build 1 lần, share color/rough/opacity

  constructor(opts: ShojiScreenOptions = {}) {
    this._glass = opts.glass ?? false
    this.uReflect = uniform(opts.reflect ?? 0.6)
    this.uOpacity = uniform(opts.opacity ?? 0.45)
    this.uScale = uniform(opts.scale ?? 1)
    this.uPaper = uniform(new THREE.Color(opts.paperColor ?? 0xf3ecd6))
    this.uWood = uniform(new THREE.Color(opts.woodColor ?? 0x7a4a30)) // gỗ ấm reddish (khớp ảnh shoji thật)
    this.uCellW = uniform(opts.cellW ?? 0.25) // trục gỗ dọc 25cm; nan gỗ = trục/2 (12.5cm) cả dọc+ngang
    this.uCellH = uniform(opts.cellH ?? 0.25)
    this.uKoshita = uniform(opts.koshita ?? 0.33)

    const mat = new NodeMaterial()
    mat.colorNode = this._buildColorNode()
    this.material = mat
  }

  /** World scale. Min 0.001. */
  setScale(v: number): void {
    if (!this.isDisposed) this.uScale.value = Math.max(0.001, v)
  }
  setPaperColor(c: THREE.ColorRepresentation): void {
    if (!this.isDisposed) (this.uPaper.value as THREE.Color).set(c)
  }
  setWoodColor(c: THREE.ColorRepresentation): void {
    if (!this.isDisposed) (this.uWood.value as THREE.Color).set(c)
  }

  getMaterial(): NodeMaterial {
    if (!this.material) throw new Error('ShojiScreen: đã dispose')
    return this.material
  }

  /** Roughness: GIẤY → 0.9 matte; KÍNH → ô bóng (theo reflect) + gỗ matte (qua woodness). */
  getRoughnessNode(): TSLNode {
    if (!this._glass) return float(0.97) as TSLNode // gỗ + giấy MAT (né nhựa)
    // glassR = lerp(0.4 → 0.02, reflect) bằng arithmetic (né mix() với uniform-node = lỗi type).
    const glassR = float(0.4).add(float(0.02).sub(float(0.4)).mul(this.uReflect))
    return mix(glassR, float(0.85), this._woodness()) as TSLNode // ô kính bóng, gỗ matte
  }

  /** Opacity (CHỈ glass): ô KÍNH mờ theo uOpacity (transparent), GỖ đặc (=1). null = opaque. */
  getOpacityNode(): TSLNode | null {
    if (!this._glass) return null
    // opacity = uOpacity + (1 − uOpacity)·woodness (ô = uOpacity, gỗ = 1) — arithmetic.
    return this.uOpacity.add(float(1).sub(this.uOpacity).mul(this._woodness())) as TSLNode
  }

  dispose(): void {
    if (this.isDisposed) return
    this.material?.dispose()
    this.material = null
    this.isDisposed = true
  }

  // ── TSL node graph ────────────────────────────────────────────────────────

  // Bar lưới 1 trục: kẻ tại bội số `cell` (world m), nửa-bề-rộng `hw` (world m). SOLID + AA mỏng (sắc nét).
  private _bars(p: TSLNode, cell: TSLNode, hw: TSLNode): TSLNode {
    const f = p.div(cell).fract()
    const d = min(f, float(1).sub(f)).mul(cell) // world m tới đường lưới gần nhất
    return smoothstep(hw.add(float(0.004)), hw, d) as TSLNode
  }

  // Mask LƯỚI kumiko 1 mặt phẳng [0..1]: TRỤC GỖ dọc (uCellW=25cm, DÀY) + NAN GỖ (uCellW/2=12.5cm, MẢNH,
  // cả dọc+ngang → ô vuông). uCellW/H uniform → cast TSLNode khi truyền vào _bars. (trục ngang-top ở _woodness.)
  private _gridLattice(pu: TSLNode, pv: TSLNode): TSLNode {
    const trucV = this._bars(pu, this.uCellW as unknown as TSLNode, float(0.013)) // trục dọc dày ~26mm
    const nanV = this._bars(pu, this.uCellW.div(float(2)), float(0.006)) // nan dọc mảnh ~12mm
    const nanH = this._bars(pv, this.uCellH.div(float(2)), float(0.006)) // nan ngang mảnh ~12mm
    return max(max(trucV, nanV), nanH) as TSLNode
  }

  // Triplanar blend 1 hàm-mặt qua 3 mặt chiếu world (|normal|^8) — giống SeigaihaScreen.
  private _triplanar(face: (pu: TSLNode, pv: TSLNode) => TSLNode): TSLNode {
    const s = this.uScale
    const fZY = face(positionWorld.z.mul(s), positionWorld.y.mul(s))
    const fXY = face(positionWorld.x.mul(s), positionWorld.y.mul(s))
    const fXZ = face(positionWorld.x.mul(s), positionWorld.z.mul(s))
    const sharp = normalWorld.abs().pow(vec3(8))
    const w = sharp.div(sharp.dot(vec3(1)).max(float(0.001)))
    return fZY.mul(w.x).add(fXZ.mul(w.y)).add(fXY.mul(w.z)) as TSLNode
  }

  // GỖ-NESS [0..1] = 1 gỗ, 0 ô (giấy/kính). = lưới kumiko (world triplanar) ∪ KHUNG NGOÀI (uv: cạnh trên +
  // 2 cạnh bên) ∪ KOSHITA (uv: đáy 1/3). Khung/koshita per-wall (uv), lưới đều theo world. Build 1 LẦN.
  private _woodness(): TSLNode {
    if (this._woodnessNode) return this._woodnessNode
    const grid = this._triplanar((pu, pv) => this._gridLattice(pu, pv))
    const uvN = uv()
    // Khung ngoài: cạnh trên (uv.y→1) + 2 cạnh bên (uv.x→0/1). KHÔNG cạnh đáy (đáy = koshita). fw = % bề tường.
    const fw = float(0.045)
    const left = smoothstep(fw, float(0), uvN.x)
    const right = smoothstep(float(1).sub(fw), float(1), uvN.x)
    const top = smoothstep(float(1).sub(fw), float(1), uvN.y)
    const frame = max(max(left, right), top)
    // TRỤC GỖ NGANG trên top: 1 thanh dày ngay dưới khung (band uv.y quanh 0.92).
    const trucTop = smoothstep(float(0.025), float(0.02), uvN.y.sub(float(0.92)).abs())
    // Koshita: đáy (uv.y < uKoshita) = gỗ đặc.
    const koshita = float(1).sub(smoothstep(this.uKoshita, this.uKoshita.add(float(0.012)), uvN.y))
    this._woodnessNode = max(max(max(grid, frame), trucTop), koshita) as TSLNode
    return this._woodnessNode
  }

  // Màu gỗ + VÂN DỌC: triNoise tần cao ngang (X,Z) + thấp dọc (Y) → streak đứng (vân ván) ±brightness.
  private _woodColor(): TSLNode {
    const grain = triNoise3D(
      positionWorld.mul(vec3(float(13), float(1.4), float(13))),
      float(0),
      float(0)
    ).sub(float(0.5))
    return this.uWood.add(this.uWood.mul(grain.mul(float(0.4)))) as TSLNode // ±20% sáng theo vân
  }

  private _buildColorNode(): TSLNode {
    return mix(this.uPaper, this._woodColor(), this._woodness()) as TSLNode
  }
}
