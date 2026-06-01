/**
 * VỊ TRÍ   — building-kit/parts/FloorSystem.ts
 * VAI TRÒ  — Phase 8: mỗi tầng cấu hình riêng độc lập — FloorDef + makeFloorAssembly
 *             Stack N FloorDef từ foundationH lên, tích lũy yOffset per floor
 * LIÊN HỆ  — BuildingLab._showFloorAssembler(); dùng WallSingle.ts cho từng mặt tường
 *
 * Architecture:
 *   FloorDef[]  →  makeFloorAssembly  →  PartResult (flat list geos/mats/meshes)
 *     [0] tầng trệt   at y = foundationH
 *     [1] tầng 1      at y = foundationH + floors[0].floorH
 *     [n] tầng n      at y = foundationH + sum(floors[0..n-1].floorH)
 *
 * setback: mỗi tầng thu hẹp baseW và baseD theo setback, tích lũy từ tầng dưới lên.
 * Ví dụ: setback=0.5 → tầng 1 hẹp hơn tầng trệt 0.5m mỗi bên (tổng 1m W và 1m D)
 *
 * DISPOSE: geos + mats qua PartResult — BuildingLab._clearSlot() quản lý
 */

import type * as THREE from 'three'

import type { PartResult } from '../tokens'
import type {
  WallSingleFlatConfig,
  WallSinglePanelConfig,
  WallSingleRevealConfig,
} from './WallSingle'
import { makeWallSingleFlat, makeWallSinglePanel, makeWallSingleReveal } from './WallSingle'

// ── Interfaces ─────────────────────────────────────────────────────────────────

export interface FloorDef {
  floorH: number // chiều cao tầng (m), standard 2.7m
  wallType: 'flat' | 'reveal' | 'panel'
  setback: number // thu hẹp W và D so với tầng dưới — mỗi bên (positive = smaller)
  colorIndex: number // WALL_COLORS index cho flat/reveal

  // Reveal params (dùng khi wallType='reveal')
  revealH: number
  showParapet: boolean
  parapetH: number
  parapetT: number

  // Panel params (dùng khi wallType='panel')
  panelW: number
  panelH: number
  grooveW: number
  frameIndex: number
  glassIndex: number
}

export interface FloorAssemblerConfig {
  baseW: number // footprint W tại tầng trệt (tầng 0)
  baseD: number // footprint D tại tầng trệt
  wallT: number // độ dày tường chung cho mọi tầng
  foundationH: number // chiều cao móng — y offset bắt đầu của tầng 0
  floors: FloorDef[]
}

// ── Helpers ────────────────────────────────────────────────────────────────────

type WallPos = { xOffset: number; zOffset: number; rotationY: number; wallW: number }

// Tạo 1 mặt tường từ WallPos + FloorDef — dispatch sang WallSingle make* tương ứng
function makeFloorWall(wd: WallPos, floorDef: FloorDef, wallT: number, wallH: number): PartResult {
  const base = {
    wallW: wd.wallW,
    wallH,
    wallT,
    xOffset: wd.xOffset,
    zOffset: wd.zOffset,
    rotationY: wd.rotationY,
  }
  if (floorDef.wallType === 'reveal') {
    return makeWallSingleReveal({
      ...base,
      colorIndex: floorDef.colorIndex,
      numFloors: 1,
      revealH: floorDef.revealH,
      showParapet: floorDef.showParapet,
      parapetH: floorDef.parapetH,
      parapetT: floorDef.parapetT,
    } satisfies WallSingleRevealConfig)
  }
  if (floorDef.wallType === 'panel') {
    return makeWallSinglePanel({
      ...base,
      colorIndex: floorDef.colorIndex,
      panelW: floorDef.panelW,
      panelH: floorDef.panelH,
      grooveW: floorDef.grooveW,
      frameIndex: floorDef.frameIndex,
      glassIndex: floorDef.glassIndex,
    } satisfies WallSinglePanelConfig)
  }
  return makeWallSingleFlat({
    ...base,
    colorIndex: floorDef.colorIndex,
  } satisfies WallSingleFlatConfig)
}

// ── makeFloorAssembly ──────────────────────────────────────────────────────────

// Tạo toàn bộ building từ stack FloorDef[] — trả về flat PartResult
// Mỗi tầng = 4 mặt tường (front/right/back/left) dùng WallSingle tương ứng
export function makeFloorAssembly(cfg: FloorAssemblerConfig): PartResult {
  const allGeos: THREE.BufferGeometry[] = []
  const allMats: THREE.Material[] = []
  const allMeshes: THREE.Object3D[] = []

  let yOffset = cfg.foundationH
  let cW = cfg.baseW
  let cD = cfg.baseD

  for (const floorDef of cfg.floors) {
    cW = Math.max(1, cW - floorDef.setback * 2) // setback thu hẹp mỗi bên → tích lũy
    cD = Math.max(1, cD - floorDef.setback * 2)
    const wallDefs: WallPos[] = [
      { xOffset: 0, zOffset: cD / 2, rotationY: 0, wallW: cW }, // front (+Z)
      { xOffset: cW / 2, zOffset: 0, rotationY: 90, wallW: cD }, // right (+X)
      { xOffset: 0, zOffset: -cD / 2, rotationY: 180, wallW: cW }, // back (-Z)
      { xOffset: -cW / 2, zOffset: 0, rotationY: 270, wallW: cD }, // left (-X)
    ]
    for (const wd of wallDefs) {
      const r = makeFloorWall(wd, floorDef, cfg.wallT, floorDef.floorH)
      // Dịch chuyển lên yOffset: flat mesh y += yOffset, group y += yOffset ✓
      for (const obj of r.meshes) obj.position.y += yOffset
      allGeos.push(...r.geos)
      allMats.push(...r.mats)
      allMeshes.push(...r.meshes)
    }
    yOffset += floorDef.floorH
  }

  return { geos: allGeos, mats: allMats, meshes: allMeshes }
}

// ── Default floor factory ──────────────────────────────────────────────────────

// Tạo 1 FloorDef mặc định — dùng bởi BuildingLab khi "Add Floor"
export function defaultFloorDef(): FloorDef {
  return {
    floorH: 2.7,
    wallType: 'flat',
    setback: 0,
    colorIndex: 0,
    revealH: 0.05,
    showParapet: false,
    parapetH: 0.4,
    parapetT: 0.15,
    panelW: 1.2,
    panelH: 0.9,
    grooveW: 0.05,
    frameIndex: 0,
    glassIndex: 0,
  }
}
