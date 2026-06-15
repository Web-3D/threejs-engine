/**
 * VỊ TRÍ   — threejs-modules/site/lighting/SiteLightingSystem.ts  (site-kit · hệ đèn TÁCH RIÊNG)
 * VAI TRÒ  — Hệ đèn site độc lập (pattern, KHÔNG cấy vào god-module): Phase 0 quản 🔦 đèn pha UPLIGHT =
 *            SpotLight no-shadow (rọi tường/cây/tượng). Pure three — KHÔNG GUI, KHÔNG editor, KHÔNG state.ts.
 *            Tự-chứa + dispose đủ. Mai sau gộp nốt pool point cũ (Phase 3). Đèn no-shadow ⇒ 0 sampler (an toàn trần 16).
 * LIÊN HỆ  — Vỏ archplan (lighting/) bơm UplightConfig[] + nightFactor; scene.add(getGroup()); raycast qua
 *            pickUplight(). Mirror triết lý lamp.ts (vỏ = mesh, real-light editor-owned) nhưng tự quản light luôn.
 *
 * CÁCH DÙNG: const sys = new SiteLightingSystem(); scene.add(sys.getGroup());
 *            sys.setUplights(cfgs); sys.update(night)  // mỗi khi sun đổi
 * DISPOSE: dispose() — gỡ group + dispose mọi SpotLight (shadow) + geo/mat chia sẻ.
 */

import * as THREE from 'three'

// 🔦 F1 đèn pha uplight: đế tại (x,z) trên đất, RỌI tới điểm aim (tường/cây). No-shadow → 0 sampler.
// intensity = base (×nightFactor lúc update). angle = nửa-góc côn (rad). range = SpotLight.distance (0 = vô hạn).
export interface UplightConfig {
  x: number
  z: number
  aimX: number
  aimZ: number
  aimY: number
  color: number
  intensity: number
  angle: number
  penumbra: number
  range: number
}

interface UpEntry {
  light: THREE.SpotLight
  target: THREE.Object3D
  housing: THREE.Mesh
  lens: THREE.Mesh
}

const FIX_R = 0.06 // m — bán kính housing đế đèn
const FIX_H = 0.12 // m — cao housing
const LENS_R = 0.05 // m — đĩa kính phát sáng (chỉ thị fixture lúc đêm)
const GLOW_BASE = 0xffe6b0 // màu kính ấm

/** Config mặc định 1 đèn pha (đế = aim chiếu thẳng lên, cao 2.4m). */
export function defaultUplight(x = 0, z = 0): UplightConfig {
  return {
    x,
    z,
    aimX: x,
    aimZ: z,
    aimY: 2.4,
    color: 0xffd9a0,
    intensity: 6,
    angle: 0.5,
    penumbra: 0.4,
    range: 8,
  }
}

export class SiteLightingSystem {
  private readonly group = new THREE.Group()
  private readonly entries: UpEntry[] = []
  private readonly baseInt: number[] = []
  private night = 1
  private isDisposed = false
  // Tài nguyên CHIA SẺ (1 cho mọi đèn — housing/lens cùng hình; glow tint theo đêm chung).
  private readonly housingGeo: THREE.CylinderGeometry
  private readonly housingMat: THREE.MeshStandardMaterial
  private readonly lensGeo: THREE.CircleGeometry
  private readonly glowMat: THREE.MeshBasicMaterial

  constructor() {
    this.group.name = 'SiteLighting'
    this.housingGeo = new THREE.CylinderGeometry(FIX_R, FIX_R * 1.2, FIX_H, 10)
    this.housingMat = new THREE.MeshStandardMaterial({
      color: 0x2a2c30,
      roughness: 0.7,
      metalness: 0.3,
    })
    this.lensGeo = new THREE.CircleGeometry(LENS_R, 16)
    this.glowMat = new THREE.MeshBasicMaterial({ color: GLOW_BASE, toneMapped: false })
  }

  getGroup(): THREE.Group {
    return this.group
  }

  /** Reconcile số đèn + áp config (LIVE-safe: chỉ set uniform/transform của SpotLight, KHÔNG recompile). */
  setUplights(cfgs: UplightConfig[]): void {
    if (this.isDisposed) return
    while (this.entries.length < cfgs.length) this._addEntry()
    while (this.entries.length > cfgs.length) this._removeEntry()
    cfgs.forEach((c, i) => this._apply(i, c))
    this.update(this.night)
  }

  /** Đêm: real-light intensity = base × night; kính lerp warm→tối. (mirror _applySunToLamps) */
  update(night: number): void {
    if (this.isDisposed) return
    this.night = night
    for (let i = 0; i < this.entries.length; i++) {
      this.entries[i].light.intensity = (this.baseInt[i] ?? 0) * night
    }
    this.glowMat.color.setHex(GLOW_BASE).multiplyScalar(0.08 + 0.92 * night)
  }

  /** Raycast → index đèn trúng (housing/lens mang userData.uplightIndex), -1 nếu trượt. Cho Focus/Move. */
  pickUplight(ray: THREE.Raycaster): number {
    const hits = ray.intersectObjects(this.group.children, false)
    for (const h of hits) {
      const idx = h.object.userData.uplightIndex
      if (typeof idx === 'number') return idx
    }
    return -1
  }

  /** Vị trí đế đèn i (m) — cho bắt đầu kéo Move. */
  getBase(i: number): { x: number; z: number } | null {
    const e = this.entries[i]
    return e ? { x: e.light.position.x, z: e.light.position.z } : null
  }

  /** Dời đế đèn i (giữ aim) — LIVE lúc kéo, 0 rebuild. */
  moveBase(i: number, x: number, z: number): void {
    const e = this.entries[i]
    if (!e) return
    e.light.position.set(x, FIX_H, z)
    e.housing.position.set(x, FIX_H / 2, z)
    e.lens.position.set(x, FIX_H + 0.001, z)
  }

  dispose(): void {
    if (this.isDisposed) return
    this.isDisposed = true
    while (this.entries.length > 0) this._removeEntry()
    this.group.parent?.remove(this.group)
    this.housingGeo.dispose()
    this.housingMat.dispose()
    this.lensGeo.dispose()
    this.glowMat.dispose()
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private _addEntry(): void {
    const light = new THREE.SpotLight(0xffd9a0, 0, 8, 0.5, 0.4, 2) // castShadow mặc định false → 0 sampler
    const target = new THREE.Object3D()
    light.target = target
    const housing = new THREE.Mesh(this.housingGeo, this.housingMat)
    housing.castShadow = true
    const lens = new THREE.Mesh(this.lensGeo, this.glowMat)
    lens.rotation.x = -Math.PI / 2 // đĩa kính ngửa lên
    this.group.add(light, target, housing, lens)
    this.entries.push({ light, target, housing, lens })
    this.baseInt.push(0)
  }

  private _removeEntry(): void {
    const e = this.entries.pop()
    this.baseInt.pop()
    if (!e) return
    this.group.remove(e.light, e.target, e.housing, e.lens)
    e.light.dispose() // dispose shadow map (no-shadow → nhẹ); geo/mat chia sẻ KHÔNG đụng
  }

  private _apply(i: number, c: UplightConfig): void {
    const e = this.entries[i]
    if (!e) return
    e.light.position.set(c.x, FIX_H, c.z)
    e.target.position.set(c.aimX, c.aimY, c.aimZ)
    e.light.color.setHex(c.color)
    e.light.angle = c.angle
    e.light.penumbra = c.penumbra
    e.light.distance = c.range
    e.light.decay = 2
    this.baseInt[i] = c.intensity
    e.housing.position.set(c.x, FIX_H / 2, c.z)
    e.lens.position.set(c.x, FIX_H + 0.001, c.z)
    e.housing.userData.uplightIndex = i
    e.lens.userData.uplightIndex = i
  }
}
