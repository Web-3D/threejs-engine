/**
 * VỊ TRÍ   — threejs-modules/site/lighting/BollardLights.ts  (site-kit · hệ đèn TÁCH RIÊNG)
 * VAI TRÒ  — F2 đèn bollard: trụ thấp ven lối đi, SpotLight RỌI XUỐNG tạo vũng sáng quanh chân.
 *            No-shadow ⇒ +0 sampler (an toàn trần 16). Pure three — KHÔNG GUI/editor/state.ts.
 *            Tự-chứa + dispose đủ. Mirror SiteLightingSystem nhưng đèn chiếu xuống + thân trụ cao.
 * LIÊN HỆ  — Vỏ archplan (lighting/) bơm BollardConfig[] + nightFactor; scene.add(getGroup()); raycast
 *            qua pickBollard(). Cùng interface {pick,getBase,moveBase} với uplight ⇒ FixtureDrag dùng chung.
 *
 * CÁCH DÙNG: const sys = new BollardLights(); scene.add(sys.getGroup());
 *            sys.setBollards(cfgs); sys.update(night)
 * DISPOSE: dispose() — gỡ group + dispose mọi SpotLight + geo/mat chia sẻ.
 */

import * as THREE from 'three'

// 🟡 F2 bollard: trụ tại (x,z), đèn ở đỉnh cao `height` rọi thẳng xuống đất. +0 sampler.
export interface BollardConfig {
  x: number
  z: number
  color: number
  intensity: number
  height: number // m — cao thân trụ (đỉnh = vị trí đèn)
  angle: number // rad — nửa-góc côn
  range: number // m — SpotLight.distance (0 = vô hạn)
  shadow: boolean // đổ bóng (spot-shadow) — controller cap theo SHADOW_BUDGET
}

interface BoEntry {
  light: THREE.SpotLight
  target: THREE.Object3D
  post: THREE.Mesh
  cap: THREE.Mesh
  glow: THREE.Mesh
  h: number // cao hiện tại (cho moveBase giữ height lúc kéo)
}

const POST_RTOP = 0.04 // m — bán kính ngọn trụ
const POST_RBOT = 0.05 // m — bán kính chân trụ
const CAP_R = 0.09 // m — bán kính chụp đỉnh
const CAP_H = 0.06 // m — cao chụp
const GLOW_R = 0.06 // m — đĩa kính phát sáng (dưới chụp, ngửa xuống)
const GLOW_BASE = 0xffe6b0 // màu kính ấm

/** Config mặc định 1 bollard (trụ 0.8m, rọi xuống vũng rộng). */
export function defaultBollard(x = 0, z = 0): BollardConfig {
  return { x, z, color: 0xfff0d0, intensity: 8, height: 0.8, angle: 1.0, range: 4, shadow: false }
}

export class BollardLights {
  private readonly group = new THREE.Group()
  private readonly entries: BoEntry[] = []
  private readonly baseInt: number[] = []
  private night = 1
  private isDisposed = false
  // Tài nguyên CHIA SẺ: thân trụ unit-height (scale.y theo height) + chụp + kính glow chung.
  private readonly postGeo: THREE.CylinderGeometry
  private readonly postMat: THREE.MeshStandardMaterial
  private readonly capGeo: THREE.CylinderGeometry
  private readonly glowGeo: THREE.CircleGeometry
  private readonly glowMat: THREE.MeshBasicMaterial

  constructor() {
    this.group.name = 'SiteBollards'
    this.postGeo = new THREE.CylinderGeometry(POST_RTOP, POST_RBOT, 1, 8) // unit → scale.y = height
    this.postMat = new THREE.MeshStandardMaterial({
      color: 0x2a2c30,
      roughness: 0.6,
      metalness: 0.4,
    })
    this.capGeo = new THREE.CylinderGeometry(CAP_R, CAP_R * 0.8, CAP_H, 10)
    this.glowGeo = new THREE.CircleGeometry(GLOW_R, 16)
    this.glowMat = new THREE.MeshBasicMaterial({ color: GLOW_BASE, toneMapped: false })
  }

  getGroup(): THREE.Group {
    return this.group
  }

  /** Reconcile số bollard + áp config (LIVE-safe: chỉ set transform/uniform, KHÔNG recompile). */
  setBollards(cfgs: BollardConfig[]): void {
    if (this.isDisposed) return
    while (this.entries.length < cfgs.length) this._addEntry()
    while (this.entries.length > cfgs.length) this._removeEntry()
    cfgs.forEach((c, i) => this._apply(i, c))
    this.update(this.night)
  }

  /** Đêm: real-light intensity = base × night; kính lerp warm→tối. */
  update(night: number): void {
    if (this.isDisposed) return
    this.night = night
    for (let i = 0; i < this.entries.length; i++) {
      this.entries[i].light.intensity = (this.baseInt[i] ?? 0) * night
    }
    this.glowMat.color.setHex(GLOW_BASE).multiplyScalar(0.08 + 0.92 * night)
  }

  /** Raycast → index bollard trúng (post/cap/glow mang userData.bollardIndex), -1 nếu trượt. */
  pickBollard(ray: THREE.Raycaster): number {
    const hits = ray.intersectObjects(this.group.children, false)
    for (const h of hits) {
      const idx = h.object.userData.bollardIndex
      if (typeof idx === 'number') return idx
    }
    return -1
  }

  /** Vị trí chân trụ i (m) — cho bắt đầu kéo Move. */
  getBase(i: number): { x: number; z: number } | null {
    const e = this.entries[i]
    return e ? { x: e.light.position.x, z: e.light.position.z } : null
  }

  /** Dời chân trụ i (giữ height) — LIVE lúc kéo, 0 rebuild. */
  moveBase(i: number, x: number, z: number): void {
    const e = this.entries[i]
    if (!e) return
    this._place(e, x, z, e.h)
  }

  dispose(): void {
    if (this.isDisposed) return
    this.isDisposed = true
    while (this.entries.length > 0) this._removeEntry()
    this.group.parent?.remove(this.group)
    this.postGeo.dispose()
    this.postMat.dispose()
    this.capGeo.dispose()
    this.glowGeo.dispose()
    this.glowMat.dispose()
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private _addEntry(): void {
    const light = new THREE.SpotLight(0xfff0d0, 0, 4, 1.0, 0.6, 2) // castShadow false → +0 sampler
    const target = new THREE.Object3D()
    light.target = target
    const post = new THREE.Mesh(this.postGeo, this.postMat)
    const cap = new THREE.Mesh(this.capGeo, this.postMat)
    cap.castShadow = true
    const glow = new THREE.Mesh(this.glowGeo, this.glowMat)
    glow.rotation.x = Math.PI / 2 // đĩa kính úp xuống (phát xuống đất)
    this.group.add(light, target, post, cap, glow)
    this.entries.push({ light, target, post, cap, glow, h: 0.8 })
    this.baseInt.push(0)
  }

  private _removeEntry(): void {
    const e = this.entries.pop()
    this.baseInt.pop()
    if (!e) return
    this.group.remove(e.light, e.target, e.post, e.cap, e.glow)
    e.light.dispose()
  }

  private _apply(i: number, c: BollardConfig): void {
    const e = this.entries[i]
    if (!e) return
    e.light.color.setHex(c.color)
    e.light.angle = c.angle
    e.light.distance = c.range
    e.light.decay = 2
    this._applyShadow(e.light, c.shadow, Math.max(2, c.height + c.range))
    this.baseInt[i] = c.intensity
    this._place(e, c.x, c.z, c.height)
    e.post.userData.bollardIndex = i
    e.cap.userData.bollardIndex = i
    e.glow.userData.bollardIndex = i
  }

  // Đặt 1 trụ tại (x,z) cao h: đèn đỉnh rọi thẳng xuống (target ở chân), thân scale theo h.
  private _place(e: BoEntry, x: number, z: number, h: number): void {
    e.h = h
    e.light.position.set(x, h, z)
    e.target.position.set(x, 0, z)
    e.post.position.set(x, h / 2, z)
    e.post.scale.y = h
    e.cap.position.set(x, h + CAP_H / 2, z)
    e.glow.position.set(x, h - 0.01, z)
    if (e.light.castShadow) e.light.shadow.needsUpdate = true // bóng theo lúc kéo/đổi cao (autoUpdate=false)
  }

  // Spot-shadow tuỳ chọn — mirror pool đèn cũ: autoUpdate=false (vẽ 1 lần, refresh khi đổi/dời) + map 512.
  // castShadow đổi runtime = recompile NodeMaterial (đắt) → chỉ bật/tắt lúc TOGGLE (commit), không live-drag.
  private _applyShadow(light: THREE.SpotLight, on: boolean, far: number): void {
    light.castShadow = on
    if (!on) return
    light.shadow.autoUpdate = false
    light.shadow.mapSize.set(512, 512)
    light.shadow.camera.near = 0.1
    light.shadow.camera.far = Math.max(2, far)
    light.shadow.needsUpdate = true
  }
}
