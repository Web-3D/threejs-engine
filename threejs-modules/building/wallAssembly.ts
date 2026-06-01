/**
 * VỊ TRÍ   — building-kit/wallAssembly.ts
 * VAI TRÒ  — Dựng 1 tường → mesh, dispatch theo material: surface-shader (merge bucket) ·
 *            brick-3d/wood-3d/wood-strip (component instanced). NGUỒN SỰ THẬT chung cho editor
 *            (archplan) lẫn headless (BuildingFromPlan) → chống drift KI-001 (Gap 1 unify).
 * LIÊN HỆ  — Input CHUẨN HOÁ (mét): WallPlace + WallSpec. Editor/headless tự convert type của mình.
 *            Ctx mang cache + buckets + group + mảng tracking để caller dispose (editor & headless
 *            truyền field riêng vào). Pick box / undo / persist = việc RIÊNG của editor, KHÔNG ở đây.
 *
 * CÁCH DÙNG:
 *   const ctx = { cache, buckets: new Map(), group, geos, brick3d, wood, strip }
 *   for (const { place, spec } of walls) assembleWall(place, spec, ctx)
 *   mergeWalls(ctx)   // gộp surface-walls cùng key → 1 mesh
 *
 * DISPOSE: caller giữ ctx.geos (merged geo) + ctx.brick3d/wood/strip (component) → tự dispose.
 *          Material tường = cache-owned (cache.sweep/dispose lo).
 */

import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

import { type BrickOpening, InstancedBrickWall } from '../components/InstancedBrickWall'
import { WoodSidingStrip } from '../components/WoodSidingStrip'
import { WoodSidingWall } from '../components/WoodSidingWall'
import { makePositionedWall, type PositionedOpening, type PositionedPanel } from './parts/WallSingle'
import { WALL_COLORS } from './tokens'
import {
  brickOptsOf,
  DEFAULT_BRICK,
  wallColor,
  WallMaterialCache,
  type WallMatInput,
} from './wallMaterials'

// Lỗ + panel + spec tường — ĐƠN VỊ MÉT (caller convert mm→m nếu cần).
export interface AsmOpening {
  kind: 'door' | 'window' | 'loading_door'
  x: number
  w: number
  h: number
  yOffset: number
  round?: boolean
}
export interface AsmPanel {
  x: number
  y: number
  w: number
  h: number
  depth: number
  mode: 'recessed' | 'raised'
  material: WallMatInput['material']
  colorIndex: number
}
export interface WallSpec extends WallMatInput {
  style: 'flat' | 'reveal' | 'panel'
  woodReveal: number // m — wood-strip
  woodButt: number // m — wood-strip
  woodStepTilt: number // deg — wood-strip
  openings: AsmOpening[]
  panels: AsmPanel[]
}
// Vị trí + kích thước tường trong world (mét, độ).
export interface WallPlace {
  w: number
  h: number
  depth: number
  rotationY: number
  xOffset: number
  zOffset: number
  yBase: number
}
// Bộ gom + tracking — caller (editor/headless) truyền field riêng để tự dispose.
export interface WallAsmCtx {
  cache: WallMaterialCache
  buckets: Map<string, THREE.BufferGeometry[]>
  group: THREE.Group
  geos: THREE.BufferGeometry[] // merged surface-wall geos (owned → caller dispose)
  brick3d: InstancedBrickWall[]
  wood: WoodSidingWall[]
  strip: WoodSidingStrip[]
}

// Dựng 1 tường: dispatch theo material. brick-3d/wood-3d/wood-strip = geometry thật (add thẳng group);
// còn lại = mesh phẳng + material cache → bake vào bucket để merge sau (mergeWalls).
export function assembleWall(place: WallPlace, spec: WallSpec, ctx: WallAsmCtx): void {
  if (spec.material === 'brick-3d') return assembleBrick3d(place, spec, ctx)
  if (spec.material === 'wood-3d') return assembleWood3d(place, spec, ctx)
  if (spec.material === 'wood-strip') return assembleWoodStrip(place, spec, ctx)
  assembleSurface(place, spec, ctx)
}

function assembleSurface(place: WallPlace, spec: WallSpec, ctx: WallAsmCtx): void {
  const openings: PositionedOpening[] = spec.openings.map((op) => ({
    type: op.kind,
    x: op.x,
    w: op.w,
    h: op.h,
    yOffset: op.yOffset, // pass thẳng (kể cả ÂM) → bán nguyệt khi kéo xuống dưới sàn
    round: op.round,
  }))
  const key = ctx.cache.wallKey(spec)
  const result = makePositionedWall({
    w: place.w,
    h: place.h,
    depth: place.depth,
    style: spec.style,
    xOffset: place.xOffset,
    zOffset: place.zOffset,
    yBase: place.yBase,
    rotationY: place.rotationY,
    openings,
    wallMaterial: ctx.cache.ensureMat(key, spec.material, wallColor(spec), spec.matScale, brickOptsOf(spec)),
    panels: resolvePanels(spec, ctx.cache),
  })
  bakeToBucket(ctx.buckets, key, result.meshes)
  for (const geo of result.geos) geo.dispose()
}

// Panel decor → PositionedPanel (material/matKey từ cache chung; merge cùng vật liệu, ít draw call).
function resolvePanels(spec: WallSpec, cache: WallMaterialCache): PositionedPanel[] {
  return spec.panels.map((p) => {
    const pColor = WALL_COLORS[p.colorIndex % WALL_COLORS.length]
    const key = cache.matKey(p.material, pColor, 1, DEFAULT_BRICK)
    return {
      x: p.x,
      y: p.y,
      w: p.w,
      h: p.h,
      depth: p.depth,
      mode: p.mode,
      material: cache.ensureMat(key, p.material, pColor, 1, DEFAULT_BRICK),
      matKey: key,
    }
  })
}

// Bake mesh → bucket theo userData.matKey (panel decor) hoặc defaultKey (tường).
function bakeToBucket(
  buckets: Map<string, THREE.BufferGeometry[]>,
  defaultKey: string,
  meshes: THREE.Object3D[]
): void {
  for (const mesh of meshes) {
    mesh.updateMatrixWorld(true)
    mesh.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return
      const baked = obj.geometry.clone()
      baked.applyMatrix4(obj.matrixWorld)
      const mk = typeof obj.userData.matKey === 'string' ? obj.userData.matKey : defaultKey
      let bucket = buckets.get(mk)
      if (!bucket) {
        bucket = []
        buckets.set(mk, bucket)
      }
      bucket.push(baked)
    })
  }
}

function placeObject(obj: THREE.Object3D, place: WallPlace): void {
  obj.position.set(place.xOffset, place.yBase, place.zOffset)
  obj.rotation.y = (place.rotationY * Math.PI) / 180
}

// brick-3d: InstancedBrickWall (nền vữa + InstancedMesh gạch thật). Cull gạch trong lỗ cửa/sổ.
function assembleBrick3d(place: WallPlace, spec: WallSpec, ctx: WallAsmCtx): void {
  const openings: BrickOpening[] = spec.openings.map((op) => ({
    x: op.x,
    y: op.yOffset,
    w: op.w,
    h: op.h,
    round: op.round,
  }))
  const wall = new InstancedBrickWall({
    width: place.w,
    height: place.h,
    depth: place.depth,
    brickColor: wallColor(spec),
    mortarColor: spec.mortarColor,
    openings,
  })
  placeObject(wall.getGroup(), place)
  ctx.group.add(wall.getGroup())
  ctx.brick3d.push(wall)
}

// wood-3d: WoodSidingWall (ván gỗ ngang instanced). Chưa cull lỗ cửa.
function assembleWood3d(place: WallPlace, spec: WallSpec, ctx: WallAsmCtx): void {
  const wall = new WoodSidingWall({
    width: place.w,
    height: place.h,
    depth: place.depth,
    woodColor: wallColor(spec),
  })
  placeObject(wall.getGroup(), place)
  ctx.group.add(wall.getGroup())
  ctx.wood.push(wall)
}

// wood-strip: WoodSidingStrip (ván gỗ 1 khối ribbon, merge được). Khoét lỗ cửa/sổ + jamb reveal.
function assembleWoodStrip(place: WallPlace, spec: WallSpec, ctx: WallAsmCtx): void {
  const openings = spec.openings.map((op) => ({
    x: op.x,
    y: op.yOffset,
    w: op.w,
    h: op.h,
    round: op.round,
  }))
  const wall = new WoodSidingStrip({
    width: place.w,
    height: place.h,
    depth: place.depth,
    reveal: spec.woodReveal,
    butt: spec.woodButt,
    stepTiltDeg: spec.woodStepTilt,
    woodColor: wallColor(spec),
    openings,
  })
  placeObject(wall.getMesh(), place)
  ctx.group.add(wall.getMesh())
  ctx.strip.push(wall)
}

// Merge surface-wall geo cùng key (material+color+scale) → 1 mesh/key → tối thiểu draw call.
export function mergeWalls(ctx: WallAsmCtx): void {
  for (const [key, geos] of ctx.buckets) {
    if (geos.length === 0) continue
    const merged = mergeGeometries(geos, false)
    for (const g of geos) g.dispose() // clones đã copy vào merged → giải phóng
    const entry = ctx.cache.getEntry(key)
    if (!merged || !entry) continue
    ctx.geos.push(merged)
    const mesh = new THREE.Mesh(merged, entry.mat)
    mesh.castShadow = true
    mesh.receiveShadow = true
    ctx.group.add(mesh)
  }
}
