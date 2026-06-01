/**
 * VỊ TRÍ   — building-kit/BuildingFromPlan.ts
 * VAI TRÒ  — Đọc FloorPlanJSON (AP4 export từ ArchPlanLab) → THREE.Group cho World/Scene.
 * LIÊN HỆ  — Parts: Structure.ts, WallSingle.ts, RoofShape.ts, Stair.ts
 *
 * Multi-floor: yAcc tích lũy qua mỗi tầng — cùng logic _buildScene trong ArchPlanLab.
 * Stairs: optional array stairDefs → makeStair; openings: lỗ sàn tùy chọn per floor.
 *
 * JSON format (AP4, tất cả đơn vị mét — ArchPlanLab export JSON):
 *   { name, wallDepth, floors: [{ index, floorH, instances: [...] }], stairs?: [...] }
 *
 * CÁCH DÙNG:
 *   const b = new BuildingFromPlan(planJSON)
 *   scene.add(b.getGroup())
 *   // cleanup:
 *   b.dispose()
 *
 * DISPOSE: dispose() giải phóng tất cả geos + mats; meshes tự remove khỏi Group.
 */

import * as THREE from 'three'

import type { RidgeDir, RoofType } from './parts/RoofShape'
import { makeRoof } from './parts/RoofShape'
import { makeStair, type StairOpts } from './parts/Stair'
import {
  makePositionedColumn,
  makePositionedFoundation,
  makePositionedSlab,
} from './parts/Structure'
import { makePositionedWall, type PositionedOpening } from './parts/WallSingle'
import { type PartResult, WALL_COLORS } from './tokens'
import { planBbox, planWalls, type SegPlan } from './turtle'

// ── JSON types (AP4 — tất cả đơn vị: mét) ─────────────────────────────────────

interface OpeningJSON {
  type: 'door' | 'window' | 'loading_door'
  round?: boolean // v9: dáng lỗ ellip (tách khỏi type). Thiếu = chữ nhật (file AP4 cũ)
  x: number
  w: number
  h: number
  yOffset: number | null
}

interface SegmentJSON {
  length: number // mét
  wallH?: number // mét — chiều cao tường segment này (AP4 xuất per-segment); thiếu (JSON cũ) = floorH
  turnBefore: number // degrees
  colorIndex: number
  style: 'flat' | 'reveal' | 'panel'
  openings: OpeningJSON[]
}

interface ColumnJSON {
  type: 'round' | 'square'
  x: number
  z: number
  h: number
  r: number
  size: number
}

interface StructureJSON {
  showFoundation: boolean
  foundH: number
  foundOh?: { n: number; e: number; s: number; w: number } // m — nhô 4 hướng (AP6+); optional cho JSON cũ
  showSlab: boolean
  slabThick: number
  columns: ColumnJSON[]
}

interface RoofJSON {
  show: boolean
  type: RoofType
  pitch: number
  overhang: number
  ridgeDir: RidgeDir
  parapetH: number
}

interface InstanceJSON {
  posX: number
  posZ: number
  rotY: number
  wallDepth: number // meters — per-instance wall thickness (AP4+)
  roof: RoofJSON
  structure: StructureJSON
  segments: SegmentJSON[]
}

interface FloorJSON {
  index: number
  floorH: number
  instances: InstanceJSON[]
}

export interface StairDef {
  fromFloor: number // cầu thang đi từ floor này lên floor trên
  worldX: number
  worldZ: number
  heading: number // degrees
  width: number // mét
  stepRise?: number // override — default auto
  stepDepth?: number // override — default 0.27
}

export interface FloorPlanJSON {
  name: string
  wallDepth?: number // mét — legacy AP3; AP4+ dùng per-instance wallDepth
  floors: FloorJSON[]
  stairs?: StairDef[]
}

// ── Turtle engine ─────────────────────────────────────────────────────────────
// Turtle-walk + transform = building-kit/turtle (CÙNG core editor archplan dùng → không drift,
// chặn KI-001). Ở đây chỉ map InstanceJSON↔core + gắn h/depth/yBase/seg. Đơn vị: MÉT (JSON sẵn).

interface WallTask {
  w: number
  h: number
  depth: number
  rotationY: number
  xOffset: number
  zOffset: number
  yBase: number
  seg: SegmentJSON
}

function computeBbox(segs: SegmentJSON[]): { w: number; d: number } {
  return planBbox(segs.map((s) => ({ length: s.length, turnBefore: s.turnBefore })))
}

function traceTurtle(
  inst: InstanceJSON,
  depth: number,
  wallBase: number,
  floorH: number
): WallTask[] {
  const segs: SegPlan[] = inst.segments.map((s) => ({ length: s.length, turnBefore: s.turnBefore }))
  const xform = { posX: inst.posX, posZ: inst.posZ, rotY: inst.rotY }
  return planWalls(segs, xform).map((p) => {
    const seg = inst.segments[p.index]
    return {
      w: p.w,
      h: seg.wallH ?? floorH, // honor wallH per-segment (AP4); floorH fallback cho JSON cũ
      depth,
      rotationY: p.rotationY,
      xOffset: p.xOffset,
      zOffset: p.zOffset,
      yBase: wallBase,
      seg,
    }
  })
}

// Tính maxLift (foundH) cho ground floor — tách ra để _assemble < complexity 10
function computeMaxLift(floor: FloorJSON): number {
  return floor.instances.reduce((max, inst) => {
    const yLift = inst.structure.showFoundation ? inst.structure.foundH : 0
    return yLift > max ? yLift : max
  }, 0)
}

// ── BuildingFromPlan ───────────────────────────────────────────────────────────

export class BuildingFromPlan {
  private group: THREE.Group = new THREE.Group()
  private parts: PartResult[] = []
  private isDisposed = false

  constructor(plan: FloorPlanJSON) {
    this._assemble(plan)
  }

  getGroup(): THREE.Group {
    return this.group
  }

  dispose(): void {
    if (this.isDisposed) return
    for (const p of this.parts) {
      p.geos.forEach((g) => g.dispose())
      p.mats.forEach((m) => m.dispose())
      p.meshes.forEach((m) => m.parent?.remove(m))
    }
    this.parts = []
    this.isDisposed = true
  }

  private _push(r: PartResult): void {
    this.parts.push(r)
    for (const m of r.meshes) this.group.add(m)
  }

  private _assemble(plan: FloorPlanJSON): void {
    let yAcc = 0
    const wallBases: number[] = []
    for (let fi = 0; fi < plan.floors.length; fi++) {
      const floor = plan.floors[fi]
      const isGround = fi === 0
      const maxLift = isGround ? computeMaxLift(floor) : 0
      wallBases.push(yAcc + maxLift)
      for (const inst of floor.instances) {
        const yLift = isGround && inst.structure.showFoundation ? inst.structure.foundH : 0
        this._buildWalls(inst, yAcc + yLift, floor.floorH)
        this._buildStructure(inst, yAcc + yLift, isGround, floor.floorH)
      }
      yAcc += maxLift + floor.floorH
    }
    for (const stair of plan.stairs ?? []) this._buildStair(stair, plan.floors, wallBases)
  }

  private _buildWalls(inst: InstanceJSON, wallBase: number, floorH: number): void {
    for (const t of traceTurtle(inst, inst.wallDepth, wallBase, floorH)) {
      const openings: PositionedOpening[] = t.seg.openings.map((op) => ({
        type: op.type,
        x: op.x,
        w: op.w,
        h: op.h,
        ...(op.round && { round: op.round }),
        ...(op.yOffset != null && { yOffset: op.yOffset }),
      }))
      const wallMat = new THREE.MeshToonMaterial({
        color: WALL_COLORS[t.seg.colorIndex % WALL_COLORS.length],
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      })
      const res = makePositionedWall({
        w: t.w,
        h: t.h,
        depth: t.depth,
        style: t.seg.style,
        openings,
        wallMaterial: wallMat,
        xOffset: t.xOffset,
        zOffset: t.zOffset,
        yBase: t.yBase,
        rotationY: t.rotationY,
      })
      res.mats.push(wallMat) // take ownership — wallMaterial không nằm trong res.mats mặc định
      this._push(res)
    }
  }

  private _buildStructure(
    inst: InstanceJSON,
    wallBase: number,
    isGround: boolean,
    floorH: number
  ): void {
    const { w, d } = computeBbox(inst.segments)
    const { posX: wx, posZ: wz, rotY: ry, structure: s } = inst
    if (isGround && s.showFoundation) {
      this._push(
        makePositionedFoundation({
          bboxW: w,
          bboxD: d,
          wallDepth: inst.wallDepth,
          oh: s.foundOh ?? { n: 0, e: 0, s: 0, w: 0 },
          h: s.foundH,
          worldX: wx,
          worldZ: wz,
          rotY: ry,
        })
      )
    }
    if (s.showSlab) {
      this._push(
        makePositionedSlab({
          bboxW: w,
          bboxD: d,
          thick: s.slabThick,
          yBase: wallBase,
          worldX: wx,
          worldZ: wz,
          rotY: ry,
        })
      )
    }
    this._buildColumns(inst, wallBase)
    this._buildRoof(inst, w, d, wallBase, floorH)
  }

  private _buildRoof(
    inst: InstanceJSON,
    w: number,
    d: number,
    wallBase: number,
    floorH: number
  ): void {
    if (!inst.roof.show) return
    const rf = inst.roof
    this._push(
      makeRoof(
        {
          type: rf.type,
          pitch: rf.pitch,
          overhang: rf.overhang,
          ridgeDir: rf.ridgeDir,
          parapetH: rf.parapetH,
          worldX: inst.posX,
          worldZ: inst.posZ,
          rotY: inst.rotY,
        },
        w,
        d,
        floorH + wallBase
      )
    )
  }

  private _buildColumns(inst: InstanceJSON, wallBase: number): void {
    const cosR = Math.cos((inst.rotY * Math.PI) / 180)
    const sinR = Math.sin((inst.rotY * Math.PI) / 180)
    for (const col of inst.structure.columns) {
      const cx = col.x * cosR - col.z * sinR + inst.posX
      const cz = col.x * sinR + col.z * cosR + inst.posZ
      this._push(
        makePositionedColumn({
          type: col.type,
          worldX: cx,
          worldZ: cz,
          h: col.h,
          r: col.r,
          size: col.size,
          yBase: wallBase,
        })
      )
    }
  }

  private _buildStair(stair: StairDef, floors: FloorJSON[], wallBases: number[]): void {
    const fromFloor = floors[stair.fromFloor]
    if (!fromFloor) return
    const yBase = wallBases[stair.fromFloor] ?? 0
    const opts: StairOpts = {
      worldX: stair.worldX,
      worldZ: stair.worldZ,
      yBase,
      totalRise: fromFloor.floorH,
      heading: stair.heading,
      width: stair.width,
      ...(stair.stepRise != null && { stepRise: stair.stepRise }),
      ...(stair.stepDepth != null && { stepDepth: stair.stepDepth }),
    }
    this._push(makeStair(opts))
  }
}
