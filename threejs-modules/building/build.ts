/**
 * VỊ TRÍ   — threejs-modules/building/build.ts  (building-kit)
 * VAI TRÒ  — Build math: ShapeInstance (mm) → WallConfig[] + bbox + footprint cầu thang. KHÔNG Three.js.
 *            Dùng chung editor (archplan) + headless renderer. Pure, no DOM (luật lõi).
 * LIÊN HỆ  — Turtle/transform = ./turtle (CÙNG core headless → không drift KI-001).
 *            archplan/build/build.ts là SHIM re-export file này (Phase 1a thin-out, 2026-06-01).
 */

import type { ShapeInstance, WallConfig } from './state'
import { planBbox, planOutline, planWalls, type SegPlan } from './turtle'

// Editor lưu mm; turtle core dùng m → convert ở biên (chỉ chỗ này).
function toSegPlans(inst: ShapeInstance): SegPlan[] {
  return inst.segments.map((s) => ({ length: s.length / 1000, turnBefore: s.turnBefore }))
}

export function computeWallConfigs(inst: ShapeInstance, wallBase: number): WallConfig[] {
  const depth = inst.wallDepth / 1000
  const xform = { posX: inst.posX / 1000, posZ: inst.posZ / 1000, rotY: inst.rotY }
  return planWalls(toSegPlans(inst), xform).map((p) => {
    const seg = inst.segments[p.index]
    return {
      w: p.w,
      h: seg.wallH / 1000, // per-segment height
      depth,
      rotationY: p.rotationY,
      xOffset: p.xOffset,
      zOffset: p.zOffset,
      yBase: wallBase,
      seg,
    }
  })
}

export function computeLocalBbox(inst: ShapeInstance): { w: number; d: number } {
  return planBbox(toSegPlans(inst))
}

// Outline footprint LOCAL (m, đã center, TRƯỚC rotY/pos — khớp frame local của slab/móng trước khi
// mesh tự xoay rotY). Shape 'round' dùng để slab/móng theo đúng đa giác thay AABB chữ nhật.
export function instOutlineLocal(inst: ShapeInstance): [number, number][] {
  return planOutline(toSegPlans(inst))
}

// ── Cầu thang: footprint world (AABB) + map sang lỗ slab tầng trên ───────────
// rotY ∈ {0,90,180,270} → footprint & slab luôn axis-aligned trong world.
// Dùng Three Ry (khớp với rotation.y của slab/stairs Group) để footprint, lỗ và
// slab tầng trên nhất quán world-position với nhau.

export interface WorldRect {
  cx: number // m — tâm world
  cz: number
  w: number // m — dim dọc trục +X cục bộ cầu thang (runL)
  d: number // m — dim vuông góc (width)
  rot: number // độ — xoay world quanh Y = inst.rotY + stair.rotDeg
}

export function stairFootprintWorld(inst: ShapeInstance): WorldRect | null {
  const s = inst.structure.stairs
  if (!s.show) return null
  // Tâm footprint chỉ xoay theo shape (rotDeg xoay quanh tâm, không dời tâm).
  // Three Ry(rotY): wx = lx*cos + lz*sin; wz = -lx*sin + lz*cos
  const th = (inst.rotY * Math.PI) / 180
  const lx = s.x / 1000
  const lz = s.z / 1000
  const cx = lx * Math.cos(th) + lz * Math.sin(th) + inst.posX / 1000
  const cz = -lx * Math.sin(th) + lz * Math.cos(th) + inst.posZ / 1000
  return { cx, cz, w: s.runL / 1000, d: s.width / 1000, rot: inst.rotY + s.rotDeg }
}

// World rect → SlabOpening (local frame của slab, trước rotation.y). Giữ góc xoay.
export function worldRectToSlabOpening(
  r: WorldRect,
  slabWX: number,
  slabWZ: number,
  slabRotY: number
): { x: number; z: number; w: number; d: number; rot: number } {
  const th = (slabRotY * Math.PI) / 180
  const dx = r.cx - slabWX
  const dz = r.cz - slabWZ
  // world→local (inverse Three Ry): lx = dx*cos − dz*sin; lz = dx*sin + dz*cos
  const lx = dx * Math.cos(th) - dz * Math.sin(th)
  const lz = dx * Math.sin(th) + dz * Math.cos(th)
  return { x: lx, z: lz, w: r.w, d: r.d, rot: r.rot - slabRotY }
}

// ── Footprint AABB (dùng chung build pick + highlight section) ────────────────

export type FootXZ = { cx: number; cz: number; sx: number; sz: number }

// Footprint XZ (world) từ 2 đầu mỗi tường → tâm + kích thước AABB cho box section / pick box.
export function footprintXZ(configs: WallConfig[]): FootXZ {
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const c of configs) {
    const rad = (c.rotationY * Math.PI) / 180
    const dx = (Math.cos(rad) * c.w) / 2
    const dz = (-Math.sin(rad) * c.w) / 2
    for (const s of [-1, 1]) {
      minX = Math.min(minX, c.xOffset + s * dx)
      maxX = Math.max(maxX, c.xOffset + s * dx)
      minZ = Math.min(minZ, c.zOffset + s * dz)
      maxZ = Math.max(maxZ, c.zOffset + s * dz)
    }
  }
  if (!Number.isFinite(minX)) return { cx: 0, cz: 0, sx: 1, sz: 1 }
  return {
    cx: (minX + maxX) / 2,
    cz: (minZ + maxZ) / 2,
    sx: Math.max(0.3, maxX - minX),
    sz: Math.max(0.3, maxZ - minZ),
  }
}

// World AABB MẶT NGOÀI 1 instance (footprint tim-tường computeLocalBbox + wallDepth/2 mỗi phía; rotY 90/270
// hoán w↔d). rotY ∈ {0,90,180,270} → axis-aligned. NGUỒN DUY NHẤT dùng chung: Ctrl-snap (vỏ snap.ts) +
// đục-lỗ-shape-lồng (render/fromState). Né drift (KI-001) — đừng copy logic này ra nơi khác.
export function instWorldAABB(inst: ShapeInstance): {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
} {
  const { w, d } = computeLocalBbox(inst)
  const t = inst.wallDepth / 1000
  const swap = inst.rotY === 90 || inst.rotY === 270
  const hw = (swap ? d : w) / 2 + t / 2
  const hd = (swap ? w : d) / 2 + t / 2
  const cx = inst.posX / 1000
  const cz = inst.posZ / 1000
  return { minX: cx - hw, maxX: cx + hw, minZ: cz - hd, maxZ: cz + hd }
}
