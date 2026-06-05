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
import { float, max, min, mix, normalWorld, positionWorld, smoothstep, uniform, uv, vec2, vec3 } from 'three/tsl'
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
  /** Bề rộng tấm shoji chia khung (m). Default: 0.9 / 1.8 */
  panelW?: number
  panelH?: number
  /** Ô = KÍNH thay giấy: roughness thấp (bóng/phản chiếu env) qua getRoughnessNode. Default: false */
  glass?: boolean
  /** Koshita (腰板): tỉ lệ phần DƯỚI tường làm GỖ ĐẶC (no lattice) — uv.y < koshita. 0 = tắt. Default: 0.33 */
  koshita?: number
}

export class ShojiScreen {
  private material: NodeMaterial | null = null
  private isDisposed = false

  private readonly uScale: ReturnType<typeof uniform>
  private readonly uPaper: ReturnType<typeof uniform>
  private readonly uWood: ReturnType<typeof uniform>
  private readonly uCellW: ReturnType<typeof uniform>
  private readonly uCellH: ReturnType<typeof uniform>
  private readonly uPanelW: ReturnType<typeof uniform>
  private readonly uPanelH: ReturnType<typeof uniform>
  private readonly uKoshita: ReturnType<typeof uniform>
  private readonly _glass: boolean

  constructor(opts: ShojiScreenOptions = {}) {
    this._glass = opts.glass ?? false
    this.uScale = uniform(opts.scale ?? 1)
    this.uPaper = uniform(new THREE.Color(opts.paperColor ?? 0xf3ecd6))
    this.uWood = uniform(new THREE.Color(opts.woodColor ?? 0x7a4a30)) // gỗ ấm reddish (khớp ảnh shoji thật)
    this.uCellW = uniform(opts.cellW ?? 0.11)
    this.uCellH = uniform(opts.cellH ?? 0.14)
    this.uPanelW = uniform(opts.panelW ?? 0.9)
    this.uPanelH = uniform(opts.panelH ?? 1.8)
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

  /** Roughness: KÍNH (glass) → 0.16 (bóng, phản chiếu env); GIẤY → 0.9 (matte washi). */
  getRoughnessNode(): TSLNode {
    return float(this._glass ? 0.16 : 0.9) as TSLNode
  }

  dispose(): void {
    if (this.isDisposed) return
    this.material?.dispose()
    this.material = null
    this.isDisposed = true
  }

  // ── TSL node graph ────────────────────────────────────────────────────────

  // 1 mặt phẳng (pu,pv = world*scale): nền giấy + lưới kumiko (đường mảnh dọc+ngang theo cellW/H) + khung tấm.
  private _face(pu: TSLNode, pv: TSLNode): TSLNode {
    // Kumiko: khoảng-cách-tới-đường-lưới-gần-nhất theo từng trục → đường mảnh gỗ.
    const cu = pu.div(this.uCellW).fract()
    const cv = pv.div(this.uCellH).fract()
    const du = min(cu, float(1).sub(cu))
    const dv = min(cv, float(1).sub(cv))
    const barW = float(0.06) // nửa-bề-rộng đường (đơn vị ô)
    const lattice = max(smoothstep(barW, float(0), du), smoothstep(barW, float(0), dv))
    const withLattice = mix(this.uPaper, this.uWood, lattice)
    // Khung tấm shoji (lưới world panelW/H) — đậm hơn lưới kumiko.
    const pf = vec2(pu.div(this.uPanelW), pv.div(this.uPanelH)).fract()
    const g = min(min(pf.x, float(1).sub(pf.x)), min(pf.y, float(1).sub(pf.y)))
    const frame = smoothstep(float(0.045), float(0.02), g)
    return mix(withLattice, this.uWood, frame) as TSLNode
  }

  // Triplanar: 3 mặt chiếu world blend theo |normal|^8 (giống SeigaihaScreen).
  private _buildColorNode(): TSLNode {
    const s = this.uScale
    const colZY = this._face(positionWorld.z.mul(s), positionWorld.y.mul(s)) // tường mặt ±X
    const colXY = this._face(positionWorld.x.mul(s), positionWorld.y.mul(s)) // tường mặt ±Z
    const colXZ = this._face(positionWorld.x.mul(s), positionWorld.z.mul(s)) // sàn/mái
    const sharp = normalWorld.abs().pow(vec3(8))
    const w = sharp.div(sharp.dot(vec3(1)).max(float(0.001)))
    const blended = colZY.mul(w.x).add(colXZ.mul(w.y)).add(colXY.mul(w.z))
    // Koshita: phần DƯỚI tường (uv.y < uKoshita) = GỖ ĐẶC (no lattice). uv.y per-wall (BoxGeometry, 0=đáy→1=đỉnh).
    const ks = smoothstep(this.uKoshita, this.uKoshita.add(float(0.012)), uv().y)
    return mix(this.uWood, blended, ks) as TSLNode
  }
}
