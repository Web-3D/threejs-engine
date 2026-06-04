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
import { clamp, color, float, frontFacing, mix, positionLocal, uniform, uv, vec3 } from 'three/tsl'
import { MeshBasicNodeMaterial, MeshStandardNodeMaterial } from 'three/webgpu'

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
  cupNormalGain: 4, // độ NGHIÊNG normal tạo cụp (SHADER mode): lớn = ăn sáng cụp gắt hơn (nhân với cup)
  bladesPerClump: 1, // số lá/CỤM (bụi). 1 = lá đơn; >1 = gộp K lá (lệch vị trí/xoay/cao) vào 1 instance
  clumpRadius: 0.04, // m — bán kính xòe bụi (4cm)
  clumpSplay: 0.45, // rad (~26°) — nghiêng ngọn lá RA NGOÀI tâm bụi → xòe ra, bớt đâm xuyên nhau
  color: 0x4f7a33 as THREE.ColorRepresentation, // màu MẶT NGOÀI (+Z)
  innerColor: 0x273d19 as THREE.ColorRepresentation, // màu MẶT TRONG (-Z) — mặc định ~0.5× ngoài
  shadowDark: 0.2, // bóng gốc mặt trong: nhân màu ở gốc (0 = đen kịt, 1 = tắt bóng)
  shadowSpan: 1 / 6, // bóng gốc vươn tới đâu (tỉ lệ thân lá; mặc định 1/6)
  contactDark: 0.45, // vệt tối TIẾP ĐẤT dưới gốc lá: độ đậm alpha (0 = tắt, không dựng mesh). Đậm vừa để
  //                    lọt khe lá vẫn thấy ở bãi dày (nền cỏ xanh che + chồng nhau tự đậm thêm ở chỗ dày)
  contactRadius: 0.07, // m — bề RỘNG NGANG vệt (live). Rộng để phủ kín khe giữa lá → nền gốc liền 1 mảng tối
}

// Số ô ngang khi BẬT geometry fold (cupGeo=true): 4 điểm/hàng → cross-section cong mượt (thấy cận cảnh).
// Tốn ×3 tris (segments·6/lá). Shader mode (cupGeo=false) giữ 2 đỉnh (segments·2, rẻ) — cụp chỉ ở normal.
const CUP_SEGS = 3

// 2 mặt 2 MÀU RIÊNG (mặt ngoài +Z = uColor, mặt trong -Z = uInnerColor) qua frontFacing → two-tone.
// (Bóng GỐC mặt trong = uniform uShadowDark/uShadowSpan → chỉnh live qua setter, GUI điều khiển.)

// Vệt TIẾP ĐẤT (ground contact): quad phẳng tối, 1 vệt/LÁ từ gốc → "cắm" cỏ xuống đất, hết trôi (fake AO
// kiểu foliage — KHÔNG shadow map, mọi cỡ bãi đều rẻ). HƯỚNG + ĐỘ DÀI = theo MẶT TRỜI (uniform, LIVE):
// vệt đổ NGƯỢC phía sun; sun lên CAO → vệt NGẮN (len = cao_lá / tan(góc cao); sun thấp → dài). Mọi vệt song
// song → khớp hướng bóng nhà. Gốc/đậm/rộng = uniform LIVE; sun đổi chỉ cập nhật uniform, KHÔNG dựng lại.
const CONTACT_LIFT = 0.001 // m — nâng 1mm trên nền tránh z-fight với slab
const CONTACT_MAX_LEN = 8 // trần độ dài vệt = cao_lá × hệ số (chặn vô cực khi sun gần chân trời)
// Đậm vệt LIÊN KẾT góc cao sun: nắng đỉnh → đậm/gắt (sáng trực diện), nắng thấp → nhạt (xiên, loãng).
// hệ số = MIN + (MAX−MIN)·sin(góc cao). Đậm hiệu lực = base(slider) × hệ số (clamp ≤1).
const CONTACT_ELEV_MIN_K = 0.35 // còn lại khi sun ở chân trời (mờ nhưng không tắt hẳn)
const CONTACT_ELEV_MAX_K = 1.2 // boost khi sun lên đỉnh (đậm hơn base)

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
  /** Độ nghiêng normal tạo cụp (shader mode); lớn = ăn sáng cụp gắt hơn (× với cup). Default 4 */
  cupNormalGain?: number
  /** Số lá mỗi cụm/bụi (1 = lá đơn). Rải cụm = count/K → tổng lá ~giữ (budget-neutral). Default 1 */
  bladesPerClump?: number
  /** Bán kính xòe bụi (m). Default 0.04 */
  clumpRadius?: number
  /** Nghiêng ngọn lá ra ngoài tâm bụi (rad) → xòe, bớt đâm xuyên. Default 0.45 (~26°) */
  clumpSplay?: number
  /** Màu lá mặt NGOÀI (+Z). Default 0x4f7a33 */
  color?: THREE.ColorRepresentation
  /** Màu lá mặt TRONG (-Z). Default 0x273d19 (~0.5× ngoài) */
  innerColor?: THREE.ColorRepresentation
  /** Bóng gốc mặt trong — nhân màu ở gốc (0 = đen, 1 = tắt). Default 0.2 */
  shadowDark?: number
  /** Bóng gốc vươn tới đâu (tỉ lệ thân lá). Default 1/6 */
  shadowSpan?: number
  /** Vệt tối tiếp đất dưới gốc lá — độ đậm alpha (0 = tắt, không dựng mesh). Default 0.45 */
  contactDark?: number
  /** Bề rộng ngang vệt tiếp đất (m) — live (độ dài theo góc nắng qua setSun). Default 0.07 */
  contactRadius?: number
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
  private readonly uInnerColor: ReturnType<typeof uniform>
  private readonly uShadowDark: ReturnType<typeof uniform> // bóng gốc mặt trong (đậm) — live
  private readonly uShadowSpan: ReturnType<typeof uniform> // bóng gốc vươn tới đâu (tỉ lệ thân) — live
  private contactMesh: THREE.InstancedMesh | null = null // vệt tiếp đất (CON của mesh lá)
  private contactGeo: THREE.BufferGeometry | null = null
  private contactMat: MeshBasicNodeMaterial | null = null
  private contactDescs: { ox: number; oz: number }[] = [] // mỗi lá: gốc (clump-local); hướng/dài = sun (uniform)
  private readonly uContactDark: ReturnType<typeof uniform> // đậm vệt (alpha) — live
  private readonly uContactRadius: ReturnType<typeof uniform> // rộng vệt (m, ngang) — live
  private readonly uSunDx: ReturnType<typeof uniform> // hướng bóng (ngược sun) — world X, live theo sun
  private readonly uSunDz: ReturnType<typeof uniform> // hướng bóng — world Z
  private readonly uSunLen: ReturnType<typeof uniform> // độ dài vệt (m) = cao_lá / tan(góc cao sun)
  private readonly bladeH: number // cao lá (m) — tính độ dài vệt theo góc sun
  private contactBaseDark = 0 // đậm vệt NỀN (slider) trước khi nhân hệ số góc-cao-sun
  private contactElevK = 1 // hệ số đậm theo góc cao sun (đỉnh→đậm, thấp→nhạt); uContactDark = base × hệ số

  constructor(opts: GrassBladesOptions = {}) {
    const o = { ...DEFAULTS, ...opts }
    const plannedBlades = Math.max(
      1,
      Math.min(o.maxBlades, Math.round(o.density * o.width * o.depth))
    )
    const k = Math.max(1, Math.round(o.bladesPerClump))
    const planned = Math.ceil(plannedBlades / k) // rải CỤM (count/K) → tổng lá ~giữ nguyên (budget-neutral)
    this.uColor = uniform(new THREE.Color(o.color))
    this.uInnerColor = uniform(new THREE.Color(o.innerColor))
    this.uShadowDark = uniform(o.shadowDark)
    this.uShadowSpan = uniform(o.shadowSpan)
    this.uContactDark = uniform(o.contactDark)
    this.uContactRadius = uniform(o.contactRadius)
    this.uSunDx = uniform(0)
    this.uSunDz = uniform(-1)
    this.uSunLen = uniform(o.bladeHeight * 0.7)
    this.bladeH = o.bladeHeight
    this.contactBaseDark = o.contactDark // base; đậm hiệu lực = base × hệ số góc sun (setSun cập nhật)

    this.geo = this._buildClumpGeo(o, k) // K=1 → 1 lá; K>1 → bụi K lá gộp 1 geometry

    this.material = new MeshStandardNodeMaterial()
    // 2 mặt 2 MÀU RIÊNG (ngoài=uColor / trong=uInnerColor qua frontFacing) + BÓNG GỐC mặt trong (live).
    const ff = float(frontFacing) // 1 = mặt ngoài, 0 = mặt trong
    const base = mix(this.uInnerColor, this.uColor, ff)
    const shadow = clamp(uv().y.div(this.uShadowSpan).oneMinus(), 0, 1).mul(ff.oneMinus()) // gốc→1, ≥span→0; chỉ mặt trong
    this.material.colorNode = base.mul(mix(float(1), this.uShadowDark, shadow))
    this.material.roughness = 0.86
    this.material.metalness = 0
    this.material.side = THREE.DoubleSide

    // Cấp buffer theo planned (số CỤM); rải né footprint → trả số cụm THỰC, gán mesh.count (≤ planned).
    this.mesh = new THREE.InstancedMesh(this.geo, this.material, planned)
    this.mesh.castShadow = false
    this.mesh.receiveShadow = true // nhận bóng nhà đổ xuống (rẻ)
    this.mesh.frustumCulled = false // 1 draw — tắt cho an toàn
    if (o.contactDark > 0) this._buildContact(o, planned, k) // vệt tiếp đất (con của mesh lá, rải cùng _scatter)
    this.count = this._scatter(o, planned, opts.exclude ?? [])
    this.mesh.count = this.count
  }

  /** Màu lá mặt NGOÀI — live (uniform, không dựng lại material). */
  setColor(c: THREE.ColorRepresentation): void {
    if (this.isDisposed) return
    ;(this.uColor.value as THREE.Color).set(c)
  }

  /** Màu lá mặt TRONG — live. */
  setInnerColor(c: THREE.ColorRepresentation): void {
    if (this.isDisposed) return
    ;(this.uInnerColor.value as THREE.Color).set(c)
  }

  /** Bóng gốc mặt trong — độ đậm (nhân màu ở gốc; 0 = đen, 1 = tắt). LIVE. */
  setShadowDark(v: number): void {
    if (this.isDisposed) return
    this.uShadowDark.value = Math.max(0, Math.min(1, v))
  }

  /** Bóng gốc — vươn tới đâu (tỉ lệ thân lá). LIVE. */
  setShadowSpan(v: number): void {
    if (this.isDisposed) return
    this.uShadowSpan.value = Math.max(0.001, Math.min(1, v))
  }

  /** Vệt tiếp đất — độ đậm NỀN (alpha 0..1). Đậm hiệu lực = base × hệ-số-góc-cao-sun (setSun). LIVE
   *  (chỉ hiệu lực khi mesh vệt đã dựng: contactDark>0 lúc tạo). */
  setContactDark(v: number): void {
    if (this.isDisposed) return
    this.contactBaseDark = Math.max(0, Math.min(1, v))
    this._applyContactDark()
  }

  // Đậm vệt hiệu lực = base(slider) × hệ-số-góc-cao-sun, clamp ≤1 → ghi uniform. Gọi từ setContactDark + setSun.
  private _applyContactDark(): void {
    this.uContactDark.value = Math.min(1, this.contactBaseDark * this.contactElevK)
  }

  /** Vệt tiếp đất — bán kính ngang (m). LIVE (scale trong shader). */
  setContactRadius(v: number): void {
    if (this.isDisposed) return
    this.uContactRadius.value = Math.max(0.001, v)
  }

  /** Hướng + độ dài + ĐẬM vệt tiếp đất theo MẶT TRỜI. Truyền vector hướng TỚI mặt trời (vd light.position,
   *  target ở gốc): vệt đổ ngược phía sun; sun lên cao → NGẮN + ĐẬM, sun thấp → DÀI + NHẠT. LIVE (uniform). */
  setSun(x: number, y: number, z: number): void {
    if (this.isDisposed) return
    const hlen = Math.hypot(x, z) || 1e-4
    this.uSunDx.value = -x / hlen // hướng bóng = ngược hình chiếu ngang của sun
    this.uSunDz.value = -z / hlen
    const elev = Math.atan2(Math.max(1e-4, y), hlen) // góc cao mặt trời (rad)
    this.uSunLen.value = Math.min(
      this.bladeH * CONTACT_MAX_LEN,
      this.bladeH / Math.tan(Math.max(0.08, elev))
    )
    const span = CONTACT_ELEV_MAX_K - CONTACT_ELEV_MIN_K
    this.contactElevK = CONTACT_ELEV_MIN_K + span * Math.sin(elev) // đỉnh→MAX, chân trời→MIN
    this._applyContactDark()
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
    this.mesh?.parent?.remove(this.mesh) // contactMesh là con → đi theo
    this.geo?.dispose()
    this.material?.dispose()
    this.contactGeo?.dispose()
    this.contactMat?.dispose()
    this.mesh = null
    this.geo = null
    this.material = null
    this.contactMesh = null
    this.contactGeo = null
    this.contactMat = null
    this.isDisposed = true
  }

  // ── Private ────────────────────────────────────────────────────────────────

  // 1 lá = strip/lưới đứng (y:0→H, S đốt). Bề rộng 3 chốt gốc→thân→ngọn (bladeHalfWidth).
  // Tâm dời X = curveLR·H·t² (cong T→P) + Z = bend·H·t² (cong DỌC, ngả — mặt chiếu cạnh Y-Z).
  // CỤP 2 lựa chọn: cupGeo=false → SHADER (2 đỉnh, normal nghiêng gain cao, ZERO tris, silhouette phẳng);
  // cupGeo=true → GEOMETRY fold thật (CUP_SEGS+1 điểm/hàng, mép lệch Z=cup·hw·u², normal khớp hình) — ×3 tris.
  private _buildBladeGeo(o: typeof DEFAULTS): THREE.BufferGeometry {
    const { segments: S, bladeHeight: H, bladeWidth: Wb, midWidth: Wm } = o
    const { taper, curveLR, bend, cup, cupGeo, cupNormalGain } = o
    const cols = cupGeo ? CUP_SEGS : 1 // geometry fold → chia ngang; shader → 2 đỉnh
    const gain = cupGeo ? 2 : cupNormalGain // geometry: normal = đạo hàm thật; shader: gain chỉnh được (GUI)
    const baseHW = Wb / 2
    const midHW = Wm / 2
    const pos: number[] = []
    const nor: number[] = []
    const uvs: number[] = [] // uv.y = t (0 gốc→1 ngọn) → shader đọc chiều cao (bóng gốc); uv.x = ngang 0..1
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
        uvs.push((u + 1) / 2, t)
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
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

  // Vệt tiếp đất: InstancedMesh QUAD phẳng (unlit đen, alpha ellipse mềm), 1 vệt/LÁ. Quad UNIT (±1)
  // → bán kính scale bằng uContactRadius (live); hướng/độ dài ellipse = per-instance scale lệch trục theo
  // độ NGẢ lá (_emitContacts). CON của mesh lá → caller add 1 lần. KHÔNG cast/receive (fake AO). Capacity
  // = planned·k (mỗi cụm k lá → k vệt). Rải cùng _scatter (cùng vị trí cụm/yaw để vệt khớp gốc lá).
  private _buildContact(o: typeof DEFAULTS, planned: number, k: number): void {
    this.contactDescs = this._contactDescs(o, k)
    this.contactGeo = contactQuad() // quad SUY BIẾN (đỉnh ở gốc) → instanceMatrix·0 = gốc lá, positionNode .add nở ra
    this.contactMat = new MeshBasicNodeMaterial()
    this.contactMat.colorNode = color(0x000000)
    // Nở vệt từ uv + sun: dọc = uv.x·len theo hướng bóng (uSunD); ngang = (uv.y−0.5)·2·rộng theo perp(−dz,dx).
    const along = uv().x.mul(this.uSunLen) // 0 gốc lá → uSunLen ở ngọn vệt
    const across = uv().y.sub(0.5).mul(this.uContactRadius).mul(2) // ∓rộng
    const ox = this.uSunDx.mul(along).sub(this.uSunDz.mul(across))
    const oz = this.uSunDz.mul(along).add(this.uSunDx.mul(across))
    // .add (KHÔNG replace): positionLocal = gốc lá đã instance → cộng vệt → GIỮ instance (replace = mất hết!).
    this.contactMat.positionNode = positionLocal.add(vec3(ox, 0, oz))
    const edge = uv().y.sub(0.5).mul(2).abs() // 0 giữa → 1 mép
    this.contactMat.opacityNode = this.uContactDark.mul(
      clamp(uv().x.oneMinus().mul(edge.oneMinus()), 0, 1)
    )
    this.contactMat.transparent = true
    this.contactMat.depthWrite = false
    this.contactMat.side = THREE.DoubleSide
    const cm = new THREE.InstancedMesh(this.contactGeo, this.contactMat, planned * k)
    cm.castShadow = false
    cm.receiveShadow = false
    cm.frustumCulled = false
    this.mesh?.add(cm) // con của mesh lá
    this.contactMesh = cm
  }

  // Gốc mỗi LÁ trong cụm (clump-local, khớp p_i của _buildClumpGeo). Hướng/độ dài vệt KHÔNG ở đây — do sun
  // (uniform) quyết định trong shader → mọi vệt song song. k=1: lá đơn ở gốc.
  private _contactDescs(o: typeof DEFAULTS, k: number): typeof this.contactDescs {
    if (k <= 1) return [{ ox: 0, oz: 0 }]
    const descs: typeof this.contactDescs = []
    for (let i = 0; i < k; i++) {
      const ang = i * 2.399963
      const r = o.clumpRadius * Math.sqrt(i / k)
      descs.push({ ox: Math.cos(ang) * r, oz: Math.sin(ang) * r })
    }
    return descs
  }

  // Ghi vệt cho 1 cụm tại (px,pz) xoay yaw: mỗi lá → 1 quad ở GỐC lá (tịnh tiến thuần — hướng vệt do sun trong
  // positionNode, KHÔNG xoay theo cụm để mọi vệt song song hướng nắng). Trả ci (chỉ số vệt) mới.
  private _emitContacts(px: number, pz: number, yaw: number, baseY: number, ci: number): number {
    const cm = this.contactMesh
    if (!cm) return ci
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion() // identity
    const pos = new THREE.Vector3()
    const scl = new THREE.Vector3(1, 1, 1)
    const cos = Math.cos(yaw)
    const sin = Math.sin(yaw)
    for (const dsc of this.contactDescs) {
      pos.set(
        px + dsc.ox * cos + dsc.oz * sin,
        baseY + CONTACT_LIFT,
        pz - dsc.ox * sin + dsc.oz * cos
      )
      cm.setMatrixAt(ci++, m.compose(pos, q, scl))
    }
    return ci
  }

  // Rải tối đa `planned` cụm (jitter-grid) + xoay Y ngẫu nhiên; BỎ cụm rơi vào rect loại trừ
  // (footprint foundation). Trả số cụm thực ghi (w). Vệt tiếp đất (nếu có) ghi cùng index, cùng vị trí.
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
    let ci = 0 // chỉ số vệt (mỗi cụm ghi k vệt → tách khỏi w)
    for (let n = 0; n < planned; n++) {
      const c = n % cols
      const r = Math.floor(n / cols)
      const px = -o.width / 2 + (c + Math.random()) * cw
      const pz = -o.depth / 2 + (r + Math.random()) * cd
      if (inExcluded(px, pz, exclude)) continue // dưới foundation → không mọc cỏ
      const yaw = Math.random() * 6.283
      p.set(px, o.baseY, pz)
      q.setFromAxisAngle(up, yaw)
      mesh.setMatrixAt(w, m.compose(p, q, s))
      if (this.contactMesh) ci = this._emitContacts(px, pz, yaw, o.baseY, ci) // k vệt khớp gốc lá + hướng ngả
      w++
    }
    mesh.instanceMatrix.needsUpdate = true
    if (this.contactMesh) {
      this.contactMesh.instanceMatrix.needsUpdate = true
      this.contactMesh.count = ci
    }
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

// Quad SUY BIẾN cho vệt tiếp đất: 4 đỉnh ở GỐC (0,0,0) + uv 4 góc. InstanceNode cho positionLocal = gốc lá
// (instanceMatrix·0 = tịnh tiến thuần); positionNode `.add` nở quad ra từ uv+sun → GIỮ instance (positionNode
// replace sẽ ghi đè làm rớt instanceMatrix → mọi vệt dồn về gốc bãi). MeshBasic không lit, NHƯNG pipeline TSL
// WebGPU vẫn tham chiếu attribute `normal` → THIẾU = spam "TSL.NormalNode: normal not found" MỖI frame (mesh
// instanced lớn → flood console, DevTools mở lúc kéo = giật giả). Thêm normal (0,0,1) thuần để câm cảnh báo.
function contactQuad(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry()
  g.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 3)
  )
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2))
  g.setIndex([0, 2, 1, 2, 3, 1])
  return g
}

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
