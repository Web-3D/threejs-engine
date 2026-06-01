/**
 * VỊ TRÍ   — building-kit/parts/RoofDetail.ts
 * VAI TRÒ  — Phase 3: hip (yosemune) + flat slab + shed + eave — Lab geometry
 * LIÊN HỆ  — Dùng bởi BuildingLab._showHipRoof/FlatRoof/ShedRoof/Eave()
 *
 * IQ SDF mapping (geometry là xấp xỉ — SDF bake sau):
 *   hip  → 4 directional half-space planes + opIntersection
 *   flat → sdBox slab + hollow parapet (4 slabs) — tương tự WallDetail.buildParapet
 *   shed → sdBox + shear: p.y -= p.z * slope trước khi evaluate
 *   eave → sdBox mỏng nhô ra, yPos là height slider
 *
 * Winding order (verified bằng cross product — xem comment bên trong):
 *   CCW khi nhìn từ phía NGOÀI mặt → normal hướng ra ngoài
 *
 * DISPOSE: geos + mats trả về qua PartResult — BuildingLab._clearParts() quản lý
 */

import * as THREE from 'three'

import type { PartResult } from '../tokens'
import { WALL_COLORS } from '../tokens'

// ── Interfaces ─────────────────────────────────────────────────────────────────

export interface HipRoofConfig {
  bodyW: number
  bodyH: number // ghost height + mesh.position.y offset
  bodyD: number
  ridgeH: number // chiều cao đỉnh trên mái (0.5–4.0 m)
  ridgeL: number // chiều dài cạnh đỉnh (0 = pyramid, < bodyW = hip)
  overhang: number // mái đua ra ngoài tường (0–0.6 m)
  colorIndex: number
}

export interface FlatRoofConfig {
  bodyW: number
  bodyH: number
  bodyD: number
  roofT: number // dày bản slab (0.10–0.30 m)
  overhang: number
  showParapet: boolean
  parapetH: number
  parapetT: number
  colorIndex: number
}

export interface ShedRoofConfig {
  bodyW: number
  bodyH: number
  bodyD: number
  highH: number // chiều cao đầu cao (phía trước, −Z)
  lowH: number // chiều cao đầu thấp (phía sau, +Z) — 0 = flush
  overhang: number
  colorIndex: number
}

export interface EaveConfig {
  bodyW: number
  bodyH: number // ghost reference height
  bodyD: number
  eaveT: number // dày slab mái hiên (0.06–0.20 m)
  eaveProjection: number // nhô ra (0.2–1.5 m)
  yPos: number // vị trí cao theo Y (thường cuối tầng 1 hoặc 2)
  colorIndex: number
}

// ── Palettes ───────────────────────────────────────────────────────────────────

// Ngói Nhật: từ đen xám đến terracotta
const TILE_COLORS = [
  0x3c3c3e, // ngói xám đen — phổ biến nhất Tokyo streetscape
  0x5a3e2c, // terracotta ấm — kawara truyền thống
  0x787068, // bê tông xám phong hoá — flat modern
  0x2d3a2e, // xám rêu tối — ngói cũ trong bóng
] as const

const EAVE_COLORS = [
  0xd4c8b0, // bê tông / thạch cao — trung tính
  0x8c7c5c, // gỗ nhuộm nâu ấm
  0x484644, // thép sẫm / nhôm
] as const

const PARAPET_COLOR = 0xccc8c0 // bê tông parapet — nhạt hơn tường

// ── Helpers ────────────────────────────────────────────────────────────────────

type Pair = { geos: THREE.BufferGeometry[]; meshes: THREE.Mesh[] }

function mk(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat)
  m.position.set(x, y, z)
  return m
}

// ── Hip geometry (verified winding) ───────────────────────────────────────────
// 6 vertices: 4 base corners + 2 ridge endpoints
// 8 triangles: front slope, back slope, left/right end slopes

function buildHipGeometry(hw: number, hd: number, rl: number, rh: number): THREE.BufferGeometry {
  // prettier-ignore
  const pos = new Float32Array([
    -hw, 0, -hd,  // 0 base front-left
     hw, 0, -hd,  // 1 base front-right
     hw, 0,  hd,  // 2 base back-right
    -hw, 0,  hd,  // 3 base back-left
    -rl, rh,  0,  // 4 ridge left
     rl, rh,  0,  // 5 ridge right
  ])
  // prettier-ignore
  // cross-product verified: each face normal points outward
  const idx = [
    0, 5, 1,  0, 4, 5,  // front slope (−Z, +Y)
    2, 4, 3,  2, 5, 4,  // back slope  (+Z, +Y)
    0, 3, 4,            // left end    (−X, +Y)
    1, 5, 2,            // right end   (+X, +Y)
  ]
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  return geo
}

// ── Shed geometry (verified winding) ──────────────────────────────────────────
// 8 vertices: high front (−Z) + low back (+Z) — wedge/prism shape
// lowH=0: back face degenerates gracefully (zero-area tris, silent in Three.js)

function buildShedGeometry(hw: number, hd: number, hh: number, lh: number): THREE.BufferGeometry {
  // prettier-ignore
  const pos = new Float32Array([
    -hw,  hh, -hd,  // 0 top front-left  (high end)
     hw,  hh, -hd,  // 1 top front-right
     hw,  lh,  hd,  // 2 top back-right   (low end)
    -hw,  lh,  hd,  // 3 top back-left
    -hw,   0, -hd,  // 4 bot front-left
     hw,   0, -hd,  // 5 bot front-right
     hw,   0,  hd,  // 6 bot back-right
    -hw,   0,  hd,  // 7 bot back-left
  ])
  // prettier-ignore
  const idx = [
    0, 3, 2,  0, 2, 1,  // top sloped (+Y, +Z)
    4, 0, 1,  4, 1, 5,  // front face (−Z)
    3, 6, 2,  3, 7, 6,  // back face  (+Z)
    0, 4, 7,  0, 7, 3,  // left face  (−X)
    1, 6, 5,  1, 2, 6,  // right face (+X)
  ]
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  return geo
}

// ── Flat roof helpers ──────────────────────────────────────────────────────────

function buildFlatSlab(cfg: FlatRoofConfig, mat: THREE.Material): Pair {
  const w = cfg.bodyW + cfg.overhang * 2
  const d = cfg.bodyD + cfg.overhang * 2
  const geo = new THREE.BoxGeometry(w, cfg.roofT, d)
  // slab bottom aligns with bodyH, center at bodyH + roofT/2
  return { geos: [geo], meshes: [mk(geo, mat, 0, cfg.bodyH + cfg.roofT / 2, 0)] }
}

// Parapet tương tự WallDetail.buildParapet nhưng ngồi trên bản slab (bodyH + roofT)
function buildFlatParapet(cfg: FlatRoofConfig, mat: THREE.Material): Pair {
  if (!cfg.showParapet) return { geos: [], meshes: [] }
  const w = cfg.bodyW + cfg.overhang * 2
  const d = cfg.bodyD + cfg.overhang * 2
  const { parapetH: pH, parapetT: pT, bodyH: bh, roofT: rt } = cfg
  const py = bh + rt + pH / 2
  const geoFB = new THREE.BoxGeometry(w + pT * 2, pH, pT)
  const geoSide = new THREE.BoxGeometry(pT, pH, d)
  return {
    geos: [geoFB, geoSide],
    meshes: [
      mk(geoFB, mat, 0, py, d / 2 - pT / 2),
      mk(geoFB, mat, 0, py, -d / 2 + pT / 2),
      mk(geoSide, mat, w / 2 - pT / 2, py, 0),
      mk(geoSide, mat, -w / 2 + pT / 2, py, 0),
    ],
  }
}

// ── Exports ────────────────────────────────────────────────────────────────────

export function makeHipRoof(cfg: HipRoofConfig): PartResult {
  const mat = new THREE.MeshToonMaterial({
    color: TILE_COLORS[cfg.colorIndex % TILE_COLORS.length],
  })
  const hw = cfg.bodyW / 2 + cfg.overhang
  const hd = cfg.bodyD / 2 + cfg.overhang
  const geo = buildHipGeometry(hw, hd, cfg.ridgeL / 2, cfg.ridgeH)
  const mesh = new THREE.Mesh(geo, mat)
  mesh.position.y = cfg.bodyH
  return { geos: [geo], mats: [mat], meshes: [mesh] }
}

export function makeFlatRoof(cfg: FlatRoofConfig): PartResult {
  const matSlab = new THREE.MeshToonMaterial({
    color: TILE_COLORS[cfg.colorIndex % TILE_COLORS.length],
  })
  const matPar = new THREE.MeshToonMaterial({ color: PARAPET_COLOR })
  const parts = [buildFlatSlab(cfg, matSlab), buildFlatParapet(cfg, matPar)]
  return {
    geos: parts.flatMap((p) => p.geos),
    mats: [matSlab, matPar],
    meshes: parts.flatMap((p) => p.meshes),
  }
}

export function makeShedRoof(cfg: ShedRoofConfig): PartResult {
  const mat = new THREE.MeshToonMaterial({
    color: TILE_COLORS[cfg.colorIndex % TILE_COLORS.length],
  })
  const hw = cfg.bodyW / 2 + cfg.overhang
  const hd = cfg.bodyD / 2 + cfg.overhang
  const geo = buildShedGeometry(hw, hd, cfg.highH, cfg.lowH)
  const mesh = new THREE.Mesh(geo, mat)
  mesh.position.y = cfg.bodyH
  return { geos: [geo], mats: [mat], meshes: [mesh] }
}

export function makeEave(cfg: EaveConfig): PartResult {
  const mat = new THREE.MeshToonMaterial({
    color: EAVE_COLORS[cfg.colorIndex % EAVE_COLORS.length],
  })
  const w = cfg.bodyW + cfg.eaveProjection * 2
  const d = cfg.bodyD + cfg.eaveProjection * 2
  const geo = new THREE.BoxGeometry(w, cfg.eaveT, d)
  // slab center at yPos + eaveT/2 (bottom of slab = yPos)
  const mesh = mk(geo, mat, 0, cfg.yPos + cfg.eaveT / 2, 0)
  return { geos: [geo], mats: [mat], meshes: [mesh] }
}

// Re-export TILE_COLORS length cho GUI range
export const TILE_COLORS_COUNT = TILE_COLORS.length
export const EAVE_COLORS_COUNT = EAVE_COLORS.length
export const WALL_COLORS_REF = WALL_COLORS // flat parapet dùng WALL_COLORS nếu muốn
