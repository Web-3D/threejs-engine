/**
 * VỊ TRÍ   — building-kit/wallAssembly.ts
 * VAI TRÒ  — Dựng 1 tường → mesh, dispatch theo material: surface-shader (merge bucket) ·
 *            brick-3d/wood-3d/wood-strip (component instanced). NGUỒN SỰ THẬT chung cho editor
 *            (archplan) lẫn headless (BuildingFromState/BuildingRenderer) → chống drift KI-001 (Gap 1 unify).
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
import type { GroundMixParams } from '../site/state' // 🎨 mix mặt tường (schema chung site-kit)
import { frameGeosLocal, leafGeoLocal } from './parts/Joinery'
import {
  makePositionedWall,
  type PositionedOpening,
  type PositionedPanel,
} from './parts/WallSingle'
import { WALL_COLORS } from './tokens'
import type { WallMaterialCache } from './wallMaterials'
import { brickOptsOf, DEFAULT_BRICK, wallColor, type WallMatInput } from './wallMaterials'

// Lỗ + panel + spec tường — ĐƠN VỊ MÉT (caller convert mm→m nếu cần).
export interface AsmOpening {
  kind: 'door' | 'window' | 'loading_door'
  x: number
  w: number
  h: number
  yOffset: number
  round?: boolean
  frame?: { w: number; out: number; color: number } // m — khung bao C1 (caller resolve style→spec); undefined = không khung
  leaf?: { double: boolean; open: number; color: number } // C2 cánh gỗ — open 0–100% (100 = 110°)
  key?: string // `${instId}:${segIdx}:${opIdx}` — editor live-tune cánh (tuneLeafLive); headless bỏ qua
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
  // 🎨 MIX mặt tường (PhotoGroundMix — caller bơm material qua ctx.mixMat). Chỉ nhánh SURFACE
  // (brick-3d/wood-3d/wood-strip giữ geometry thật — mix bỏ qua). undefined / ctx.mixMat null → như cũ.
  mix?: GroundMixParams
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
  // 🎨 MIX: caller (editor Lab) resolve material cho spec.mix (PhotoGroundMix cached, CALLER sở hữu — KHÔNG
  // dispose ở đây) + range (footY/h world) cho rule trọng lực. null = chưa sẵn → fallback material thường.
  mixMat?: (mix: GroundMixParams, range: { footY: number; h: number }) => THREE.Material | null
  // Material NGOÀI cache (mix per-segment) theo bucket key — mergeWalls tra đây khi cache miss.
  extraMats?: Map<string, THREE.Material>
}

// Dựng 1 tường: dispatch theo material. brick-3d/wood-3d/wood-strip = geometry thật (add thẳng group);
// còn lại = mesh phẳng + material cache → bake vào bucket để merge sau (mergeWalls).
export function assembleWall(place: WallPlace, spec: WallSpec, ctx: WallAsmCtx): void {
  assembleFrames(place, spec, ctx) // khung opening TRƯỚC dispatch — mọi loại tường đều có khung
  assembleLeaves(place, spec, ctx) // cánh cửa (C2) — mesh riêng trên pivot, không theo material tường
  if (spec.material === 'brick-3d') return assembleBrick3d(place, spec, ctx)
  if (spec.material === 'wood-3d') return assembleWood3d(place, spec, ctx)
  if (spec.material === 'wood-strip') return assembleWoodStrip(place, spec, ctx)
  assembleSurface(place, spec, ctx)
}

// Tường GEOMETRY THẬT có bề mặt NHÔ khỏi depth/2 (ván/gạch) → khung phải dày thêm bấy nhiêu kẻo má
// bị ván che mất (ảnh 2026-06-11: má khung wood-strip chỉ ló ở khe giữa các tấm). Số đo: strip =
// butt·cos(tilt) (mép proud, công thức zP của WoodSidingStrip); wood-3d ≈ thick+protrude default
// component (~40mm); brick-3d = brickProtrude 12mm. Surface-shader phẳng = 0.
function wallProud(spec: WallSpec): number {
  if (spec.material === 'wood-strip')
    return spec.woodButt * Math.cos((spec.woodStepTilt * Math.PI) / 180) + 0.004
  if (spec.material === 'wood-3d') return 0.042
  if (spec.material === 'brick-3d') return 0.014
  return 0
}

// KHUNG BAO opening (C1 Joinery): geos hệ local tường → transform theo place → đẩy THẲNG vào bucket
// màu phẳng `n:color` (mergeWalls merge + dispose) — khung cùng màu toàn nhà gộp 1 draw, 0 lifecycle mới.
function assembleFrames(place: WallPlace, spec: WallSpec, ctx: WallAsmCtx): void {
  const framed = spec.openings.filter((op) => op.frame)
  if (framed.length === 0) return
  const proud = wallProud(spec) // vỏ tường nhô (ván/gạch) → cộng vào nhô khung
  const mtx = new THREE.Matrix4()
    .makeRotationY((place.rotationY * Math.PI) / 180)
    .setPosition(place.xOffset, place.yBase, place.zOffset)
  for (const op of framed) {
    const fr0 = op.frame
    if (!fr0) continue
    const fr = proud > 0 ? { ...fr0, out: fr0.out + proud } : fr0
    const key = ctx.cache.frameKey(fr.color) // material DoubleSide riêng (né cull lớp lót trong)
    ctx.cache.ensureFrameMat(fr.color)
    let bucket = ctx.buckets.get(key)
    if (!bucket) {
      bucket = []
      ctx.buckets.set(key, bucket)
    }
    for (const g of frameGeosLocal(op, place.w, place.h, place.depth, fr)) {
      g.applyMatrix4(mtx)
      bucket.push(g) // bucket SỞ HỮU — mergeWalls dispose sau merge
    }
  }
}

// Cánh mở tối đa 110° (open=100%). Editor live-tune dùng CÙNG hằng số (xoay pivot trực tiếp).
export const LEAF_MAX_RAD = (110 * Math.PI) / 180

// CÁNH CỬA (C2 Joinery): mesh RIÊNG trên PIVOT tại trục bản lề — xoay live (transform thuần) nên
// KHÔNG merge bucket. Material chung joinery DoubleSide (cache — per-color). Pivot mang userData
// {leafKey, leafBase, leafSign} để editor kéo slider Mở xoay trực tiếp 0-rebuild (ctx.tuneLeafLive).
// French đôi: cánh 0 bản lề má TRÁI (trải +X), cánh 1 bản lề má PHẢI (mirror, trải −X) — cùng mở vào trong.
function assembleLeaves(place: WallPlace, spec: WallSpec, ctx: WallAsmCtx): void {
  const th = (place.rotationY * Math.PI) / 180
  const cos = Math.cos(th)
  const sin = Math.sin(th)
  for (const op of spec.openings) {
    const lf = op.leaf
    if (!lf || op.round) continue
    const y0 = Math.max(0, op.yOffset)
    const lh = Math.min(place.h, op.yOffset + op.h) - y0 - 0.008 // khe trên/dưới
    const n = lf.double ? 2 : 1
    const lw = op.w / n
    const mat = ctx.cache.ensureFrameMat(lf.color)
    const hx0 = op.x - place.w / 2 // mép trái lỗ (local centered)
    for (let i = 0; i < n; i++) {
      const mirror = i === 1
      const geo = leafGeoLocal(lw, lh, mirror)
      if (!geo) continue
      ctx.geos.push(geo)
      const mesh = new THREE.Mesh(geo, mat)
      mesh.castShadow = true
      mesh.receiveShadow = true
      const pivot = new THREE.Group()
      const hx = mirror ? hx0 + op.w : hx0 // trục bản lề: má trái / má phải
      pivot.position.set(
        place.xOffset + hx * cos,
        place.yBase + y0 + 0.004,
        place.zOffset - hx * sin
      )
      const sign = mirror ? -1 : 1 // cả 2 cánh mở VÀO TRONG (−Z local)
      pivot.rotation.y = th + sign * (Math.min(100, Math.max(0, lf.open)) / 100) * LEAF_MAX_RAD
      pivot.userData.leafKey = op.key ?? ''
      pivot.userData.leafBase = th
      pivot.userData.leafSign = sign
      pivot.add(mesh)
      ctx.group.add(pivot)
    }
  }
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
  // 🎨 MIX thắng material thường: key riêng theo params object (per-segment — không merge chéo mix khác
  // nhau; các mảnh CÙNG segment vẫn merge). Material caller-owned → extraMats (mergeWalls tra khi cache miss).
  const mixMat = spec.mix
    ? (ctx.mixMat?.(spec.mix, { footY: place.yBase, h: place.h }) ?? null)
    : null
  const key = mixMat ? mixKeyOf(spec.mix as GroundMixParams) : ctx.cache.wallKey(spec)
  if (mixMat) (ctx.extraMats ??= new Map()).set(key, mixMat)
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
    wallMaterial:
      mixMat ??
      ctx.cache.ensureMat(key, spec.material, wallColor(spec), spec.matScale, brickOptsOf(spec)),
    panels: resolvePanels(spec, ctx.cache),
  })
  bakeToBucket(ctx.buckets, key, result.meshes)
  for (const geo of result.geos) geo.dispose()
}

// 🎨 Bucket key ổn định per GroundMixParams object (WeakMap id) — mix per-segment không merge chéo.
const mixIds = new WeakMap<GroundMixParams, number>()
let mixIdSeq = 0
function mixKeyOf(m: GroundMixParams): string {
  let id = mixIds.get(m)
  if (id === undefined) {
    id = ++mixIdSeq
    mixIds.set(m, id)
  }
  return `mix:${id}`
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
    // 🎨 mix key → material caller-owned (extraMats, KHÔNG dispose); còn lại → cache như cũ.
    const mat = ctx.cache.getEntry(key)?.mat ?? ctx.extraMats?.get(key)
    if (!merged || !mat) continue
    ctx.geos.push(merged)
    const mesh = new THREE.Mesh(merged, mat)
    mesh.castShadow = true
    mesh.receiveShadow = true
    ctx.group.add(mesh)
  }
}
