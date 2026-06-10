/**
 * VỊ TRÍ   — threejs-modules/components/CurvedBrickWall/index.ts
 * VAI TRÒ  — TƯỜNG GẠCH CONG đứng tự do (tường vườn/rào trang trí): thân vữa CONG theo cung tròn
 *            (radius + góc quét, 360° = vòng kín) + viên gạch running-bond nhô CẢ 2 MẶT + DECAY tuổi
 *            (mất viên lộ vữa + thụt + xoay lệch + sạm). 3 draw (thân + 2 lớp viên). Deterministic seed.
 * LIÊN HỆ  — TỔ HỢP 4 OP kệ ops (asset = op cũ chồng nhau): #1 resampleCurve (spine đốt đều) →
 *            #2 sweepInto (thân cong liền) → #3 rowsOnSurface (viên ĐẾM THEO CHIỀU DÀI THẬT từng hàng,
 *            stagger = bond) + copyToPoints → #5 mulberry32 (decay). Anh em InstancedBrickWall (tường
 *            THẲNG, lỗ cửa cull) + BrickPaving (sân NẰM). Site-kit: zoneKind 'wall' (addWallCurveMesh).
 *
 * LƯU Ý CONG: viên = box THẲNG trên mặt cong → R nhỏ + viên dài thì dây cung hở góc; sagitta = L²/8R
 *            (0.215m trên R1m ≈ 6mm < protrude 12mm — ổn). R < 0.5m nên rút brickL.
 *
 * CÁCH DÙNG: const w = new CurvedBrickWall({ radius: 2, sweepDeg: 120, decay: 0.3 })
 *            scene.add(w.getMesh()) // local: TÂM CUNG (0,0), chân tường y=0 — caller đặt transform
 * DISPOSE: dispose() — geo + material NỘI BỘ + 2 InstancedMesh, gỡ khỏi parent; material NGOÀI không đụng.
 */

import * as THREE from 'three'

import { copyToPoints, rowsOnSurface, type SurfacePoint } from '../../ops/copy-to-points'
import { resampleCurve } from '../../ops/resample'
import { mulberry32 } from '../../ops/scatter'
import { rectProfile, sweepInto } from '../../ops/sweep'

export interface CurvedBrickWallOptions {
  radius?: number // m — bán kính cung (đường TIM tường). Default 2
  sweepDeg?: number // độ — góc quét cung (10..360; 360 = vòng tròn kín). Default 120
  height?: number // m — cao tường. Default 1
  thickness?: number // m — dày thân vữa. Default 0.1
  brickL?: number // m — dài mặt lộ viên. Default 0.215 (UK — như InstancedBrickWall)
  brickH?: number // m — cao mặt lộ viên. Default 0.065
  protrude?: number // m — độ nhô viên khỏi thân = sâu mạch. Default 0.012
  joint?: number // m — mạch vữa. Default 0.01
  seed?: number // deterministic — đổi viên rụng/lệch (decay). Default 7
  decay?: number // 0..1 — tuổi tường: mất viên + thụt + xoay lệch + sạm. Default 0
  brickColor?: THREE.ColorRepresentation // Default 0xb86042 (terra cotta — khớp InstancedBrickWall)
  mortarColor?: THREE.ColorRepresentation // thân vữa. Default 0xc7c4be
  colorVariation?: number // 0..1 — jitter sáng/tối từng viên. Default 0.12
  material?: THREE.Material // material NGOÀI cho VIÊN (caller-owned, vd triplanar) — KHÔNG dispose
}

type Resolved = Required<Omit<CurvedBrickWallOptions, 'material'>> & { material?: THREE.Material }

// Defaults tách 2 hàm nhỏ — eslint complexity đếm TỪNG `??` (gom 1 chỗ là vượt trần 10).
function curveDims(
  o: CurvedBrickWallOptions
): Pick<Resolved, 'radius' | 'sweepDeg' | 'height' | 'thickness' | 'brickL' | 'brickH'> {
  return {
    radius: o.radius ?? 2,
    sweepDeg: o.sweepDeg ?? 120,
    height: o.height ?? 1,
    thickness: o.thickness ?? 0.1,
    brickL: o.brickL ?? 0.215,
    brickH: o.brickH ?? 0.065,
  }
}

function curveLook(o: CurvedBrickWallOptions): Omit<Resolved, keyof ReturnType<typeof curveDims>> {
  return {
    protrude: o.protrude ?? 0.012,
    joint: o.joint ?? 0.01,
    seed: o.seed ?? 7,
    decay: o.decay ?? 0,
    brickColor: o.brickColor ?? 0xb86042,
    mortarColor: o.mortarColor ?? 0xc7c4be,
    colorVariation: o.colorVariation ?? 0.12,
    material: o.material,
  }
}

type Layout = { pts: SurfacePoint[]; sink: number[]; tone: number[] }

export class CurvedBrickWall {
  private group: THREE.Group | null = null
  private bodyGeo: THREE.BufferGeometry | null = null
  private bodyMat: THREE.MeshStandardMaterial | null = null
  private brickGeo: THREE.BoxGeometry | null = null
  private flatMat: THREE.MeshStandardMaterial | null = null // CHỈ khi không có material ngoài
  private readonly instanced: THREE.InstancedMesh[] = [] // 2 lớp viên (mặt ngoài + mặt trong)
  private brickCount = 0
  private isDisposed = false

  constructor(opts: CurvedBrickWallOptions = {}) {
    const o: Resolved = { ...curveDims(opts), ...curveLook(opts) }
    const group = new THREE.Group()
    this._buildBody(group, o)
    this._buildBricks(group, o, this._layout(o))
    this.group = group
  }

  /** Group thân + 2 lớp viên. Local: TÂM CUNG (0,0), chân tường y=0 — caller đặt transform. */
  getMesh(): THREE.Group {
    if (!this.group) throw new Error('CurvedBrickWall: đã dispose')
    return this.group
  }

  /** Số viên MỖI MẶT sau decay (tổng instance = ×2) — đo budget: tris ≈ count × 24 + thân. */
  getBrickCount(): number {
    return this.brickCount
  }

  dispose(): void {
    if (this.isDisposed) return
    this.group?.parent?.remove(this.group)
    this.bodyGeo?.dispose()
    this.bodyMat?.dispose()
    this.brickGeo?.dispose()
    this.flatMat?.dispose() // material ngoài (caller-owned) KHÔNG đụng
    for (const m of this.instanced) m.dispose()
    this.instanced.length = 0
    this.group = null
    this.isDisposed = true
  }

  // ── Private ────────────────────────────────────────────────────────────────

  // Hàm cung tròn tại cao yc: t∈[0,1] → điểm trên đường tim (góc bắt đầu −sweep/2 → cung CÂN qua trục +X).
  private _arcFn(o: Resolved, yc: number): (t: number) => THREE.Vector3 {
    const a0 = (-o.sweepDeg / 2) * (Math.PI / 180)
    const da = o.sweepDeg * (Math.PI / 180)
    return (t) =>
      new THREE.Vector3(o.radius * Math.cos(a0 + t * da), yc, o.radius * Math.sin(a0 + t * da))
  }

  // THÂN vữa cong: op #1 resample (spine đốt đều theo mét) → op #2 sweep tiết diện thickness×height
  // (profile centered → spine đặt ở y = height/2; parallel transport spine phẳng = frame ổn, không xoắn).
  private _buildBody(group: THREE.Group, o: Resolved): void {
    const segs = Math.max(8, Math.ceil(o.sweepDeg / 5)) // ~5°/đốt — cong mượt, 360° = 72 đốt
    const spine = resampleCurve(this._arcFn(o, o.height / 2), segs)
    const pos: number[] = []
    const idx: number[] = []
    sweepInto(pos, idx, spine, rectProfile(o.thickness, o.height), {})
    this.bodyGeo = new THREE.BufferGeometry()
    this.bodyGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    this.bodyGeo.setIndex(idx)
    this.bodyGeo.computeVertexNormals()
    this.bodyMat = new THREE.MeshStandardMaterial({ color: o.mortarColor, roughness: 0.95 })
    const mesh = new THREE.Mesh(this.bodyGeo, this.bodyMat)
    mesh.castShadow = true
    mesh.receiveShadow = true
    group.add(mesh)
  }

  // Lưới viên op #3 rowsOnSurface trên MẶT TIM tường (S(u,v) = cung × cao): viên đếm theo CHIỀU DÀI THẬT
  // từng hàng (arc-length #1 nội bộ) → cỡ đều tuyệt đối trên cung, stagger 0.5 = running bond.
  // DECAY 1 lượt rng cố định thứ tự (4 random/viên RÚT ĐỦ kể cả viên rụng — đổi decay không xáo bố cục).
  private _layout(o: Resolved): Layout {
    const nv = Math.max(1, Math.round(o.height / (o.brickH + o.joint)))
    const a0 = (-o.sweepDeg / 2) * (Math.PI / 180)
    const da = o.sweepDeg * (Math.PI / 180)
    const surf = (u: number, v: number): THREE.Vector3 =>
      new THREE.Vector3(
        o.radius * Math.cos(a0 + u * da),
        v * o.height,
        o.radius * Math.sin(a0 + u * da)
      )
    const rng = mulberry32(o.seed)
    const lay: Layout = { pts: [], sink: [], tone: [] }
    for (const p of rowsOnSurface(surf, nv, o.brickL + o.joint, { stagger: 0.5 })) {
      const rMiss = rng()
      const rYaw = rng()
      const rSink = rng()
      const rTone = rng()
      if (rMiss < o.decay * 0.3) continue // mất viên — lộ thân vữa
      p.tanU.applyAxisAngle(p.nrm, (rYaw - 0.5) * o.decay * 0.14) // xoay lệch ±4° @ decay 1
      lay.pts.push(p)
      lay.sink.push(rSink * o.decay * o.protrude * 0.6) // thụt về thân
      lay.tone.push(1 - rTone * o.decay * 0.35) // sạm
    }
    return lay
  }

  // 2 LỚP viên ±lift quanh thân (tường tự do thấy cả 2 mặt): CÙNG bố cục/decay (viên rụng trùng chỗ
  // 2 mặt = vết tróc thật). Basis copyToPoints: x=tanU (dọc cung) · y=nrm (radial) · z=binormal (đứng).
  private _buildBricks(group: THREE.Group, o: Resolved, lay: Layout): void {
    if (lay.pts.length === 0) return
    this.brickGeo = new THREE.BoxGeometry(1, 1, 1)
    let mat = o.material
    if (!mat) {
      this.flatMat = new THREE.MeshStandardMaterial({ roughness: 0.88 }) // trắng — instanceColor nhuộm
      mat = this.flatMat
    }
    const colors = this._brickColors(o, lay)
    const s = new THREE.Vector3()
    const base = o.thickness / 2 + o.protrude / 2
    for (const side of [1, -1]) {
      const inst = copyToPoints(this.brickGeo, mat, lay.pts, {
        scale: (p) =>
          s.set(Math.max(0.01, p.cw - o.joint), o.protrude, Math.max(0.01, p.ch - o.joint)),
        lift: (_p, i) => side * (base - lay.sink[i]), // decay thụt VỀ thân cả 2 phía
      })
      inst.castShadow = true
      inst.receiveShadow = true
      const c = new THREE.Color()
      for (let i = 0; i < colors.length; i++) inst.setColorAt(i, c.setHex(colors[i]))
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true
      this.instanced.push(inst)
      group.add(inst)
    }
    this.brickCount = lay.pts.length
  }

  // Màu per viên (variation × sạm) — tính 1 LẦN dùng chung 2 lớp (2 mặt cùng viên cùng màu).
  private _brickColors(o: Resolved, lay: Layout): number[] {
    const rng = mulberry32(o.seed * 7 + 3) // chuỗi màu RIÊNG — không lệch khi decay đổi số viên
    const base = new THREE.Color(o.brickColor)
    const c = new THREE.Color()
    const out: number[] = []
    for (let i = 0; i < lay.pts.length; i++) {
      const j = (1 + (rng() - 0.5) * 2 * o.colorVariation) * lay.tone[i]
      out.push(c.copy(base).multiplyScalar(j).getHex())
    }
    return out
  }
}
