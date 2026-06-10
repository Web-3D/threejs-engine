/**
 * VỊ TRÍ   — threejs-modules/components/BrickPaving/index.ts
 * VAI TRÒ  — SÂN LÁT GẠCH bond đều (running bond): nền vữa/cát mỏng + InstancedMesh viên block chữ nhật
 *            rải lưới so le chừa khe + DECAY tuổi sân (mất viên lộ nền + lún + xoay lệch + sạm màu).
 *            1 sân = 2 draw (nền + instanced). Deterministic theo seed.
 * LIÊN HỆ  — CONSUMER op #3: build TRÊN kệ ops — gridOnSurface (stagger = bond) + copyToPoints
 *            (mutate tanU per-điểm = xoay lệch viên) + mulberry32 (#5). Anh em InstancedBrickWall
 *            (tường ĐỨNG, cull lỗ) — đây là bản NẰM cho sân/lối đi. Site-kit: zoneKind 'paving'.
 *
 * CÁCH DÙNG: const p = new BrickPaving({ frameW: 4, frameD: 3, decay: 0.3 }); scene.add(p.getMesh())
 *            // mesh local: tâm (0,0), mặt nền y≈0, viên nhô +Y — caller đặt position/rotation
 * DISPOSE: dispose() — geo + material NỘI BỘ + InstancedMesh, gỡ khỏi parent; material NGOÀI không đụng.
 */

import * as THREE from 'three'

import { copyToPoints, gridOnSurface, type SurfacePoint } from '../../ops/copy-to-points'
import { mulberry32 } from '../../ops/scatter'

export interface BrickPavingOptions {
  frameW?: number // m — bề ngang sân (trục X). Default 4
  frameD?: number // m — chiều sâu sân (trục Z). Default 3
  brickL?: number // m — DÀI viên (dọc X, hướng bond). Default 0.2 (block sân 200×100 chuẩn)
  brickW?: number // m — RỘNG viên. Default 0.1
  brickH?: number // m — DÀY viên nhô trên nền. Default 0.06
  joint?: number // m — khe vữa/cát giữa viên. Default 0.008
  bond?: number // 0..1 — SO LE hàng lẻ (× viên): 0.5 = running bond · 0 = stack thẳng. Default 0.5
  seed?: number // deterministic — đổi seed = đổi viên rụng/lệch (decay). Default 7
  decay?: number // 0..1 — TUỔI sân: mất viên (lộ nền) + lún + xoay lệch + sạm màu. Default 0 = mới tinh
  brickColor?: THREE.ColorRepresentation // Default 0x9a6a52 (block đất nung)
  jointColor?: THREE.ColorRepresentation // màu NỀN lộ ở khe + chỗ mất viên. Default 0xb5ab98 (cát vữa)
  colorVariation?: number // 0..1 — jitter sáng/tối từng viên (instanceColor). Default 0.12
  material?: THREE.Material // material NGOÀI (caller-owned, vd TexturedSurface triplanar) — KHÔNG dispose
}

type Resolved = Required<Omit<BrickPavingOptions, 'material'>> & { material?: THREE.Material }

const BACKING_TOP = 0.002 // mặt nền vữa nhô nhẹ trên mặt zone — né z-fight với slab G-level
const BACKING_H = 0.02

// Defaults tách 2 hàm nhỏ — eslint complexity đếm TỪNG `??` (gom 1 chỗ là vượt trần 10).
function pavingDims(
  o: BrickPavingOptions
): Pick<Resolved, 'frameW' | 'frameD' | 'brickL' | 'brickW' | 'brickH' | 'joint'> {
  return {
    frameW: o.frameW ?? 4,
    frameD: o.frameD ?? 3,
    brickL: o.brickL ?? 0.2,
    brickW: o.brickW ?? 0.1,
    brickH: o.brickH ?? 0.06,
    joint: o.joint ?? 0.008,
  }
}

function pavingLook(o: BrickPavingOptions): Omit<Resolved, keyof ReturnType<typeof pavingDims>> {
  return {
    bond: o.bond ?? 0.5,
    seed: o.seed ?? 7,
    decay: o.decay ?? 0,
    brickColor: o.brickColor ?? 0x9a6a52,
    jointColor: o.jointColor ?? 0xb5ab98,
    colorVariation: o.colorVariation ?? 0.12,
    material: o.material,
  }
}

export class BrickPaving {
  private group: THREE.Group | null = null
  private backingGeo: THREE.BoxGeometry | null = null
  private backingMat: THREE.MeshStandardMaterial | null = null
  private brickGeo: THREE.BoxGeometry | null = null
  private flatMat: THREE.MeshStandardMaterial | null = null // CHỈ khi không có material ngoài
  private instanced: THREE.InstancedMesh | null = null
  private brickCount = 0
  private isDisposed = false

  constructor(opts: BrickPavingOptions = {}) {
    const o: Resolved = { ...pavingDims(opts), ...pavingLook(opts) }
    const group = new THREE.Group()
    this._buildBacking(group, o)
    this._buildBricks(group, o, this._layout(o))
    this.group = group
  }

  /** Group nền + viên. Local: tâm (0,0), nền y≈0 — caller đặt transform. */
  getMesh(): THREE.Group {
    if (!this.group) throw new Error('BrickPaving: đã dispose')
    return this.group
  }

  /** Số viên thực tế (sau decay rụng) — đo budget: tris ≈ count × 12 + 12 nền. */
  getBrickCount(): number {
    return this.brickCount
  }

  dispose(): void {
    if (this.isDisposed) return
    this.group?.parent?.remove(this.group)
    this.backingGeo?.dispose()
    this.backingMat?.dispose()
    this.brickGeo?.dispose()
    this.flatMat?.dispose() // material ngoài (caller-owned) KHÔNG đụng
    this.instanced?.dispose()
    this.group = null
    this.instanced = null
    this.isDisposed = true
  }

  // ── Private ────────────────────────────────────────────────────────────────

  // Nền vữa/cát: box mỏng phủ kín khuôn, mặt trên +BACKING_TOP — lộ ở khe + chỗ viên rụng (decay).
  private _buildBacking(group: THREE.Group, o: Resolved): void {
    this.backingGeo = new THREE.BoxGeometry(o.frameW, BACKING_H, o.frameD)
    this.backingMat = new THREE.MeshStandardMaterial({ color: o.jointColor, roughness: 0.95 })
    const mesh = new THREE.Mesh(this.backingGeo, this.backingMat)
    mesh.position.y = BACKING_TOP - BACKING_H / 2
    mesh.receiveShadow = true
    group.add(mesh)
  }

  // Lưới điểm op #3 (gridOnSurface — comment gốc: "đúng cho sân") + DECAY 1 lượt rng cố định thứ tự:
  // 4 random/điểm (rụng/xoay/lún/sạm) RÚT ĐỦ kể cả viên rụng → đổi decay không xáo bố cục viên còn lại.
  // Xoay lệch = mutate tanU quanh nrm TRƯỚC copyToPoints (basis instance xoay theo — không cần op mới).
  private _layout(o: Resolved): { pts: SurfacePoint[]; sink: number[]; tone: number[] } {
    const nu = Math.max(1, Math.round(o.frameW / (o.brickL + o.joint)))
    const nv = Math.max(1, Math.round(o.frameD / (o.brickW + o.joint)))
    // (1−v) đảo trục Z → ∂u×∂v = +Y (normal lên trời; để thuận chiều thì cross ra −Y, viên úp ngược)
    const surf = (u: number, v: number): THREE.Vector3 =>
      new THREE.Vector3(u * o.frameW - o.frameW / 2, 0, (1 - v) * o.frameD - o.frameD / 2)
    const rng = mulberry32(o.seed)
    const pts: SurfacePoint[] = []
    const sink: number[] = []
    const tone: number[] = []
    for (const p of gridOnSurface(surf, nu, nv, { stagger: o.bond })) {
      const rMiss = rng()
      const rYaw = rng()
      const rSink = rng()
      const rTone = rng()
      if (rMiss < o.decay * 0.35) continue // mất viên — lộ nền vữa ở khe
      p.tanU.applyAxisAngle(p.nrm, (rYaw - 0.5) * o.decay * 0.14) // xoay lệch ±4° @ decay 1
      pts.push(p)
      sink.push(rSink * o.decay * o.brickH * 0.45) // lún — viên thụt xuống nền
      tone.push(1 - rTone * o.decay * 0.35) // sạm — viên cũ tối màu
    }
    return { pts, sink, tone }
  }

  // Viên = box ĐƠN VỊ scale per-điểm theo Ô THẬT (cw/ch − khe) qua copyToPoints; màu per viên
  // (variation × sạm decay). Material ngoài (triplanar) → instanceColor shader ngoài tự quyết.
  private _buildBricks(
    group: THREE.Group,
    o: Resolved,
    lay: { pts: SurfacePoint[]; sink: number[]; tone: number[] }
  ): void {
    if (lay.pts.length === 0) return
    this.brickGeo = new THREE.BoxGeometry(1, 1, 1)
    let mat = o.material
    if (!mat) {
      this.flatMat = new THREE.MeshStandardMaterial({ roughness: 0.85 }) // trắng — instanceColor nhuộm
      mat = this.flatMat
    }
    const s = new THREE.Vector3()
    const inst = copyToPoints(this.brickGeo, mat, lay.pts, {
      scale: (p) => s.set(Math.max(0.01, p.cw - o.joint), o.brickH, Math.max(0.01, p.ch - o.joint)),
      lift: (_p, i) => BACKING_TOP + o.brickH / 2 - lay.sink[i],
    })
    inst.castShadow = true
    inst.receiveShadow = true
    const c = new THREE.Color()
    const base = new THREE.Color(o.brickColor)
    const rng = mulberry32(o.seed * 7 + 3) // chuỗi màu RIÊNG — không lệch khi decay đổi số viên
    for (let i = 0; i < lay.pts.length; i++) {
      const j = (1 + (rng() - 0.5) * 2 * o.colorVariation) * lay.tone[i]
      inst.setColorAt(i, c.copy(base).multiplyScalar(j))
    }
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true
    this.brickCount = lay.pts.length
    this.instanced = inst
    group.add(inst)
  }
}
