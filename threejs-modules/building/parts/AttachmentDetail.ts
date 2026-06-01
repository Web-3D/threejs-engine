/**
 * VỊ TRÍ   — building-kit/parts/AttachmentDetail.ts
 * VAI TRÒ  — Phase 5: balcony_slab + balcony_railing + awning + drain_pipe + ac_unit + meter_box + antenna — Lab geometry
 * LIÊN HỆ  — Dùng bởi BuildingLab._showBalconySlab / _showBalconyRailing / _showAwning / etc.
 *
 * IQ SDF mapping (geometry là xấp xỉ — SDF bake sau):
 *   balcony_slab    → sdBox nhô ra + thin drip edge
 *   balcony_railing → opRepLim(sdCylinder post) + 2 sdCapsule rails
 *   awning          → sdBox xoay angle quanh điểm gắn tường
 *   drain_pipe      → sdCylinder mỏng full-height + sdRoundBox bracket
 *   ac_unit         → sdRoundBox body + opRep horizontal grill slats
 *   meter_box       → sdRoundBox flat gắn tường
 *   antenna         → sdCylinder mast + sdCapsule elements ngang
 *
 * DISPOSE: geos + mats trả về qua PartResult — BuildingLab._clearParts() quản lý
 */

import * as THREE from 'three'

import type { PartResult } from '../tokens'

// ── Color palettes ────────────────────────────────────────────────────────────

const CONCRETE_COLOR = 0xc8c0b4 // bê tông ban công

const RAILING_COLORS = [
  0x8a8a8a, // thép mạ kẽm bạc
  0x2c2c2c, // sắt đen
  0xdcd0b0, // nhôm nhạt
] as const

const AWNING_COLORS = [
  0x2c5282, // navy — phổ biến nhất Nhật
  0x742a2a, // đỏ đậm
  0x276749, // xanh lá
  0xf6ad55, // cam — convenience store
] as const

const PIPE_COLOR = 0x5a6472 // amadoi — thép mạ kẽm

const AC_COLORS = [
  0xf0ece0, // trắng kem — Daikin/Mitsubishi
  0x8a8a8a, // xám
] as const

const METER_BOX_COLOR = 0xb4a090 // beige trung tính

const ANTENNA_COLOR = 0x8a8a8a // thép xám

// ── Helpers ───────────────────────────────────────────────────────────────────

type Pair = { geos: THREE.BufferGeometry[]; meshes: THREE.Mesh[] }

function mk(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat)
  m.position.set(x, y, z)
  return m
}

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface BalconySlabConfig {
  bodyW: number
  bodyH: number
  bodyD: number
  slabW: number // slab width (< bodyW)
  slabD: number // cantilever depth (0.8–1.5)
  slabT: number // thickness (0.10–0.20)
  yPos: number // floor level height from ground
  colorIndex: number
}

export interface BalconyRailingConfig {
  bodyW: number
  bodyH: number
  bodyD: number
  slabW: number // matching balcony slab width
  slabD: number // matching cantilever depth
  slabT: number // slab thickness (for railing base Y)
  slabY: number // slab floor level
  railingH: number // railing height (0.9–1.2)
  postR: number // post cylinder radius (0.02–0.05)
  postCount: number // number of front posts (3–8)
  railT: number // rail bar thickness (0.015–0.04)
  colorIndex: number
}

export interface AwningConfig {
  bodyW: number
  bodyH: number
  bodyD: number
  awningW: number // width
  awningD: number // projection depth
  awningT: number // thickness (0.05–0.10)
  angle: number // tilt angle degrees (10–45) — front tips down
  yPos: number // attachment height on wall
  colorIndex: number
}

export interface DrainPipeConfig {
  bodyW: number
  bodyH: number // pipe runs full height
  bodyD: number
  pipeR: number // pipe radius (0.03–0.06)
  xPos: number // horizontal position (near corner)
  bracketCount: number // wall brackets (2–5)
  colorIndex: number
}

export interface ACUnitConfig {
  bodyW: number
  bodyH: number
  bodyD: number
  unitW: number // width (0.7–1.0)
  unitH: number // height (0.5–0.8)
  unitD: number // depth (0.25–0.40)
  grillSlats: number // horizontal grill count (3–8)
  xPos: number // horizontal offset from center
  yPos: number // base height from ground
  colorIndex: number
}

export interface MeterBoxConfig {
  bodyW: number
  bodyH: number
  bodyD: number
  boxW: number // width (0.25–0.45)
  boxH: number // height (0.35–0.60)
  boxD: number // depth/thickness (0.05–0.15)
  xPos: number
  yPos: number
  colorIndex: number
}

export interface AntennaConfig {
  bodyW: number
  bodyH: number // mast base = bodyH (on roof)
  bodyD: number
  mastH: number // mast height (0.8–2.5)
  mastR: number // mast radius (0.01–0.03)
  elementCount: number // Yagi elements (3–8)
  elementL: number // element total length (0.4–1.0)
  elementR: number // element radius (0.005–0.015)
  xPos: number
  colorIndex: number
}

// ── Builders ──────────────────────────────────────────────────────────────────

// Balcony slab: flat box cantilevered from wall face + thin drip edge at front
function buildBalconySlab(cfg: BalconySlabConfig, mat: THREE.Material): Pair {
  const { bodyD, slabW, slabD, slabT, yPos } = cfg
  // Back edge of slab flush with wall face
  const slabCenterZ = bodyD / 2 + slabD / 2

  const slabGeo = new THREE.BoxGeometry(slabW, slabT, slabD)
  // Drip edge: thin strip at front-bottom corner (water shedding detail)
  const dripGeo = new THREE.BoxGeometry(slabW, 0.04, 0.04)

  return {
    geos: [slabGeo, dripGeo],
    meshes: [
      mk(slabGeo, mat, 0, yPos + slabT / 2, slabCenterZ),
      mk(dripGeo, mat, 0, yPos, bodyD / 2 + slabD + 0.02), // front-bottom edge
    ],
  }
}

// Balcony railing: front posts (CylinderGeo) + top rail + mid rail
function buildBalconyRailing(cfg: BalconyRailingConfig, mat: THREE.Material): Pair {
  const { bodyD, slabW, slabD, slabT, slabY, railingH, postR, postCount, railT } = cfg
  const frontZ = bodyD / 2 + slabD // front face of slab
  const baseY = slabY + slabT // railing base = top of slab

  const geos: THREE.BufferGeometry[] = []
  const meshes: THREE.Mesh[] = []

  // Posts: CylinderGeometry(rTop, rBottom, height, segments)
  const postGeo = new THREE.CylinderGeometry(postR, postR, railingH, 6)
  geos.push(postGeo)
  const postY = baseY + railingH / 2
  for (let i = 0; i < postCount; i++) {
    const x = -slabW / 2 + (slabW / (postCount - 1)) * i
    meshes.push(mk(postGeo, mat, x, postY, frontZ))
  }

  // Top rail
  const topRailGeo = new THREE.BoxGeometry(slabW, railT * 2, railT * 2)
  geos.push(topRailGeo)
  meshes.push(mk(topRailGeo, mat, 0, baseY + railingH, frontZ))

  // Mid rail at ~45% height
  const midRailGeo = new THREE.BoxGeometry(slabW, railT, railT * 2)
  geos.push(midRailGeo)
  meshes.push(mk(midRailGeo, mat, 0, baseY + railingH * 0.45, frontZ))

  return { geos, meshes }
}

// Awning: tilted box — back edge at wall face (bodyD/2) at yPos
function buildAwning(cfg: AwningConfig, mat: THREE.Material): Pair {
  const { bodyD, awningW, awningD, awningT, angle, yPos } = cfg
  const rad = (angle * Math.PI) / 180
  // Position center such that back edge lands at z=bodyD/2, y=yPos after rotation.x = -rad
  // From rotation matrix (rx = -rad): back point (0, 0, -awningD/2) transforms to:
  //   z' = (-awningD/2)*cos(rad), y' = (-awningD/2)*sin(rad) (wait, let me recalculate)
  // rotation.x = θ: y' = y*cos(θ) - z*sin(θ), z' = y*sin(θ) + z*cos(θ)
  // θ = -rad, back point (0, 0, -awningD/2):
  //   y' = 0 - (-awningD/2)*sin(-rad) = -awningD/2 * sin(rad)  [downward = negative]
  //   z' = 0 + (-awningD/2)*cos(-rad) = -awningD/2 * cos(rad)
  // Center must satisfy: centerZ + z' = bodyD/2 → centerZ = bodyD/2 + awningD/2 * cos(rad)
  //                      centerY + y' = yPos    → centerY = yPos + awningD/2 * sin(rad)
  const cz = bodyD / 2 + (awningD / 2) * Math.cos(rad)
  const cy = yPos + (awningD / 2) * Math.sin(rad)

  const geo = new THREE.BoxGeometry(awningW, awningT, awningD)
  const mesh = new THREE.Mesh(geo, mat)
  mesh.position.set(0, cy, cz)
  mesh.rotation.x = -rad // front tips downward

  return { geos: [geo], meshes: [mesh] }
}

// Drain pipe: full-height thin cylinder against wall face + flat bracket clamps
function buildDrainPipe(cfg: DrainPipeConfig, mat: THREE.Material): Pair {
  const { bodyH, bodyD, pipeR, xPos, bracketCount } = cfg
  const pipeH = bodyH - 0.1
  const fz = bodyD / 2 + pipeR // pipe touches wall face

  const geos: THREE.BufferGeometry[] = []
  const meshes: THREE.Mesh[] = []

  const pipeGeo = new THREE.CylinderGeometry(pipeR, pipeR, pipeH, 6)
  geos.push(pipeGeo)
  meshes.push(mk(pipeGeo, mat, xPos, pipeH / 2 + 0.1, fz))

  // Bracket clamps at regular intervals
  const bracketGeo = new THREE.BoxGeometry(pipeR * 4, pipeR * 2, pipeR * 3)
  geos.push(bracketGeo)
  const bracketSpacing = pipeH / (bracketCount + 1)
  for (let i = 1; i <= bracketCount; i++) {
    meshes.push(mk(bracketGeo, mat, xPos, 0.1 + bracketSpacing * i, fz + pipeR * 1.5))
  }

  return { geos, meshes }
}

// AC unit: box body + horizontal grill slats on front face
function buildACUnit(cfg: ACUnitConfig, mat: THREE.Material): Pair {
  const { bodyD, unitW, unitH, unitD, grillSlats, xPos, yPos } = cfg
  const fz = bodyD / 2 + unitD / 2 // unit protrudes from wall face

  const geos: THREE.BufferGeometry[] = []
  const meshes: THREE.Mesh[] = []

  const bodyGeo = new THREE.BoxGeometry(unitW, unitH, unitD)
  geos.push(bodyGeo)
  meshes.push(mk(bodyGeo, mat, xPos, yPos + unitH / 2, fz))

  // Grill slats: horizontal strips across front face
  const grillBottom = yPos + unitH * 0.1
  const grillSpan = unitH * 0.8
  const spacing = grillSpan / grillSlats
  const slatH = spacing * 0.55

  const slatGeo = new THREE.BoxGeometry(unitW - 0.04, slatH, 0.03)
  geos.push(slatGeo)
  for (let i = 0; i < grillSlats; i++) {
    const sy = grillBottom + spacing * (i + 0.5)
    meshes.push(mk(slatGeo, mat, xPos, sy, bodyD / 2 + unitD + 0.015))
  }

  return { geos, meshes }
}

// Meter box: flat box flush on wall face
function buildMeterBox(cfg: MeterBoxConfig, mat: THREE.Material): Pair {
  const { bodyD, boxW, boxH, boxD, xPos, yPos } = cfg
  const fz = bodyD / 2 + boxD / 2

  const geo = new THREE.BoxGeometry(boxW, boxH, boxD)
  return {
    geos: [geo],
    meshes: [mk(geo, mat, xPos, yPos + boxH / 2, fz)],
  }
}

// Antenna: vertical mast + horizontal Yagi elements at intervals
function buildAntenna(cfg: AntennaConfig, mat: THREE.Material): Pair {
  const { bodyH, mastH, mastR, elementCount, elementL, elementR, xPos } = cfg

  const geos: THREE.BufferGeometry[] = []
  const meshes: THREE.Mesh[] = []

  // Mast: vertical thin cylinder from roof (bodyH) upward
  const mastGeo = new THREE.CylinderGeometry(mastR, mastR * 1.5, mastH, 6)
  geos.push(mastGeo)
  meshes.push(mk(mastGeo, mat, xPos, bodyH + mastH / 2, 0))

  // Elements: horizontal cylinders (Yagi style), rotated 90° around Z to lie horizontal
  const elemGeo = new THREE.CylinderGeometry(elementR, elementR, elementL, 5)
  geos.push(elemGeo)
  const elemSpan = mastH * 0.6 // range: 30%–90% of mast
  const spacing = elemSpan / Math.max(elementCount - 1, 1)
  for (let i = 0; i < elementCount; i++) {
    const ey = bodyH + mastH * 0.3 + spacing * i
    const mesh = mk(elemGeo, mat, xPos, ey, 0)
    mesh.rotation.z = Math.PI / 2 // rotate to horizontal
    meshes.push(mesh)
  }

  return { geos, meshes }
}

// ── Exports ───────────────────────────────────────────────────────────────────

export function makeBalconySlab(cfg: BalconySlabConfig): PartResult {
  const mat = new THREE.MeshToonMaterial({ color: CONCRETE_COLOR })
  const parts = buildBalconySlab(cfg, mat)
  return { geos: parts.geos, mats: [mat], meshes: parts.meshes }
}

export function makeBalconyRailing(cfg: BalconyRailingConfig): PartResult {
  const mat = new THREE.MeshToonMaterial({
    color: RAILING_COLORS[cfg.colorIndex % RAILING_COLORS.length],
  })
  const parts = buildBalconyRailing(cfg, mat)
  return { geos: parts.geos, mats: [mat], meshes: parts.meshes }
}

export function makeAwning(cfg: AwningConfig): PartResult {
  const mat = new THREE.MeshToonMaterial({
    color: AWNING_COLORS[cfg.colorIndex % AWNING_COLORS.length],
  })
  const parts = buildAwning(cfg, mat)
  return { geos: parts.geos, mats: [mat], meshes: parts.meshes }
}

export function makeDrainPipe(cfg: DrainPipeConfig): PartResult {
  const mat = new THREE.MeshToonMaterial({ color: PIPE_COLOR })
  const parts = buildDrainPipe(cfg, mat)
  return { geos: parts.geos, mats: [mat], meshes: parts.meshes }
}

export function makeACUnit(cfg: ACUnitConfig): PartResult {
  const mat = new THREE.MeshToonMaterial({ color: AC_COLORS[cfg.colorIndex % AC_COLORS.length] })
  const parts = buildACUnit(cfg, mat)
  return { geos: parts.geos, mats: [mat], meshes: parts.meshes }
}

export function makeMeterBox(cfg: MeterBoxConfig): PartResult {
  const mat = new THREE.MeshToonMaterial({ color: METER_BOX_COLOR })
  const parts = buildMeterBox(cfg, mat)
  return { geos: parts.geos, mats: [mat], meshes: parts.meshes }
}

export function makeAntenna(cfg: AntennaConfig): PartResult {
  const mat = new THREE.MeshToonMaterial({ color: ANTENNA_COLOR })
  const parts = buildAntenna(cfg, mat)
  return { geos: parts.geos, mats: [mat], meshes: parts.meshes }
}

// Re-export color counts cho GUI range
export const RAILING_COLORS_COUNT = RAILING_COLORS.length
export const AWNING_COLORS_COUNT = AWNING_COLORS.length
export const AC_COLORS_COUNT = AC_COLORS.length
