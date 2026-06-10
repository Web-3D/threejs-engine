/**
 * VỊ TRÍ   — threejs-modules/components/StoneScatter/index.ts
 * VAI TRÒ  — Rải mảng đá DẸT tròn/ellipse trong 1 khuôn chữ nhật VÔ HÌNH, phân bố Poisson-disk
 *            (Bridson 2007 → blue-noise): cách đều ngẫu nhiên, KHÔNG chạm nhau (luôn chừa khe cỏ).
 *            N phiến = 1 InstancedMesh = 1 DRAW. Lối đi lát đá / bãi đá dăm sân vườn. v1 stepping-stone.
 * LIÊN HỆ  — Ráp bởi site-kit/archplan (Phase B): khuôn = zone G-level vô hình trên nền cỏ G0; đá BÁM
 *            cao-độ gò (heightAt) khi terrain bật. Material đá dùng chung cache triplanar với border hồ.
 *            Voronoi ghép-khít (crazy-paving) = đích xa, KHÔNG ở v1 (đá xếp THƯA, có khe).
 *
 * GIỚI HẠN: đá tròn/ellipse RỜI (không ghép khít). bounding-circle mỗi phiến ≤ rMax ⇒ minDist=2·rMax+gap
 *           đảm bảo không chạm (kể cả ellipse xoay). Phiến gần mép có thể nhô ra khỏi khuôn ≤ rMax (chấp nhận).
 * CÁCH DÙNG: const s = new StoneScatter({ frameW: 4, frameD: 4, seed: 1 }); scene.add(s.getMesh())
 * DISPOSE: dispose() giải phóng geometry + material NỘI BỘ + InstancedMesh, gỡ khỏi parent.
 */

import * as THREE from 'three'

const DEFAULTS = {
  frameW: 4.0, // m — bề ngang khuôn vô hình (X)
  frameD: 4.0, // m — chiều sâu khuôn vô hình (Z)
  rMin: 0.18, // m — bán kính phiến nhỏ nhất
  rMax: 0.35, // m — bán kính phiến lớn nhất (= bán kính BAO → quyết định minDist)
  ellipseMin: 0.6, // 0..1 — aspect tối thiểu (1 = tròn hết; <1 = dẹt thành ellipse)
  gap: 0.06, // m — khe cỏ tối thiểu giữa 2 phiến (mép-mép)
  thickness: 0.05, // m — dày phiến nhô trên cỏ
  radialSegments: 16, // độ mịn vành đĩa (tris ≈ ×4/phiến)
  seed: 0, // int — đổi layout + cỡ phiến (deterministic, tái lập)
  color: 0x9b948a as THREE.ColorRepresentation, // xám-đá — live setColor
  shape: 'rect' as 'rect' | 'circle', // khung rải: 'rect' = chữ nhật frameW×frameD; 'circle' = ellipse nội tiếp
}

const MAX_STONES = 400 // trần an toàn (budget + chặn Poisson loop dài khi khuôn lớn/phiến nhỏ)
const POISSON_TRIES = 30 // k — số lần thử quanh 1 điểm active (Bridson khuyến nghị 30)

interface P2 {
  x: number
  z: number
}

// 1 phiến đã đặt (LOCAL, tâm khuôn = gốc): tâm (x,z) + bán trục ellipse (rx,rz) + xoay quanh Y (rad).
export interface StonePlacement {
  x: number
  z: number
  rx: number
  rz: number
  rot: number
}

// mulberry32 — PRNG deterministic theo seed (stream 32-bit). ~6 dòng, 0 dep. Cùng seed = cùng chuỗi.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function inRect(c: P2, w: number, d: number): boolean {
  return c.x >= 0 && c.x < w && c.z >= 0 && c.z < d
}

// Candidate có đủ xa MỌI điểm đã đặt? Quét 5×5 ô lưới quanh nó (cell = minDist/√2 ⇒ điểm gần nhất chắc chắn
// nằm trong bán kính 2 ô). So sánh khoảng-cách-bình-phương với min2 → tránh sqrt.
function farEnough(
  grid: Int32Array,
  gw: number,
  gd: number,
  cell: number,
  pts: P2[],
  c: P2,
  min2: number
): boolean {
  const gi = Math.floor(c.x / cell)
  const gj = Math.floor(c.z / cell)
  for (let i = Math.max(0, gi - 2); i <= Math.min(gw - 1, gi + 2); i++) {
    for (let j = Math.max(0, gj - 2); j <= Math.min(gd - 1, gj + 2); j++) {
      const idx = grid[i + j * gw]
      if (idx < 0) continue
      const dx = pts[idx].x - c.x
      const dz = pts[idx].z - c.z
      if (dx * dx + dz * dz < min2) return false
    }
  }
  return true
}

// Bridson 2007 — Fast Poisson-disk sampling trong rect [0,w]×[0,d]. minDist = khoảng cách tối thiểu mọi cặp
// điểm → phân bố blue-noise (rải đều NGẪU NHIÊN, không vón cục/không lưới). Trả mảng điểm (≤ maxPts).
// Deterministic theo rng. Lưới gia tốc cell=minDist/√2 (≤1 điểm/ô) → kiểm tra lân cận O(1).
function poissonDisk(
  w: number,
  d: number,
  minDist: number,
  maxPts: number,
  rng: () => number
): P2[] {
  const cell = minDist / Math.SQRT2
  const gw = Math.max(1, Math.ceil(w / cell))
  const gd = Math.max(1, Math.ceil(d / cell))
  const grid = new Int32Array(gw * gd).fill(-1)
  const min2 = minDist * minDist
  const pts: P2[] = []
  const active: number[] = []
  const add = (p: P2): void => {
    grid[Math.floor(p.x / cell) + Math.floor(p.z / cell) * gw] = pts.length
    active.push(pts.length)
    pts.push(p)
  }
  add({ x: rng() * w, z: rng() * d })
  while (active.length > 0 && pts.length < maxPts) {
    const ai = (rng() * active.length) | 0
    const p = pts[active[ai]]
    let placed = false
    for (let k = 0; k < POISSON_TRIES && !placed; k++) {
      const ang = rng() * Math.PI * 2
      const rad = minDist * (1 + rng()) // [minDist, 2·minDist)
      const c: P2 = { x: p.x + Math.cos(ang) * rad, z: p.z + Math.sin(ang) * rad }
      if (!inRect(c, w, d)) continue
      if (!farEnough(grid, gw, gd, cell, pts, c, min2)) continue
      add(c)
      placed = true
    }
    if (!placed) active.splice(ai, 1)
  }
  return pts
}

export interface StoneScatterOptions {
  /** Bề ngang khuôn vô hình X (m). Default 4.0 */
  frameW?: number
  /** Chiều sâu khuôn vô hình Z (m). Default 4.0 */
  frameD?: number
  /** Bán kính phiến nhỏ nhất (m). Default 0.18 */
  rMin?: number
  /** Bán kính phiến lớn nhất = bán kính bao, quyết định minDist (m). Default 0.35 */
  rMax?: number
  /** Aspect ellipse tối thiểu 0..1 (1 = tròn hết; <1 = dẹt). Default 0.6 */
  ellipseMin?: number
  /** Khe cỏ tối thiểu giữa 2 phiến (m). Default 0.06 */
  gap?: number
  /** Dày phiến nhô trên cỏ (m). Default 0.05 */
  thickness?: number
  /** Độ mịn vành đĩa (≥6). Default 16 */
  radialSegments?: number
  /** Seed deterministic (đổi layout + cỡ phiến). Default 0 */
  seed?: number
  /** Khung rải: 'rect' (chữ nhật frameW×frameD) | 'circle' (ellipse nội tiếp — loại phiến tâm ngoài). Default 'rect' */
  shape?: 'rect' | 'circle'
  /** Màu đá (material NỘI BỘ) — live setColor. Default 0x9b948a */
  color?: THREE.ColorRepresentation
  /** Material NGOÀI (caller-owned, vd TexturedSurface triplanar đá) → đá dùng nó thay màu phẳng;
   *  KHÔNG dispose ở module (caller sở hữu/cache). Thiếu → material nội bộ theo color. */
  material?: THREE.Material
}

export class StoneScatter {
  private mesh: THREE.InstancedMesh | null = null
  private geometry: THREE.BufferGeometry | null = null
  // flatMat = material NỘI BỘ (OWNED → dispose). null khi caller bơm material ngoài (KHÔNG dispose).
  private flatMat: THREE.MeshStandardMaterial | null = null
  private isDisposed = false
  private placements: StonePlacement[] = []
  private triCount = 0

  constructor(opts: StoneScatterOptions = {}) {
    const o = { ...DEFAULTS, ...opts }
    let material = opts.material
    if (!material) {
      this.flatMat = new THREE.MeshStandardMaterial({
        color: o.color,
        roughness: 0.88,
        metalness: 0,
      })
      material = this.flatMat
    }
    this.placements = this.computePlacements(o)
    const geo = new THREE.CylinderGeometry(1, 1, 1, Math.max(6, Math.round(o.radialSegments)))
    this.geometry = geo
    this.mesh = this.buildMesh(o, geo, material)
    const triPer = geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3
    this.triCount = triPer * this.placements.length
  }

  // Sinh tâm Poisson trong khuôn → mỗi tâm gán bán kính r∈[rMin,rMax] + aspect ellipse + xoay ngẫu nhiên.
  // bounding-circle = r ≤ rMax (rz = r·aspect ≤ r) ⇒ minDist = 2·rMax + gap đảm bảo mọi phiến KHÔNG chạm.
  // Toạ độ trả về LOCAL (tâm khuôn = gốc): dời -hw,-hd. rng tiếp tục stream sau Poisson (vẫn deterministic).
  private computePlacements(o: typeof DEFAULTS): StonePlacement[] {
    const rMax = Math.max(0.01, o.rMax)
    const rMin = Math.min(Math.max(0.01, o.rMin), rMax)
    const w = Math.max(0.1, o.frameW)
    const d = Math.max(0.1, o.frameD)
    const minDist = 2 * rMax + Math.max(0, o.gap)
    const rng = mulberry32((Math.round(o.seed) | 0) * 0x9e3779b1 + 0x1234)
    const pts = poissonDisk(w, d, minDist, MAX_STONES, rng)
    const hw = w / 2
    const hd = d / 2
    const eMin = Math.min(1, Math.max(0.1, o.ellipseMin))
    const circle = o.shape === 'circle'
    // map ALL pts (rng/phiến chạy đều → đổi rect↔circle giữ layout, chỉ bớt phiến); circle → lọc tâm trong ellipse
    // nội tiếp (x/hw)²+(z/hd)²≤1. rng consume bằng nhau mọi shape ⇒ deterministic.
    return pts
      .map((p) => {
        const r = rMin + (rMax - rMin) * rng()
        const aspect = eMin + (1 - eMin) * rng()
        return { x: p.x - hw, z: p.z - hd, rx: r, rz: r * aspect, rot: rng() * Math.PI * 2 }
      })
      .filter((pl) => !circle || (pl.x / hw) ** 2 + (pl.z / hd) ** 2 <= 1)
  }

  // N phiến → 1 InstancedMesh: mỗi instance = đĩa đơn-vị scale (rx, dày, rz) [rx≠rz = ellipse] + xoay Y + dời.
  // Đĩa cao = thickness, dời y = thickness/2 → đáy nằm ở y=0 (mặt nền). castShadow để hằn bóng lên cỏ.
  private buildMesh(
    o: typeof DEFAULTS,
    geo: THREE.BufferGeometry,
    material: THREE.Material
  ): THREE.InstancedMesh {
    const n = this.placements.length
    const mesh = new THREE.InstancedMesh(geo, material, n)
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const pos = new THREE.Vector3()
    const scl = new THREE.Vector3()
    const up = new THREE.Vector3(0, 1, 0)
    const halfT = o.thickness / 2
    for (let i = 0; i < n; i++) {
      const pl = this.placements[i]
      q.setFromAxisAngle(up, pl.rot)
      pos.set(pl.x, halfT, pl.z)
      scl.set(pl.rx, o.thickness, pl.rz)
      mesh.setMatrixAt(i, m.compose(pos, q, scl))
    }
    mesh.instanceMatrix.needsUpdate = true
    mesh.castShadow = true
    mesh.receiveShadow = true
    return mesh
  }

  /** Đổi màu đá (CHỈ material NỘI BỘ). Live — tức thì. No-op khi dùng material ngoài (texture). */
  setColor(color: THREE.ColorRepresentation): void {
    if (this.isDisposed || !this.flatMat) return
    this.flatMat.color.set(color)
  }

  getMesh(): THREE.InstancedMesh {
    if (!this.mesh) throw new Error('StoneScatter: đã dispose')
    return this.mesh
  }

  /** Số phiến đá thực rải được (Poisson tự cap khi khuôn chật). */
  getStoneCount(): number {
    return this.placements.length
  }

  /** Vị trí/cỡ từng phiến (LOCAL, tâm khuôn = gốc) — cho grass-exclude / picking ở Phase B. */
  getPlacements(): readonly StonePlacement[] {
    return this.placements
  }

  /** Tổng tam giác (verify budget) = tri/đĩa × số phiến. 1 DRAW (instanced). */
  getTriangleCount(): number {
    return this.triCount
  }

  dispose(): void {
    if (this.isDisposed) return
    this.mesh?.parent?.remove(this.mesh)
    this.mesh?.dispose()
    this.geometry?.dispose()
    this.flatMat?.dispose() // CHỈ material NỘI BỘ; material ngoài (caller-owned, cache) KHÔNG đụng
    this.mesh = null
    this.geometry = null
    this.flatMat = null
    this.placements = []
    this.isDisposed = true
  }
}
