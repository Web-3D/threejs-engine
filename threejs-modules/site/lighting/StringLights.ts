/**
 * VỊ TRÍ   — threejs-modules/site/lighting/StringLights.ts  (site-kit · hệ đèn TÁCH RIÊNG)
 * VAI TRÒ  — F3 đèn dây (festoon): chuỗi bóng EMISSIVE võng theo dây giữa 2 cọc A→B (catenary).
 *            Bóng = MeshBasicMaterial toneMapped:false (tự sáng, +0 sampler) → glow nhìn được KHÔNG cần bloom.
 *            1 PointLight giữa dây cho hắt nền (no-shadow). Pure three — KHÔNG GUI/editor/state.ts.
 * LIÊN HỆ  — Vỏ archplan (lighting/) bơm StringConfig[] + nightFactor. Cùng interface {pick,getBase,moveBase}
 *            (base = trung điểm dây; kéo = dịch CẢ chuỗi qua subgroup, 0 rebuild) ⇒ FixtureDrag dùng chung.
 *
 * CÁCH DÙNG: const sys = new StringLights(); scene.add(sys.getGroup()); sys.setStrings(cfgs); sys.update(night)
 * DISPOSE: dispose() — gỡ group + dispose PointLight + geo tube/instanced + bulbMat mỗi chuỗi + geo/mat chia sẻ.
 */

import * as THREE from 'three'

// 🎏 F3 đèn dây: 2 đầu A(ax,ay,az)→B(bx,by,bz), võng `sag` m, `bulbs` bóng đều dọc dây. +0 sampler.
export interface StringConfig {
  ax: number
  ay: number
  az: number
  bx: number
  by: number
  bz: number
  color: number
  intensity: number // hắt nền (PointLight giữa dây) + độ rực bóng
  sag: number // m — độ võng giữa dây
  bulbs: number // số bóng (≥2)
}

interface StEntry {
  group: THREE.Group
  light: THREE.PointLight
  bulbMat: THREE.MeshBasicMaterial
  tube: THREE.Mesh | null
  orb: THREE.InstancedMesh | null
  baseColor: number
  midX: number
  midZ: number
}

const BULB_R = 0.05 // m — bán kính bóng
const TUBE_R = 0.012 // m — bán kính dây
const WIRE_COL = 0x1a1a1e // màu dây tối

/** Config mặc định 1 chuỗi đèn dây (2 cọc cao 2.4m cách 4m, võng 0.5m, 10 bóng). */
export function defaultString(x = 0, z = 0): StringConfig {
  return {
    ax: x - 2,
    ay: 2.4,
    az: z,
    bx: x + 2,
    by: 2.4,
    bz: z,
    color: 0xffd27a,
    intensity: 3,
    sag: 0.5,
    bulbs: 10,
  }
}

export class StringLights {
  private readonly group = new THREE.Group()
  private readonly entries: StEntry[] = []
  private readonly baseInt: number[] = []
  private night = 1
  private isDisposed = false
  // CHIA SẺ: hình bóng + dây (material dây chung; material bóng RIÊNG mỗi chuỗi vì màu khác nhau).
  private readonly bulbGeo: THREE.SphereGeometry
  private readonly wireMat: THREE.MeshStandardMaterial
  private readonly mtx = new THREE.Matrix4()

  constructor() {
    this.group.name = 'SiteStringLights'
    this.bulbGeo = new THREE.SphereGeometry(BULB_R, 8, 6)
    this.wireMat = new THREE.MeshStandardMaterial({
      color: WIRE_COL,
      roughness: 0.8,
      metalness: 0.1,
    })
  }

  getGroup(): THREE.Group {
    return this.group
  }

  /** Reconcile số chuỗi + dựng lại hình mỗi chuỗi (rebuild geometry — gọi lúc commit/structural, KHÔNG lúc kéo). */
  setStrings(cfgs: StringConfig[]): void {
    if (this.isDisposed) return
    while (this.entries.length < cfgs.length) this._addEntry()
    while (this.entries.length > cfgs.length) this._removeEntry()
    cfgs.forEach((c, i) => this._apply(i, c))
    this.update(this.night)
  }

  /** Đêm: PointLight intensity = base × night; bóng emissive lerp màu→tối. */
  update(night: number): void {
    if (this.isDisposed) return
    this.night = night
    for (let i = 0; i < this.entries.length; i++) {
      const e = this.entries[i]
      e.light.intensity = (this.baseInt[i] ?? 0) * night
      e.bulbMat.color.setHex(e.baseColor).multiplyScalar(0.1 + 0.9 * night)
    }
  }

  /** Raycast → index chuỗi trúng (tube/bóng mang userData.stringIndex), -1 nếu trượt. */
  pickString(ray: THREE.Raycaster): number {
    const hits = ray.intersectObjects(this.group.children, true)
    for (const h of hits) {
      const idx = h.object.userData.stringIndex
      if (typeof idx === 'number') return idx
    }
    return -1
  }

  /** Trung điểm dây i (m) — gốc cho kéo Move. */
  getBase(i: number): { x: number; z: number } | null {
    const e = this.entries[i]
    return e ? { x: e.midX + e.group.position.x, z: e.midZ + e.group.position.z } : null
  }

  /** Dời CẢ chuỗi sao cho trung điểm về (x,z) — LIVE lúc kéo (dịch subgroup, 0 rebuild). */
  moveBase(i: number, x: number, z: number): void {
    const e = this.entries[i]
    if (!e) return
    e.group.position.set(x - e.midX, 0, z - e.midZ)
  }

  dispose(): void {
    if (this.isDisposed) return
    this.isDisposed = true
    while (this.entries.length > 0) this._removeEntry()
    this.group.parent?.remove(this.group)
    this.bulbGeo.dispose()
    this.wireMat.dispose()
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private _addEntry(): void {
    const g = new THREE.Group()
    const light = new THREE.PointLight(0xffd27a, 0, 6, 2) // no-shadow → +0 sampler
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffd27a, toneMapped: false })
    g.add(light)
    this.group.add(g)
    this.entries.push({
      group: g,
      light,
      bulbMat,
      tube: null,
      orb: null,
      baseColor: 0xffd27a,
      midX: 0,
      midZ: 0,
    })
    this.baseInt.push(0)
  }

  private _removeEntry(): void {
    const e = this.entries.pop()
    this.baseInt.pop()
    if (!e) return
    this._clearGeo(e)
    e.light.dispose()
    e.bulbMat.dispose()
    this.group.remove(e.group)
  }

  private _apply(i: number, c: StringConfig): void {
    const e = this.entries[i]
    if (!e) return
    this._clearGeo(e)
    const pts = this._curvePoints(c)
    e.midX = (c.ax + c.bx) / 2
    e.midZ = (c.az + c.bz) / 2
    e.group.position.set(0, 0, 0)
    e.baseColor = c.color
    e.bulbMat.color.setHex(c.color)
    e.light.color.setHex(c.color)
    e.light.distance = Math.max(2, Math.hypot(c.bx - c.ax, c.bz - c.az))
    e.light.position.set(e.midX, Math.min(c.ay, c.by) - c.sag, e.midZ)
    this.baseInt[i] = c.intensity
    this._buildTube(e, pts, i)
    this._buildBulbs(e, pts, i)
  }

  // Lấy n điểm dọc dây A→B, võng parabol (4t(1−t)) — dùng cả cho tube lẫn vị trí bóng.
  private _curvePoints(c: StringConfig): THREE.Vector3[] {
    const n = Math.max(2, Math.round(c.bulbs))
    const pts: THREE.Vector3[] = []
    for (let k = 0; k < n; k++) {
      const t = k / (n - 1)
      const y = c.ay + (c.by - c.ay) * t - c.sag * 4 * t * (1 - t)
      pts.push(new THREE.Vector3(c.ax + (c.bx - c.ax) * t, y, c.az + (c.bz - c.az) * t))
    }
    return pts
  }

  private _buildTube(e: StEntry, pts: THREE.Vector3[], i: number): void {
    const curve = new THREE.CatmullRomCurve3(pts)
    const geo = new THREE.TubeGeometry(curve, Math.max(8, pts.length * 2), TUBE_R, 5, false)
    const tube = new THREE.Mesh(geo, this.wireMat)
    tube.userData.stringIndex = i
    e.tube = tube
    e.group.add(tube)
  }

  private _buildBulbs(e: StEntry, pts: THREE.Vector3[], i: number): void {
    const orb = new THREE.InstancedMesh(this.bulbGeo, e.bulbMat, pts.length)
    for (let k = 0; k < pts.length; k++) {
      this.mtx.makeTranslation(pts[k].x, pts[k].y, pts[k].z)
      orb.setMatrixAt(k, this.mtx)
    }
    orb.instanceMatrix.needsUpdate = true
    orb.userData.stringIndex = i
    e.orb = orb
    e.group.add(orb)
  }

  private _clearGeo(e: StEntry): void {
    if (e.tube) {
      e.group.remove(e.tube)
      e.tube.geometry.dispose()
      e.tube = null
    }
    if (e.orb) {
      e.group.remove(e.orb)
      e.orb.dispose() // dispose InstancedMesh (instanceMatrix); geo/mat chia sẻ KHÔNG đụng
      e.orb = null
    }
  }
}
