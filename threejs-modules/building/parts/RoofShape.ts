/**
 * VỊ TRÍ   — building-kit/parts/RoofShape.ts
 * VAI TRÒ  — AP3: geometry mái — gabled / hip / flat / shed / half-hip / skew per instance.
 * LIÊN HỆ  — Dùng bởi ArchPlanLab._buildStructureForInstance(); trả về PartResult.
 *
 * Coordinate convention:
 *   Geometry centered tại (0, 0) — caller set mesh.position = (worldX, yBase, worldZ).
 *   yBase = floorH (m) = đỉnh tường → bottom edge của mái.
 *   pitch = góc mặt mái tính từ ngang, đo tại wall plate (không tính overhang).
 *
 * SDF hint (IQ mapping future):
 *   gabled → sdWedge (triangular prism)
 *   hip    → sdConvexHull 6 điểm
 *   flat   → sdBox mỏng + parapet box
 *   shed   → sdCutPlane(sdBox)
 */

import * as THREE from 'three'

import type { PartResult } from '../tokens'

export type RoofType = 'gabled' | 'hip' | 'flat' | 'shed' | 'half-hip' | 'skew'
export type RidgeDir = 'EW' | 'NS'

// Overhang riêng 4 hướng (m): N=+Z, S=-Z, E=+X, W=-X.
export interface RoofOverhang {
  n: number
  e: number
  s: number
  w: number
}

export interface RoofConfig {
  type: RoofType
  pitch: number // degrees (5–60) — góc mặt mái từ ngang
  overhang: number | RoofOverhang // m — số: nhô đều; object: nhô riêng 4 hướng
  ridgeDir: RidgeDir // 'EW' = đòn dông hướng Đông-Tây; cho gabled + hip
  parapetH: number // meters — tường lô tô, chỉ cho flat
  worldX: number
  worldZ: number
  rotY: number // degrees
}

const COL_ROOF = 0x9c7248 // ngói ấm — terracotta-brown

// BufferGeometry từ flat positions + indices, tự compute normals
function buildGeo(pos: number[], idx: number[]): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  return geo
}

// ── Gabled EW: đòn dông chạy E-W, mái dốc về N và S ─────────────────────────
function buildGabledEW(hw: number, hd: number, roofH: number): THREE.BufferGeometry {
  const pos = [
    -hw,
    0,
    -hd, //  0 SW
    hw,
    0,
    -hd, //  1 SE
    hw,
    0,
    hd, //  2 NE
    -hw,
    0,
    hd, //  3 NW
    -hw,
    roofH,
    0, //  4 W-ridge
    hw,
    roofH,
    0, //  5 E-ridge
  ]
  // DoubleSide material — không cần lo winding; computeVertexNormals tự xử lý
  const idx = [
    0,
    1,
    5,
    0,
    5,
    4, // south slope
    2,
    3,
    4,
    2,
    4,
    5, // north slope
    3,
    0,
    4, // west gable
    1,
    2,
    5, // east gable
  ]
  return buildGeo(pos, idx)
}

// ── Gabled NS: đòn dông chạy N-S, mái dốc về E và W ─────────────────────────
function buildGabledNS(hw: number, hd: number, roofH: number): THREE.BufferGeometry {
  const pos = [
    -hw,
    0,
    -hd, //  0 SW
    hw,
    0,
    -hd, //  1 SE
    hw,
    0,
    hd, //  2 NE
    -hw,
    0,
    hd, //  3 NW
    0,
    roofH,
    -hd, //  4 S-ridge
    0,
    roofH,
    hd, //  5 N-ridge
  ]
  const idx = [
    3,
    0,
    4,
    3,
    4,
    5, // west slope
    1,
    2,
    5,
    1,
    5,
    4, // east slope
    0,
    1,
    4, // south gable
    2,
    3,
    5, // north gable
  ]
  return buildGeo(pos, idx)
}

// ── Hip EW: 4 mặt dốc, đòn dông ngắn chạy E-W ───────────────────────────────
// rx = half ridge length = max(0, hw - hd); nếu rx=0 thì thành pyramid
function buildHipEW(hw: number, hd: number, roofH: number): THREE.BufferGeometry {
  const rx = Math.max(0, hw - hd)
  const pos = [
    -hw,
    0,
    -hd, //  0 SW
    hw,
    0,
    -hd, //  1 SE
    hw,
    0,
    hd, //  2 NE
    -hw,
    0,
    hd, //  3 NW
    -rx,
    roofH,
    0, //  4 W-ridge
    rx,
    roofH,
    0, //  5 E-ridge
  ]
  const idx = [
    0,
    1,
    5,
    0,
    5,
    4, // south hip
    2,
    3,
    4,
    2,
    4,
    5, // north hip
    3,
    0,
    4, // west hip
    1,
    2,
    5, // east hip
  ]
  return buildGeo(pos, idx)
}

// ── Hip NS: 4 mặt dốc, đòn dông ngắn chạy N-S ───────────────────────────────
function buildHipNS(hw: number, hd: number, roofH: number): THREE.BufferGeometry {
  const rz = Math.max(0, hd - hw)
  const pos = [
    -hw,
    0,
    -hd, //  0 SW
    hw,
    0,
    -hd, //  1 SE
    hw,
    0,
    hd, //  2 NE
    -hw,
    0,
    hd, //  3 NW
    0,
    roofH,
    -rz, //  4 S-ridge
    0,
    roofH,
    rz, //  5 N-ridge
  ]
  const idx = [
    3,
    0,
    4,
    3,
    4,
    5, // west hip
    1,
    2,
    5,
    1,
    5,
    4, // east hip
    0,
    1,
    4, // south hip
    2,
    3,
    5, // north hip
  ]
  return buildGeo(pos, idx)
}

// ── Flat: hộp mỏng + parapet ─────────────────────────────────────────────────
// w/d = bề rộng/sâu cuối cùng (đã gồm overhang). Lệch tâm do overhang lo ở makeRoof.
function buildFlat(w: number, d: number, parapetH: number): THREE.BufferGeometry {
  const h = Math.max(0.05, parapetH)
  const geo = new THREE.BoxGeometry(w, h, d)
  geo.translate(0, h / 2, 0) // bottom tại y=0 (đỉnh tường)
  return geo
}

// ── Shed: 1 mặt dốc, thấp ở S, cao ở N ──────────────────────────────────────
function buildShed(hw: number, hd: number, roofH: number): THREE.BufferGeometry {
  const pos = [
    -hw,
    0,
    -hd, //  0 SW (low — south)
    hw,
    0,
    -hd, //  1 SE (low)
    hw,
    roofH,
    hd, //  2 NE (high — north)
    -hw,
    roofH,
    hd, //  3 NW (high)
  ]
  const idx = [0, 1, 2, 0, 2, 3]
  return buildGeo(pos, idx)
}

// ── Half-hip: 1 đầu hồi tam giác ĐỨNG + 3 mặt dốc (2 dài + 1 hông) ──────────
// EW: đòn dông chạy E-W, đầu hồi đứng ở Tây, mái hông dốc ở Đông.
function buildHalfHipEW(hw: number, hd: number, roofH: number): THREE.BufferGeometry {
  const ex = Math.max(0, hw - hd) // đỉnh đòn dông phía Đông thụt vào (hông)
  // prettier-ignore
  const pos = [
    -hw, 0, -hd,      // 0 SW
    hw, 0, -hd,       // 1 SE
    hw, 0, hd,        // 2 NE
    -hw, 0, hd,       // 3 NW
    -hw, roofH, 0,    // 4 W-ridge (hồi đứng — bám tường Tây)
    ex, roofH, 0,     // 5 E-ridge (thụt vào → mái hông)
  ]
  // prettier-ignore
  const idx = [
    0, 1, 5, 0, 5, 4, // mái dốc Nam
    2, 3, 4, 2, 4, 5, // mái dốc Bắc
    1, 2, 5,          // mái hông Đông
    3, 0, 4,          // hồi ĐỨNG Tây (x = -hw)
  ]
  return buildGeo(pos, idx)
}

// NS: đòn dông chạy N-S, đầu hồi đứng ở Nam, mái hông dốc ở Bắc.
function buildHalfHipNS(hw: number, hd: number, roofH: number): THREE.BufferGeometry {
  const ez = Math.max(0, hd - hw)
  // prettier-ignore
  const pos = [
    -hw, 0, -hd,      // 0 SW
    hw, 0, -hd,       // 1 SE
    hw, 0, hd,        // 2 NE
    -hw, 0, hd,       // 3 NW
    0, roofH, -hd,    // 4 S-ridge (hồi đứng — bám tường Nam)
    0, roofH, ez,     // 5 N-ridge (thụt vào → mái hông)
  ]
  // prettier-ignore
  const idx = [
    3, 0, 4, 3, 4, 5, // mái dốc Tây
    1, 2, 5, 1, 5, 4, // mái dốc Đông
    2, 3, 5,          // mái hông Bắc
    0, 1, 4,          // hồi ĐỨNG Nam (z = -hd)
  ]
  return buildGeo(pos, idx)
}

// ── Skew: 1 đỉnh nhọn trên trung điểm 1 cạnh → 1 tam giác ĐỨNG + 3 tam giác xòe ─
// EW: đỉnh trên cạnh Bắc → mặt Bắc đứng, 3 mặt còn lại xòe từ đỉnh.
function buildSkewEW(hw: number, hd: number, roofH: number): THREE.BufferGeometry {
  // prettier-ignore
  const pos = [
    -hw, 0, -hd,      // 0 SW
    hw, 0, -hd,       // 1 SE
    hw, 0, hd,        // 2 NE
    -hw, 0, hd,       // 3 NW
    0, roofH, hd,     // 4 đỉnh (trên trung điểm cạnh Bắc, z = hd)
  ]
  // prettier-ignore
  const idx = [
    0, 1, 4, // xòe Nam
    1, 2, 4, // xòe Đông
    2, 3, 4, // ĐỨNG Bắc (z = hd)
    3, 0, 4, // xòe Tây
  ]
  return buildGeo(pos, idx)
}

// NS: đỉnh trên cạnh Đông → mặt Đông đứng, 3 mặt còn lại xòe.
function buildSkewNS(hw: number, hd: number, roofH: number): THREE.BufferGeometry {
  // prettier-ignore
  const pos = [
    -hw, 0, -hd,      // 0 SW
    hw, 0, -hd,       // 1 SE
    hw, 0, hd,        // 2 NE
    -hw, 0, hd,       // 3 NW
    hw, roofH, 0,     // 4 đỉnh (trên trung điểm cạnh Đông, x = hw)
  ]
  // prettier-ignore
  const idx = [
    1, 2, 4, // ĐỨNG Đông (x = hw)
    0, 1, 4, // xòe Nam
    2, 3, 4, // xòe Bắc
    3, 0, 4, // xòe Tây
  ]
  return buildGeo(pos, idx)
}

// ── Public API ─────────────────────────────────────────────────────────────────

// Các dạng có đòn dông/đỉnh (gabled/half-hip/skew/hip) — chọn builder theo type + hướng.
function ridgeGeo(
  type: RoofType,
  hw: number,
  hd: number,
  roofH: number,
  isEW: boolean
): THREE.BufferGeometry {
  switch (type) {
    case 'gabled':
      return isEW ? buildGabledEW(hw, hd, roofH) : buildGabledNS(hw, hd, roofH)
    case 'half-hip':
      return isEW ? buildHalfHipEW(hw, hd, roofH) : buildHalfHipNS(hw, hd, roofH)
    case 'skew':
      return isEW ? buildSkewEW(hw, hd, roofH) : buildSkewNS(hw, hd, roofH)
    default: // hip
      return isEW ? buildHipEW(hw, hd, roofH) : buildHipNS(hw, hd, roofH)
  }
}

// Số → nhô đều 4 hướng; object → giữ nguyên.
function normOverhang(oh: number | RoofOverhang): RoofOverhang {
  return typeof oh === 'number' ? { n: oh, e: oh, s: oh, w: oh } : oh
}

export function makeRoof(cfg: RoofConfig, bboxW: number, bboxD: number, yBase: number): PartResult {
  const o = normOverhang(cfg.overhang)
  // Eaves bất đối xứng = build đối xứng với half-extent trung bình rồi dịch tâm.
  const hw = bboxW / 2 + (o.e + o.w) / 2
  const hd = bboxD / 2 + (o.n + o.s) / 2
  const cx = (o.e - o.w) / 2 // dịch tâm theo X (đông nhô nhiều → lệch +X)
  const cz = (o.n - o.s) / 2 // dịch tâm theo Z (bắc nhô nhiều → lệch +Z)
  const pitch = (cfg.pitch * Math.PI) / 180
  const isEW = cfg.ridgeDir === 'EW'

  let geo: THREE.BufferGeometry
  if (cfg.type === 'flat') {
    geo = buildFlat(2 * hw, 2 * hd, cfg.parapetH)
  } else if (cfg.type === 'shed') {
    geo = buildShed(hw, hd, bboxD * Math.tan(pitch))
  } else {
    const roofH = ((isEW ? bboxD : bboxW) / 2) * Math.tan(pitch)
    geo = ridgeGeo(cfg.type, hw, hd, roofH, isEW)
  }
  if (cx !== 0 || cz !== 0) geo.translate(cx, 0, cz)

  const mat = new THREE.MeshToonMaterial({ color: COL_ROOF, side: THREE.DoubleSide })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.position.set(cfg.worldX, yBase, cfg.worldZ)
  mesh.rotation.y = (cfg.rotY * Math.PI) / 180
  mesh.castShadow = true
  mesh.receiveShadow = true

  return { geos: [geo], mats: [mat], meshes: [mesh] }
}
