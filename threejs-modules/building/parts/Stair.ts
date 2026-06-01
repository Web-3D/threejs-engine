/**
 * VỊ TRÍ   — building-kit/parts/Stair.ts
 * VAI TRÒ  — Cầu thang thẳng (straight-run): treads + stringers
 * LIÊN HỆ  — ⚠️ ORPHANED 2026-06-01: makeStair CHỈ BuildingFromPlan (đã retire) dùng → 0 caller.
 *            Editor/headless dùng makePositionedStairs (parts/Structure) — builder khác. Chờ quyết xoá.
 *
 * Turtle convention (cùng quy ước engine):
 *   heading 0° = East (+X); 90° = North (-Z).
 *   stepRise = totalRise / numSteps (target 0.175m, tối thiểu 7 bậc).
 *   stepDepth = 0.27m (chuẩn VN/JP) — mỗi bậc nhô ra.
 *   Tread: BoxGeometry(stepDepth, stepRise, stairWidth) — depth dọc heading.
 *   Stringer: BoxGeometry(diagLen, 0.05, 0.06) xoay rotation.order='YZX'
 *             → Y aligns local+X với heading, Z tilts lên theo pitch angle.
 *
 * DISPOSE: geos + mats qua PartResult — caller quản lý (hiện không còn caller — orphaned).
 */

import * as THREE from 'three'

import type { PartResult } from '../tokens'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StairOpts {
  worldX: number // chân cầu thang — world X
  worldZ: number // chân cầu thang — world Z
  yBase: number // Y tại chân cầu thang
  totalRise: number // meters — tổng chiều cao leo (= floorH của tầng from)
  heading: number // degrees — hướng leo (0°=East, 90°=North)
  width: number // meters — chiều rộng bậc thang
  stepRise?: number // meters — override chiều cao 1 bậc (default auto từ totalRise)
  stepDepth?: number // meters — chiều sâu 1 bậc nằm ngang (default 0.27)
}

// ── Palette ───────────────────────────────────────────────────────────────────

const COL_TREAD = 0xd4c8b8 // bê tông ấm sáng
const COL_STRINGER = 0xa8a098 // bê tông xám đậm

// ── Stringer helper ───────────────────────────────────────────────────────────
// 2 tấm xiên (1 mỗi bên) chạy dọc chiều dài cầu thang + chiều cao.
// rotation.order = 'YZX': Y align local+X với heading; Z tilt lên theo pitch.
function buildStringers(
  opts: StairOpts,
  run: number,
  dx: number,
  dz: number,
  mat: THREE.Material
): { geos: THREE.BufferGeometry[]; meshes: THREE.Object3D[] } {
  const len = Math.sqrt(run * run + opts.totalRise * opts.totalRise)
  const pitch = Math.atan2(opts.totalRise, run)
  const geo = new THREE.BoxGeometry(len, 0.05, 0.06)
  const cx = opts.worldX + dx * run * 0.5
  const cz = opts.worldZ + dz * run * 0.5
  const cy = opts.yBase + opts.totalRise * 0.5
  const hRad = (opts.heading * Math.PI) / 180
  const make = (side: number): THREE.Mesh => {
    const m = new THREE.Mesh(geo, mat)
    // perp vector (rotate travel 90° left in XZ): (-dz, 0, dx)
    m.position.set(cx + -dz * side * (opts.width / 2), cy, cz + dx * side * (opts.width / 2))
    m.rotation.order = 'YZX'
    m.rotation.y = hRad
    m.rotation.z = pitch // tilt local+X (travel axis) upward at pitch angle
    return m
  }
  return { geos: [geo], meshes: [make(-1), make(1)] }
}

// ── Public API ────────────────────────────────────────────────────────────────

export function makeStair(opts: StairOpts): PartResult {
  const depth = opts.stepDepth ?? 0.27
  const numSteps = Math.max(7, Math.round(opts.totalRise / (opts.stepRise ?? 0.175)))
  const rise = opts.totalRise / numSteps
  const rad = (opts.heading * Math.PI) / 180
  const dx = Math.cos(rad)
  const dz = -Math.sin(rad)
  const mat = new THREE.MeshToonMaterial({ color: COL_TREAD })
  const matStr = new THREE.MeshToonMaterial({ color: COL_STRINGER })
  // BoxGeometry(depth, rise, width): local +X = travel direction → rotation.y = heading
  const tGeo = new THREE.BoxGeometry(depth, rise, opts.width)
  const meshes: THREE.Object3D[] = []
  for (let i = 0; i < numSteps; i++) {
    const m = new THREE.Mesh(tGeo, mat)
    m.position.set(
      opts.worldX + dx * (i + 0.5) * depth,
      opts.yBase + (i + 0.5) * rise,
      opts.worldZ + dz * (i + 0.5) * depth
    )
    m.rotation.y = rad
    meshes.push(m)
  }
  const run = numSteps * depth
  const sr = buildStringers(opts, run, dx, dz, matStr)
  return { geos: [tGeo, ...sr.geos], mats: [mat, matStr], meshes: [...meshes, ...sr.meshes] }
}
