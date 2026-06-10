/**
 * VỊ TRÍ   — threejs-modules/site/render/fromState.ts  (site-kit)
 * VAI TRÒ  — RENDERER lô: SiteState (mm) → nền slab (dày) + hàng rào (gỗ/tường, merged) vào ctx
 *            (group + arrays caller SỞ HỮU). Headless, KHÔNG DOM, KHÔNG dispose ctx (giống building).
 * LIÊN HỆ  — Mirror pattern building-kit/render/fromState. ĐỘC LẬP building/ (không import).
 *            Nền: slab BoxGeometry đáy y=0, top y=groundThick → cao hơn grid editor (hết z-fight).
 *
 * CÁCH DÙNG:
 *   renderSiteState(site, { group: siteGroup, geos, mats })   // caller tự dispose geos/mats
 * DISPOSE: ctx.geos/mats do caller dispose. Renderer không giữ gì.
 */

// boolean zone−cut (Martinez) — khoét chính xác mọi shape. Lib export RUNTIME chỉ qua DEFAULT (named .d.ts lệch
// bản esm → `{difference}` = undefined lúc chạy); type-only named OK (erased). Gọi polygonClipping.difference.
import polygonClipping, { type MultiPolygon, type Ring } from 'polygon-clipping'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type Node from 'three/src/nodes/core/Node.js'
import type { ShaderNodeObject } from 'three/tsl'
import { float, floor, fract, min, mix, smoothstep, uv, vec3 } from 'three/tsl'
import { MeshStandardNodeMaterial } from 'three/webgpu'

import { GrassBlades, type GrassExcludeRect } from '../../components/GrassBlades'
import { StoneScatter } from '../../components/StoneScatter'
import { WaterSurface } from '../../components/WaterSurface'
import { arcLength } from '../../ops/resample' // op #1 — viền đá hồ đặt theo chiều-dài-thật, khép kín
import { GrassGround } from '../../shaders/ground/GrassGround'
import { PhotoGround, type PhotoGroundMaps } from '../../shaders/ground/PhotoGround'
import { TexturedSurface, type TexturedSurfaceMaps } from '../../shaders/surface/TexturedSurface'
import { offsetPolygon, shapeToLocalPolygon } from '../shapes' // tessellate shape→polygon + vành coping bo-cong
import {
  type FenceConfig,
  GROUND_PRESETS,
  type GroundLayer,
  type GroundMaterialKey,
  isGroundTexKey,
  makeStonePathParams,
  renderPuddles,
  renderWaters,
  type SiteState,
  type TerrainConfig,
  type WaterConfig,
  type WaterMaterialKey,
} from '../state'
import { heightAt, type HeightField, makeHeightField, type MaskRect } from '../terrain' // 🏔️ height-field gò

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
  if (!site.show) return { grass: null, waters: [], ground: null }
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
  // Rào ĐA-LỚP: dựng mỗi lớp enabled (vòng đồng tâm ở inset riêng). skipFence → editor tự dựng (_syncFence)
  // để per-fence material cache + dirty-check riêng. Headless (lib) path: mọi lớp dùng chung opts (fenceWallTextures).
  if (!opts.skipFence)
    for (const f of site.fences) if (f.enabled) buildSiteFence(f, site, ctx, opts)
  return { grass, waters, ground }
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
    if (l.op !== 'cut' && l.zoneKind === 'path') exclude.push(layerRect(l))
  return exclude
}

// Rect 1 hồ (m, world XZ) cho cỏ né — cỏ KHÔNG mọc xuyên mặt nước LẪN dải coping. Mở rộng halfW/D theo
// edgeWidth. Free → bbox polygon (axis-aligned).
function waterRect(w: WaterConfig): GrassExcludeRect {
  const ew = w.edgeWidth / 1000 // coping cũng né cỏ
  if (w.shape === 'free' && w.points.length >= 3) {
    let minX = Infinity
    let maxX = -Infinity
    let minZ = Infinity
    let maxZ = -Infinity
    for (const p of w.points) {
      minX = Math.min(minX, p.x)
      maxX = Math.max(maxX, p.x)
      minZ = Math.min(minZ, p.z)
      maxZ = Math.max(maxZ, p.z)
    }
    return {
      cx: (w.offsetX + (minX + maxX) / 2) / 1000,
      cz: (w.offsetZ + (minZ + maxZ) / 2) / 1000,
      halfW: (maxX - minX) / 2000 + ew,
      halfD: (maxZ - minZ) / 2000 + ew,
      rot: 0,
    }
  }
  return {
    cx: w.offsetX / 1000,
    cz: w.offsetZ / 1000,
    halfW: w.width / 2000 + ew,
    halfD: w.depth / 2000 + ew,
    rot: 0,
  }
}

// 1 hồ phản chiếu (tier C — WaterSurface). Đặt tại offset trong lô, mặt nước trên slab nền (+5mm né
// z-fight). push ctx.shaders → setTime mỗi frame (sóng) + dispose tự lo. Trả ref cho caller setSun + tune.
function buildWater(
  w: WaterConfig,
  site: SiteState,
  ctx: SiteRenderCtx,
  opts: SiteRenderOpts
): WaterSurface {
  buildBasin(w, site, ctx, opts) // đáy hồ vẽ TRƯỚC (opaque) → nước (transparent) khúc xạ thấy đáy
  buildPoolEdge(w, site, ctx) // dải coping/mép viền quanh hồ (rect-frame ở mặt nền)
  buildPondBorder(w, site, ctx, opts) // 🪨 rào gỗ (rect) / đá cuội (cong) chạy dọc vành ngoài coping
  // points local (mét) cho MỌI shape ≠ rect (circle/ellipse/free → ShapeGeometry); rect → undefined (PlaneGeometry).
  const points = w.shape === 'rect' ? undefined : shapeToLocalPolygon(w)
  // Mặt nước chìm ~3cm dưới vành nền (rim = groundThick) → đọc ra "lỗ" — nhưng LUÔN cao hơn đáy basin
  // ≥3cm. Slab nền mỏng (~1cm) nên KHÔNG kẹp lip theo slab mà kẹp theo đáy (yBot). Nền editor được khoét
  // CÙNG lỗ ở vỏ (_rebuildEditorGround) → nhìn từ trên xuyên xuống thấy đáy, không bị tấm backdrop che.
  const rimY = site.groundThick / 1000
  const yBot = rimY - w.depthY / 1000 // cao độ đáy basin
  const baseY = Math.max(yBot + 0.03, rimY - 0.03)
  const water = new WaterSurface({
    width: w.width / 1000,
    depth: w.depth / 1000,
    baseY,
    waterColor: w.color,
    reflectivity: w.reflectivity,
    flow: w.flow,
    distortion: w.distortion,
    detail: w.detail,
    refract: w.refract,
    rippleScale: w.rippleScale,
    tint: w.tint,
    points,
  })
  const mesh = water.getMesh()
  mesh.position.x = w.offsetX / 1000
  mesh.position.z = w.offsetZ / 1000
  ctx.group.add(mesh)
  ctx.shaders.push(water)
  return water
}

// Vũng nước (puddle) = mặt nước PHẲNG đặt TRÊN nền — KHÔNG basin (đáy/vách), KHÔNG coping, KHÔNG khoét lỗ
// nền. baseY = mặt nền + 5mm (đậu trên, né z-fight). Khúc xạ (viewportSharedTexture) xuyên thấy NỀN/cỏ phía
// sau → đúng cảm giác vũng nông; vẫn phản chiếu trời/nhà (+1 RTT như hồ). depthY/edgeWidth/bottomColor KHÔNG dùng.
function buildPuddle(w: WaterConfig, site: SiteState, ctx: SiteRenderCtx): WaterSurface {
  const points = w.shape === 'rect' ? undefined : shapeToLocalPolygon(w) // tessellate shape (puddle phẳng)
  const water = new WaterSurface({
    width: w.width / 1000,
    depth: w.depth / 1000,
    baseY: site.groundThick / 1000 + 0.005, // 5mm trên mặt nền (đậu trên, không lõm)
    waterColor: w.color,
    reflectivity: w.reflectivity,
    flow: w.flow,
    distortion: w.distortion,
    detail: w.detail,
    refract: w.refract,
    rippleScale: w.rippleScale,
    tint: w.tint,
    points,
  })
  const mesh = water.getMesh()
  mesh.position.x = w.offsetX / 1000
  mesh.position.z = w.offsetZ / 1000
  ctx.group.add(mesh)
  ctx.shaders.push(water)
  return water
}

// Đỉnh 1 hồ trong world XZ (mét): rect → 4 góc quanh offset; free → offset + points.
// EXPORT: vỏ (editor) cần khoét CÙNG lỗ này vào nền backdrop của nó (nếu không sẽ che đáy hồ).
// Polygon mặt nước (world XZ, mét) cho MỌI shape (rect/circle/ellipse/free-bezier) — tessellate ở shapes.ts rồi
// cộng offset hồ. SINGLE SOURCE: basin/lỗ-nền/carve-layer/foundation-drop/cỏ-né/coping đều phái sinh từ đây.
export function pondWorldXZ(w: WaterConfig): { x: number; z: number }[] {
  const ox = w.offsetX / 1000
  const oz = w.offsetZ / 1000
  return shapeToLocalPolygon(w).map((p) => ({ x: ox + p.x, z: oz + p.z }))
}

// Polygon (world XZ) của MỌI hồ đang bật — vỏ (editor) khoét lỗ nền/lưới CÙNG các lỗ này (nhiều hồ).
export function waterPolygons(site: SiteState): { x: number; z: number }[][] {
  return renderWaters(site).map((w) => pondWorldXZ(w))
}

// Dải coping/mép viền quanh 1 hồ = VÀNH BO-CONG ôm hình hồ (outer = offsetPolygon(poly, edgeWidth), hole = poly)
// ở mặt nền (+3mm né z-fight). Bám MỌI shape (tròn/ellipse/bezier) thay vì khung bbox cũ. Material đá xám mặc định.
function buildPoolEdge(w: WaterConfig, site: SiteState, ctx: SiteRenderCtx): void {
  if (w.edgeWidth <= 0) return
  const ew = w.edgeWidth / 1000
  const poly = pondWorldXZ(w)
  const outer = offsetPolygon(poly, ew) // nở ra ngoài theo pháp-tuyến đỉnh → vành cong đều
  // Shape XY (x=worldX, y=−worldZ) → rotateX(−90) nằm ngang. Outer = vành offset, hole = polygon hồ.
  const s = new THREE.Shape()
  outer.forEach((q, i) => (i === 0 ? s.moveTo(q.x, -q.z) : s.lineTo(q.x, -q.z)))
  s.closePath()
  const hole = new THREE.Path()
  poly.forEach((q, i) => (i === 0 ? hole.moveTo(q.x, -q.z) : hole.lineTo(q.x, -q.z)))
  hole.closePath()
  s.holes.push(hole)
  const geo = new THREE.ShapeGeometry(s)
  geo.rotateX(-Math.PI / 2)
  geo.translate(0, site.groundThick / 1000 + 0.003, 0) // 3mm trên mặt nền né z-fight
  const mat = new THREE.MeshStandardMaterial({ color: 0xb0aaa0, roughness: 0.9 }) // đá xám mặc định
  const mesh = new THREE.Mesh(geo, mat)
  mesh.receiveShadow = true
  ctx.geos.push(geo)
  ctx.mats.push(mat)
  ctx.group.add(mesh)
}

// 🪨 RÀO/VIỀN quanh hồ chạy dọc VÀNH NGOÀI coping (offsetPolygon edgeWidth; bờ nước nếu edgeWidth=0). Auto theo
// shape: rect → hàng rào gỗ (cọc + 2 thanh ngang); tròn/ellipse/free → đá cuội tròn xếp liền uốn theo bờ. Merge
// 1 mesh (rào=box indexed / đá=icosa non-indexed — KHÔNG trộn 2 loại trong 1 merge, né KI-004). Material phẳng.
function buildPondBorder(
  w: WaterConfig,
  site: SiteState,
  ctx: SiteRenderCtx,
  opts: SiteRenderOpts
): void {
  if (!w.borderEnabled) return
  const ring = w.edgeWidth > 0 ? offsetPolygon(pondWorldXZ(w), w.edgeWidth / 1000) : pondWorldXZ(w)
  if (ring.length < 3) return
  const topY = site.groundThick / 1000 // mặt nền (coping ở +3mm)
  const size = w.borderHeight / 1000
  const isRect = w.shape === 'rect'
  const geos = isRect
    ? pondFenceGeos(ring, topY, size)
    : pondStoneGeos(ring, topY, size, w.borderStoneVar / 100, w.borderStoneJag / 100)
  if (geos.length === 0) return
  const merged = mergeGeometries(geos, false)
  for (const g of geos) g.dispose()
  if (!merged) return
  const mesh = new THREE.Mesh(merged, borderMaterialFor(w, isRect, opts, ctx))
  mesh.castShadow = true
  mesh.receiveShadow = true
  ctx.geos.push(merged)
  ctx.group.add(mesh)
}

// Material rào/viền: texture đá injected (TexturedSurface triplanar, caller-owned) → KHÔNG push; else màu phẳng
// borderColor (push ctx.mats). isRect → rào gỗ mượt; cong → đá faceted (flatShading). Tách giữ complexity ≤10.
function borderMaterialFor(
  w: WaterConfig,
  isRect: boolean,
  opts: SiteRenderOpts,
  ctx: SiteRenderCtx
): THREE.Material {
  const injected = w.borderMaterial !== 'none' ? opts.borderMatByKey?.[w.borderMaterial] : undefined
  if (injected) return injected
  const mat = new THREE.MeshStandardMaterial({
    color: w.borderColor,
    roughness: 0.92,
    flatShading: !isRect,
  })
  ctx.mats.push(mat)
  return mat
}

// Pseudo-random [0,1) DETERMINISTIC theo (i, salt) — né đá nhảy vị trí/scale mỗi rebuild (sin-hash kinh điển).
function hash01(i: number, salt: number): number {
  const v = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453
  return v - Math.floor(v)
}

// 1 viên đá cuội tại (px,pz): IcosahedronGeometry(r, detail=1) faceted (~80 tri), jitter scale ngang 0.78..1.18 +
// hơi dẹt Y + xoay Y random (deterministic theo idx). jag>0 → GÓC CẠNH (jagVertices). Tâm ở topY + r×0.4
// (chìm nhẹ xuống coping → tự nhiên).
function stoneAt(
  px: number,
  pz: number,
  topY: number,
  r: number,
  idx: number,
  jag = 0
): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(r, 1)
  if (jag > 0) jagVertices(g, jag, idx)
  // Dáng BÈ BÈ (NgQuan 2026-06-10): ngang nở 0.95..1.35, cao DẸT 0.42..0.56 (range hẹp = ít random
  // chiều cao — đá nào cũng lùn đều, "bớt nguy hiểm"); scale Y áp SAU jag → góc cạnh cũng bẹp theo.
  const s = 0.95 + hash01(idx, 1.7) * 0.4 // scale ngang 0.95..1.35 — bè ra
  const sy = 0.42 + hash01(idx, 5.3) * 0.14 // dẹt 0.42..0.56
  const rot = new THREE.Matrix4().makeRotationY(hash01(idx, 9.1) * Math.PI * 2)
  g.applyMatrix4(rot.multiply(new THREE.Matrix4().makeScale(s, s * sy, s))) // scale rồi xoay
  g.translate(px, topY + r * 0.3, pz) // tâm hạ nhẹ (0.4→0.3) — đá dẹt ngồi sát coping hơn
  return g
}

// GÓC CẠNH (NgQuan 2026-06-10 "min max random từ tâm ra các cạnh, đừng tròn quá"): mỗi đỉnh icosa lệch bán
// kính [1 − 0.45j .. 1 + 0.45j] từ tâm — sin-hash theo (VỊ TRÍ đỉnh, idx viên): vertex trùng vị-trí lệch
// GIỐNG nhau → icosa non-indexed KHÔNG nứt mặt (cùng bài displacement-theo-vị-trí của KI-003); idx vào salt
// → viên nào dáng nấy. computeVertexNormals sau displace — non-indexed → normal per-face, giữ faceted.
function jagVertices(g: THREE.BufferGeometry, jag: number, idx: number): void {
  const pos = g.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + idx * 17.13) * 43758.5453
    const k = 1 + (h - Math.floor(h) - 0.5) * jag * 0.9
    pos.setXYZ(i, x * k, y * k, z * k)
  }
  g.computeVertexNormals()
}

// Đá cuội xếp liền dọc polygon `ring` (world XZ, mét) — đặt theo CHIỀU DÀI THẬT qua op #1 `arcLength`
// (ops/resample, thay walk tay 2026-06-10): sinh hết bước adaptive trước rồi CHIA LẠI khít chu vi
// (k = L/Σstep) → vòng KHÉP KÍN không mối nối (walk cũ dừng đâu hở đó — seam last→first tùy chu vi).
// varK>0 → TO-NHỎ XEN KẼ: bán kính ×[1±0.45v] (hash idx), bước (r_i + r_{i+1})×0.82 — viên to chiếm
// chỗ rộng, vẫn liền (varK=0 → bước đều 2r×0.82). jag → góc cạnh. Deterministic theo idx.
function pondStoneGeos(
  ring: { x: number; z: number }[],
  topY: number,
  diam: number,
  varK = 0,
  jag = 0
): THREE.BufferGeometry[] {
  const n = ring.length
  // Polyline khép kín → curve fn (t 0..1 theo index); arcLength lo phần đều-theo-chiều-dài + nghịch đảo.
  const closed = (t: number): THREE.Vector3 => {
    const s = Math.min(0.999999, Math.max(0, t)) * n
    const i = Math.floor(s)
    const f = s - i
    const a = ring[i]
    const b = ring[(i + 1) % n]
    return new THREE.Vector3(a.x + (b.x - a.x) * f, 0, a.z + (b.z - a.z) * f)
  }
  const al = arcLength(closed, Math.max(128, n * 2))
  if (al.length < 1e-3) return []
  const r = diam / 2
  const fAt = (i: number): number => 1 + (hash01(i, 3.7) - 0.5) * varK * 0.9
  const m = Math.max(3, Math.round(al.length / Math.max(0.05, diam * 0.82))) // số viên vừa chu vi
  const steps: number[] = []
  let sum = 0
  for (let i = 0; i < m; i++) {
    const s = Math.max(0.05, (r * fAt(i) + r * fAt((i + 1) % m)) * 0.82) // neighbor wrap → bước cuối khớp viên 0
    steps.push(s)
    sum += s
  }
  const k = al.length / sum // chia lại khít chu vi → khép kín
  const out: THREE.BufferGeometry[] = []
  let dist = 0
  for (let i = 0; i < m; i++) {
    const p = al.pointAt(dist / al.length)
    out.push(stoneAt(p.x, p.z, topY, r * fAt(i), i, jag))
    dist += steps[i] * k
  }
  return out
}

// Hàng rào gỗ dọc polygon `ring` (rect = 4 cạnh): mỗi cạnh → cọc đứng cách ~1.5m (cọc t=0 = góc, không lặp) +
// 2 THANH NGANG (trên h×0.85, giữa h×0.45) chạy hết cạnh (box dài=len, xoay theo hướng cạnh). Box → merge.
function pondFenceGeos(
  ring: { x: number; z: number }[],
  topY: number,
  h: number
): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = []
  const n = ring.length
  for (let i = 0; i < n; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % n]
    const dx = b.x - a.x
    const dz = b.z - a.z
    const len = Math.hypot(dx, dz)
    if (len < 1e-4) continue
    const nPost = Math.max(1, Math.round(len / 1.5))
    for (let k = 0; k < nPost; k++) {
      const t = k / nPost // 0..(<1): t=0 = góc, cạnh sau lo góc kế → không lặp
      const p = new THREE.BoxGeometry(0.08, h, 0.08) // cọc 8cm
      p.translate(a.x + dx * t, topY + h / 2, a.z + dz * t)
      out.push(p)
    }
    const ang = Math.atan2(dz, dx) // hướng cạnh → xoay box-X (rotateY(−ang))
    for (const ry of [h * 0.85, h * 0.45]) {
      const rail = new THREE.BoxGeometry(len, 0.05, 0.05) // thanh 5cm dài hết cạnh
      rail.rotateY(-ang)
      rail.translate((a.x + b.x) / 2, topY + ry, (a.z + b.z) / 2)
      out.push(rail)
    }
  }
  return out
}

// Đáy 1 hồ = SÀN (ShapeGeometry @yBot) + VÁCH (quad mỗi cạnh RIM→floor) — 2 MESH RIÊNG để floor/wall mang
// material ĐỘC LẬP (floorMaterial/wallMaterial). 'none' = màu phẳng bottomColor; 'tile' = caro hồ bơi.
// Vách chạy từ MẶT NỀN (rim) xuống đáy → liền "thành hồ", KHÔNG lộ mặt-cắt slab (nền dựng PHẲNG khi có hồ).
// KHÔNG merge (trước gộp 1 mesh để tiết draw call; nay tách → thoát luôn rủi ro mergeGeometries mixed-index, KI-004).
function buildBasin(
  w: WaterConfig,
  site: SiteState,
  ctx: SiteRenderCtx,
  opts: SiteRenderOpts
): void {
  const rimY = site.groundThick / 1000 // mặt nền = đỉnh vách
  const yBot = rimY - w.depthY / 1000 // floor dưới rim depthY
  const pts = pondWorldXZ(w)
  // basinMaterial tự push ctx.mats nếu OWNED ('none'/'tile'); texture injected (groundMatByKey) = caller-owned,
  // KHÔNG push. Share 1 instance khi wall≡floor (né compile tile 2 lần / né push trùng).
  const floorMat = basinMaterial(w.floorMaterial, w, ctx, opts)
  const wallMat =
    w.wallMaterial === w.floorMaterial ? floorMat : basinMaterial(w.wallMaterial, w, ctx, opts)
  addBasinMesh(basinFloorGeometry(pts, yBot), floorMat, ctx)
  addBasinMesh(basinWallsGeometry(pts, rimY, yBot), wallMat, ctx)
}

// 1 mesh basin (floor hoặc walls): nhận bóng, track geo (material đã push ở caller — có thể share).
function addBasinMesh(geo: THREE.BufferGeometry, mat: THREE.Material, ctx: SiteRenderCtx): void {
  const mesh = new THREE.Mesh(geo, mat)
  mesh.receiveShadow = true
  ctx.geos.push(geo)
  ctx.group.add(mesh)
}

// Material 1 mặt basin theo key. TEXTURE (GroundMaterialKey) + có material injected (groundMatByKey, PhotoGround
// world-XZ — đáy basin uv=world-XZ → lát khớp) = DÙNG CHUNG caller-owned, KHÔNG push (caller dispose, như
// resolveGroundMat). 'tile' = caro NodeMaterial (PBR + colorNode). 'none'/texture-chưa-load = màu phẳng bottomColor.
// OWNED ('none'/'tile') → push ctx.mats; injected → không.
function basinMaterial(
  key: WaterMaterialKey,
  w: WaterConfig,
  ctx: SiteRenderCtx,
  opts: SiteRenderOpts
): THREE.Material {
  if (key !== 'none' && key !== 'tile') {
    const cached = opts.groundMatByKey?.[key]
    if (cached) return cached // texture đáy hồ injected — KHÔNG push (caller-owned, lab-lifetime)
  }
  if (key === 'tile') {
    const mat = new MeshStandardNodeMaterial()
    mat.colorNode = poolTileColorNode(
      new THREE.Color(w.bottomColor),
      new THREE.Color(w.tileColor2),
      new THREE.Color(w.groutColor)
    )
    mat.roughness = 0.6 // gạch men hơi bóng (thấp hơn nền 0.95) → bắt sáng nhẹ
    mat.metalness = 0
    mat.side = THREE.DoubleSide
    ctx.mats.push(mat)
    return mat
  }
  const mat = new THREE.MeshStandardMaterial({
    color: w.bottomColor, // 'none' hoặc texture chưa load → màu phẳng tạm
    roughness: 0.95,
    side: THREE.DoubleSide,
  })
  ctx.mats.push(mat)
  return mat
}

// colorNode caro hồ bơi: ô vuông 2 màu xen kẽ (checker) + mạch vữa (grout) — đọc uv (mét) baked vào
// geometry (floor: world XZ; wall: chu-vi×cao). Ô 0.2m. 3 màu DO USER CHỌN: a=ô chính (bottomColor),
// b=ô xen kẽ (tileColor2), g=mạch (groutColor). Khúc xạ nước làm caro gợn → thấy rõ "đáy hồ bơi".
function poolTileColorNode(a: THREE.Color, b: THREE.Color, g: THREE.Color): ShaderNodeObject<Node> {
  const cA = vec3(a.r, a.g, a.b)
  const cB = vec3(b.r, b.g, b.b)
  const cG = vec3(g.r, g.g, g.b)
  const p = uv().mul(float(1 / 0.2)) // tile-space (5 ô/m)
  const cell = floor(p)
  const parity = cell.x.add(cell.y).mod(float(2)) // 0/1 xen kẽ
  const tile = mix(cA, cB, parity)
  const f = fract(p)
  const d = min(min(f.x, float(1).sub(f.x)), min(f.y, float(1).sub(f.y))) // khoảng tới mạch gần nhất
  const line = smoothstep(float(0), float(0.04), d) // 0 ở mạch → grout; 1 trong ô → tile
  return mix(cG, tile, line) as ShaderNodeObject<Node>
}

// Geometry SÀN hồ = ShapeGeometry @yBot, GIỮ uv = (worldX, −worldZ) mét (ShapeGeometry sinh uv = toạ độ
// shape) → caro lát theo world XZ. rotateX không đụng uv. Mesh riêng (không merge) nên giữ index thoải mái.
function basinFloorGeometry(pts: { x: number; z: number }[], yBot: number): THREE.BufferGeometry {
  const s = new THREE.Shape()
  pts.forEach((q, i) => (i === 0 ? s.moveTo(q.x, -q.z) : s.lineTo(q.x, -q.z))) // XY: x=worldX, y=−worldZ
  s.closePath()
  const g = new THREE.ShapeGeometry(s)
  g.rotateX(-Math.PI / 2)
  g.translate(0, yBot, 0)
  return g
}

// Geometry VÁCH hồ = quad mỗi cạnh (yTop→yBot). uv = (chu-vi tích luỹ, cao Y) mét → caro lát dọc tường,
// ô cùng cỡ với sàn (cùng đơn vị mét). Non-indexed (raw position) — không merge nên không cần đồng nhất.
function basinWallsGeometry(
  pts: { x: number; z: number }[],
  yTop: number,
  yBot: number
): THREE.BufferGeometry {
  const pos: number[] = []
  const uvs: number[] = []
  let perim = 0
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    const ua = perim
    const ub = perim + Math.hypot(b.x - a.x, b.z - a.z)
    pos.push(a.x, yTop, a.z, b.x, yTop, b.z, b.x, yBot, b.z) // quad cạnh → 2 tris
    uvs.push(ua, yTop, ub, yTop, ub, yBot)
    pos.push(a.x, yTop, a.z, b.x, yBot, b.z, a.x, yBot, a.z)
    uvs.push(ua, yTop, ub, yBot, ua, yBot)
    perim = ub
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  g.computeVertexNormals()
  return g
}

// Cỏ 3D nhú lên (tier B — GrassBlades) = LỚP THỰC VẬT ĐỘC LẬP, KHÔNG dính loại surface: mọc trên nền BẤT KỲ
// (grass/soil/gravel) khi grass3d.enabled. Gốc ở mặt trên nền. dispose qua ctx.shaders. exclude = footprint
// foundation → cỏ né (lá rơi trong rect bị bỏ). Surface material (GrassGround/soil/gravel) là lớp riêng (buildGround).
function buildVegetation(
  site: SiteState,
  ctx: SiteRenderCtx,
  exclude: GrassExcludeRect[]
): GrassBlades | null {
  const blades = buildSiteGrass(site, exclude)
  if (!blades) return null
  ctx.group.add(blades.getMesh())
  ctx.shaders.push(blades) // lõi quản dispose qua ctx.shaders (consumer KHÔNG skipGrass)
  return blades
}

// Dựng RIÊNG bãi cỏ (GrassBlades) cho lô — KHÔNG add vào ctx, KHÔNG track dispose → CALLER sở hữu (add
// mesh + dispose). Dùng khi caller=editor tự quản cỏ trong group bền + dirty-check (skipGrass), để né
// re-scatter 24000 lá mỗi lần sửa thứ KHÔNG liên quan cỏ. Trả null nếu cỏ tắt.
export function buildSiteGrass(site: SiteState, exclude: GrassExcludeRect[]): GrassBlades | null {
  if (!site.grass3d.enabled) return null // độc lập surface — bất kỳ nền nào cũng rải được
  const g = site.grass3d
  // 🏔️ Cỏ bám gò: height-field DÙNG CHUNG maskRects với nền — exclude (foundation+hồ) ≡ buildHeightField
  // (buildingFootprint+hồ, cùng _foundationRects()+waterRect) ⇒ gốc lá khớp ĐÚNG mặt nền displaced. Tắt → null.
  const terr = site.terrain
  const hf =
    terr && terr.enabled
      ? makeHeightField(
          terr,
          [...exclude, ...zoneRects(site)], // 🏔️ cỏ KHỚP nền: chừa phẳng dưới zones (như buildHeightField)
          site.lotWidth / 2000,
          site.lotDepth / 2000
        )
      : null
  const blades = new GrassBlades({
    width: site.lotWidth / 1000,
    depth: site.lotDepth / 1000,
    baseY: site.groundThick / 1000,
    density: g.density,
    bladeHeight: g.height,
    bladeWidth: g.bladeWidth,
    midWidth: g.midWidth,
    segments: g.segments,
    taper: g.taper,
    curveLR: g.curveLR,
    bend: g.bend,
    cup: g.cup,
    cupGeo: g.cupGeo,
    cupNormalGain: g.cupNormalGain,
    bladesPerClump: g.bladesPerClump,
    clumpRadius: g.clumpRadius,
    clumpSplay: g.clumpSplay,
    color: g.color,
    innerColor: g.innerColor,
    shadowDark: g.shadowDark,
    shadowSpan: g.shadowSpan,
    contactDark: g.contactDark, // luôn dựng contact mesh nếu >0 → toggle live cả 2 chiều
    contactRadius: g.contactRadius,
    heightAt: hf ? (x, z) => heightAt(hf, x, z) : undefined, // 🏔️ gốc lá bám gò (null → cỏ phẳng như cũ)
    exclude,
  })
  if (!g.contactOn) blades.setContactDark(0) // tắt vệt = uniform 0 (mesh vẫn có, bật lại live được)
  // Cỏ NHẬN bóng sun (nhà/rào/mái đổ xuống bãi) — xài lại shadow map có sẵn, rẻ. KHÔNG castShadow:
  // lá 6mm < 1 texel @19mm/texel của shadow cam ±20m → rớt/nhấp nháy; self-shadow đã có bóng-gốc-giả lo.
  blades.getMesh().receiveShadow = true
  return blades
}

// Chữ ký STRUCTURAL của bãi cỏ: CHỈ field buộc dựng lại geometry/scatter — KHÔNG gồm field live (màu/bóng/
// vệt = uniform, đổi qua setter KHÔNG rebuild). Caller so sánh sig: giống → giữ nguyên mesh (bỏ re-scatter
// khi sửa thứ KHÔNG liên quan cỏ: di chuyển nhà, đổi màu tường…); khác → dựng lại. Footprint/hồ đổi (exclude)
// → sig đổi → rải lại (cỏ né chỗ mới). contactDark>0 = mesh vệt CÓ/KHÔNG (giá trị + on/off vẫn live).
export function grassBuildSig(site: SiteState, exclude: GrassExcludeRect[]): string {
  const g = site.grass3d
  if (!site.show || !g.enabled) return 'off'
  return JSON.stringify([
    site.lotWidth,
    site.lotDepth,
    site.groundThick,
    g.density,
    g.height,
    g.bladeWidth,
    g.midWidth,
    g.segments,
    g.taper,
    g.curveLR,
    g.bend,
    g.cup,
    g.cupGeo,
    g.cupNormalGain,
    g.bladesPerClump,
    g.clumpRadius,
    g.clumpSplay,
    g.contactDark > 0,
    // 🏔️ terrain đổi → cỏ rải lại bám gò mới; KÈM groundLayers (zone đổi → mask phẳng-dưới-zone đổi → re-scatter)
    site.terrain && site.terrain.enabled ? [site.terrain, site.groundLayers ?? []] : null,
    exclude,
  ])
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

// Ray-cast point-in-polygon (mặt phẳng XZ). poly = {x,z}[] (không lặp đỉnh cuối).
function pointInPolygon(x: number, z: number, poly: { x: number; z: number }[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    const cross = a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x
    if (cross) inside = !inside
  }
  return inside
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
// + cỏ (buildSiteGrass) → gò + cỏ KHỚP nhau dưới zone. Rỗng nếu không có zone.
// CHỈ zone PHẲNG-pad (drape=false): gò làm phẳng dưới nó. Zone DRAPE (drape=true) KHÔNG vào mask → gò giữ nhấp
// nhô để zone uốn theo (drapedLayerGeometry). cut = lỗ → bỏ.
function zoneRects(site: SiteState): MaskRect[] {
  const rects: MaskRect[] = []
  for (const l of site.groundLayers ?? []) if (l.op !== 'cut' && !l.drape) rects.push(layerRect(l))
  return rects
}

// Pool/pond đục lỗ GỒM dải EDGE/coping: polygon hồ NỞ ra edgeWidth (offsetPolygon) — khớp đúng vành coping bo-cong
// của buildPoolEdge → layer né cả viền theo đường cong, không chỉ mặt nước. (edge=0 → trùng polygon hồ.)
function waterCarveWithEdge(w: WaterConfig): { x: number; z: number }[] {
  return offsetPolygon(pondWorldXZ(w), w.edgeWidth / 1000)
}

// Polygon (world XZ) MỌI mặt nước layer phải né: pool/pond (LÕM, GỒM dải edge/coping) + puddle (PHẲNG, đúng
// footprint, không coping). "3 đứa" — ground KHÔNG bao giờ che mặt nước LẪN viền (NgQuan 2026-06-05).
function allWaterCarvePolygons(site: SiteState): { x: number; z: number }[][] {
  const out: { x: number; z: number }[][] = []
  for (const w of renderWaters(site)) out.push(waterCarveWithEdge(w)) // pool/pond: + dải edge
  for (const w of renderPuddles(site)) out.push(pondWorldXZ(w)) // puddle: phẳng, không edge
  return out
}

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
  if (layer.zoneKind === 'path') return addStonePathMesh(layer, idx, baseY, ctx, opts, drape) // 🪨 rải đá thay surface
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
    if (layer.zoneKind !== 'path') maxTh = Math.max(maxTh, layer.thickness / 1000) // path = rải đá, không tính dày stacking
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

// Box dời sẵn về (x,y,z) — bake transform vào geometry để mergeGeometries gộp 1 mesh.
function box(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(w, h, d)
  g.translate(x, y, z)
  return g
}

// CỔNG ra vào: khoét gap 1 cạnh + 2 cột. side 0=+Z 1=−Z 2=+X 3=−X; posAlong (m, dọc cạnh từ tâm); halfGap (m).
interface GateSpec {
  side: number
  posAlong: number
  halfGap: number
  postH: number // m — chiều cao 2 cột cổng (độc lập chiều cao tường)
}

// Khoét [gc−gh, gc+gh] khỏi span [lo,hi] → 1–2 đoạn còn lại. Gap ngoài span → giữ nguyên.
function gapSplit(lo: number, hi: number, gc: number, gh: number): [number, number][] {
  const a = gc - gh
  const b = gc + gh
  if (b <= lo || a >= hi) return [[lo, hi]]
  const segs: [number, number][] = []
  if (a > lo) segs.push([lo, a])
  if (b < hi) segs.push([b, hi])
  return segs
}

// Kẹp tham số cổng → GateSpec hợp lệ (gap luôn trong cạnh, chừa ≥15cm) hoặc null. DÙNG CHUNG buildSiteFence
// (khoét gap) + gateWorldSpec (editor pick-box/drag) → single source, né drift toạ độ. null nếu không cổng.
function gateClamp(fence: FenceConfig, halfW: number, halfD: number): GateSpec | null {
  if (fence.type !== 'wall' || !fence.gate) return null
  const side = fence.gateSide ?? 0
  const spanHalf = side <= 1 ? halfW : halfD
  const halfGap = Math.min((fence.gateWidth ?? 1400) / 2000, spanHalf - 0.15)
  if (halfGap <= 0.1) return null
  const lim = spanHalf - halfGap
  const posAlong = Math.max(-lim, Math.min(lim, (fence.gatePos ?? 0) / 1000))
  return { side, posAlong, halfGap, postH: (fence.gatePostH ?? 1600) / 1000 }
}

// Vị trí cổng trong THẾ GIỚI (m, XZ tâm gap + trục tiếp tuyến để editor kéo dọc cạnh). null nếu không cổng
// hợp lệ. cx/cz = tâm khoảng trống; axis='x'(cạnh trước/sau) | 'z'(trái/phải) = trục trượt → gatePos. Editor
// (ArchPlanLab) dùng để đặt pick-box + chiếu drag → gatePos. Khớp gatePostXZ (cùng gateClamp).
export interface GateWorldSpec {
  cx: number
  cz: number
  axis: 'x' | 'z'
  halfSpan: number // m — nửa bề rộng gap (dọc tiếp tuyến)
  postH: number // m
  top: number // m — mặt nền (đáy box)
  side: number
}
export function gateWorldSpec(fence: FenceConfig, site: SiteState): GateWorldSpec | null {
  const inset = fence.inset / 1000
  const halfW = site.lotWidth / 2000 - inset
  const halfD = site.lotDepth / 2000 - inset
  if (halfW <= 0 || halfD <= 0) return null
  const gc = gateClamp(fence, halfW, halfD)
  if (!gc) return null
  const axis: 'x' | 'z' = gc.side <= 1 ? 'x' : 'z'
  const cx = gc.side <= 1 ? gc.posAlong : gc.side === 2 ? halfW : -halfW
  const cz = gc.side === 0 ? halfD : gc.side === 1 ? -halfD : gc.posAlong
  return {
    cx,
    cz,
    axis,
    halfSpan: gc.halfGap,
    postH: gc.postH,
    top: site.groundThick / 1000,
    side: gc.side,
  }
}

// Toạ độ XZ (m) 2 cột cổng = 2 mép gap trên cạnh `side`.
function gatePostXZ(gate: GateSpec, halfW: number, halfD: number): [number, number][] {
  const a = gate.posAlong - gate.halfGap
  const b = gate.posAlong + gate.halfGap
  if (gate.side === 0)
    return [
      [a, halfD],
      [b, halfD],
    ]
  if (gate.side === 1)
    return [
      [a, -halfD],
      [b, -halfD],
    ]
  if (gate.side === 2)
    return [
      [halfW, a],
      [halfW, b],
    ]
  return [
    [-halfW, a],
    [-halfW, b],
  ]
}

// 4 cạnh tường rào dạng [side, axis, fixedCoord, lo, hi]. N/S full (±(halfW+r)) phủ góc; E/W short (±(halfD−r)).
function wallEdgeSpecs(
  halfW: number,
  halfD: number,
  r: number
): [number, 'x' | 'z', number, number, number][] {
  return [
    [0, 'x', halfD, -(halfW + r), halfW + r],
    [1, 'x', -halfD, -(halfW + r), halfW + r],
    [2, 'z', halfW, -(halfD - r), halfD - r],
    [3, 'z', -halfW, -(halfD - r), halfD - r],
  ]
}

// Tường rào: 4 cạnh low-wall liền. tk = bề dày. Đứng trên mặt nền (y bắt đầu từ top). gate → khoét cạnh + 2 cột box.
function wallFenceGeos(
  halfW: number,
  halfD: number,
  h: number,
  top: number,
  tk: number,
  gate?: GateSpec
): THREE.BufferGeometry[] {
  const cy = top + h / 2
  const r = tk / 2
  const out: THREE.BufferGeometry[] = []
  for (const [side, axis, fixed, lo, hi] of wallEdgeSpecs(halfW, halfD, r)) {
    const spans =
      gate && gate.side === side ? gapSplit(lo, hi, gate.posAlong, gate.halfGap) : [[lo, hi]]
    for (const [s0, s1] of spans) {
      const len = s1 - s0
      if (len <= 0.02) continue
      const mid = (s0 + s1) / 2
      out.push(axis === 'x' ? box(len, h, tk, mid, cy, fixed) : box(tk, h, len, fixed, cy, mid))
    }
  }
  if (gate) {
    const s = tk * 1.18
    for (const [px, pz] of gatePostXZ(gate, halfW, halfD)) {
      out.push(box(s, gate.postH, s, px, top + gate.postH / 2, pz)) // cao riêng theo gatePostH
    }
  }
  return out
}

// Tường rào ĐÁ (chỉ wallTex='stone'): mỗi cạnh = profile "chữ-nhật-đỉnh-tròn" extrude dọc, ĐỈNH gợn cao-thấp
// → cảm giác đá xếp dày + đỉnh bo tròn (đặc tả user). Dày hơn tường thường. Triplanar (TexturedSurface) lo
// texture nên KHÔNG cần uv. + CỘT GÓC ĐÁ (quoin) ở 4 góc: 2 coping tròn tách nhau ở góc → hở apex; cột góc
// chunky (×1.18 tk, cao tới đỉnh coping) LẤP góc đó. Trả 4 cạnh + 4 góc (merge ở buildFence).
function stoneWallFenceGeos(
  halfW: number,
  halfD: number,
  h: number,
  top: number,
  tk: number,
  gate?: GateSpec
): THREE.BufferGeometry[] {
  const r = tk / 2
  const geos: THREE.BufferGeometry[] = []
  const seeds = [11, 23, 37, 53] // seed gợn-đỉnh deterministic mỗi cạnh
  wallEdgeSpecs(halfW, halfD, r).forEach(([side, axis, fixed, lo, hi], ei) => {
    const spans =
      gate && gate.side === side ? gapSplit(lo, hi, gate.posAlong, gate.halfGap) : [[lo, hi]]
    spans.forEach(([s0, s1], si) => {
      const len = s1 - s0
      if (len <= 0.08) return
      const mid = (s0 + s1) / 2
      const seed = seeds[ei] + si * 7
      geos.push(
        axis === 'x'
          ? stoneWallEdge(mid, fixed, 'x', len, tk, top, h, seed)
          : stoneWallEdge(fixed, mid, 'z', len, tk, top, h, seed)
      )
    })
  })
  // 4 cột góc (quoin, cao = tường+5cm) lấp notch góc.
  for (const [px, pz] of [
    [halfW, halfD],
    [-halfW, halfD],
    [halfW, -halfD],
    [-halfW, -halfD],
  ] as const) {
    geos.push(stoneCornerPost(px, pz, top, h + 0.05, tk))
  }
  // 2 cột cổng (cùng dạng quoin nhưng cao RIÊNG = gate.postH — trụ cổng cao hơn).
  if (gate) {
    for (const [px, pz] of gatePostXZ(gate, halfW, halfD)) {
      geos.push(stoneCornerPost(px, pz, top, gate.postH, tk))
    }
  }
  return geos
}

// Cột góc/cổng đá (quoin). Vuông ×1.18 bề dày tường (faces NHÔ ra ngoài mặt tường → trùm mối nối, KHÔNG
// coplanar = né z-fight). ph = TỔNG chiều cao cột (caller truyền: góc = tường+5cm; cổng = gatePostH riêng).
// RoundedBox bo 2.5cm → 4 GÓC TRÊN cột tròn (đừng sắc, khớp đỉnh coping). Có uv → merge khớp cạnh. Triplanar lo texture.
function stoneCornerPost(
  px: number,
  pz: number,
  baseY: number,
  ph: number,
  tk: number
): THREE.BufferGeometry {
  const s = tk * 1.18
  const g = new RoundedBoxGeometry(s, ph, s, 3, 0.025)
  g.translate(px, baseY + ph / 2, pz)
  return g
}

// 1 cạnh tường đá: profile (lat×y) = chữ nhật 2 mặt + cung tròn đỉnh (bán kính r=tk/2), extrude theo trục
// edge với M trạm. ĐỈNH y gợn theo tổng-2-sin (deterministic theo seed → KHÔNG nhấp nháy mỗi rebuild;
// rebuild ra y HỆT). Tách verts/indices (Rule-50 + complexity) — code di nguyên văn, 0 đổi hành vi.
function stoneWallEdge(
  cx: number,
  cz: number,
  axis: 'x' | 'z',
  length: number,
  tk: number,
  baseY: number,
  h: number,
  seed: number
): THREE.BufferGeometry {
  const r = tk / 2
  const A = 4 // số đoạn cung đỉnh tròn (mượt vừa, rẻ)
  const M = Math.max(8, Math.round(length / 0.4)) // trạm dọc cạnh (~1/0.4m)
  const jit = 0.04 // m — biên gợn cao-thấp đỉnh
  const K = A + 3 // profile: outer-bottom + (A+1) cung + inner-bottom
  // ĐỈNH gợn: tổng 2 sin lệch pha theo seed → nhấp nhô mượt, lặp lại y hệt mỗi build.
  const topYAt = (t: number): number =>
    baseY + h + jit * (0.6 * Math.sin(2.3 * t + seed) + 0.4 * Math.sin(5.1 * t + seed * 1.7))
  const { pos, uvs } = stoneWallVerts(cx, cz, axis, length, r, baseY, topYAt, { A, M, K })
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  g.setIndex(stoneWallIndices(M, K, axis === 'z'))
  g.computeVertexNormals() // smooth (đỉnh cung tròn ăn sáng) — TRƯỚC toNonIndexed để giữ normal đã blend
  // NON-INDEXED: cột góc (RoundedBoxGeometry) là non-indexed → trộn indexed/non-indexed = mergeGeometries NULL
  // (mất hình, KI-004). Đồng bộ về non-indexed. computeVertexNormals chạy TRƯỚC nên normal mượt bake sẵn.
  return g.toNonIndexed()
}

// Lưới đỉnh (profile K × trạm M+1) 1 cạnh tường đá. uv = placeholder (triplanar BỎ QUA uv, nhưng pipeline
// WebGPU MeshStandardNodeMaterial CẦN attr này — thiếu là draw fail, KI-010).
function stoneWallVerts(
  cx: number,
  cz: number,
  axis: 'x' | 'z',
  length: number,
  r: number,
  baseY: number,
  topYAt: (t: number) => number,
  d: { A: number; M: number; K: number }
): { pos: number[]; uvs: number[] } {
  const pos: number[] = []
  const uvs: number[] = []
  for (let i = 0; i <= d.M; i++) {
    const f = i / d.M
    const along = -length / 2 + f * length
    const topY = topYAt(f * length)
    for (let k = 0; k < d.K; k++) {
      let lat: number
      let y: number
      if (k === 0) {
        lat = r // outer-bottom
        y = baseY
      } else if (k === d.K - 1) {
        lat = -r // inner-bottom
        y = baseY
      } else {
        const a = (Math.PI * (k - 1)) / d.A // cung 0..π: outer-top → đỉnh → inner-top
        lat = r * Math.cos(a)
        y = topY - r + r * Math.sin(a)
      }
      const x = axis === 'x' ? cx + along : cx + lat
      const z = axis === 'x' ? cz + lat : cz + along
      pos.push(x, y, z)
      uvs.push(f, k / (d.K - 1))
    }
  }
  return { pos, uvs }
}

// Index mặt bên + end-cap fan 2 đầu (ẩn ở góc, tránh thủng nếu lộ). Winding (a,b,d,b,c,d): mặt ngoài +lat,
// mặt trong −lat → pháp tuyến đúng (FrontSide). lat→z (trục X) thuận tay; lat→x (trục Z) ĐẢO handedness →
// phải LẬT winding, nếu không mặt ngoài 2 cạnh vuông góc quay pháp tuyến vào trong → cull "mất 1 mặt" (KI-010).
function stoneWallIndices(M: number, K: number, flip: boolean): number[] {
  const idx: number[] = []
  const vid = (i: number, k: number): number => i * K + k
  for (let i = 0; i < M; i++) {
    for (let k = 0; k < K - 1; k++) {
      const a = vid(i, k)
      const b = vid(i + 1, k)
      const c = vid(i + 1, k + 1)
      const d = vid(i, k + 1)
      if (flip) {
        idx.push(a, d, b, b, d, c)
      } else {
        idx.push(a, b, d, b, c, d)
      }
    }
  }
  for (const i of [0, M]) {
    for (let k = 1; k < K - 1; k++) {
      const a = vid(i, 0)
      const out = i === 0 // 2 đầu pháp tuyến ngược nhau; lật thêm theo `flip` cho khớp mặt bên
      if (out !== flip) idx.push(a, vid(i, k + 1), vid(i, k))
      else idx.push(a, vid(i, k), vid(i, k + 1))
    }
  }
  return idx
}

// 1 cạnh rào gỗ: cọc cách ~1.8m + 2 thanh ngang (box dài xoay theo cạnh). A→B trong XZ.
function woodEdge(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  h: number,
  top: number
): THREE.BufferGeometry[] {
  const geos: THREE.BufferGeometry[] = []
  const dx = bx - ax
  const dz = bz - az
  const len = Math.hypot(dx, dz)
  if (len < 1e-4) return geos
  const ux = dx / len
  const uz = dz / len
  const post = 0.1
  const nPosts = Math.max(2, Math.round(len / 1.8) + 1)
  for (let i = 0; i < nPosts; i++) {
    const t = (i / (nPosts - 1)) * len
    geos.push(box(post, h, post, ax + ux * t, top + h / 2, az + uz * t))
  }
  const ang = Math.atan2(-uz, ux) // Three Ry: +X → (cos, -sin) = (ux, uz)
  for (const ry of [top + h * 0.35, top + h * 0.8]) {
    const g = new THREE.BoxGeometry(len, 0.08, 0.04)
    g.rotateY(ang)
    g.translate((ax + bx) / 2, ry, (az + bz) / 2)
    geos.push(g)
  }
  return geos
}

function woodFenceGeos(
  halfW: number,
  halfD: number,
  h: number,
  top: number
): THREE.BufferGeometry[] {
  return [
    ...woodEdge(-halfW, halfD, halfW, halfD, h, top),
    ...woodEdge(halfW, halfD, halfW, -halfD, h, top),
    ...woodEdge(halfW, -halfD, -halfW, -halfD, h, top),
    ...woodEdge(-halfW, -halfD, -halfW, halfD, h, top),
  ]
}

// Hàng rào quanh biên lô (lùi inset), merge 1 mesh để giữ draw call thấp (budget rule #2).
// Tường rào (type='wall') + wallTex='cinder'/'stone' + caller bơm texture → MẶT = TexturedSurface (triplanar,
// đúng mặt DỌC). Thiếu texture (hoặc 'plain') → màu phẳng. Gỗ → màu nâu phẳng. push ctx.shaders khi TexturedSurface.
// EXPORT: caller (editor) dựng rào vào GROUP RIÊNG (dirty-check) để né rebuild rào/nước mỗi frame kéo slider rào.
// Dựng 1 LỚP rào (fence) vào ctx. site = lô (lotWidth/Depth/groundThick); fence = config lớp này (đa-lớp →
// caller loop site.fences). opts.fenceWallMat (nếu có) = material CACHED riêng cho lớp này (editor bơm per-kind).
export function buildSiteFence(
  fence: FenceConfig,
  site: SiteState,
  ctx: SiteRenderCtx,
  opts: SiteRenderOpts
): void {
  const h = fence.height / 1000
  const top = site.groundThick / 1000
  const halfW = site.lotWidth / 2000 - fence.inset / 1000
  const halfD = site.lotDepth / 2000 - fence.inset / 1000
  if (halfW <= 0 || halfD <= 0) return
  // CỔNG (chỉ type='wall'): khoét gap 1 cạnh + 2 cột. gateClamp lo kẹp halfGap/posAlong (gap luôn trong cạnh).
  const gate = gateClamp(fence, halfW, halfD) ?? undefined
  const geos = fenceGeosFor(fence, { halfW, halfD, h, top }, gate, opts)
  const merged = mergeGeometries(geos, false)
  for (const g of geos) g.dispose()
  if (!merged) return
  const mesh = new THREE.Mesh(merged, fenceMaterialFor(fence, ctx, opts))
  mesh.castShadow = true
  mesh.receiveShadow = true
  ctx.geos.push(merged)
  ctx.group.add(mesh)
}

// Đá (wallTex='stone') → geometry đỉnh-tròn-gợn + dày hơn (0.18), THEO LỰA CHỌN texture (không đợi load
// xong: đang load vẫn ra khối đá xám tạm). Cinder/plain → box phẳng mỏng (0.12). Gỗ → cọc + thanh ngang.
// fenceLodBox (đang kéo): stone tạm dùng box mỏng (rẻ) — material stone cached vẫn áp (triplanar lo).
function fenceGeosFor(
  fence: FenceConfig,
  f: { halfW: number; halfD: number; h: number; top: number },
  gate: GateSpec | undefined,
  opts: SiteRenderOpts
): THREE.BufferGeometry[] {
  if (fence.type !== 'wall') return woodFenceGeos(f.halfW, f.halfD, f.h, f.top)
  const isStone = (fence.wallTex ?? 'plain') === 'stone' && !opts.fenceLodBox
  return isStone
    ? stoneWallFenceGeos(f.halfW, f.halfD, f.h, f.top, 0.18, gate)
    : wallFenceGeos(f.halfW, f.halfD, f.h, f.top, 0.12, gate)
}

// Vật liệu MẶT tường: (1) fenceWallMat CACHED (editor — KHÔNG push shaders/mats, KHÔNG recompile mỗi rebuild
// → trị tụt fps kéo cổng); (2) fenceWallTextures → tạo TexturedSurface (headless, push shaders); (3) màu phẳng.
function fenceMaterialFor(
  fence: FenceConfig,
  ctx: SiteRenderCtx,
  opts: SiteRenderOpts
): THREE.Material {
  const isWall = fence.type === 'wall'
  const wantTex = isWall && (fence.wallTex ?? 'plain') !== 'plain'
  if (wantTex && opts.fenceWallMat) return opts.fenceWallMat // cached — caller sở hữu dispose
  if (wantTex && opts.fenceWallTextures) {
    const surf = new TexturedSurface({
      maps: opts.fenceWallTextures,
      tileSizeMeters: opts.fenceWallTileMeters ?? 2,
    })
    ctx.shaders.push(surf)
    return surf.getMaterial()
  }
  const flat = new THREE.MeshStandardMaterial(
    isWall ? { color: 0x9a9690, roughness: 0.95 } : { color: 0x8a6a45, roughness: 0.85 }
  )
  ctx.mats.push(flat)
  return flat
}
