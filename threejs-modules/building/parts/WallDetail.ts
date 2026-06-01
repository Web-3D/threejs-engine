/**
 * VỊ TRÍ   — building-kit/parts/WallDetail.ts
 * VAI TRÒ  — Phase 2: wall_reveal (rãnh shadow line per tầng) + wall_panel (curtain wall)
 * LIÊN HỆ  — Dùng bởi BuildingLab._showWallReveal() / _showWallPanel()
 *
 * IQ SDF mapping (geometry là xấp xỉ — SDF bake sẽ thay sau):
 *   wall_reveal → opSubtraction(cut_box, wall) tạo groove; ở đây = panels có gap visible
 *   parapet     → hollow sdBox (4 slabs) — signal khi roofH ≤ 1.0
 *   wall_panel  → opRep(sdBox per cell) + groove = mullion gap giữa panels
 *
 * DISPOSE: geos + mats trả về qua PartResult — BuildingLab._clearParts() quản lý
 */

import * as THREE from 'three'

import type { PartResult } from '../tokens'
import { OFFICE_GLASS_COLORS, WALL_COLORS } from '../tokens'

export interface WallRevealConfig {
  bodyW: number
  bodyH: number
  bodyD: number
  numFloors: number
  revealH: number // chiều cao rãnh (groove) giữa các tầng: 0.02–0.10 m
  colorIndex: number
  showParapet: boolean
  parapetH: number // chiều cao parapet trên đỉnh
  parapetT: number // dày tường parapet
}

export interface WallPanelConfig {
  bodyW: number
  bodyH: number
  bodyD: number
  panelW: number // rộng mỗi cell panel (bao gồm groove)
  panelH: number // cao mỗi cell panel
  grooveW: number // rộng mullion/groove giữa panels
  frameIndex: number // FRAME_COLORS index
  glassIndex: number // OFFICE_GLASS_COLORS index
}

// ── Palettes ───────────────────────────────────────────────────────────────────
const PARAPET_COLOR = 0xccc8c0 // bê tông parapet — nhạt hơn tường chính
const FRAME_COLORS = [
  0x28282c, // thép đen anodized — Tokyo Midtown style
  0x383640, // xám xanh — aluminium anodized
  0x383028, // đồng tối — bronze curtain wall
  0x283428, // xanh rêu tối — industrial office
] as const

// ── Helpers ────────────────────────────────────────────────────────────────────

type Pair = { geos: THREE.BufferGeometry[]; meshes: THREE.Mesh[] }

function mk(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat)
  m.position.set(x, y, z)
  return m
}

// ── wall_reveal ────────────────────────────────────────────────────────────────

// N panels tách biệt per tầng — khoảng trống giữa = groove shadow line
// IQ: opSubtraction(cut, wall) tạo indent; ở đây void giữa panels tương đương visually
function buildRevealPanels(cfg: WallRevealConfig, mat: THREE.Material): Pair {
  const floors = Math.max(1, Math.round(cfg.numFloors))
  const floorH = cfg.bodyH / floors
  // Mỗi panel chiếm (floorH - revealH) — phần còn lại là void (groove)
  const panelH = Math.max(0.05, floorH - cfg.revealH)
  const geo = new THREE.BoxGeometry(cfg.bodyW, panelH, cfg.bodyD)
  const meshes: THREE.Mesh[] = []
  for (let i = 0; i < floors; i++) {
    // Panel bắt đầu từ y = floorH*i, groove nằm ở phần trên mỗi tầng
    meshes.push(mk(geo, mat, 0, floorH * i + panelH / 2, 0))
  }
  return { geos: [geo], meshes }
}

// Parapet: 4 tường mỏng tạo frame rỗng trên đỉnh mái phẳng
// IQ: sdBox(outer) opSubtraction sdBox(inner) → hollow; ở đây = 4 slabs rời
function buildParapet(cfg: WallRevealConfig, mat: THREE.Material): Pair {
  if (!cfg.showParapet) return { geos: [], meshes: [] }
  const { bodyW, bodyD, parapetH: pH, parapetT: pT } = cfg
  const py = cfg.bodyH + pH / 2

  // Front/back: toàn bộ chiều ngang (bao gộp góc)
  const geoFB = new THREE.BoxGeometry(bodyW + pT * 2, pH, pT)
  // Sides: chiều sâu nằm giữa front/back (không overlap góc)
  const geoSide = new THREE.BoxGeometry(pT, pH, bodyD)

  return {
    geos: [geoFB, geoSide],
    meshes: [
      mk(geoFB, mat, 0, py, bodyD / 2 - pT / 2), // front
      mk(geoFB, mat, 0, py, -bodyD / 2 + pT / 2), // back
      mk(geoSide, mat, bodyW / 2 - pT / 2, py, 0), // right
      mk(geoSide, mat, -bodyW / 2 + pT / 2, py, 0), // left
    ],
  }
}

export function makeWallReveal(cfg: WallRevealConfig): PartResult {
  // polygonOffset: wall panels là "nền" — column/attachment detail luôn thắng depth
  const matWall = new THREE.MeshToonMaterial({
    color: WALL_COLORS[cfg.colorIndex % WALL_COLORS.length],
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  })
  const matParapet = new THREE.MeshToonMaterial({ color: PARAPET_COLOR })
  const parts = [buildRevealPanels(cfg, matWall), buildParapet(cfg, matParapet)]
  return {
    geos: parts.flatMap((p) => p.geos),
    mats: [matWall, matParapet],
    meshes: parts.flatMap((p) => p.meshes),
  }
}

// ── wall_panel ─────────────────────────────────────────────────────────────────

// Wall body tối = khung mullion (structural depth)
function buildPanelFrame(cfg: WallPanelConfig, mat: THREE.Material): Pair {
  const geo = new THREE.BoxGeometry(cfg.bodyW, cfg.bodyH, cfg.bodyD)
  return { geos: [geo], meshes: [mk(geo, mat, 0, cfg.bodyH / 2, 0)] }
}

// Grid panel inserts trên front + back face
// IQ: opRep(cell) với cell = sdBox panel; groove = khoảng trống giữa
// Shared geometry (1 BoxGeometry, nhiều Mesh instance) — Lab preview không cần performance opt
function buildPanelInserts(cfg: WallPanelConfig, mat: THREE.Material): Pair {
  const numCols = Math.max(1, Math.floor(cfg.bodyW / cfg.panelW))
  const numRows = Math.max(1, Math.floor(cfg.bodyH / cfg.panelH))
  const insertW = Math.max(0.05, cfg.panelW - cfg.grooveW)
  const insertH = Math.max(0.05, cfg.panelH - cfg.grooveW)
  const geo = new THREE.BoxGeometry(insertW, insertH, 0.04)

  // Căn giữa grid theo X và Y
  const startX = -(numCols * cfg.panelW) / 2 + cfg.panelW / 2
  const startY = (cfg.bodyH - numRows * cfg.panelH) / 2 + cfg.panelH / 2

  const meshes: THREE.Mesh[] = []
  for (let row = 0; row < numRows; row++) {
    for (let col = 0; col < numCols; col++) {
      const x = startX + col * cfg.panelW
      const y = startY + row * cfg.panelH
      // Front face (+Z) và Back face (-Z) — side faces: TODO khi cần 4-sided preview
      meshes.push(mk(geo, mat, x, y, cfg.bodyD / 2 + 0.02))
      meshes.push(mk(geo, mat, x, y, -cfg.bodyD / 2 - 0.02))
    }
  }
  return { geos: [geo], meshes }
}

export function makeWallPanel(cfg: WallPanelConfig): PartResult {
  // polygonOffset: frame body là "nền" — panel insert glass luôn thắng depth
  const matFrame = new THREE.MeshToonMaterial({
    color: FRAME_COLORS[cfg.frameIndex % FRAME_COLORS.length],
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  })
  const matGlass = new THREE.MeshToonMaterial({
    color: OFFICE_GLASS_COLORS[cfg.glassIndex % OFFICE_GLASS_COLORS.length],
  })
  const parts = [buildPanelFrame(cfg, matFrame), buildPanelInserts(cfg, matGlass)]
  return {
    geos: parts.flatMap((p) => p.geos),
    mats: [matFrame, matGlass],
    meshes: parts.flatMap((p) => p.meshes),
  }
}
