/**
 * VỊ TRÍ   — building-kit/Building.ts
 * VAI TRÒ  — Assembler: đọc BuildingPreset → tạo THREE.Group chứa toàn bộ building parts
 * LIÊN HỆ  — BuildingConfig.ts (interfaces); parts/ (make* functions); data/buildings/*.json (presets)
 *
 * CÁCH DÙNG:
 *   import preset from '../../data/buildings/residential_01.json'
 *   import { Building } from 'building-kit/Building'
 *   const b = new Building(preset)
 *   scene.add(b.getGroup())
 *   // khi dispose scene:
 *   b.dispose()
 *
 * DISPOSE: building.dispose() — giải phóng tất cả geos + mats trong group
 *
 * Delta-only merge: preset chỉ override defaults. bodyW/H/D luôn lấy từ dims.
 */

import * as THREE from 'three'

import type { AttachmentEntry, BuildingDims, BuildingPreset, OpeningEntry } from './BuildingConfig'
import defaultACUnitConfig from './parts/ac_unit.config.json'
import defaultAntennaConfig from './parts/antenna.config.json'
import {
  makeACUnit,
  makeAntenna,
  makeAwning,
  makeBalconyRailing,
  makeBalconySlab,
  makeDrainPipe,
  makeMeterBox,
} from './parts/AttachmentDetail'
import defaultAwningConfig from './parts/awning.config.json'
import defaultBalconyRailingConfig from './parts/balcony_railing.config.json'
import defaultBalconySlabConfig from './parts/balcony_slab.config.json'
import defaultDoorFrameConfig from './parts/door_frame.config.json'
import defaultDrainPipeConfig from './parts/drain_pipe.config.json'
import defaultEaveConfig from './parts/eave.config.json'
import defaultFlatRoofConfig from './parts/flat_roof.config.json'
import defaultHipConfig from './parts/hip.config.json'
import defaultLoadingDoorConfig from './parts/loading_door.config.json'
import defaultMeterBoxConfig from './parts/meter_box.config.json'
import {
  makeDoorFrame,
  makeLoadingDoor,
  makeWindowFrame,
  makeWindowGrid,
  makeWindowStrip,
} from './parts/OpeningDetail'
import { makeGabledRoof } from './parts/Roof'
import { makeEave, makeFlatRoof, makeHipRoof, makeShedRoof } from './parts/RoofDetail'
import defaultShedConfig from './parts/shed.config.json'
// ── Part imports ──────────────────────────────────────────────────────────────
import { makeStructure } from './parts/Structure'
// ── Default configs ───────────────────────────────────────────────────────────
import defaultStructureConfig from './parts/structure.config.json'
import { makeWall } from './parts/Wall'
import defaultWallPanelConfig from './parts/wall_panel.config.json'
import defaultWallRevealConfig from './parts/wall_reveal.config.json'
import { makeWallPanel, makeWallReveal } from './parts/WallDetail'
import defaultWindowFrameConfig from './parts/window_frame.config.json'
import defaultWindowGridConfig from './parts/window_grid.config.json'
import defaultWindowStripConfig from './parts/window_strip.config.json'
import type { BuildingToken, PartResult } from './tokens'

// ── Helper ────────────────────────────────────────────────────────────────────

// Remove keys from object without mutating — used to strip discriminator 'type'
// before spreading preset overrides into part configs.
function omitKeys(obj: unknown, keys: string[]): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj as Record<string, unknown>).filter(([k]) => !keys.includes(k))
  )
}

// ── Building ──────────────────────────────────────────────────────────────────

export class Building {
  private readonly group = new THREE.Group()
  private readonly geos: THREE.BufferGeometry[] = []
  private readonly mats: THREE.Material[] = []
  private isDisposed = false

  constructor(preset: BuildingPreset) {
    this._assemble(preset)
  }

  getGroup(): THREE.Group {
    return this.group
  }

  dispose(): void {
    if (this.isDisposed) return
    for (const g of this.geos) g.dispose()
    for (const m of this.mats) m.dispose()
    // remove from parent if attached
    this.group.parent?.remove(this.group)
    this.geos.length = 0
    this.mats.length = 0
    this.isDisposed = true
  }

  // ── Assembly ───────────────────────────────────────────────────────────────

  private _assemble(preset: BuildingPreset): void {
    const { dims, wall, roof, eave, structure, openings = [], attachments = [] } = preset
    const body = this._bodyDims(dims)

    // Structure (foundation + columns + beams)
    if (structure?.enabled) {
      this._add(
        makeStructure({
          ...defaultStructureConfig,
          ...body,
          numFloors: dims.floors,
          ...omitKeys(structure, ['enabled']),
        })
      )
    }

    // Wall body
    this._buildWall(dims, body, wall)

    // Roof
    this._buildRoof(dims, body, roof)

    // Eave
    if (eave?.enabled) {
      this._add(
        makeEave({
          ...defaultEaveConfig,
          ...body,
          yPos: eave.yPos ?? dims.H,
          ...omitKeys(eave, ['enabled']),
        })
      )
    }

    // Openings — manual placement array
    for (const o of openings) {
      this._buildOpening(o, dims, body)
    }

    // Attachments — manual placement array
    for (const a of attachments) {
      this._buildAttachment(a, dims, body)
    }
  }

  // ── Wall builders ──────────────────────────────────────────────────────────

  private _buildWall(
    dims: BuildingDims,
    body: { bodyW: number; bodyH: number; bodyD: number },
    wp: BuildingPreset['wall']
  ): void {
    const overrides = omitKeys(wp, ['type'])
    switch (wp.type) {
      case 'wall':
        this._add(makeWall({ ...body, roofW: 0, roofD: 0, roofH: 0 }, wp.colorIndex ?? 0))
        break
      case 'wall_reveal':
        this._add(
          makeWallReveal({
            ...defaultWallRevealConfig,
            ...body,
            numFloors: dims.floors,
            ...overrides,
          })
        )
        break
      case 'wall_panel':
        this._add(
          makeWallPanel({
            ...defaultWallPanelConfig,
            ...body,
            ...overrides,
          })
        )
        break
    }
  }

  // ── Roof builders ──────────────────────────────────────────────────────────

  private _buildRoof(
    dims: BuildingDims,
    body: { bodyW: number; bodyH: number; bodyD: number },
    rp: BuildingPreset['roof']
  ): void {
    const overhang = rp.overhang ?? (rp.type === 'flat' ? 0.15 : 0.6)
    const overrides = omitKeys(rp, ['type', 'overhang'])

    switch (rp.type) {
      case 'gabled': {
        const tok: BuildingToken = {
          ...body,
          roofW: dims.W + 2 * overhang,
          roofD: dims.D + 2 * overhang,
          roofH: rp.ridgeH ?? dims.H * 0.44,
        }
        this._add(makeGabledRoof(tok))
        break
      }
      case 'hip':
        this._add(
          makeHipRoof({
            ...defaultHipConfig,
            ...body,
            overhang,
            ...overrides,
          })
        )
        break
      case 'flat':
        this._add(
          makeFlatRoof({
            ...defaultFlatRoofConfig,
            ...body,
            overhang,
            ...overrides,
          })
        )
        break
      case 'shed':
        this._add(
          makeShedRoof({
            ...defaultShedConfig,
            ...body,
            overhang,
            ...overrides,
          })
        )
        break
    }
  }

  // ── Opening builders ───────────────────────────────────────────────────────

  private _buildOpening(
    entry: OpeningEntry,
    dims: BuildingDims,
    body: { bodyW: number; bodyH: number; bodyD: number }
  ): void {
    const xOff = entry.xOffset ?? 0
    const ov = omitKeys(entry, ['type', 'xOffset'])

    switch (entry.type) {
      case 'door_frame':
        this._add(makeDoorFrame({ ...defaultDoorFrameConfig, ...body, ...ov }), xOff)
        break
      case 'window_frame':
        this._add(makeWindowFrame({ ...defaultWindowFrameConfig, ...body, ...ov }), xOff)
        break
      case 'window_grid':
        this._add(makeWindowGrid({ ...defaultWindowGridConfig, ...body, ...ov }), xOff)
        break
      case 'window_strip':
        this._add(
          makeWindowStrip({
            ...defaultWindowStripConfig,
            ...body,
            numFloors: dims.floors,
            floorH: dims.floorH,
            ...ov,
          }),
          xOff
        )
        break
      case 'loading_door':
        this._add(makeLoadingDoor({ ...defaultLoadingDoorConfig, ...body, ...ov }), xOff)
        break
    }
  }

  // ── Attachment builders ────────────────────────────────────────────────────

  private _buildAttachment(
    entry: AttachmentEntry,
    _dims: BuildingDims,
    body: { bodyW: number; bodyH: number; bodyD: number }
  ): void {
    const xOff = entry.xOffset ?? 0
    const ov = omitKeys(entry, ['type', 'xOffset'])

    switch (entry.type) {
      case 'balcony_slab':
        this._add(makeBalconySlab({ ...defaultBalconySlabConfig, ...body, ...ov }), xOff)
        break
      case 'balcony_railing':
        this._add(makeBalconyRailing({ ...defaultBalconyRailingConfig, ...body, ...ov }), xOff)
        break
      case 'awning':
        this._add(makeAwning({ ...defaultAwningConfig, ...body, ...ov }), xOff)
        break
      case 'drain_pipe':
        this._add(makeDrainPipe({ ...defaultDrainPipeConfig, ...body, ...ov }), xOff)
        break
      case 'ac_unit':
        this._add(makeACUnit({ ...defaultACUnitConfig, ...body, ...ov }), xOff)
        break
      case 'meter_box':
        this._add(makeMeterBox({ ...defaultMeterBoxConfig, ...body, ...ov }), xOff)
        break
      case 'antenna':
        this._add(makeAntenna({ ...defaultAntennaConfig, ...body, ...ov }), xOff)
        break
    }
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private _bodyDims(dims: BuildingDims) {
    return { bodyW: dims.W, bodyH: dims.H, bodyD: dims.D }
  }

  /** Register + add a PartResult to the group; apply optional X offset. */
  private _add(result: PartResult, xOffset = 0): void {
    for (const mesh of result.meshes) {
      if (xOffset !== 0) mesh.position.x += xOffset
      mesh.castShadow = true
      mesh.receiveShadow = true
      this.group.add(mesh)
    }
    this.geos.push(...result.geos)
    this.mats.push(...result.mats)
  }
}
