/**
 * VỊ TRÍ   — building-kit/parts/OpeningDetail.ts
 * VAI TRÒ  — Phase 4: door_frame + window_frame + window_grid + window_strip + loading_door — Lab geometry
 * LIÊN HỆ  — Dùng bởi BuildingLab._showDoorFrame / _showWindowFrame / _showWindowGrid / _showWindowStrip / _showLoadingDoor
 *
 * IQ SDF mapping (geometry là xấp xỉ — SDF bake sau):
 *   door_frame   → opSubtraction(hole, wall) + U-frame depth reveal
 *   window_frame → sdRoundBox outer ring + glass panel
 *   window_grid  → frame + opRep cross mullions
 *   window_strip → sdBox horizontal band per floor (office curtain wall)
 *   loading_door → sdBox panel + opRep horizontal ribs (rolling shutter)
 *
 * Winding / dispose: geometry via PartResult — BuildingLab._clearParts() quản lý
 */

import * as THREE from 'three'

import type { PartResult } from '../tokens'

// ── Color palettes ──────────────────────────────────────────────────────────

// Khung cửa: nhôm anodized / gỗ / sắt / sơn trắng
const FRAME_COLORS = [
  0x8a8a8a, // nhôm bạc — phổ biến nhất
  0x5c4033, // gỗ nâu
  0x2c2c2c, // đen matte — nhà hiện đại
  0xe8e0d0, // trắng/kem sơn
] as const

// Cánh cửa đi
const DOOR_PANEL_COLORS = [
  0x2c3e50, // navy — nhà ở Nhật
  0x8b6914, // gỗ vàng nâu
  0x1a1a1a, // đen matte
  0xc0392b, // đỏ — convenience store
] as const

const GLASS_COLOR = 0x90b4c8 // kính xanh nhạt

// Cửa cuốn / rolling shutter
const LOADING_COLORS = [
  0x6e7f80, // xám công nghiệp
  0x8a6060, // nâu đỏ gỉ — kho cũ
  0x4a5568, // xám xanh đậm
] as const

// ── Helpers ─────────────────────────────────────────────────────────────────

type Pair = { geos: THREE.BufferGeometry[]; meshes: THREE.Mesh[] }

function mk(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat)
  m.position.set(x, y, z)
  return m
}

// ── Interfaces ───────────────────────────────────────────────────────────────

export interface DoorFrameConfig {
  bodyW: number // wall width (ghost)
  bodyH: number // wall height
  bodyD: number // wall depth
  doorW: number // opening width (0.8–1.2)
  doorH: number // opening height (2.0–2.8)
  frameT: number // jamb/header thickness (0.05–0.15)
  frameDepth: number // depth reveal into wall (0.05–0.20)
  colorIndex: number // frame color
  panelIndex: number // door panel color
}

export interface WindowFrameConfig {
  bodyW: number
  bodyH: number
  bodyD: number
  winW: number // outer frame width (0.6–2.0)
  winH: number // outer frame height (0.6–1.8)
  frameT: number // ring thickness (0.04–0.15)
  frameDepth: number // depth reveal (0.04–0.20)
  yPos: number // window center height from ground
  colorIndex: number
}

export interface WindowGridConfig {
  bodyW: number
  bodyH: number
  bodyD: number
  winW: number
  winH: number
  frameT: number
  frameDepth: number // depth reveal (0.04–0.20)
  mullionT: number // mullion thickness (0.02–0.06)
  cols: number // 1–4 columns of panes
  rows: number // 1–3 rows
  yPos: number
  colorIndex: number
}

export interface WindowStripConfig {
  bodyW: number
  bodyH: number
  bodyD: number
  numFloors: number // 1–4
  floorH: number // floor height (2.5–4.0)
  stripH: number // glass strip height per floor (0.5–2.0)
  frameT: number // top + bottom frame rail (0.04–0.12)
  colorIndex: number
}

export interface LoadingDoorConfig {
  bodyW: number
  bodyH: number
  bodyD: number
  doorW: number // opening width (2.5–6.0)
  doorH: number // opening height (2.5–4.0)
  trackCount: number // horizontal rib count (4–10)
  colorIndex: number
}

// ── Builders ─────────────────────────────────────────────────────────────────

// Door frame: left jamb + right jamb + top header (U-shape) + door panel recessed
function buildDoorFrame(
  cfg: DoorFrameConfig,
  matFrame: THREE.Material,
  matPanel: THREE.Material
): Pair {
  const { doorW: dw, doorH: dh, frameT: ft, frameDepth: fd, bodyD } = cfg
  // Frame center recessed: outer face at bodyD/2, inner face at bodyD/2 − fd
  const fz = bodyD / 2 - fd / 2

  const jambGeo = new THREE.BoxGeometry(ft, dh, fd)
  const headerGeo = new THREE.BoxGeometry(dw + ft * 2, ft, fd)
  const panelGeo = new THREE.BoxGeometry(dw - 0.02, dh - 0.02, 0.04)

  const geos: THREE.BufferGeometry[] = [jambGeo, headerGeo, panelGeo]
  const meshes: THREE.Mesh[] = [
    mk(jambGeo, matFrame, -(dw / 2 + ft / 2), dh / 2, fz), // left jamb
    mk(jambGeo, matFrame, dw / 2 + ft / 2, dh / 2, fz), // right jamb (reuse geo)
    mk(headerGeo, matFrame, 0, dh + ft / 2, fz), // top header
    mk(panelGeo, matPanel, 0, dh / 2, bodyD / 2 - fd - 0.02), // panel behind frame
  ]
  return { geos, meshes }
}

// Window frame: 4-sided ring (top/bottom rails + left/right stiles) + glass
function buildWindowFrame(
  cfg: WindowFrameConfig,
  matFrame: THREE.Material,
  matGlass: THREE.Material
): Pair {
  const { winW: ww, winH: wh, frameT: ft, frameDepth: fd, bodyD, yPos } = cfg
  const fz = bodyD / 2 - fd / 2

  const railGeo = new THREE.BoxGeometry(ww, ft, fd)
  const stileGeo = new THREE.BoxGeometry(ft, wh - ft * 2, fd)
  const glassGeo = new THREE.BoxGeometry(ww - ft * 2, wh - ft * 2, 0.03)

  const geos: THREE.BufferGeometry[] = [railGeo, stileGeo, glassGeo]
  const meshes: THREE.Mesh[] = [
    mk(railGeo, matFrame, 0, yPos + wh / 2 - ft / 2, fz), // top rail
    mk(railGeo, matFrame, 0, yPos - wh / 2 + ft / 2, fz), // bottom rail
    mk(stileGeo, matFrame, -(ww / 2 - ft / 2), yPos, fz), // left stile
    mk(stileGeo, matFrame, ww / 2 - ft / 2, yPos, fz), // right stile
    mk(glassGeo, matGlass, 0, yPos, bodyD / 2 - fd - 0.01), // glass behind
  ]
  return { geos, meshes }
}

// Window grid: outer ring + (cols-1) vertical + (rows-1) horizontal mullions + glass
function buildWindowGrid(
  cfg: WindowGridConfig,
  matFrame: THREE.Material,
  matGlass: THREE.Material
): Pair {
  const {
    winW: ww,
    winH: wh,
    frameT: ft,
    mullionT: mt,
    frameDepth: fd,
    bodyD,
    yPos,
    cols,
    rows,
  } = cfg
  const fz = bodyD / 2 - fd / 2
  const innerW = ww - ft * 2
  const innerH = wh - ft * 2

  const geos: THREE.BufferGeometry[] = []
  const meshes: THREE.Mesh[] = []

  // Outer ring
  const railGeo = new THREE.BoxGeometry(ww, ft, fd)
  const stileGeo = new THREE.BoxGeometry(ft, innerH, fd)
  geos.push(railGeo, stileGeo)
  meshes.push(
    mk(railGeo, matFrame, 0, yPos + wh / 2 - ft / 2, fz),
    mk(railGeo, matFrame, 0, yPos - wh / 2 + ft / 2, fz),
    mk(stileGeo, matFrame, -(ww / 2 - ft / 2), yPos, fz),
    mk(stileGeo, matFrame, ww / 2 - ft / 2, yPos, fz)
  )

  // Vertical mullions
  if (cols > 1) {
    const vGeo = new THREE.BoxGeometry(mt, innerH, fd)
    geos.push(vGeo)
    for (let i = 1; i < cols; i++) {
      meshes.push(mk(vGeo, matFrame, -innerW / 2 + (innerW / cols) * i, yPos, fz))
    }
  }

  // Horizontal mullions
  if (rows > 1) {
    const hGeo = new THREE.BoxGeometry(innerW, mt, fd)
    geos.push(hGeo)
    for (let i = 1; i < rows; i++) {
      meshes.push(mk(hGeo, matFrame, 0, yPos - innerH / 2 + (innerH / rows) * i, fz))
    }
  }

  const glassGeo = new THREE.BoxGeometry(innerW, innerH, 0.03)
  geos.push(glassGeo)
  meshes.push(mk(glassGeo, matGlass, 0, yPos, bodyD / 2 - fd - 0.01))

  return { geos, meshes }
}

// Window strip: per-floor horizontal glass band + top/bottom frame rails
function buildWindowStrip(
  cfg: WindowStripConfig,
  matFrame: THREE.Material,
  matGlass: THREE.Material
): Pair {
  const { bodyW, bodyD, numFloors, floorH, stripH, frameT: ft } = cfg
  const fz = bodyD / 2

  const railGeo = new THREE.BoxGeometry(bodyW, ft, ft)
  const glassGeo = new THREE.BoxGeometry(bodyW, stripH, 0.03)
  const geos: THREE.BufferGeometry[] = [railGeo, glassGeo]
  const meshes: THREE.Mesh[] = []

  for (let fl = 0; fl < numFloors; fl++) {
    const centerY = fl * floorH + floorH * 0.3 + stripH / 2
    meshes.push(
      mk(railGeo, matFrame, 0, centerY + stripH / 2 + ft / 2, fz - ft / 2), // top rail
      mk(railGeo, matFrame, 0, centerY - stripH / 2 - ft / 2, fz - ft / 2), // bottom rail
      mk(glassGeo, matGlass, 0, centerY, fz - 0.015) // glass panel
    )
  }

  return { geos, meshes }
}

// Loading door: main panel + horizontal ribs (rolling shutter slat joints)
function buildLoadingDoor(cfg: LoadingDoorConfig, mat: THREE.Material): Pair {
  const { doorW: dw, doorH: dh, bodyD, trackCount } = cfg
  const fz = bodyD / 2

  const panelGeo = new THREE.BoxGeometry(dw, dh, 0.05)
  const ribGeo = new THREE.BoxGeometry(dw + 0.02, 0.018, 0.04)
  const geos: THREE.BufferGeometry[] = [panelGeo, ribGeo]
  const meshes: THREE.Mesh[] = [mk(panelGeo, mat, 0, dh / 2, fz + 0.025)]

  const spacing = dh / (trackCount + 1)
  for (let i = 1; i <= trackCount; i++) {
    meshes.push(mk(ribGeo, mat, 0, spacing * i, fz + 0.07))
  }

  return { geos, meshes }
}

// ── Exports ───────────────────────────────────────────────────────────────────

export function makeDoorFrame(cfg: DoorFrameConfig): PartResult {
  const matFrame = new THREE.MeshToonMaterial({
    color: FRAME_COLORS[cfg.colorIndex % FRAME_COLORS.length],
  })
  const matPanel = new THREE.MeshToonMaterial({
    color: DOOR_PANEL_COLORS[cfg.panelIndex % DOOR_PANEL_COLORS.length],
  })
  const parts = buildDoorFrame(cfg, matFrame, matPanel)
  return { geos: parts.geos, mats: [matFrame, matPanel], meshes: parts.meshes }
}

export function makeWindowFrame(cfg: WindowFrameConfig): PartResult {
  const matFrame = new THREE.MeshToonMaterial({
    color: FRAME_COLORS[cfg.colorIndex % FRAME_COLORS.length],
  })
  const matGlass = new THREE.MeshToonMaterial({
    color: GLASS_COLOR,
    transparent: true,
    opacity: 0.7,
  })
  const parts = buildWindowFrame(cfg, matFrame, matGlass)
  return { geos: parts.geos, mats: [matFrame, matGlass], meshes: parts.meshes }
}

export function makeWindowGrid(cfg: WindowGridConfig): PartResult {
  const matFrame = new THREE.MeshToonMaterial({
    color: FRAME_COLORS[cfg.colorIndex % FRAME_COLORS.length],
  })
  const matGlass = new THREE.MeshToonMaterial({
    color: GLASS_COLOR,
    transparent: true,
    opacity: 0.7,
  })
  const parts = buildWindowGrid(cfg, matFrame, matGlass)
  return { geos: parts.geos, mats: [matFrame, matGlass], meshes: parts.meshes }
}

export function makeWindowStrip(cfg: WindowStripConfig): PartResult {
  const matFrame = new THREE.MeshToonMaterial({
    color: FRAME_COLORS[cfg.colorIndex % FRAME_COLORS.length],
  })
  const matGlass = new THREE.MeshToonMaterial({
    color: GLASS_COLOR,
    transparent: true,
    opacity: 0.7,
  })
  const parts = buildWindowStrip(cfg, matFrame, matGlass)
  return { geos: parts.geos, mats: [matFrame, matGlass], meshes: parts.meshes }
}

export function makeLoadingDoor(cfg: LoadingDoorConfig): PartResult {
  const mat = new THREE.MeshToonMaterial({
    color: LOADING_COLORS[cfg.colorIndex % LOADING_COLORS.length],
  })
  const parts = buildLoadingDoor(cfg, mat)
  return { geos: parts.geos, mats: [mat], meshes: parts.meshes }
}

// Re-export color counts cho GUI range
export const FRAME_COLORS_COUNT = FRAME_COLORS.length
export const DOOR_PANEL_COLORS_COUNT = DOOR_PANEL_COLORS.length
export const LOADING_COLORS_COUNT = LOADING_COLORS.length
