/**
 * VỊ TRÍ   — threejs-modules/site/render/fromState.ts  (site-kit)
 * VAI TRÒ  — RENDERER lô (orchestrator): SiteState (mm) → nền slab + tầng/zone + cỏ + hồ + rào vào ctx
 *            (group + arrays caller SỞ HỮU). Headless, KHÔNG DOM, KHÔNG dispose ctx (giống building).
 *            File này giữ: renderSiteState + ground geometry (grid/heightfield/clip) + LAYERS/ZONES/MIX.
 * LIÊN HỆ  — Mirror pattern building-kit/render/fromState. ĐỘC LẬP building/ (không import).
 *            Sub-domain TÁCH FILE (2026-06-11, code di nguyên văn): ./water.ts (hồ/vũng/basin/viền) +
 *            ./fence.ts (rào/cổng) + ./grass.ts (cỏ 3D) — public API re-export barrel ở CUỐI FILE,
 *            consumer giữ nguyên import từ fromState. Sub-file chỉ import type (+ zoneRects) ngược lại.
 *
 * CÁCH DÙNG:
 *   renderSiteState(site, { group: siteGroup, geos, mats })   // caller tự dispose geos/mats
 * DISPOSE: ctx.geos/mats do caller dispose. Renderer không giữ gì.
 */

// boolean zone−cut (Martinez) — khoét chính xác mọi shape. Lib export RUNTIME chỉ qua DEFAULT (named .d.ts lệch
// bản esm → `{difference}` = undefined lúc chạy); type-only named OK (erased). Gọi polygonClipping.difference.
import polygonClipping, { type MultiPolygon, type Ring } from 'polygon-clipping'
import * as THREE from 'three'

import { BrickPaving } from '../../components/BrickPaving' // 🧱 sân gạch bond đều (paving-zone, consumer op #3)
import { CurvedBrickWall } from '../../components/CurvedBrickWall' // 🧱 tường cong (wall-zone — op #1+#2+#3+#5)
import type { GrassBlades, GrassExcludeRect } from '../../components/GrassBlades'
import type { PondFish } from '../../components/PondFish' // 🐟 type-only — instance dựng ở render/water.ts
import { StoneScatter } from '../../components/StoneScatter'
import type { WaterSurface } from '../../components/WaterSurface'
import { GrassGround } from '../../shaders/ground/GrassGround'
import { PhotoGround, type PhotoGroundMaps } from '../../shaders/ground/PhotoGround'
import type { TexturedSurfaceMaps } from '../../shaders/surface/TexturedSurface'
import { pointInPolygon, shapeToLocalPolygon } from '../shapes' // tessellate shape→polygon + point-in-poly
import {
  type FenceConfig,
  type FishSchool,
  GROUND_PRESETS,
  type GroundLayer,
  type GroundMaterialKey,
  isGroundTexKey,
  makePavingParams,
  makeStonePathParams,
  makeWallCurveParams,
  renderPuddles,
  renderWaters,
  type SiteState,
  type TerrainConfig,
  type WaterConfig,
} from '../state'
import { heightAt, type HeightField, makeHeightField, type MaskRect } from '../terrain' // 🏔️ height-field gò
import { buildSiteFence } from './fence'
import { buildVegetation } from './grass'
import {
  allWaterCarvePolygons,
  buildFishSchool,
  buildPuddle,
  buildWater,
  waterPolygons,
  waterRect,
} from './water'

// Resource caller sở hữu — renderer build vào đây, KHÔNG dispose (giống building BuildRenderCtx).
// shaders: vật liệu procedural (vd GrassGround) có dispose() riêng (ngoài mats phẳng).
export interface SiteRenderCtx {
  group: THREE.Group
  geos: THREE.BufferGeometry[]
  mats: THREE.Material[]
  shaders: { dispose(): void }[]
}

// Handle trả về caller: ref tới cỏ 3D + hồ nước đang sống → tinh chỉnh uniform live + setSun (KHÔNG
// instanceof = né lỗi alias/relative khác class identity → live no-op).
export interface SiteHandle {
  grass: GrassBlades | null
  waters: WaterSurface[] // 1 WaterSurface mỗi hồ ĐANG BẬT (cùng thứ tự renderWaters(site)) — caller zip cfg↔surf
  ground: THREE.Mesh | null // mesh nền base (G0) — caller giữ ref để LIVE-rebuild geometry-only (terrain drag, né water-RTT)
  // 🐟 Bầy cá CON của hồ pond (kèm cfg + water chứa — caller tune live + navigate). Caller drive update(dt)
  // mỗi frame; dispose theo ctx.shaders.
  fish: { cfg: FishSchool; water: WaterConfig; fish: PondFish }[]
}

// Tùy chọn render lô (do caller=editor bơm; site-kit không tự biết building).
export interface SiteRenderOpts {
  // Footprint foundation (m, world XZ) — cỏ KHÔNG mọc trong các rect này ("nơi có foundation thì
  // không đặt nền cỏ"). Plain numbers → site-kit độc lập building-kit.
  exclude?: GrassExcludeRect[]
  // Bỏ qua dựng cỏ (caller TỰ quản cỏ riêng qua buildSiteGrass + dirty-check để né re-scatter mỗi
  // edit). Khi true → handle.grass = null. Mặc định false (consumer khác giữ hành vi cũ: lõi dựng cỏ).
  skipGrass?: boolean
  // Texture set cho ground 'grass-tex' (PhotoGround) — caller LOAD theo manifest assets/textures (rule
  // module độc lập: lõi KHÔNG biết URL). Thiếu → 'grass-tex' fallback màu phẳng preset. + tileSizeMeters (m).
  groundTextures?: PhotoGroundMaps
  groundTileMeters?: number
  // Material PhotoGround ĐÃ TẠO SẴN theo KEY (base + các TẦNG layer). Caller (editor) CACHE 1 lần/key — sống
  // lab-lifetime, KHÔNG recompile mỗi rebuild; nhiều ground cùng key DÙNG CHUNG 1 material. Ưu tiên hơn
  // groundTextures single. Lõi KHÔNG dispose (caller lo). Thiếu key → ground rơi về màu phẳng preset.
  groundMatByKey?: Partial<Record<GroundMaterialKey, THREE.Material>>
  // 🎨 Material MIX per-zone (PhotoGroundMix — layer.mix bật): caller (editor) tạo + CACHE theo zone, lõi
  // KHÔNG push/dispose. null = chưa sẵn (texture đang load) → fallback texture đơn layer.material như cũ.
  groundMixMat?: (layer: GroundLayer) => THREE.Material | null
  // 🎨 Material MIX cho G0 BASE (site.groundMix bật) — cùng giao kèo groundMixMat (caller cache/dispose,
  // null = chưa sẵn → fallback groundMaterial texture đơn).
  groundBaseMixMat?: () => THREE.Material | null
  // 🎨 Material MIX đáy/vách hồ (w.floorMix/wallMix bật — floor mapping 'xz', wall 'uv' chu-vi×cao) — cùng
  // giao kèo groundMixMat (caller cache/dispose; null = chưa sẵn/tắt → fallback basinMaterial như cũ).
  waterMixMat?: (w: WaterConfig, face: 'floor' | 'wall') => THREE.Material | null
  // 🎨 Material MIX mặt tường rào (fence.mix bật, chỉ type='wall' — mapping 'wall' planar đứng) — cùng giao
  // kèo (null = chưa sẵn/tắt → fallback fenceMaterialFor: triplanar wallTex / màu phẳng).
  fenceMixMat?: (f: FenceConfig) => THREE.Material | null
  // 🪨 Material RÀO/VIỀN hồ (TexturedSurface triplanar) theo borderMaterial key. Caller CACHE 1 lần/key (lab-
  // lifetime, KHÔNG push/dispose ở lõi). Thiếu/'none' → rào dùng màu phẳng borderColor. Triplanar áp được cả đá/gỗ.
  borderMatByKey?: Partial<Record<string, THREE.Material>>
  // Texture set cho MẶT tường rào (fence.type='wall' + fence.wallTex='cinder'/'stone') — TexturedSurface
  // (triplanar: tường DỌC nên cần). Caller LOAD theo manifest. Thiếu → tường màu phẳng. + tileSizeMeters (m).
  fenceWallTextures?: TexturedSurfaceMaps
  fenceWallTileMeters?: number
  // Material tường rào ĐÃ TẠO SẴN do caller CACHE 1 lần + sở hữu (TexturedSurface, KHÔNG recompile mỗi rebuild
  // — fence dựng lại mỗi frame kéo cổng/slider). Ưu tiên hơn fenceWallTextures. Lõi KHÔNG dispose (caller lo).
  fenceWallMat?: THREE.Material
  // Bỏ qua dựng RÀO (caller TỰ quản rào trong group bền + dirty-check riêng — né rebuild rào/nước-RTT mỗi
  // frame kéo slider rào). true → renderSiteState KHÔNG dựng rào; caller gọi buildSiteFence riêng. Default false.
  skipFence?: boolean
  // LOD rào lúc KÉO: stone (12k verts đỉnh-gợn) → dùng box mỏng rẻ (material vẫn cached, triplanar lo texture)
  // → kéo cổng/slider mượt; buông (false) → stone thật. Default false.
  fenceLodBox?: boolean
  // 🏔️ Footprint nhà (m, world XZ, rect có xoay) — terrain GIỮ PHẲNG pad dưới nhà (mask=0). Caller bơm
  // `_foundationRects()` (= GrassExcludeRect, khớp MaskRect). Thiếu → không pad nhà (chỉ pad hồ + viền lô).
  buildingFootprint?: MaskRect[]
}

// Dựng lô vào ctx. show=false → không dựng gì (caller để building về y=0). Trả handle (grass) cho live-tune.
export function renderSiteState(
  site: SiteState,
  ctx: SiteRenderCtx,
  opts: SiteRenderOpts = {}
): SiteHandle {
  if (!site.show) return { grass: null, waters: [], ground: null, fish: [] }
  const ground = buildGround(site, ctx, opts)
  buildGroundLayers(site, ctx, opts) // TẦNG surface chồng (xếp lớp 3D) lên base
  const pools = renderWaters(site) // pool + pond ĐANG BẬT (puddle placeholder bỏ qua)
  // Cỏ né cả foundation (caller) LẪN footprint+coping MỖI hồ → không mọc xuyên mặt nước/dải viền.
  const exclude = siteGrassExclude(site, opts.exclude ?? [])
  // skipGrass → caller TỰ dựng cỏ (buildSiteGrass) + giữ bền qua dirty-check (né re-scatter mỗi edit).
  const grass = opts.skipGrass ? null : buildVegetation(site, ctx, exclude)
  // waters: hồ LÕM (pool/pond, có basin) TRƯỚC rồi VŨNG phẳng (puddle) SAU — caller zip theo ĐÚNG thứ tự
  // [...renderWaters, ...renderPuddles] để drag/tune/handle nhắm đúng instance.
  const waters = pools.map((w) => buildWater(w, site, ctx, opts)) // 1 WaterSurface (+1 RTT) mỗi hồ bật
  for (const w of renderPuddles(site)) waters.push(buildPuddle(w, site, ctx)) // mặt nước phẳng trên nền
  // 🐟 đàn cá = CON của hồ pond (w.fishSchools[]) — chỉ pond đang bật, mỗi đàn enabled. Vùng bơi = lòng hồ thật.
  const fish = buildFishSchools(pools, site, ctx)
  // Rào ĐA-LỚP: dựng mỗi lớp enabled (vòng đồng tâm ở inset riêng). skipFence → editor tự dựng (_syncFence)
  // để per-fence material cache + dirty-check riêng. Headless (lib) path: mọi lớp dùng chung opts (fenceWallTextures).
  if (!opts.skipFence)
    for (const f of site.fences) if (f.enabled) buildSiteFence(f, site, ctx, opts)
  return { grass, waters, ground, fish }
}

// 🐟 Dựng cá cho mọi hồ pond đang bật: loop w.fishSchools[] (NHIỀU đàn/hồ — chuỗi bậc), mỗi đàn enabled = 1 PondFish
// (pool/puddle không có fishSchools). Tách khỏi renderSiteState (rule-50). Trả mảng {cfg, water, fish} thẳng hàng
// cho caller update(dt)/tune/navigate (cfg = FishSchool ref — _tuneFish/_previewFish khớp theo ref, đa đàn OK).
function buildFishSchools(
  pools: WaterConfig[],
  site: SiteState,
  ctx: SiteRenderCtx
): SiteHandle['fish'] {
  const fish: SiteHandle['fish'] = []
  for (const w of pools) {
    for (const fs of w.fishSchools ?? []) {
      if (!fs.enabled) continue // đàn tắt thì bỏ
      fish.push({ cfg: fs, water: w, fish: buildFishSchool(w, fs, site, ctx) })
    }
  }
  return fish
}

// Rect loại trừ cỏ (m, world XZ) = foundation (caller bơm) + footprint+coping MỖI hồ/vũng đang bật. (Path-zone rải
// đá né cỏ qua `zoneRects` — zone add nằm trong groundLayers nên đã có sẵn.) Export để CALLER dùng đúng tập exclude
// này cho cả dirty-check (grassBuildSig) LẪN buildSiteGrass → khớp với lõi.
export function siteGrassExclude(
  site: SiteState,
  foundation: GrassExcludeRect[]
): GrassExcludeRect[] {
  const exclude = [...foundation]
  for (const w of renderWaters(site)) exclude.push(waterRect(w))
  for (const w of renderPuddles(site)) exclude.push(waterRect(w)) // cỏ né cả vũng nước (không mọc xuyên mặt)
  // 🪨 cỏ né KHUÔN path (mọi path-zone): flat path đã trong zoneRects nhưng bám-gò (drape) thì KHÔNG → cần ở đây.
  for (const l of site.groundLayers ?? [])
    if (l.op !== 'cut' && (l.zoneKind === 'path' || l.zoneKind === 'paving'))
      exclude.push(layerRect(l)) // 🧱 cỏ né cả sân gạch (paving) — không mọc xuyên viên
  return exclude
}

// Nền lô. PBR nhận IBL + đổ bóng. Lô tâm world (0,0). KHÔNG hồ → BoxGeometry dày (đáy y=0, top y=t).
// CÓ hồ → ShapeGeometry PHẲNG ở mặt nền (y=t) KHOÉT LỖ polygon hồ: KHÔNG có mặt-cắt-dày → hết "đường xanh
// cỏ" ở mép hồ (cut-face của slab cũ cao = groundThick, càng dày càng lộ). Vách basin tự chạy rim→đáy.
function buildGround(site: SiteState, ctx: SiteRenderCtx, opts: SiteRenderOpts): THREE.Mesh {
  const geo = groundGeometry(site, opts)
  // 🎨 G0 bật MIX → PhotoGroundMix từ editor; null (texture đang load / tắt) → groundMaterial texture đơn như cũ
  const mesh = new THREE.Mesh(geo, baseMixMaterial(site, opts) ?? groundMaterial(site, ctx, opts))
  mesh.userData.isBaseGround = true // 🖌 editor raycast cọ vẽ mask mix G0 (target 'base')
  mesh.receiveShadow = true
  // 🌑 Nền cast bóng: vành hồ (mép lỗ) + gò terrain che nắng thấp → hết "nắng rọi xuyên mép xuống đáy hồ".
  // Mặt phẳng ngang cast gần như vô hại trên nền bằng (tia song song), chỉ mép lỗ/gò mới sinh bóng. NgQuan 2026-06-13.
  mesh.castShadow = true
  ctx.geos.push(geo)
  ctx.group.add(mesh)
  return mesh
}

// 🎨 Material mix G0 base (site.groundMix bật) — caller-owned (editor cache/dispose, lõi KHÔNG push).
// Tách hàm riêng: groundMaterial vốn đã chạm trần complexity 10.
function baseMixMaterial(site: SiteState, opts: SiteRenderOpts): THREE.Material | null {
  if (!site.groundMix) return null
  return opts.groundBaseMixMat?.() ?? null
}

// Geometry nền base (G0) TÁCH RIÊNG → caller LIVE-rebuild geometry-only (terrain drag): swap mesh.geometry,
// KHÔNG đụng water reflector RTT / NodeMaterial (= chỗ tụt fps). terrain bật → lưới displaced; tắt → phẳng cũ.
// clean=true (commit): cắt lỗ hồ SẠCH bám polygon (clip ô-biên). clean=false (live-drag): bỏ-ô nhanh (răng cưa
// tạm) → né clip Martinez per-frame. Buông slider = commit (clean) → mép snap về sạch.
export function groundGeometry(
  site: SiteState,
  opts: SiteRenderOpts,
  clean = true
): THREE.BufferGeometry {
  const t = site.groundThick / 1000
  const terr = site.terrain
  return terr && terr.enabled
    ? griddedGroundGeometry(site, opts, terr, t, clean)
    : flatGroundGeometry(site, t)
}

// Nền PHẲNG (terrain tắt) — giữ nguyên hành vi cũ: có hồ → ShapeGeometry 1 mặt (lỗ hồ, hở màu cỏ); không hồ → Box dày.
function flatGroundGeometry(site: SiteState, t: number): THREE.BufferGeometry {
  if (renderWaters(site).length > 0) {
    const geo = new THREE.ShapeGeometry(lotShape(site)) // phẳng (1 mặt) — không cut-face để hở màu cỏ
    geo.rotateX(-Math.PI / 2) // shape XY → nằm ngang XZ (normal +Y, nhìn từ trên)
    geo.translate(0, t, 0) // nâng lên mặt nền (rim = top slab cũ)
    return geo
  }
  const geo = new THREE.BoxGeometry(site.lotWidth / 1000, t, site.lotDepth / 1000)
  geo.translate(0, t / 2, 0) // box tâm → đáy y=0
  return geo
}

// 🏔️ Nền GÒ (terrain bật): lưới res×res trên bbox lô, đẩy Y = topY + heightAt(hf). Lỗ nền = waterPolygons
// (pool/pond WATER-SHAPE thuần, KHỚP path phẳng — KHÔNG edge/puddle). clean=true (commit) → CLIP ô-biên bằng
// polygon-clipping (mép bám đúng polygon, mịn như cut C1); clean=false (live) → bỏ-NGUYÊN-ô (răng cưa nhanh, né
// clip Martinez mỗi frame). Mặt trên ĐƠN (viền phẳng+rào che). Material sample positionWorld.xz → texture tự bám gò.
// Phần TỐI THIỂU để emit tam-giác displaced — DÙNG CHUNG nền G0 (GridBuild) lẫn zone drape/gò. `yAt(x,z)` = cao-độ
// Y world: G0 = topY+heightAt; zone = baseY + (gò G0 nếu drape) + (gò riêng zone) → caller tổ hợp.
interface GridEmit {
  yAt: (x: number, z: number) => number
  pos: number[]
  uv: number[]
  idx: number[]
}
interface GridBuild extends GridEmit {
  res: number
  nx: number
  hw: number // m — nửa ngang lô
  hd: number // m — nửa sâu lô
  holes: { x: number; z: number }[][] // polygon hồ (world XZ)
  boxes: { x0: number; x1: number; z0: number; z1: number }[] // bbox hồ +1 ô (broad-phase né corner-test/clip)
  clean: boolean
}

function gridX(g: GridBuild, i: number): number {
  return -g.hw + (i / g.res) * 2 * g.hw
}
function gridZ(g: GridBuild, j: number): number {
  return -g.hd + (j / g.res) * 2 * g.hd
}

function griddedGroundGeometry(
  site: SiteState,
  opts: SiteRenderOpts,
  terrain: TerrainConfig,
  topY: number,
  clean: boolean
): THREE.BufferGeometry {
  const res = terrain.resolution
  const hw = site.lotWidth / 2000
  const hd = site.lotDepth / 2000
  const holes = waterPolygons(site)
  const cell = Math.max((2 * hw) / res, (2 * hd) / res)
  const hf = buildHeightField(site, opts, terrain)
  const g: GridBuild = {
    res,
    nx: res + 1,
    hw,
    hd,
    yAt: (x, z) => topY + heightAt(hf, x, z),
    holes,
    boxes: holes.map((h) => polyBox(h, cell)),
    clean,
    pos: [],
    uv: [],
    idx: [],
  }
  for (let j = 0; j <= res; j++)
    for (let i = 0; i <= res; i++) {
      const x = gridX(g, i)
      const z = gridZ(g, j)
      g.pos.push(x, g.yAt(x, z), z)
      g.uv.push(i / res, j / res)
    }
  for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) emitGridCell(g, i, j)
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.uv, 2))
  geo.setIndex(g.idx)
  geo.computeVertexNormals()
  return geo
}

// bbox polygon + lề m — broad-phase: ô ngoài hết mọi bbox → chắc chắn ngoài hồ (bỏ qua corner-test/clip).
function polyBox(
  h: { x: number; z: number }[],
  m: number
): { x0: number; x1: number; z0: number; z1: number } {
  let x0 = Infinity
  let x1 = -Infinity
  let z0 = Infinity
  let z1 = -Infinity
  for (const p of h) {
    x0 = Math.min(x0, p.x)
    x1 = Math.max(x1, p.x)
    z0 = Math.min(z0, p.z)
    z1 = Math.max(z1, p.z)
  }
  return { x0: x0 - m, x1: x1 + m, z0: z0 - m, z1: z1 + m }
}

// 1 ô lưới → tam-giác. !clean (live) → bỏ-ô theo tâm (răng cưa nhanh). clean: xa hồ / 0 góc trong → 2 tris lưới;
// 4 góc trong → bỏ (lỗ); 1–3 góc (cắt biên) → clip sạch. a = index đỉnh góc (i,j).
function emitGridCell(g: GridBuild, i: number, j: number): void {
  const a = j * g.nx + i
  if (!g.clean) {
    if (!insideWaterHole(gridX(g, i + 0.5), gridZ(g, j + 0.5), g.holes)) pushGridQuad(g, a)
    return
  }
  if (!cellNearWater(g, i, j)) {
    pushGridQuad(g, a)
    return
  }
  const corners = cellCorners(g, i, j)
  let inside = 0
  for (const c of corners) if (insideWaterHole(c.x, c.z, g.holes)) inside++
  if (inside === 0) pushGridQuad(g, a)
  else if (inside < 4) clipCellAgainstWater(g, corners)
}

function pushGridQuad(g: GridBuild, a: number): void {
  g.idx.push(a, a + g.nx, a + 1, a + 1, a + g.nx, a + g.nx + 1) // winding → normal +Y
}

function cellCorners(g: GridBuild, i: number, j: number): { x: number; z: number }[] {
  const x0 = gridX(g, i)
  const x1 = gridX(g, i + 1)
  const z0 = gridZ(g, j)
  const z1 = gridZ(g, j + 1)
  return [
    { x: x0, z: z0 },
    { x: x1, z: z0 },
    { x: x1, z: z1 },
    { x: x0, z: z1 },
  ]
}

function cellNearWater(g: GridBuild, i: number, j: number): boolean {
  const x0 = gridX(g, i)
  const x1 = gridX(g, i + 1)
  const z0 = gridZ(g, j)
  const z1 = gridZ(g, j + 1)
  for (const b of g.boxes) if (x1 >= b.x0 && x0 <= b.x1 && z1 >= b.z0 && z0 <= b.z1) return true
  return false
}

// Cắt ô-biên SẠCH: ô − hồ (polygon-clipping difference, như cut C1) → MultiPolygon → tam-giác-hoá
// (ShapeUtils.triangulateShape) → đỉnh đẩy y=topY+heightAt. Mép bám đúng đường hồ (tròn/ellipse/bezier).
function clipCellAgainstWater(g: GridBuild, corners: { x: number; z: number }[]): void {
  const cellRing: Ring = corners.map((c) => [c.x, c.z])
  cellRing.push([corners[0].x, corners[0].z]) // khép kín
  const waterMulti: MultiPolygon = g.holes.map((h) => [closeWaterRing(h)])
  const result = polygonClipping.difference([cellRing], waterMulti)
  for (const poly of result) {
    const ring = poly[0]
    if (!ring || ring.length < 4) continue // biên ngoài < 3 đỉnh thật → bỏ
    const pts = ring.map(([x, z]) => new THREE.Vector2(x, z)) // Vector2 (triangulateShape gọi .equals)
    for (const [ia, ib, ic] of THREE.ShapeUtils.triangulateShape(pts, []))
      emitWorldTri(g, pts[ia], pts[ib], pts[ic])
  }
}

function closeWaterRing(h: { x: number; z: number }[]): Ring {
  const r: Ring = h.map((p) => [p.x, p.z])
  if (r.length > 0) r.push([h[0].x, h[0].z])
  return r
}

// Emit 1 tam-giác (đỉnh Vector2: x=worldX, y=worldZ) — canh winding +Y (grid: signed-area(x,z) < 0; >0 thì lật).
function emitWorldTri(g: GridEmit, a: THREE.Vector2, b: THREE.Vector2, c: THREE.Vector2): void {
  const area = (b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)
  const tri = area > 0 ? [a, c, b] : [a, b, c]
  const base = g.pos.length / 3
  for (const p of tri) {
    g.pos.push(p.x, g.yAt(p.x, p.y), p.y) // p.y = worldZ
    g.uv.push(0, 0)
  }
  g.idx.push(base, base + 1, base + 2)
}

// Height-field gò: maskRects giữ-phẳng = footprint nhà (opts) + bbox MỌI hồ/vũng (waterRect, đã nở edgeWidth).
function buildHeightField(
  site: SiteState,
  opts: SiteRenderOpts,
  terrain: TerrainConfig
): HeightField {
  const rects: MaskRect[] = [...(opts.buildingFootprint ?? [])]
  for (const w of renderWaters(site)) rects.push(waterRect(w))
  for (const w of renderPuddles(site)) rects.push(waterRect(w))
  rects.push(...zoneRects(site)) // 🏔️ gò chừa PHẲNG dưới zones G1/G2/z1/z2 (không cướp đất)
  return makeHeightField(terrain, rects, site.lotWidth / 2000, site.lotDepth / 2000)
}

// Tâm ô có nằm trong polygon hồ nào không (point-in-polygon ray-cast) → đục lỗ nền.
function insideWaterHole(x: number, z: number, holes: { x: number; z: number }[][]): boolean {
  for (const poly of holes) if (pointInPolygon(x, z, poly)) return true
  return false
}

// Shape lô (XY: x=worldX, y=−worldZ) + 1 lỗ MỖI pool đang bật cho ExtrudeGeometry nền.
function lotShape(site: SiteState): THREE.Shape {
  const hw = site.lotWidth / 2000
  const hd = site.lotDepth / 2000
  const s = new THREE.Shape()
  s.moveTo(-hw, -hd)
  s.lineTo(hw, -hd)
  s.lineTo(hw, hd)
  s.lineTo(-hw, hd)
  s.closePath()
  for (const poly of waterPolygons(site)) {
    const hole = new THREE.Path()
    poly.forEach((q, i) => (i === 0 ? hole.moveTo(q.x, -q.z) : hole.lineTo(q.x, -q.z)))
    hole.closePath()
    s.holes.push(hole)
  }
  return s
}

// {x,z} polygon (world, mét) → Ring polygon-clipping ở (x, −z) — KHÉP KÍN (đỉnh đầu lặp cuối, lib yêu cầu).
function toRing(poly: { x: number; z: number }[]): Ring {
  const r: Ring = poly.map((p) => [p.x, -p.z])
  if (r.length > 0) r.push([r[0][0], r[0][1]])
  return r
}

// 1 Ring (x, −z) → nạp vào THREE Path/Shape (moveTo/lineTo), bỏ đỉnh khép trùng cuối.
function ringToPath(ring: Ring, target: THREE.Path): void {
  for (let i = 0; i < ring.length - 1; i++) {
    const [x, y] = ring[i]
    if (i === 0) target.moveTo(x, y)
    else target.lineTo(x, y)
  }
}

// Contour 1 layer (world XZ, mét) theo shape (rect/circle/ellipse/free). Tái dùng length/width = trục shape.
function layerWorldPolygon(layer: GroundLayer): { x: number; z: number }[] {
  const ox = layer.offsetX / 1000
  const oz = layer.offsetZ / 1000
  const local = shapeToLocalPolygon({
    shape: layer.shape ?? 'rect',
    width: layer.length,
    depth: layer.width,
    points: layer.points ?? [],
  })
  return local.map((p) => ({ x: ox + p.x, z: oz + p.z }))
}

// 🏔️ BBox 1 ADD-zone (m, world XZ) cho terrain mask — gò GIỮ PHẲNG dưới zone → KHÔNG "cướp đất" của G1/G2/z1/z2
// (zone = ExtrudeGeometry slab phẳng; nếu gò nhấp nhô dưới nó → nổi/lún mép). BBox axis-aligned (như waterRect):
// non-rect/xoay → hơi rộng, chấp nhận. layerWorldPolygon đã gồm offset.
function layerRect(layer: GroundLayer): MaskRect {
  const poly = layerWorldPolygon(layer)
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const p of poly) {
    minX = Math.min(minX, p.x)
    maxX = Math.max(maxX, p.x)
    minZ = Math.min(minZ, p.z)
    maxZ = Math.max(maxZ, p.z)
  }
  return {
    cx: (minX + maxX) / 2,
    cz: (minZ + maxZ) / 2,
    halfW: (maxX - minX) / 2,
    halfD: (maxZ - minZ) / 2,
    rot: 0,
  }
}

// 🏔️ Rects giữ-phẳng terrain của MỌI ADD-zone (cut = lỗ, không surface để cướp → bỏ). DÙNG CHUNG nền (buildHeightField)
// + cỏ (buildSiteGrass — EXPORT cho ./grass.ts import ngược) → gò + cỏ KHỚP nhau dưới zone. Rỗng nếu không có zone.
// CHỈ zone PHẲNG-pad (drape=false): gò làm phẳng dưới nó. Zone DRAPE (drape=true) KHÔNG vào mask → gò giữ nhấp
// nhô để zone uốn theo (drapedLayerGeometry). cut = lỗ → bỏ.
export function zoneRects(site: SiteState): MaskRect[] {
  const rects: MaskRect[] = []
  // 🧱 wall = tường cong MỎNG (rect zone không phản ánh footprint) → KHÔNG flatten terrain dưới nó
  for (const l of site.groundLayers ?? [])
    if (l.op !== 'cut' && !l.drape && l.zoneKind !== 'wall') rects.push(layerRect(l))
  return rects
}

// (waterCarveWithEdge + allWaterCarvePolygons → ./water.ts — import ở đầu file.)

// Geometry 1 tầng ADD-layer = ExtrudeGeometry theo SHAPE (rect/circle/ellipse/free, contour = layerWorldPolygon)
// dày th, ĐỤC LỖ mọi `holes` (nước + vùng CUT) bằng polygon-boolean THẬT (difference): khoét chính xác mọi case —
// phủ một phần/lệch/mép cong/xóa hết — KHÔNG còn viền/góc thừa/wedge. Kết quả MultiPolygon (cut có thể chẻ zone
// thành nhiều mảnh, mỗi mảnh có lỗ) → mảng Shape. Rỗng (cut phủ trọn) → null (caller KHÔNG dựng mesh). Shape XY
// (x=worldX, y=−worldZ) → rotateX(−90) nằm ngang (đáy y=0, đỉnh th).
function layerGeometry(
  layer: GroundLayer,
  th: number,
  holes: { x: number; z: number }[][]
): THREE.BufferGeometry | null {
  const contour = toRing(layerWorldPolygon(layer))
  if (contour.length < 4) return null // contour < 3 đỉnh thật → bỏ
  const clips: MultiPolygon = holes.filter((h) => h.length >= 3).map((h) => [toRing(h)])
  const result: MultiPolygon =
    clips.length > 0 ? polygonClipping.difference([contour], ...clips) : [[contour]]
  const shapes: THREE.Shape[] = []
  for (const poly of result) {
    if (!poly[0] || poly[0].length < 4) continue // ring biên ngoài < 3 đỉnh → bỏ mảnh
    const shape = new THREE.Shape()
    ringToPath(poly[0], shape) // ring[0] = biên ngoài
    for (let h = 1; h < poly.length; h++) {
      const path = new THREE.Path()
      ringToPath(poly[h], path) // ring[1..] = lỗ
      shape.holes.push(path)
    }
    shapes.push(shape)
  }
  if (shapes.length === 0) return null // bị khoét sạch → không có gì để dựng
  const geo = new THREE.ExtrudeGeometry(shapes, { depth: th, bevelEnabled: false })
  geo.rotateX(-Math.PI / 2) // XY → XZ; depth +Z → +Y (đáy y=0, đỉnh y=th)
  return geo
}

// Cỡ ô lưới (m) = cạnh-lô-lớn / resolution — DÙNG CHUNG nền G0 + zone drape (mật độ tessellation khớp gò).
function gridCell(site: SiteState, terrain: TerrainConfig): number {
  return Math.max(site.lotWidth / 1000, site.lotDepth / 1000) / terrain.resolution
}

// Khoảng cách (m) từ (x,z) tới VIỀN polygon (min qua mọi cạnh) — cho edge-taper zone (mép→0, trong→band).
function distToPolyEdge(x: number, z: number, ring: { x: number; z: number }[]): number {
  let min = Infinity
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    min = Math.min(min, distPointSeg(x, z, a.x, a.z, b.x, b.z))
  }
  return min
}

// Khoảng cách điểm→đoạn thẳng (2D XZ).
function distPointSeg(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number
): number {
  const dx = bx - ax
  const dz = bz - az
  const len2 = dx * dx + dz * dz
  let t = len2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / len2 : 0
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz))
}

// Hàm cao-độ Y zone cuối: loangLo (drape) → `surf.top` thẳng (dao động quanh G0). else → taper mép về `below+GAP`
// (band = edgeFlat zone, cap ≤45% cạnh nhỏ). Tách giữ drapedLayerGeometry complexity ≤10.
function zoneYAtFn(
  surf: { top: YFn; below: YFn; loangLo: boolean },
  contour: { x: number; z: number }[],
  layer: GroundLayer
): YFn {
  if (surf.loangLo) return surf.top
  const minSide = Math.min(layer.length, layer.width) / 1000
  const band = Math.max(0.05, Math.min((layer.terrain?.edgeFlat ?? 800) / 1000, minSide * 0.45))
  return (x, z) => {
    const lo = surf.below(x, z) + ZONE_MIN_GAP
    const d = Math.min(distToPolyEdge(x, z, contour) / band, 1)
    const w = d * d * (3 - 2 * d)
    return lo + w * (surf.top(x, z) - lo)
  }
}

// 🏔️ Zone DISPLACED (drape G0 và/hoặc gò riêng zone): lưới (cỡ ô = cell) trên bbox zone. **MÉP HẠ THẤP TỰ NHIÊN**:
// `yAt` blend `top` về (`below + GAP`) theo khoảng-cách-tới-viền → rủ mượt xuống GẦN G-dưới (cách GAP, KHÔNG bằng
// → né z-fight). band = edgeFlat (cap ≤45% cạnh nhỏ). **clean=true (commit):** clip ô-biên `polygonClipping`
// (mép sạch). **clean=false (live drag):** bỏ-ô theo tâm-trong-contour (răng cưa tạm, KHÔNG clip Martinez → mượt
// fps). holes = nước+cut cùng level. Rỗng → null.
function drapedLayerGeometry(
  layer: GroundLayer,
  surf: { top: YFn; below: YFn; loangLo: boolean },
  holes: { x: number; z: number }[][],
  cell: number,
  clean: boolean
): THREE.BufferGeometry | null {
  const contour = layerWorldPolygon(layer)
  if (contour.length < 3) return null
  const bb = polyBox(contour, 0)
  const nx = Math.max(1, Math.ceil((bb.x1 - bb.x0) / cell))
  const nz = Math.max(1, Math.ceil((bb.z1 - bb.z0) / cell))
  const yAt = zoneYAtFn(surf, contour, layer)
  const g: GridEmit = { yAt, pos: [], uv: [], idx: [] }
  const contourRing = closeWaterRing(contour)
  const holeRings: MultiPolygon = holes.filter((h) => h.length >= 3).map((h) => [closeWaterRing(h)])
  for (let jz = 0; jz < nz; jz++)
    for (let ix = 0; ix < nx; ix++) {
      const x0 = bb.x0 + ix * cell
      const x1 = Math.min(bb.x1, x0 + cell)
      const z0 = bb.z0 + jz * cell
      const z1 = Math.min(bb.z1, z0 + cell)
      if (clean) clipZoneCell(g, x0, x1, z0, z1, contourRing, holeRings)
      else if (
        pointInPolygon((x0 + x1) / 2, (z0 + z1) / 2, contour) &&
        !insideWaterHole((x0 + x1) / 2, (z0 + z1) / 2, holes)
      )
        emitZoneQuad(g, x0, x1, z0, z1) // live: bỏ-ô tâm-trong (răng cưa tạm, né clip)
    }
  if (g.idx.length === 0) return null
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.uv, 2))
  geo.setIndex(g.idx)
  geo.computeVertexNormals()
  return geo
}

// 1 ô lưới zone → (ô ∩ contour) − holes (polygon-clipping) → ShapeUtils.triangulateShape (gồm lỗ trong ô) →
// emitWorldTri (Y bám gò). Ô ngoài contour → intersection rỗng → bỏ. Mép bám đúng đường zone (mọi shape).
function clipZoneCell(
  g: GridEmit,
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  contourRing: Ring,
  holeRings: MultiPolygon
): void {
  const cellRing: Ring = [
    [x0, z0],
    [x1, z0],
    [x1, z1],
    [x0, z1],
    [x0, z0],
  ]
  const inter = polygonClipping.intersection([cellRing], [contourRing])
  if (inter.length === 0) return
  const result = holeRings.length > 0 ? polygonClipping.difference(inter, ...holeRings) : inter
  for (const poly of result) {
    if (!poly[0] || poly[0].length < 4) continue // biên ngoài < 3 đỉnh thật → bỏ
    const outer = poly[0].map(([x, z]) => new THREE.Vector2(x, z))
    const holePts = poly.slice(1).map((r) => r.map(([x, z]) => new THREE.Vector2(x, z)))
    const all = holePts.length > 0 ? [...outer, ...holePts.flat()] : outer
    for (const [ia, ib, ic] of THREE.ShapeUtils.triangulateShape(outer, holePts))
      emitWorldTri(g, all[ia], all[ib], all[ic])
  }
}

// Live (clean=false): 1 ô lưới zone TRỌN → 2 tam-giác (4 góc ở yAt) — KHÔNG clip (răng cưa mép tạm, mượt fps).
function emitZoneQuad(g: GridEmit, x0: number, x1: number, z0: number, z1: number): void {
  const a = new THREE.Vector2(x0, z0)
  const b = new THREE.Vector2(x1, z0)
  const c = new THREE.Vector2(x1, z1)
  const d = new THREE.Vector2(x0, z1)
  emitWorldTri(g, a, b, c)
  emitWorldTri(g, a, c, d)
}

// Các G-LEVEL phân biệt (1-based, tăng dần) — gồm CẢ level chỉ-có-cut (cut-only). Xếp chồng Y theo level.
function groundRenderLevels(layers: GroundLayer[]): number[] {
  const set = new Set<number>()
  for (const l of layers) set.add(l.level ?? 1)
  return [...set].sort((a, b) => a - b)
}

// Dựng 1 ZONE (mesh) tại baseY (KHÔNG cộng baseY trong level → zones cùng level đồng phẳng). holes = NƯỚC + vùng
// CUT cùng level (ĐỤC LỖ thật → lộ lớp dưới). groundLayerIdx = index phẳng gốc (ArchPlanLab pick).
// 🏔️ Drape ctx (terrain bật): height-field + cỡ ô — bơm xuống để zone drape=true uốn theo gò. null = terrain tắt.
interface DrapeCtx {
  hf: HeightField
  cell: number
  hw: number // m — nửa ngang lô (lưới G0) — để zone lấy cao-độ G0 MESH (facet) đúng, không lệch
  hd: number // m — nửa sâu lô
  res: number // độ phân giải lưới G0
}

// Cao-độ G0 MESH (m, KHÔNG kể topY) tại (x,z) = nội-suy TAM-GIÁC trên lưới G0 — khớp ĐÚNG mặt G0 render (pushGridQuad
// chia 2 tam-giác, KHÔNG bilinear). Zone `below` dùng cái này (THAY heightAt true-curve) ⇒ below = mặt G0 mesh đúng ở
// đỉnh zone → zone LUÔN cao hơn G0 đúng GAP (hết XUYÊN do lệch true-curve vs facet, lộ khi gò-zone thấp).
function g0MeshHeightAt(
  g0: HeightField,
  x: number,
  z: number,
  hw: number,
  hd: number,
  res: number
): number {
  const cellX = (2 * hw) / res
  const cellZ = (2 * hd) / res
  const i = Math.max(0, Math.min(res - 1, Math.floor((x + hw) / cellX)))
  const j = Math.max(0, Math.min(res - 1, Math.floor((z + hd) / cellZ)))
  const x0 = -hw + (i / res) * 2 * hw
  const z0 = -hd + (j / res) * 2 * hd
  const x1 = -hw + ((i + 1) / res) * 2 * hw
  const z1 = -hd + ((j + 1) / res) * 2 * hd
  const fx = Math.max(0, Math.min(1, (x - x0) / cellX))
  const fz = Math.max(0, Math.min(1, (z - z0) / cellZ))
  const h00 = heightAt(g0, x0, z0)
  const h10 = heightAt(g0, x1, z0)
  const h01 = heightAt(g0, x0, z1)
  const h11 = heightAt(g0, x1, z1)
  // pushGridQuad: T1 (00,01,10) khi fx+fz≤1; T2 (11,10,01) khi fx+fz>1.
  return fx + fz <= 1
    ? h00 * (1 - fx - fz) + h10 * fx + h01 * fz
    : h11 * (fx + fz - 1) + h10 * (1 - fz) + h01 * (1 - fx)
}

type YFn = (x: number, z: number) => number

// 🏔️ Khoảng hở TỐI THIỂU zone↔G-dưới (m): Y zone LUÔN ≥ Y-G-dưới + GAP → **G1 KHÔNG BAO GIỜ bằng Y G0** theo chiếu
// đứng (né z-fight + "không lơ lửng nhưng cũng không trùng"). Mép taper rủ về `below + GAP` (không tới below). 2cm
// đủ trùm sai-số nội-suy lưới (curve-vs-chord) ở địa hình thường; gò dốc cực đoan có thể cần grid-align (defer).
const ZONE_MIN_GAP = 0.02

// 🏔️ Mặt Y zone DISPLACED — null nếu zone PHẲNG (không drape + không gò riêng → slab). 2 CHẾ ĐỘ:
//  • **DRAPE bật = LOANG LỔ** (`loangLo=true`): zone (cát) dao động QUANH mặt G0 (cỏ) theo gò CENTERED → chỗ chìm
//    dưới G0 = G0 ló (cỏ), chỗ nổi = zone (cát) → "cát phủ loang lổ lên cỏ". bias = ½amplitude (gò [0,amp]→[±amp/2]).
//    KHÔNG taper/min-gap (interpenetrate CHÍNH LÀ hiệu ứng). Không gò-riêng → +GAP (clean, bám G0).
//  • **DRAPE tắt = ĐÈ TRỰC TIẾP** (`loangLo=false`): gò trên nền PHẲNG (G0 đã mask phẳng dưới), giữ TRÊN base +
//    taper mép (clean pad). `below`=base, `top`=base+GAP+gò.
// g0At = cao-độ G0 MESH (facet, khớp render). Gò-zone = height-field noise+mounds riêng (mask off → fill cả zone).
function zoneSurfaces(
  layer: GroundLayer,
  baseY: number,
  drape: DrapeCtx | null
): { top: YFn; below: YFn; loangLo: boolean } | null {
  const dc = drape && layer.drape ? drape : null // ctx G0 nếu zone bám gò G0 (gồm lưới hw/hd/res)
  const zt = layer.terrain && layer.terrain.enabled ? layer.terrain : null // cấu hình gò riêng (nếu bật)
  const zhf = zt ? makeHeightField(zt, [], 1e6, 1e6) : null // gò riêng (lotHalf lớn → edge-mask ~1 khắp zone)
  if (!dc && !zhf) return null // phẳng → slab ExtrudeGeometry
  const g0At: YFn = (x, z) => (dc ? g0MeshHeightAt(dc.hf, x, z, dc.hw, dc.hd, dc.res) : 0)
  if (dc) {
    const bias = zt ? zt.amplitude / 2000 : 0 // ½ amplitude (m) → gò centered quanh 0
    const yAt: YFn = (x, z) =>
      baseY + g0At(x, z) + (zhf ? heightAt(zhf, x, z) - bias : ZONE_MIN_GAP)
    return { top: yAt, below: (x, z) => baseY + g0At(x, z), loangLo: true }
  }
  return {
    below: () => baseY,
    top: (x, z) => baseY + ZONE_MIN_GAP + (zhf ? heightAt(zhf, x, z) : 0),
    loangLo: false,
  }
}

// Cỡ ô lưới zone displaced: ưu tiên cell G0 (drape, khớp mật độ nền); else gò-riêng → zone-size / resolution-zone.
function zoneCell(layer: GroundLayer, drape: DrapeCtx | null): number {
  if (drape) return drape.cell
  const res = layer.terrain?.resolution ?? 64
  return Math.max(layer.length, layer.width) / 1000 / res
}

// 🪨 BÁM GÒ: dời Y MỖI viên đá theo cao-độ gò tại vị-trí-thế-giới của nó. Instance Y (mesh-local) += heightAt;
// mesh.rotation.y giữ Y nên world Y dời đúng. worldXZ = offset + xoay(local) theo rot (Three Y-rot: x'=x·c+z·s, z'=−x·s+z·c).
function drapeStonesToTerrain(
  field: StoneScatter,
  hf: HeightField,
  offX: number,
  offZ: number,
  rotRad: number
): void {
  const mesh = field.getMesh()
  const pls = field.getPlacements()
  const m = new THREE.Matrix4()
  const c = Math.cos(rotRad)
  const s = Math.sin(rotRad)
  for (let i = 0; i < pls.length; i++) {
    mesh.getMatrixAt(i, m)
    const pl = pls[i]
    m.elements[13] += heightAt(hf, offX + (pl.x * c + pl.z * s), offZ + (-pl.x * s + pl.z * c))
    mesh.setMatrixAt(i, m)
  }
  mesh.instanceMatrix.needsUpdate = true
}

// 🪨 Zone LOẠI 'path' (zoneKind='path') = rải đá StoneScatter trong rect zone (Poisson, không chạm) thay lớp
// surface. Khung = chính rect zone (length×width = frameW/D, offsetX/Z = vị trí). Y = baseY (mặt G-level). BÁM GÒ
// khi layer.drape (= ngoài zoneRects → gò giữ nhấp nhô): dời Y mỗi viên theo heightAt. userData.stonePath = ref
// StoneScatter → live-rebuild dispose đúng (né double-dispose geo). Texture đá DÙNG CHUNG cache border hồ.
function addStonePathMesh(
  layer: GroundLayer,
  idx: number,
  baseY: number,
  ctx: SiteRenderCtx,
  opts: SiteRenderOpts,
  drape: DrapeCtx | null
): void {
  const p = layer.path ?? makeStonePathParams()
  const mat = p.material !== 'none' ? opts.borderMatByKey?.[p.material] : undefined
  const field = new StoneScatter({
    frameW: layer.length / 1000,
    frameD: layer.width / 1000,
    rMin: p.rMin / 1000,
    rMax: p.rMax / 1000,
    ellipseMin: p.ellipseMin,
    gap: p.gap / 1000,
    thickness: p.thickness / 1000,
    seed: p.seed,
    shape: layer.shape === 'circle' ? 'circle' : 'rect', // dùng chung GroundLayer.shape (path chỉ rect|circle)
    color: p.color,
    material: mat,
  })
  const mesh = field.getMesh()
  const offX = layer.offsetX / 1000
  const offZ = layer.offsetZ / 1000
  const rotRad = (p.rot * Math.PI) / 180
  mesh.position.set(offX, baseY, offZ)
  mesh.rotation.y = rotRad // 🪨 xoay cả khung quanh Y (exclude giữ bbox axis-aligned — chấp nhận)
  if (layer.drape && drape) drapeStonesToTerrain(field, drape.hf, offX, offZ, rotRad) // 🏔️ bám gò (per-viên)
  mesh.userData.groundLayerIdx = idx // editor pick/Move/live-rebuild (như surface zone)
  mesh.userData.stonePath = field // 🪨 ref StoneScatter → live-rebuild dispose qua field.dispose (né double-dispose)
  ctx.group.add(mesh)
  ctx.shaders.push(field) // dispose tự lo (field.dispose → geometry+material+gỡ parent)
}

// 🧱 Zone LOẠI 'wall' (zoneKind='wall') = TƯỜNG CONG CurvedBrickWall thay lớp surface (op #1+#2+#3+#5).
// TÂM cung = offsetX/Z; length/width zone KHÔNG dùng (R + góc quét thay). Chân tường y = baseY. PHẲNG v1.
// userData.curvedWall = ref → live-rebuild dispose đúng. Texture viên DÙNG CHUNG cache đá border hồ.
function addWallCurveMesh(
  layer: GroundLayer,
  idx: number,
  baseY: number,
  ctx: SiteRenderCtx,
  opts: SiteRenderOpts
): void {
  const p = layer.wall ?? makeWallCurveParams()
  const mat = p.material !== 'none' ? opts.borderMatByKey?.[p.material] : undefined
  const field = new CurvedBrickWall({
    radius: p.radius / 1000,
    sweepDeg: p.sweep,
    height: p.height / 1000,
    thickness: p.thickness / 1000,
    brickL: p.brickL / 1000,
    brickH: p.brickH / 1000,
    joint: p.joint / 1000,
    seed: p.seed,
    decay: p.decay,
    brickColor: p.color,
    material: mat,
  })
  const mesh = field.getMesh()
  mesh.position.set(layer.offsetX / 1000, baseY, layer.offsetZ / 1000)
  mesh.rotation.y = (p.rot * Math.PI) / 180 // xoay cung quanh tâm (như path/paving)
  mesh.userData.groundLayerIdx = idx // editor pick/Move/live-rebuild (như surface zone)
  mesh.userData.curvedWall = field // ref → live-rebuild dispose qua field.dispose (né double-dispose)
  ctx.group.add(mesh)
  ctx.shaders.push(field) // dispose tự lo (geo + material nội bộ + gỡ parent)
}

// 🧱 Zone LOẠI 'paving' (zoneKind='paving') = sân gạch bond đều BrickPaving thay lớp surface (consumer op #3).
// Khung = chính rect zone. Y = baseY (mặt G-level). PHẲNG v1 (sân gạch không bám gò — khác path).
// userData.brickPaving = ref → live-rebuild dispose đúng. Texture viên DÙNG CHUNG cache đá border hồ.
function addPavingMesh(
  layer: GroundLayer,
  idx: number,
  baseY: number,
  ctx: SiteRenderCtx,
  opts: SiteRenderOpts
): void {
  const p = layer.paving ?? makePavingParams()
  const mat = p.material !== 'none' ? opts.borderMatByKey?.[p.material] : undefined
  const field = new BrickPaving({
    frameW: layer.length / 1000,
    frameD: layer.width / 1000,
    brickL: p.brickL / 1000,
    brickW: p.brickW / 1000,
    brickH: p.brickH / 1000,
    joint: p.joint / 1000,
    bond: p.bond,
    seed: p.seed,
    decay: p.decay,
    brickColor: p.color,
    material: mat,
  })
  const mesh = field.getMesh()
  mesh.position.set(layer.offsetX / 1000, baseY, layer.offsetZ / 1000)
  mesh.rotation.y = (p.rot * Math.PI) / 180 // xoay cả khung quanh Y (như path)
  mesh.userData.groundLayerIdx = idx // editor pick/Move/live-rebuild (như surface zone)
  mesh.userData.brickPaving = field // ref → live-rebuild dispose qua field.dispose (né double-dispose)
  ctx.group.add(mesh)
  ctx.shaders.push(field) // dispose tự lo (geometry + material nội bộ + gỡ parent)
}

// 🪨🧱 Zone LOẠI viên rải/dựng (path/paving/wall) → builder riêng thay surface; true = đã xử lý.
// Tách khỏi addZoneMesh (chạm trần complexity 10).
function addKindZone(
  layer: GroundLayer,
  idx: number,
  baseY: number,
  ctx: SiteRenderCtx,
  opts: SiteRenderOpts,
  drape: DrapeCtx | null
): boolean {
  if (layer.zoneKind === 'path') addStonePathMesh(layer, idx, baseY, ctx, opts, drape)
  else if (layer.zoneKind === 'paving') addPavingMesh(layer, idx, baseY, ctx, opts)
  else if (layer.zoneKind === 'wall') addWallCurveMesh(layer, idx, baseY, ctx, opts)
  else return false
  return true
}

function addZoneMesh(
  layer: GroundLayer,
  idx: number,
  baseY: number,
  holes: { x: number; z: number }[][],
  ctx: SiteRenderCtx,
  opts: SiteRenderOpts,
  drape: DrapeCtx | null,
  clean: boolean
): void {
  if (addKindZone(layer, idx, baseY, ctx, opts, drape)) return // 🪨🧱 path/paving/wall = builder viên riêng
  const surf = zoneSurfaces(layer, baseY, drape)
  let geo: THREE.BufferGeometry | null
  if (surf) {
    geo = drapedLayerGeometry(layer, surf, holes, zoneCell(layer, drape), clean) // lưới displaced (drape G0 + gò zone)
    if (!geo) return
  } else {
    geo = layerGeometry(layer, layer.thickness / 1000, holes) // slab phẳng
    if (!geo) return // zone bị cut khoét sạch (difference rỗng) → không dựng mesh
    geo.translate(0, baseY, 0)
  }
  // 🎨 zone bật MIX → material PhotoGroundMix từ editor (cache per-zone); chưa sẵn/tắt → texture đơn như cũ
  const mixMat = layer.mix ? (opts.groundMixMat?.(layer) ?? null) : null
  const mesh = new THREE.Mesh(geo, mixMat ?? resolveGroundMat(layer.material, ctx, opts))
  mesh.userData.groundLayerIdx = idx
  mesh.receiveShadow = true
  mesh.castShadow = true
  ctx.geos.push(geo)
  ctx.group.add(mesh)
}

// Dựng MỌI zone của 1 level tại CÙNG baseY (đồng phẳng). Trả baseY kế = baseY + dày-zone-LỚN-NHẤT.
function buildLevelZones(
  layers: GroundLayer[],
  lv: number,
  baseY: number,
  water: { x: number; z: number }[][],
  ctx: SiteRenderCtx,
  opts: SiteRenderOpts,
  drape: DrapeCtx | null,
  clean: boolean
): number {
  // Vùng CUT cùng level → ĐỤC LỖ zones level này (difference). Phủ trọn → zone rỗng → addZoneMesh tự bỏ mesh.
  const cuts = layers
    .filter((l) => l.op === 'cut' && (l.level ?? 1) === lv)
    .map((l) => layerWorldPolygon(l))
  let maxTh = 0
  layers.forEach((layer, idx) => {
    if (layer.op === 'cut' || (layer.level ?? 1) !== lv) return
    addZoneMesh(layer, idx, baseY, [...water, ...cuts], ctx, opts, drape, clean)
    if (layer.zoneKind === 'surface' || layer.zoneKind === undefined)
      maxTh = Math.max(maxTh, layer.thickness / 1000) // path/paving/wall = viên rải/dựng, không tính dày stacking
  })
  return baseY + maxTh
}

// CUT đã ĐỤC LỖ THẬT vào zones (buildLevelZones → holes) → lộ lớp dưới. Mảng XÁM này CHỈ là HIGHLIGHT-khi-chọn
// (KHÔNG phải cơ chế khoét). ShapeGeometry footprint @y (trên đỉnh zones level đó). MẶC ĐỊNH ẩN (visible=false) —
// KHÔNG xám lúc bình thường (thấy lỗ khoét lộ dưới); ArchPlanLab bật visible (hiện xám) CHỈ khi layer active
// (chọn tab GUI / click-focus / Move-drag). Raycaster vẫn pick dù ẩn (THREE bỏ .visible) → click/kéo trúng được.
function buildLevelCutPatches(
  layers: GroundLayer[],
  lv: number,
  y: number,
  ctx: SiteRenderCtx
): void {
  layers.forEach((layer, idx) => {
    if (layer.op !== 'cut' || (layer.level ?? 1) !== lv) return
    const poly = layerWorldPolygon(layer)
    if (poly.length < 3) return
    const shape = new THREE.Shape()
    poly.forEach((q, i) => (i === 0 ? shape.moveTo(q.x, -q.z) : shape.lineTo(q.x, -q.z)))
    shape.closePath()
    const geo = new THREE.ShapeGeometry(shape)
    geo.rotateX(-Math.PI / 2)
    geo.translate(0, y, 0)
    const mat = new THREE.MeshStandardMaterial({
      color: 0x8a8a8a, // xám
      transparent: true,
      opacity: 0.72, // mờ (thấy mờ zone dưới)
      roughness: 0.95,
      side: THREE.DoubleSide,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.userData.groundLayerIdx = idx // ArchPlanLab Move-drag/click-focus pick
    mesh.userData.isCutPatch = true // ArchPlanLab toggle .visible: chỉ hiện XÁM khi active (click/move)
    mesh.visible = false // mặc định ẩn (không xám); raycaster vẫn pick (THREE bỏ qua .visible)
    mesh.receiveShadow = true
    ctx.geos.push(geo)
    ctx.mats.push(mat)
    ctx.group.add(mesh)
  })
}

// TẦNG surface đa G-level: zones CÙNG level = ĐỒNG PHẲNG (cùng baseY); level sau chồng lên (baseY += dày lớn
// nhất). CUT cùng level = ĐỤC LỖ THẬT zones (lộ lớp dưới) + thêm mảng XÁM highlight-khi-chọn (ẩn mặc định).
// clean=true (commit): zone displaced clip ô-biên sạch. clean=false (live drag zone slider): bỏ-ô nhanh (răng cưa
// tạm) → né clip Martinez mỗi frame. EXPORT để Lab `_applyTerrainLive` rebuild zone-only LIVE (né water-RTT = tụt fps).
export function buildGroundLayers(
  site: SiteState,
  ctx: SiteRenderCtx,
  opts: SiteRenderOpts,
  clean = true
): void {
  const layers = site.groundLayers
  if (!layers?.length) return
  const water = allWaterCarvePolygons(site) // nước (pool/pond+edge, puddle)
  const terr = site.terrain
  // 🏔️ terrain bật → drape ctx (hf + cỡ ô) cho zone drape=true uốn theo gò; tắt → null (mọi zone slab phẳng).
  const drape: DrapeCtx | null = terr?.enabled
    ? {
        hf: buildHeightField(site, opts, terr),
        cell: gridCell(site, terr),
        hw: site.lotWidth / 2000,
        hd: site.lotDepth / 2000,
        res: terr.resolution,
      }
    : null
  let baseY = site.groundThick / 1000 // mặt base ground = đáy add-layer đầu
  for (const lv of groundRenderLevels(layers)) {
    const top = buildLevelZones(layers, lv, baseY, water, ctx, opts, drape, clean)
    buildLevelCutPatches(layers, lv, top + 0.005, ctx) // mảng xám highlight (ẩn) trên zones đã khoét
    baseY = top
  }
}

// Material base ground: ưu tiên byKey; backward-compat consumer cũ chỉ bơm single groundTextures cho site.ground.
function groundMaterial(site: SiteState, ctx: SiteRenderCtx, opts: SiteRenderOpts): THREE.Material {
  if (
    site.ground !== 'grass' &&
    isGroundTexKey(site.ground) &&
    !opts.groundMatByKey?.[site.ground] &&
    opts.groundTextures
  ) {
    const photo = new PhotoGround({
      maps: opts.groundTextures,
      tileSizeMeters: opts.groundTileMeters ?? 2,
      detail: site.terrain?.detail ?? 0, // 🏔️ Phase 4 micro-relief (bật khả năng; live qua setDetail)
    })
    ctx.shaders.push(photo)
    return photo.getMaterial()
  }
  return resolveGroundMat(site.ground, ctx, opts)
}

// Resolve material 1 ground key (base hoặc layer): grass = GrassGround (shader, ctx.shaders); tex-key + có
// material cache (groundMatByKey) = DÙNG CHUNG material caller-owned (KHÔNG push/dispose — sống lab-lifetime,
// hết recompile mỗi rebuild); còn lại = màu phẳng preset (ctx.mats). Caller dispose material cache ở teardown.
function resolveGroundMat(
  key: GroundMaterialKey,
  ctx: SiteRenderCtx,
  opts: SiteRenderOpts
): THREE.Material {
  if (key === 'grass') {
    const grass = new GrassGround({ scale: 1.0 })
    ctx.shaders.push(grass)
    return grass.getMaterial()
  }
  const cached = opts.groundMatByKey?.[key]
  if (isGroundTexKey(key) && cached) return cached // Lab-owned cache — KHÔNG push ctx (caller dispose)
  const preset = GROUND_PRESETS[key] // gồm fallback 'grass-tex' (olive) khi thiếu texture
  const mat = new THREE.MeshStandardMaterial({ color: preset.color, roughness: preset.roughness })
  ctx.mats.push(mat)
  return mat
}

// ── Barrel re-export — sub-domain tách file 2026-06-11, consumer giữ NGUYÊN import từ fromState ──
export { buildSiteFence, type GateWorldSpec, gateWorldSpec } from './fence'
export { buildSiteGrass, grassBuildSig } from './grass'
export { buildBasinFloorGeometry, pondWorldXZ, waterPolygons } from './water'
