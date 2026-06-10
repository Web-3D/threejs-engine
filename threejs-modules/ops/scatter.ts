/**
 * VỊ TRÍ   — threejs-modules/ops/scatter.ts
 * VAI TRÒ  — OP #5 thư viện ops (Houdini Scatter): rải điểm NGẪU NHIÊN trên mesh bất kỳ. Wrap
 *            MeshSurfaceSampler (three examples — phân bố đều theo DIỆN TÍCH tam giác, không tự viết)
 *            + seed (mulberry32 — cùng seed cùng bố cục, tái lập như Houdini) + minDist (dart-throwing
 *            qua lưới hash — poisson-ish, bớt dính chùm) + mask (loại vùng — density mask).
 *            = TẦNG 1d của bộ Copy to Points: trả SurfacePoint nên TẦNG 2 copyToPoints (#3) dùng lại
 *            nguyên — tanU per-điểm là hướng NGẪU NHIÊN ⊥ normal → instance tự xoay yaw random;
 *            u/v = 2 SỐ RANDOM [0,1) per-điểm cho caller jitter scale; cw/ch = 1 (scale theo MÉT).
 * LIÊN HỆ  — ops/copy-to-points.ts (SurfacePoint + copyToPoints). Consumer: roof-preview.setScatter
 *            (đá + bụi cỏ quanh nhà). Catalog: Factory/deferred/houdini-algorithms.md (#5).
 *
 * CÁCH DÙNG: const pts = scatterOnMesh(groundGeo, 200, { seed: 7, minDist: 0.4, mask: (p) => ngoaiNha(p) })
 *            copyToPoints(rockGeo, mat, pts, { scale: (p) => sv.setScalar(0.08 + 0.1 * p.u) })
 * DISPOSE: pure math — sampler tạm trong hàm, không giữ tài nguyên GPU.
 */

import * as THREE from 'three'
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js'

import type { SurfacePoint } from './copy-to-points'

export interface ScatterOptions {
  seed?: number // PRNG seed — cùng seed cùng bố cục. Mặc định 1.
  minDist?: number // khoảng cách TỐI THIỂU giữa 2 điểm (m) — dart-throwing loại điểm dính chùm. Mặc định 0 (tắt).
  mask?: (pos: THREE.Vector3) => boolean // false = LOẠI điểm (vd vùng dưới nhà). Mặc định nhận hết.
}

// PRNG mulberry32 — nhanh, đủ tốt cho scatter; seed nguyên 32-bit → chuỗi [0,1) tái lập.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return (): number => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Lưới hash ô cạnh = minDist: kiểm tra láng giềng chỉ trong 27 ô quanh điểm → ~O(1)/điểm thay O(n²)
// (500 điểm × vài nghìn lần thử vẫn tức thời). Chỉ dùng nội bộ scatterOnMesh.
class HashGrid {
  private readonly cells = new Map<string, THREE.Vector3[]>()
  constructor(private readonly cell: number) {}

  private key(ix: number, iy: number, iz: number): string {
    return `${ix},${iy},${iz}`
  }

  tooClose(p: THREE.Vector3, d: number): boolean {
    const ix = Math.floor(p.x / this.cell)
    const iy = Math.floor(p.y / this.cell)
    const iz = Math.floor(p.z / this.cell)
    const d2 = d * d
    for (let o = 0; o < 27; o++) {
      // 27 ô lân cận duỗi PHẲNG 1 vòng lặp (o → dx/dy/dz ∈ {-1,0,1}) — né max-depth, cùng số lần thăm
      const bucket = this.cells.get(
        this.key(ix + (o % 3) - 1, iy + (Math.floor(o / 3) % 3) - 1, iz + Math.floor(o / 9) - 1)
      )
      if (!bucket) continue
      for (const q of bucket) if (q.distanceToSquared(p) < d2) return true
    }
    return false
  }

  add(p: THREE.Vector3): void {
    const k = this.key(
      Math.floor(p.x / this.cell),
      Math.floor(p.y / this.cell),
      Math.floor(p.z / this.cell)
    )
    const bucket = this.cells.get(k)
    if (bucket) bucket.push(p)
    else this.cells.set(k, [p])
  }
}

// Đóng gói 1 mẫu thành SurfacePoint: tanU = hướng NGẪU NHIÊN ⊥ normal (yaw random sẵn trong frame),
// u/v = 2 random per-điểm (caller jitter scale/squash), cw/ch = 1 (caller scale theo mét tuyệt đối).
function makePoint(pos: THREE.Vector3, nrm: THREE.Vector3, rng: () => number): SurfacePoint {
  const n = nrm.clone().normalize()
  const ref = Math.abs(n.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)
  const t1 = new THREE.Vector3().crossVectors(ref, n).normalize()
  const t2 = new THREE.Vector3().crossVectors(n, t1)
  const a = rng() * Math.PI * 2
  const tanU = t1.multiplyScalar(Math.cos(a)).addScaledVector(t2, Math.sin(a)).normalize()
  return { pos: pos.clone(), nrm: n, tanU, u: rng(), v: rng(), cw: 1, ch: 1 }
}

// Điểm ứng viên ĐẬU được không: qua mask (vùng cấm) + qua minDist (grid) — đậu thì GHI luôn vào grid.
// Tách khỏi scatterOnMesh (gate complexity).
function tryPlace(
  pos: THREE.Vector3,
  grid: HashGrid | null,
  md: number,
  mask?: (p: THREE.Vector3) => boolean
): boolean {
  if (mask && !mask(pos)) return false
  if (grid) {
    if (grid.tooClose(pos, md)) return false
    grid.add(pos.clone())
  }
  return true
}

// SCATTER: rải tối đa `count` điểm trên mesh — sample đều theo diện tích (MeshSurfaceSampler), điểm phạm
// mask/minDist bị loại và thử lại (ngân sách 8× count lần thử → vùng mask hẹp/minDist chật trả VỀ ÍT HƠN
// count thay vì treo). Geometry cần attribute normal (PlaneGeometry/IcosahedronGeometry... có sẵn).
export function scatterOnMesh(
  geo: THREE.BufferGeometry,
  count: number,
  opts: ScatterOptions = {}
): SurfacePoint[] {
  if (count <= 0) return []
  const rng = mulberry32(opts.seed ?? 1)
  const sampler = new MeshSurfaceSampler(new THREE.Mesh(geo)) // mesh tạm chỉ để sampler đọc geometry
  // @types/three 0.174 THIẾU setRandomGenerator trong d.ts — JS CÓ THẬT (verified node_modules
  // examples/jsm/math/MeshSurfaceSampler.js: setRandomGenerator(fn){ this.randomFunction = fn }) → cast gọi.
  ;(sampler as unknown as { setRandomGenerator(fn: () => number): void }).setRandomGenerator(rng)
  sampler.build()
  const md = opts.minDist ?? 0
  const grid = md > 0 ? new HashGrid(md) : null
  const pts: SurfacePoint[] = []
  const pos = new THREE.Vector3()
  const nrm = new THREE.Vector3()
  const maxTry = count * 8
  for (let t = 0; t < maxTry && pts.length < count; t++) {
    sampler.sample(pos, nrm)
    if (tryPlace(pos, grid, md, opts.mask)) pts.push(makePoint(pos, nrm, rng))
  }
  return pts
}
