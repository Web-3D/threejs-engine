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

import type { InstancedBrickWall } from '../components/InstancedBrickWall'
import type { WoodSidingStrip } from '../components/WoodSidingStrip'
import type { WoodSidingWall } from '../components/WoodSidingWall'
import type { RidgeDir, RoofType } from './parts/RoofShape'
import { makeRoof } from './parts/RoofShape'
import { makeStair, type StairOpts } from './parts/Stair'
import {
  makePositionedColumn,
  makePositionedFoundation,
  makePositionedSlab,
} from './parts/Structure'
import { type PartResult } from './tokens'
import { planBbox, planWalls, type SegPlan } from './turtle'
import {
  assembleWall,
  mergeWalls,
  type WallAsmCtx,
  type WallPlace,
  type WallSpec,
} from './wallAssembly'
import { DEFAULT_BRICK, type WallMaterial, WallMaterialCache } from './wallMaterials'

// ── JSON types (AP4 — tất cả đơn vị: mét) ─────────────────────────────────────

interface OpeningJSON {
  type: 'door' | 'window' | 'loading_door'
  round?: boolean // v9: dáng lỗ ellip (tách khỏi type). Thiếu = chữ nhật (file AP4 cũ)
  x: number
  w: number
  h: number
  yOffset: number | null
}

interface PanelJSON {
  x: number // mét
  y: number
  w: number
  h: number
  depth: number
  mode: 'recessed' | 'raised'
  material: WallMaterial
  colorIndex: number
}

interface SegmentJSON {
  length: number // mét
  wallH?: number // mét — chiều cao tường segment này (AP4 xuất per-segment); thiếu (JSON cũ) = floorH
  turnBefore: number // degrees
  colorIndex: number
  style: 'flat' | 'reveal' | 'panel'
  // AP5 material — thiếu (AP4 cũ) → default ('none', matScale 1…) qua segToSpec
  material?: WallMaterial
  matScale?: number
  paintColor?: number | null
  mortarColor?: number
  brickRelief?: number
  woodReveal?: number // mét — wood-strip
  woodButt?: number
  woodStepTilt?: number // deg
  openings: OpeningJSON[]
  panels?: PanelJSON[]
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

// SegmentJSON (AP4, mét) → WallSpec cho shared assembler. Default cho AP4 cũ thiếu field material.
function segToSpec(seg: SegmentJSON): WallSpec {
  return {
    material: seg.material ?? 'none',
    colorIndex: seg.colorIndex,
    paintColor: seg.paintColor ?? null,
    matScale: seg.matScale ?? 1,
    mortarColor: seg.mortarColor ?? DEFAULT_BRICK.mortarColor,
    brickRelief: seg.brickRelief ?? DEFAULT_BRICK.relief,
    style: seg.style,
    woodReveal: seg.woodReveal ?? 0.18,
    woodButt: seg.woodButt ?? 0.012,
    woodStepTilt: seg.woodStepTilt ?? 0,
    openings: seg.openings.map((op) => ({
      kind: op.type,
      x: op.x,
      w: op.w,
      h: op.h,
      yOffset: op.yOffset ?? 0, // AP4 null (cửa yOffset≤0) → 0 (chân sàn)
      round: op.round,
    })),
    panels: (seg.panels ?? []).map((p) => ({
      x: p.x,
      y: p.y,
      w: p.w,
      h: p.h,
      depth: p.depth,
      mode: p.mode,
      material: p.material,
      colorIndex: p.colorIndex,
    })),
  }
}

// ── BuildingFromPlan ───────────────────────────────────────────────────────────

export class BuildingFromPlan {
  private group: THREE.Group = new THREE.Group()
  private parts: PartResult[] = [] // structure (foundation/slab/cột/mái/cầu thang)
  private isDisposed = false
  // Wall subsystem (shared assembler): material cache + merged geo + component instanced — dispose riêng.
  private readonly wallCache = new WallMaterialCache()
  private wallGeos: THREE.BufferGeometry[] = []
  private brick3d: InstancedBrickWall[] = []
  private wood: WoodSidingWall[] = []
  private strip: WoodSidingStrip[] = []

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
    for (const g of this.wallGeos) g.dispose() // merged surface-wall geo
    for (const w of this.brick3d) w.dispose()
    for (const w of this.wood) w.dispose()
    for (const w of this.strip) w.dispose()
    this.wallCache.dispose() // material cache + brick textures
    this.parts = []
    this.wallGeos = []
    this.brick3d = []
    this.wood = []
    this.strip = []
    this.isDisposed = true
  }

  private _push(r: PartResult): void {
    this.parts.push(r)
    for (const m of r.meshes) this.group.add(m)
  }

  private _assemble(plan: FloorPlanJSON): void {
    let yAcc = 0
    const wallBases: number[] = []
    const ctx: WallAsmCtx = {
      cache: this.wallCache,
      buckets: new Map(),
      group: this.group,
      geos: this.wallGeos,
      brick3d: this.brick3d,
      wood: this.wood,
      strip: this.strip,
    }
    for (let fi = 0; fi < plan.floors.length; fi++) {
      const floor = plan.floors[fi]
      const isGround = fi === 0
      const maxLift = isGround ? computeMaxLift(floor) : 0
      wallBases.push(yAcc + maxLift)
      for (const inst of floor.instances) {
        const yLift = isGround && inst.structure.showFoundation ? inst.structure.foundH : 0
        this._buildWalls(inst, yAcc + yLift, floor.floorH, ctx)
        this._buildStructure(inst, yAcc + yLift, isGround, floor.floorH)
      }
      yAcc += maxLift + floor.floorH
    }
    mergeWalls(ctx) // gộp surface-wall cùng key sau khi gom hết tầng
    for (const stair of plan.stairs ?? []) this._buildStair(stair, plan.floors, wallBases)
  }

  // Tường: shared assembleWall (đúng material như editor — brick/wood/metal/concrete/brick-3d/…).
  private _buildWalls(inst: InstanceJSON, wallBase: number, floorH: number, ctx: WallAsmCtx): void {
    for (const t of traceTurtle(inst, inst.wallDepth, wallBase, floorH)) {
      const place: WallPlace = {
        w: t.w,
        h: t.h,
        depth: t.depth,
        rotationY: t.rotationY,
        xOffset: t.xOffset,
        zOffset: t.zOffset,
        yBase: t.yBase,
      }
      assembleWall(place, segToSpec(t.seg), ctx)
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
