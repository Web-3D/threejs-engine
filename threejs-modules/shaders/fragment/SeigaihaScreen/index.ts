/**
 * VỊ TRÍ   — threejs-modules/shaders/fragment/SeigaihaScreen/index.ts
 * VAI TRÒ  — TSL NodeMaterial: tường tranh Nhật (fusuma/byōbu) — KHUNG GỖ chia ô + nền washi/vàng kim +
 *            sóng SEIGAIHA (青海波) procedural (Voronoi staggered + vòng cung đồng tâm). Lit (nhận sáng/bóng).
 * LIÊN HỆ  — surface shader cho WallMaterial 'jp-screen' (như WoodPlank/BrickWall). Triplanar world-space.
 *
 * CÁCH DÙNG:
 *   const jp = new SeigaihaScreen({ scale: 1 }); mesh.material = jp.getMaterial(); // qua makeSurfaceMaterial
 * DISPOSE: dispose() giải phóng NodeMaterial.
 */

import * as THREE from 'three'
import type Node from 'three/src/nodes/core/Node.js'
import type { ShaderNodeObject } from 'three/tsl'
import { float, min, mix, normalWorld, positionWorld, smoothstep, uniform, vec2, vec3 } from 'three/tsl'
import { NodeMaterial } from 'three/webgpu'

type TSLNode = ShaderNodeObject<Node>

export interface SeigaihaScreenOptions {
  /** World scale (lớn = motif nhỏ). Default: 1 */
  scale?: number
  /** Nền washi / vàng kim (kinpaku). Default: vàng ấm */
  paperColor?: THREE.ColorRepresentation
  /** Màu sóng (chàm/indigo). Default: 0x2a4d7a */
  waveColor?: THREE.ColorRepresentation
  /** Màu khung gỗ chia ô fusuma. Default: nâu sẫm */
  frameColor?: THREE.ColorRepresentation
  /** Số vòng cung mỗi vảy sóng. Default: 5 */
  rings?: number
  /** Bề rộng ô fusuma (m, world). Default: 0.9 */
  panelW?: number
  /** Cao ô fusuma (m, world). Default: 1.8 */
  panelH?: number
}

export class SeigaihaScreen {
  private material: NodeMaterial | null = null
  private isDisposed = false

  private readonly uScale: ReturnType<typeof uniform>
  private readonly uPaper: ReturnType<typeof uniform>
  private readonly uWave: ReturnType<typeof uniform>
  private readonly uFrame: ReturnType<typeof uniform>
  private readonly uRings: ReturnType<typeof uniform>
  private readonly uPanelW: ReturnType<typeof uniform>
  private readonly uPanelH: ReturnType<typeof uniform>

  constructor(opts: SeigaihaScreenOptions = {}) {
    this.uScale = uniform(opts.scale ?? 1)
    this.uPaper = uniform(new THREE.Color(opts.paperColor ?? 0xe7d6a0))
    this.uWave = uniform(new THREE.Color(opts.waveColor ?? 0x2a4d7a))
    this.uFrame = uniform(new THREE.Color(opts.frameColor ?? 0x3a2a1c))
    this.uRings = uniform(opts.rings ?? 5)
    this.uPanelW = uniform(opts.panelW ?? 0.9)
    this.uPanelH = uniform(opts.panelH ?? 1.8)

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
  setWaveColor(c: THREE.ColorRepresentation): void {
    if (!this.isDisposed) (this.uWave.value as THREE.Color).set(c)
  }
  setFrameColor(c: THREE.ColorRepresentation): void {
    if (!this.isDisposed) (this.uFrame.value as THREE.Color).set(c)
  }

  getMaterial(): NodeMaterial {
    if (!this.material) throw new Error('SeigaihaScreen: đã dispose')
    return this.material
  }

  dispose(): void {
    if (this.isDisposed) return
    this.material?.dispose()
    this.material = null
    this.isDisposed = true
  }

  // ── TSL node graph ────────────────────────────────────────────────────────

  // Sóng seigaiha 1 mặt phẳng (pu,pv = world*scale). Tâm vảy = lưới so le (x cách 1, y cách 0.5, hàng lẻ
  // lệch 0.5) → khoảng-cách-tới-tâm-gần-nhất (Voronoi, unroll 3×3) cho vòng cung đồng tâm + biên vảy. + khung ô.
  private _face(pu: TSLNode, pv: TSLNode): TSLNode {
    const wsx = pu.mul(float(3)) // mật độ sóng (3 vảy / đơn vị scale)
    const wsy = pv.mul(float(3))
    const baseRow = wsy.div(float(0.5)).floor()
    let minD: TSLNode = float(1e3)
    for (let dj = -1; dj <= 1; dj++) {
      const row = baseRow.add(float(dj))
      const cy = row.mul(float(0.5))
      const off = row.mod(float(2)).mul(float(0.5)) // hàng lẻ lệch nửa ô
      const baseCol = wsx.sub(off).floor()
      for (let di = -1; di <= 1; di++) {
        const cx = baseCol.add(float(di)).add(off)
        const dd = vec2(wsx.sub(cx), wsy.sub(cy)).length()
        minD = min(minD, dd) as TSLNode
      }
    }
    // Vòng cung đồng tâm: band xen kẽ mềm + đường mảnh sẫm ở mép vòng.
    const r = minD.mul(this.uRings)
    const ring = r.fract()
    const alt = r.floor().mod(float(2))
    const fill = mix(this.uPaper, this.uWave, alt.mul(float(0.28)))
    const lineMask = smoothstep(float(0.07), float(0), min(ring, float(1).sub(ring)))
    const waved = mix(fill, this.uWave.mul(float(0.55)), lineMask)
    // Khung gỗ chia ô fusuma (lưới world theo panelW/H).
    const pf = vec2(pu.div(this.uPanelW), pv.div(this.uPanelH)).fract()
    const g = min(min(pf.x, float(1).sub(pf.x)), min(pf.y, float(1).sub(pf.y)))
    const frameMask = smoothstep(float(0.04), float(0.015), g)
    return mix(waved, this.uFrame, frameMask) as TSLNode
  }

  // Triplanar: 3 mặt chiếu world blend theo |normal|^8 (giống WoodPlank/BrickWall).
  private _buildColorNode(): TSLNode {
    const s = this.uScale
    const colZY = this._face(positionWorld.z.mul(s), positionWorld.y.mul(s)) // tường mặt ±X
    const colXY = this._face(positionWorld.x.mul(s), positionWorld.y.mul(s)) // tường mặt ±Z
    const colXZ = this._face(positionWorld.x.mul(s), positionWorld.z.mul(s)) // sàn/mái
    const sharp = normalWorld.abs().pow(vec3(8))
    const w = sharp.div(sharp.dot(vec3(1)).max(float(0.001)))
    return colZY.mul(w.x).add(colXZ.mul(w.y)).add(colXY.mul(w.z)) as TSLNode
  }
}
