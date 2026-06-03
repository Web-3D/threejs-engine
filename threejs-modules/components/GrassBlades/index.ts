/**
 * VỊ TRÍ   — threejs-modules/components/GrassBlades/index.ts
 * VAI TRÒ  — Cỏ 3D (tier B, material-roadmap): InstancedMesh lá geometry rải trên nền lô.
 *            Lá đứng 2 MẶT (ngoài +Z lồi / trong -Z lõm, TÔ KHÁC MÀU): Cao + Rộng + Số đốt + Thon ngọn + Cong T→P + Cong dọc + Cụp (1 chiều) + bụi.
 *            preview (1 lá) DÙNG CHUNG model với bãi → trông y hệt nhau. Màu-gradient/bend-3D/
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
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { float, frontFacing, mix, uniform } from 'three/tsl'
import { MeshStandardNodeMaterial } from 'three/webgpu'

const DEFAULTS = {
  width: 12, // m — bề ngang vùng rải (X)
  depth: 9.6, // m — chiều sâu vùng rải (Z)
  baseY: 0.01, // m — cao độ gốc lá (= mặt trên nền)
  density: 100, // lá/m²
  maxBlades: 24000, // trần count (budget) — accent-only
  bladeHeight: 0.28, // m
  bladeWidth: 0.006, // m (6mm) — bề rộng GỐC lá (t=0)
  midWidth: 0.006, // m — bề rộng THÂN lá (t=0.5), độc lập gốc
  segments: 5, // số đốt dọc (độ mịn strip)
  taper: 0.7, // B1 — thon ngọn 0..1 (0 = chữ nhật, 1 = nhọn đỉnh; mép cong ellipse từ thân lên)
  curveLR: 0, // cong trái→phải -1..1 (dời tâm X = curveLR·H·t²; 0 = thẳng)
  bend: 0, // cong DỌC 0..1 (1 chiều): dời Z = bend·H·t² → mặt NGOÀI (+Z) lồi ra; gốc thẳng→ngọn ngả
  cup: 0, // cụp 0..1 (1 chiều, cường độ): mặt TRONG (-Z) lõm vào. SHADER normal (rẻ) / GEOMETRY nếu cupGeo.
  cupGeo: false, // BẬT = fold GEOMETRY thật (trục giữa, cross-section cong) thay vì shader — tốn ×3 tris, cận cảnh. Mặc định ẩn/tắt.
  bladesPerClump: 1, // số lá/CỤM (bụi). 1 = lá đơn; >1 = gộp K lá (lệch vị trí/xoay/cao) vào 1 instance
  clumpRadius: 0.04, // m — bán kính xòe bụi (4cm)
  clumpSplay: 0.45, // rad (~26°) — nghiêng ngọn lá RA NGOÀI tâm bụi → xòe ra, bớt đâm xuyên nhau
  color: 0x4f7a33 as THREE.ColorRepresentation, // 1 màu lá (B0); gradient = bước sau
}

// Số ô ngang khi BẬT geometry fold (cupGeo=true): 4 điểm/hàng → cross-section cong mượt (thấy cận cảnh).
// Tốn ×3 tris (segments·6/lá). Shader mode (cupGeo=false) giữ 2 đỉnh (segments·2, rẻ) — cụp chỉ ở normal.
const CUP_SEGS = 3

// Mặt TRONG (-Z) nhân màu < 1 → tối hơn mặt NGOÀI (+Z) → "đánh dấu" 2 mặt rõ (kiểu lá thật two-tone).
const INNER_MUL = 0.5

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
  /** Rộng GỐC lá (m, t=0). Default 0.006 */
  bladeWidth?: number
  /** Rộng THÂN lá (m, t=0.5). Default 0.006 */
  midWidth?: number
  /** Số đốt dọc lá. Default 5 */
  segments?: number
  /** B1 — độ thon ngọn 0..1 (0 = chữ nhật, 1 = nhọn đỉnh, mép cong ellipse). Default 0.7 */
  taper?: number
  /** Cong trái→phải -1..1 (dời tâm X theo t²; 0 = thẳng). Default 0 */
  curveLR?: number
  /** Cong DỌC 0..1 (1 chiều): mặt ngoài +Z lồi ra (Z = bend·H·t²); 0 = đứng thẳng. Default 0 */
  bend?: number
  /** Cụp 0..1 (1 chiều, cường độ): mặt trong -Z lõm vào. Shader normal / geometry nếu cupGeo. Default 0 */
  cup?: number
  /** BẬT geometry fold thật cho cụp (trục giữa, ×3 tris, cận cảnh) thay vì shader normal. Default false */
  cupGeo?: boolean
  /** Số lá mỗi cụm/bụi (1 = lá đơn). Rải cụm = count/K → tổng lá ~giữ (budget-neutral). Default 1 */
  bladesPerClump?: number
  /** Bán kính xòe bụi (m). Default 0.04 */
  clumpRadius?: number
  /** Nghiêng ngọn lá ra ngoài tâm bụi (rad) → xòe, bớt đâm xuyên. Default 0.45 (~26°) */
  clumpSplay?: number
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
    const plannedBlades = Math.max(1, Math.min(o.maxBlades, Math.round(o.density * o.width * o.depth)))
    const k = Math.max(1, Math.round(o.bladesPerClump))
    const planned = Math.ceil(plannedBlades / k) // rải CỤM (count/K) → tổng lá ~giữ nguyên (budget-neutral)
    this.uColor = uniform(new THREE.Color(o.color))

    this.geo = this._buildClumpGeo(o, k) // K=1 → 1 lá; K>1 → bụi K lá gộp 1 geometry

    this.material = new MeshStandardNodeMaterial()
    // 2 mặt 2 màu: mặt NGOÀI (+Z = frontFacing) màu đầy; mặt TRONG (-Z) tối hơn ×INNER_MUL → đánh dấu trong/ngoài.
    this.material.colorNode = mix(this.uColor.mul(INNER_MUL), this.uColor, float(frontFacing))
    this.material.roughness = 0.86
    this.material.metalness = 0
    this.material.side = THREE.DoubleSide

    // Cấp buffer theo planned (số CỤM); rải né footprint → trả số cụm THỰC, gán mesh.count (≤ planned).
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

  // 1 lá = strip/lưới đứng (y:0→H, S đốt). Bề rộng 3 chốt gốc→thân→ngọn (bladeHalfWidth).
  // Tâm dời X = curveLR·H·t² (cong T→P) + Z = bend·H·t² (cong DỌC, ngả — mặt chiếu cạnh Y-Z).
  // CỤP 2 lựa chọn: cupGeo=false → SHADER (2 đỉnh, normal nghiêng gain cao, ZERO tris, silhouette phẳng);
  // cupGeo=true → GEOMETRY fold thật (CUP_SEGS+1 điểm/hàng, mép lệch Z=cup·hw·u², normal khớp hình) — ×3 tris.
  private _buildBladeGeo(o: typeof DEFAULTS): THREE.BufferGeometry {
    const { segments: S, bladeHeight: H, bladeWidth: Wb, midWidth: Wm } = o
    const { taper, curveLR, bend, cup, cupGeo } = o
    const cols = cupGeo ? CUP_SEGS : 1 // geometry fold → chia ngang; shader → 2 đỉnh
    const gain = cupGeo ? 2 : CUP_NORMAL_GAIN // geometry: normal = đạo hàm thật; shader: phóng đại cho rõ
    const baseHW = Wb / 2
    const midHW = Wm / 2
    const pos: number[] = []
    const nor: number[] = []
    for (let i = 0; i <= S; i++) {
      const t = i / S
      const y = t * H
      const hw = bladeHalfWidth(t, baseHW, midHW, taper)
      const xc = curveLR * H * t * t // cong T→P (dời X)
      const zc = bend * H * t * t // cong dọc (dời Z, ngả gốc→ngọn)
      for (let j = 0; j <= cols; j++) {
        const u = (j / cols) * 2 - 1 // -1 mép trái → +1 mép phải
        const zFold = cupGeo ? -cup * hw * u * u : 0 // fold THẬT (geometry): mép lệch -Z (mặt TRONG lõm)
        pos.push(u * hw + xc, y, zFold + zc)
        pushCupNormal(nor, cup, u, gain)
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
    g.setIndex(gridIndices(S, cols))
    return g
  }

  // Bụi cỏ = K lá gộp 1 geometry: lệch golden-angle + cao thấp DETERMINISTIC (ổn định, không nhấp nháy).
  // Mỗi lá XOAY để mặt NGOÀI (+Z) hướng RA NGOÀI tâm → mặt TRONG quay VÀO TÂM; NGHIÊNG ngọn ra ngoài
  // (clumpSplay) → xòe như bụi thật + bớt đâm xuyên. K=1 → 1 lá. Rải cụm (budget-neutral).
  private _buildClumpGeo(o: typeof DEFAULTS, k: number): THREE.BufferGeometry {
    const blade = this._buildBladeGeo(o)
    if (k <= 1) return blade
    const parts: THREE.BufferGeometry[] = []
    const m = new THREE.Matrix4()
    const qFace = new THREE.Quaternion()
    const qTilt = new THREE.Quaternion()
    const q = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    const xAxis = new THREE.Vector3(1, 0, 0)
    const p = new THREE.Vector3()
    const s = new THREE.Vector3()
    for (let i = 0; i < k; i++) {
      const ang = i * 2.399963 // golden angle → xòe đều không chồng
      const r = o.clumpRadius * Math.sqrt(i / k) // tâm → mép, tỏa dần đều mật độ
      p.set(Math.cos(ang) * r, 0, Math.sin(ang) * r)
      s.set(1, 0.78 + 0.44 * ((i * 0.618) % 1), 1) // cao thấp xen kẽ (deterministic)
      qFace.setFromAxisAngle(up, Math.PI / 2 - ang) // +Z (mặt ngoài) hướng ra ngoài → mặt trong vào tâm
      qTilt.setFromAxisAngle(xAxis, o.clumpSplay) // nghiêng ngọn ra ngoài (local X) → xòe, bớt đâm xuyên
      q.multiplyQuaternions(qFace, qTilt) // tilt local trước, rồi quay hướng tâm
      parts.push(blade.clone().applyMatrix4(m.compose(p, q, s)))
    }
    blade.dispose()
    const merged = mergeGeometries(parts)
    for (const part of parts) part.dispose()
    return merged ?? this._buildBladeGeo(o)
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

// Nửa bề rộng lá tại t (0 gốc→1 ngọn): gốc→thân (t≤0.5) lerp tuyến tính; thân→ngọn (t>0.5) thon
// theo taper (mép ellipse). Liên tục tại t=0.5 (đều = midHW).
function bladeHalfWidth(t: number, baseHW: number, midHW: number, taper: number): number {
  if (t <= 0.5) return baseHW + (midHW - baseHW) * (t / 0.5)
  const u = (t - 0.5) / 0.5
  return midHW * (1 - taper + taper * Math.sqrt(1 - u * u))
}

// Hệ số nghiêng normal mép ở SHADER mode: lớn = 2 mép ăn sáng gắt hơn ("dáng lá" rõ trên strip phẳng). 2 hơi nhạt → 4.
// (Geometry mode dùng gain=2 = đạo hàm thật của fold z∝u² để normal khớp hình.)
const CUP_NORMAL_GAIN = 4

// Normal "cụp" tại u∈[-1,1]: mặt lõm về -Z (z=-cup·hw·u², mặt TRONG) → normal ∝ (gain·cup·u, 0, 1) chuẩn hoá,
// thân normal hướng +Z (mặt NGOÀI lồi). gain lớn = phóng đại (shader); gain=2 = đạo hàm thật (khớp geometry fold).
// cup≥0 (1 chiều) → cụp về mặt trong; cup=0 → (0,0,1) phẳng. Độc lập hw → góc cụp đều dọc lá.
function pushCupNormal(nor: number[], cup: number, u: number, gain: number): void {
  const nx = gain * cup * u
  const inv = 1 / Math.hypot(nx, 1)
  nor.push(nx * inv, 0, inv)
}

// Index lưới S đốt dọc × cols ô ngang → 2 tam giác/ô. Winding giữ mặt +Z (khớp strip 2 đỉnh khi cols=1).
function gridIndices(S: number, cols: number): number[] {
  const idx: number[] = []
  const stride = cols + 1
  for (let i = 0; i < S; i++) {
    for (let j = 0; j < cols; j++) {
      const a = i * stride + j
      idx.push(a, a + 1, a + stride, a + 1, a + stride + 1, a + stride)
    }
  }
  return idx
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
