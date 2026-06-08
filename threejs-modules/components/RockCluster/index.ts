/**
 * VỊ TRÍ   — threejs-modules/components/RockCluster/index.ts
 * VAI TRÒ  — Đá mỏm procedural (non bộ Phase A): N viên Icosahedron DISPLACE craggy xếp thành MỎM
 *            (đế rộng → đỉnh hẹp), merge 1 mesh flatShading faceted. Mảnh THIẾU của cảnh non bộ.
 * LIÊN HỆ  — Ráp bởi site-kit/archplan (Phase B) trên mound + hồ + rêu (GrassBlades). Mirror stoneAt/
 *            pondStoneGeos (site/render/fromState.ts) — icosa faceted đã chạy dưới WebGPU — nhưng dựng
 *            KHỐI ĐỨNG thay vì rải viền phẳng.
 *
 * GIỚI HẠN: KHÔNG overhang/hang thật (đá xếp chồng → khe + craggy, không đục hang). MVP chấp nhận.
 * CÁCH DÙNG: const r = new RockCluster({ footprintRadius, height, rockCount, seed }); scene.add(r.getMesh())
 * DISPOSE: dispose() giải phóng merged geometry + material + gỡ mesh khỏi parent.
 */

import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

const DEFAULTS = {
  footprintRadius: 1.2, // m — bán kính đế mỏm
  height: 1.6, // m — cao mỏm
  rockCount: 20, // số viên đá (budget — cap ROCK_COUNT_MAX)
  craggy: 0.35, // 0..1 — biên độ lởm chởm (displace dọc bán kính viên)
  rockScale: 1.0, // × — phóng/thu cỡ viên (khít ↔ hở)
  detail: 2, // int 1..3 — subdiv icosa (1=80, 2=320, 3=1280 tri/viên)
  seed: 0, // int — đổi layout + hình đá (deterministic, tái lập)
  color: 0x8a8278 as THREE.ColorRepresentation, // màu đá xám-nâu — live setColor
}

const ROCK_COUNT_MAX = 60 // trần số viên/cụm (budget) — nhiều cụm/lô không vỡ tri
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)) // ~2.39996 rad — xoắn ốc phủ đều
const NOISE_FREQ = 1.6 // 1/m — tần số craggy nền (cao = lởm chởm dày)

// hash01 — pseudo-random [0,1) deterministic theo (a,b). Mirror hash01 ở fromState.ts (sin·fract).
function hash01(a: number, b: number): number {
  const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453
  return v - Math.floor(v)
}

// hash 3D lattice → [0,1) tại điểm nguyên (ix,iy,iz). Hạt nhân value-noise.
function hash3(ix: number, iy: number, iz: number): number {
  const v = Math.sin(ix * 127.1 + iy * 311.7 + iz * 74.7) * 43758.5453
  return v - Math.floor(v)
}

const smoother = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10)
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

// Value-noise 3D ∈ [0,1): hash 8 góc lattice + trilinear (smootherstep). Tự-chứa, KHÔNG dependency.
function valueNoise3(x: number, y: number, z: number): number {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const iz = Math.floor(z)
  const fx = smoother(x - ix)
  const fy = smoother(y - iy)
  const fz = smoother(z - iz)
  const x00 = lerp(hash3(ix, iy, iz), hash3(ix + 1, iy, iz), fx)
  const x10 = lerp(hash3(ix, iy + 1, iz), hash3(ix + 1, iy + 1, iz), fx)
  const x01 = lerp(hash3(ix, iy, iz + 1), hash3(ix + 1, iy, iz + 1), fx)
  const x11 = lerp(hash3(ix, iy + 1, iz + 1), hash3(ix + 1, iy + 1, iz + 1), fx)
  return lerp(lerp(x00, x10, fy), lerp(x01, x11, fy), fz)
}

// fbm3 ∈ [-1,1]: 3 octave value-noise (lacunarity 2 / gain 0.5), re-center → vừa bướu vừa khe (crevice).
function fbm3(x: number, y: number, z: number): number {
  let sum = 0
  let amp = 0.5
  let freq = 1
  for (let o = 0; o < 3; o++) {
    sum += amp * valueNoise3(x * freq, y * freq, z * freq)
    freq *= 2
    amp *= 0.5
  }
  return (sum / 0.875) * 2 - 1 // amp tổng = 0.5+0.25+0.125 = 0.875 → chuẩn hoá [0,1] → [-1,1]
}

// 1 viên đá craggy: IcosahedronGeometry(r, detail) [non-indexed] DISPLACE mỗi đỉnh dọc pháp-tuyến-cầu theo
// fbm3. Displacement CHỈ là hàm vị-trí ⇒ đỉnh trùng-vị-trí (icosa non-indexed) dịch GIỐNG nhau → KHÔNG nứt mặt.
// (ox,oz) = offset noise riêng mỗi viên → mỗi viên 1 hình. flatShading ở material lo facet (không computeNormals).
function icosaRock(
  r: number,
  detail: number,
  craggy: number,
  ox: number,
  oz: number
): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(r, detail)
  const pos = g.attributes.position
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const len = v.length() || 1e-6
    const n = fbm3((v.x + ox) * NOISE_FREQ, v.y * NOISE_FREQ, (v.z + oz) * NOISE_FREQ)
    const k = (len + craggy * r * n) / len // scale dọc bán kính = dịch theo dir (dir = v/len)
    pos.setXYZ(i, v.x * k, v.y * k, v.z * k)
  }
  pos.needsUpdate = true
  return g
}

export interface RockClusterOptions {
  /** Bán kính đế mỏm (m). Default 1.2 */
  footprintRadius?: number
  /** Cao mỏm (m). Default 1.6 */
  height?: number
  /** Số viên đá (budget, cap 60). Default 20 */
  rockCount?: number
  /** Biên độ lởm chởm 0..1 (displace). Default 0.35 */
  craggy?: number
  /** Hệ số phóng/thu cỡ viên (khít↔hở). Default 1.0 */
  rockScale?: number
  /** Subdiv icosa 1..3 (1=80,2=320,3=1280 tri/viên). Default 2 */
  detail?: number
  /** Seed deterministic (đổi layout+hình). Default 0 */
  seed?: number
  /** Màu đá (material NỘI BỘ flat). Default 0x8a8278 — live setColor */
  color?: THREE.ColorRepresentation
  /** Material NGOÀI (caller-owned) — vd TexturedSurface triplanar đá. Bơm → đá dùng nó (bỏ qua color/flatShading);
   *  KHÔNG dispose ở đây (caller sở hữu, cache lab-lifetime). Thiếu → material nội bộ flat theo color. */
  material?: THREE.Material
}

export class RockCluster {
  private mesh: THREE.Mesh | null = null
  private geometry: THREE.BufferGeometry | null = null
  // flatMat = material NỘI BỘ (flat color, OWNED → dispose). null khi caller bơm material ngoài (KHÔNG dispose).
  private flatMat: THREE.MeshStandardMaterial | null = null
  private isDisposed = false
  private triCount = 0

  constructor(opts: RockClusterOptions = {}) {
    const o = { ...DEFAULTS, ...opts }
    let material = opts.material
    if (!material) {
      this.flatMat = new THREE.MeshStandardMaterial({
        color: o.color,
        roughness: 0.92,
        metalness: 0,
        flatShading: true, // facet = đá (như pondStoneGeos); normal theo derivative, không cần geometry normal
      })
      material = this.flatMat
    }
    this.geometry = this.build(o)
    this.triCount = this.geometry.attributes.position.count / 3
    this.mesh = new THREE.Mesh(this.geometry, material)
    this.mesh.castShadow = true
    this.mesh.receiveShadow = true
  }

  // Xếp N viên thành MỎM: đế rộng (ringR lớn, t=0) → đỉnh hẹp (t=1); cao dần y = height·t^0.8; viên nhỏ dần
  // lên đỉnh. Vị trí xoắn ốc (GOLDEN_ANGLE) + jitter → phủ đều, không xếp hàng. Bake transform vào geometry
  // rồi mergeGeometries → 1 mesh (1 draw). Tất cả deterministic theo seed.
  private build(o: typeof DEFAULTS): THREE.BufferGeometry {
    const n = Math.max(1, Math.min(ROCK_COUNT_MAX, Math.round(o.rockCount)))
    const detail = Math.max(1, Math.min(3, Math.round(o.detail)))
    const baseRockR = (o.footprintRadius / Math.sqrt(n)) * 1.5 * o.rockScale // phủ kín đế, chồng nhẹ → không hở
    const geos: THREE.BufferGeometry[] = []
    const m = new THREE.Matrix4()
    const rot = new THREE.Matrix4()
    const scl = new THREE.Matrix4()
    const eul = new THREE.Euler()
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : i / (n - 1)
      const ringR = o.footprintRadius * (1 - t) * (0.75 + hash01(o.seed + i, 1.3) * 0.5)
      const ang = i * GOLDEN_ANGLE + hash01(o.seed + i, 7.1) * Math.PI * 2
      const y = o.height * Math.pow(t, 0.8)
      const rr = baseRockR * (1 - 0.45 * t) * (0.8 + hash01(o.seed + i, 4.7) * 0.5)
      const geo = icosaRock(rr, detail, o.craggy, (o.seed + i) * 1.7, (o.seed + i) * 2.3)
      eul.set(
        hash01(o.seed + i, 2.1) * 6.283,
        hash01(o.seed + i, 5.5) * 6.283,
        hash01(o.seed + i, 8.8) * 6.283
      )
      rot.makeRotationFromEuler(eul)
      scl.makeScale(1, 0.7 + hash01(o.seed + i, 9.2) * 0.4, 1) // dẹt Y nhẹ → đá nằm, không tròn cầu
      m.multiplyMatrices(rot, scl).setPosition(Math.cos(ang) * ringR, y, Math.sin(ang) * ringR)
      geo.applyMatrix4(m)
      geos.push(geo)
    }
    const merged = mergeGeometries(geos, false)
    for (const g of geos) g.dispose()
    if (!merged)
      throw new Error(
        'RockCluster: mergeGeometries null (icosa đồng non-indexed → không nên xảy ra)'
      )
    return merged
  }

  /** Đổi màu đá (CHỈ material NỘI BỘ flat). Live — tức thì. No-op khi dùng material ngoài (texture). */
  setColor(color: THREE.ColorRepresentation): void {
    if (this.isDisposed || !this.flatMat) return
    this.flatMat.color.set(color)
  }

  getMesh(): THREE.Mesh {
    if (!this.mesh) throw new Error('RockCluster: đã dispose')
    return this.mesh
  }

  /** Số tam giác của merged mesh — verify budget. */
  getTriangleCount(): number {
    return this.triCount
  }

  dispose(): void {
    if (this.isDisposed) return
    this.mesh?.parent?.remove(this.mesh)
    this.geometry?.dispose()
    this.flatMat?.dispose() // CHỈ material NỘI BỘ; material ngoài (caller-owned, cache) KHÔNG đụng
    this.mesh = null
    this.geometry = null
    this.flatMat = null
    this.isDisposed = true
  }
}
