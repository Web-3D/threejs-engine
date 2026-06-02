/**
 * VỊ TRÍ   — threejs-modules/components/GrassBlades/index.ts
 * VAI TRÒ  — Cỏ 3D (tier B, material-roadmap): InstancedMesh lá geometry rải trên nền lô.
 *            B0 = HÌNH DÁNG TRẦN: lá phẳng đứng (Cao + Rộng + Số đốt) + 1 màu. Mục tiêu B0:
 *            preview (1 lá) DÙNG CHUNG model với bãi → trông y hệt nhau. Shape/màu-gradient/cong/
 *            xoắn/gió/cao-thấp/ngả/đổ-bóng = các bước SAU (thêm dần, mỗi cái verify ở preview).
 * LIÊN HỆ  — Rải bởi site-kit (render/fromState) lên nền lô. Lớp NỀN + LOD-xa = GrassGround (tier A).
 *
 * BUDGET (luật tier-B): accent-only (count cap qua maxBlades), instanced (1 draw), cặp tier-A.
 *   LOD-theo-camera = bước sau (v1 cap count cho 1 lô).
 *
 * CÁCH DÙNG: const g = new GrassBlades({ width, depth, baseY }); scene.add(g.getMesh())
 * DISPOSE: dispose() giải phóng geometry + NodeMaterial + gỡ mesh khỏi parent.
 */

import * as THREE from 'three'
import { uniform } from 'three/tsl'
import { MeshStandardNodeMaterial } from 'three/webgpu'

const DEFAULTS = {
  width: 12, // m — bề ngang vùng rải (X)
  depth: 9.6, // m — chiều sâu vùng rải (Z)
  baseY: 0.01, // m — cao độ gốc lá (= mặt trên nền)
  density: 100, // lá/m²
  maxBlades: 24000, // trần count (budget) — accent-only
  bladeHeight: 0.28, // m
  bladeWidth: 0.006, // m (6mm)
  segments: 5, // số đốt dọc (độ mịn strip)
  color: 0x4f7a33 as THREE.ColorRepresentation, // 1 màu lá (B0); gradient = bước sau
}

// Rect loại trừ (m, world XZ = hệ grass-local vì siteGroup ở gốc): cỏ KHÔNG mọc bên trong.
// Dùng cho footprint foundation ("nơi có foundation thì không đặt nền cỏ"). halfW/halfD theo trục
// LOCAL của rect (trước xoay); rot = góc xoay quanh Y (rad). Plain numbers → site-kit không phụ thuộc building-kit.
export interface GrassExcludeRect {
  cx: number
  cz: number
  halfW: number
  halfD: number
  rot: number
}

export interface GrassBladesOptions {
  /** Bề ngang vùng rải (m, trục X). Default 12 */
  width?: number
  /** Chiều sâu vùng rải (m, trục Z). Default 9.6 */
  depth?: number
  /** Cao độ gốc lá (m) = mặt trên nền. Default 0.01 */
  baseY?: number
  /** Mật độ lá/m². Default 100 */
  density?: number
  /** Trần số lá (budget). Default 24000 */
  maxBlades?: number
  /** Cao lá (m). Default 0.28 */
  bladeHeight?: number
  /** Rộng lá (m). Default 0.006 */
  bladeWidth?: number
  /** Số đốt dọc lá. Default 5 */
  segments?: number
  /** Màu lá (B0: 1 màu phẳng). Default 0x4f7a33 */
  color?: THREE.ColorRepresentation
  /** Rect loại trừ (m, world XZ) — cỏ né các vùng này (vd footprint foundation). Default [] */
  exclude?: GrassExcludeRect[]
}

export class GrassBlades {
  private mesh: THREE.InstancedMesh | null = null
  private geo: THREE.BufferGeometry | null = null
  private material: MeshStandardNodeMaterial | null = null
  private isDisposed = false

  private readonly count: number
  private readonly uColor: ReturnType<typeof uniform>

  constructor(opts: GrassBladesOptions = {}) {
    const o = { ...DEFAULTS, ...opts }
    const planned = Math.max(1, Math.min(o.maxBlades, Math.round(o.density * o.width * o.depth)))
    this.uColor = uniform(new THREE.Color(o.color))

    this.geo = this._buildBladeGeo(o.segments, o.bladeHeight, o.bladeWidth)

    this.material = new MeshStandardNodeMaterial()
    this.material.colorNode = this.uColor
    this.material.roughness = 0.86
    this.material.metalness = 0
    this.material.side = THREE.DoubleSide

    // Cấp buffer theo planned; rải né footprint → trả số lá THỰC, gán mesh.count (≤ planned).
    this.mesh = new THREE.InstancedMesh(this.geo, this.material, planned)
    this.mesh.castShadow = false
    this.mesh.receiveShadow = true // nhận bóng nhà đổ xuống (rẻ)
    this.mesh.frustumCulled = false // 1 draw — tắt cho an toàn
    this.count = this._scatter(o, planned, opts.exclude ?? [])
    this.mesh.count = this.count
  }

  /** Màu lá — live (uniform, không dựng lại material). */
  setColor(c: THREE.ColorRepresentation): void {
    if (this.isDisposed) return
    ;(this.uColor.value as THREE.Color).set(c)
  }

  getMesh(): THREE.InstancedMesh {
    if (!this.mesh) throw new Error('GrassBlades: already disposed')
    return this.mesh
  }

  /** Số lá thực tế (sau cap). */
  getCount(): number {
    return this.count
  }

  dispose(): void {
    if (this.isDisposed) return
    this.mesh?.parent?.remove(this.mesh)
    this.geo?.dispose()
    this.material?.dispose()
    this.mesh = null
    this.geo = null
    this.material = null
    this.isDisposed = true
  }

  // ── Private ────────────────────────────────────────────────────────────────

  // 1 lá = strip phẳng đứng (y: 0→H, x: ±W/2 hằng), S đốt. Normal +Z. B0: hình dáng final = geometry này.
  private _buildBladeGeo(S: number, H: number, W: number): THREE.BufferGeometry {
    const pos: number[] = []
    const nor: number[] = []
    const idx: number[] = []
    const hw = W / 2
    for (let i = 0; i <= S; i++) {
      const y = (i / S) * H
      pos.push(-hw, y, 0, hw, y, 0)
      nor.push(0, 0, 1, 0, 0, 1)
    }
    for (let i = 0; i < S; i++) {
      const a = i * 2
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
    g.setIndex(idx)
    return g
  }

  // Rải tối đa `planned` lá (jitter-grid) + xoay Y ngẫu nhiên; BỎ lá rơi vào rect loại trừ
  // (footprint foundation). Trả số lá thực ghi (w). B0: scale 1 (cao-thấp = bước sau).
  private _scatter(o: typeof DEFAULTS, planned: number, exclude: GrassExcludeRect[]): number {
    const mesh = this.mesh
    if (!mesh) return 0
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    const p = new THREE.Vector3()
    const s = new THREE.Vector3(1, 1, 1)
    const cols = Math.max(1, Math.ceil(Math.sqrt(planned * (o.width / o.depth))))
    const rows = Math.ceil(planned / cols)
    const cw = o.width / cols
    const cd = o.depth / rows
    let w = 0
    for (let n = 0; n < planned; n++) {
      const c = n % cols
      const r = Math.floor(n / cols)
      const px = -o.width / 2 + (c + Math.random()) * cw
      const pz = -o.depth / 2 + (r + Math.random()) * cd
      if (inExcluded(px, pz, exclude)) continue // dưới foundation → không mọc cỏ
      p.set(px, o.baseY, pz)
      q.setFromAxisAngle(up, Math.random() * 6.283)
      mesh.setMatrixAt(w++, m.compose(p, q, s))
    }
    mesh.instanceMatrix.needsUpdate = true
    return w
  }
}

// Điểm (px,pz) (m, world XZ) có nằm trong rect loại trừ nào không (đã xoay rotY). Rect đối xứng nên
// dấu xoay không ảnh hưởng với rotY ∈ {0,90,180,270} (case duy nhất hiện có).
function inExcluded(px: number, pz: number, rects: GrassExcludeRect[]): boolean {
  for (const r of rects) {
    const dx = px - r.cx
    const dz = pz - r.cz
    const cos = Math.cos(r.rot)
    const sin = Math.sin(r.rot)
    const lx = cos * dx + sin * dz // world → local rect (xoay -rot)
    const lz = -sin * dx + cos * dz
    if (Math.abs(lx) <= r.halfW && Math.abs(lz) <= r.halfD) return true
  }
  return false
}
