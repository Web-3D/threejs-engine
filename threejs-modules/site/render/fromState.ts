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
import { WaterSurface } from '../../components/WaterSurface'
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
  renderPuddles,
  renderWaters,
  type SiteState,
  type WaterConfig,
  type WaterMaterialKey,
} from '../state'

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
}

// Dựng lô vào ctx. show=false → không dựng gì (caller để building về y=0). Trả handle (grass) cho live-tune.
export function renderSiteState(
  site: SiteState,
  ctx: SiteRenderCtx,
  opts: SiteRenderOpts = {}
): SiteHandle {
  if (!site.show) return { grass: null, waters: [] }
  buildGround(site, ctx, opts)
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
  return { grass, waters }
}

// Rect loại trừ cỏ (m, world XZ) = foundation (caller bơm) + footprint+coping MỖI hồ/vũng đang bật. Export để
// CALLER dùng đúng tập exclude này cho cả dirty-check (grassBuildSig) LẪN buildSiteGrass → khớp với lõi.
export function siteGrassExclude(
  site: SiteState,
  foundation: GrassExcludeRect[]
): GrassExcludeRect[] {
  const exclude = [...foundation]
  for (const w of renderWaters(site)) exclude.push(waterRect(w))
  for (const w of renderPuddles(site)) exclude.push(waterRect(w)) // cỏ né cả vũng nước (không mọc xuyên mặt)
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
  const geos = isRect ? pondFenceGeos(ring, topY, size) : pondStoneGeos(ring, topY, size)
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
// hơi dẹt Y + xoay Y random (deterministic theo idx). Tâm ở topY + r×0.4 (chìm nhẹ xuống coping → tự nhiên).
function stoneAt(
  px: number,
  pz: number,
  topY: number,
  r: number,
  idx: number
): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(r, 1)
  const s = 0.78 + hash01(idx, 1.7) * 0.4 // scale ngang 0.78..1.18
  const sy = 0.7 + hash01(idx, 5.3) * 0.45 // hơi dẹt 0.7..1.15
  const rot = new THREE.Matrix4().makeRotationY(hash01(idx, 9.1) * Math.PI * 2)
  g.applyMatrix4(rot.multiply(new THREE.Matrix4().makeScale(s, s * sy, s))) // scale rồi xoay
  g.translate(px, topY + r * 0.4, pz)
  return g
}

// Đá cuội xếp liền dọc polygon `ring` (world XZ, mét; tự nối last→first). Sample arc-length mỗi ~0.82×đường-kính
// (xếp liền, chồng nhẹ → không hở). Mỗi điểm 1 viên (stoneAt, jitter deterministic theo index chạy liên tục).
function pondStoneGeos(
  ring: { x: number; z: number }[],
  topY: number,
  diam: number
): THREE.BufferGeometry[] {
  const r = diam / 2
  const step = Math.max(0.05, diam * 0.82)
  const out: THREE.BufferGeometry[] = []
  const n = ring.length
  let acc = 0 // arc-length tới điểm đặt kế (mang dư qua cạnh sau)
  let idx = 0
  for (let i = 0; i < n; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % n]
    const dx = b.x - a.x
    const dz = b.z - a.z
    const segLen = Math.hypot(dx, dz)
    if (segLen < 1e-4) continue
    while (acc <= segLen) {
      out.push(stoneAt(a.x + (dx / segLen) * acc, a.z + (dz / segLen) * acc, topY, r, idx++))
      acc += step
    }
    acc -= segLen
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
    exclude,
  ])
}

// Nền lô. PBR nhận IBL + đổ bóng. Lô tâm world (0,0). KHÔNG hồ → BoxGeometry dày (đáy y=0, top y=t).
// CÓ hồ → ShapeGeometry PHẲNG ở mặt nền (y=t) KHOÉT LỖ polygon hồ: KHÔNG có mặt-cắt-dày → hết "đường xanh
// cỏ" ở mép hồ (cut-face của slab cũ cao = groundThick, càng dày càng lộ). Vách basin tự chạy rim→đáy.
function buildGround(site: SiteState, ctx: SiteRenderCtx, opts: SiteRenderOpts): void {
  const t = site.groundThick / 1000
  let geo: THREE.BufferGeometry
  if (renderWaters(site).length > 0) {
    geo = new THREE.ShapeGeometry(lotShape(site)) // phẳng (1 mặt) — không cut-face để hở màu cỏ
    geo.rotateX(-Math.PI / 2) // shape XY → nằm ngang XZ (normal +Y, nhìn từ trên)
    geo.translate(0, t, 0) // nâng lên mặt nền (rim = top slab cũ)
  } else {
    geo = new THREE.BoxGeometry(site.lotWidth / 1000, t, site.lotDepth / 1000)
    geo.translate(0, t / 2, 0) // box tâm → đáy y=0
  }
  const mesh = new THREE.Mesh(geo, groundMaterial(site, ctx, opts))
  mesh.receiveShadow = true
  ctx.geos.push(geo)
  ctx.group.add(mesh)
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

// Các G-LEVEL phân biệt (1-based, tăng dần) — gồm CẢ level chỉ-có-cut (cut-only). Xếp chồng Y theo level.
function groundRenderLevels(layers: GroundLayer[]): number[] {
  const set = new Set<number>()
  for (const l of layers) set.add(l.level ?? 1)
  return [...set].sort((a, b) => a - b)
}

// Dựng 1 ZONE (mesh) tại baseY (KHÔNG cộng baseY trong level → zones cùng level đồng phẳng). holes = NƯỚC + vùng
// CUT cùng level (ĐỤC LỖ thật → lộ lớp dưới). groundLayerIdx = index phẳng gốc (ArchPlanLab pick).
function addZoneMesh(
  layer: GroundLayer,
  idx: number,
  baseY: number,
  holes: { x: number; z: number }[][],
  ctx: SiteRenderCtx,
  opts: SiteRenderOpts
): void {
  const geo = layerGeometry(layer, layer.thickness / 1000, holes)
  if (!geo) return // zone bị cut khoét sạch (difference rỗng) → không dựng mesh
  geo.translate(0, baseY, 0)
  const mesh = new THREE.Mesh(geo, resolveGroundMat(layer.material, ctx, opts))
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
  opts: SiteRenderOpts
): number {
  // Vùng CUT cùng level → ĐỤC LỖ zones level này (difference). Phủ trọn → zone rỗng → addZoneMesh tự bỏ mesh.
  const cuts = layers
    .filter((l) => l.op === 'cut' && (l.level ?? 1) === lv)
    .map((l) => layerWorldPolygon(l))
  let maxTh = 0
  layers.forEach((layer, idx) => {
    if (layer.op === 'cut' || (layer.level ?? 1) !== lv) return
    addZoneMesh(layer, idx, baseY, [...water, ...cuts], ctx, opts)
    maxTh = Math.max(maxTh, layer.thickness / 1000) // giữ stacking ổn định kể cả zone bị khoét sạch
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
function buildGroundLayers(site: SiteState, ctx: SiteRenderCtx, opts: SiteRenderOpts): void {
  const layers = site.groundLayers
  if (!layers?.length) return
  const water = allWaterCarvePolygons(site) // nước (pool/pond+edge, puddle)
  let baseY = site.groundThick / 1000 // mặt base ground = đáy add-layer đầu
  for (const lv of groundRenderLevels(layers)) {
    const top = buildLevelZones(layers, lv, baseY, water, ctx, opts)
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
// rebuild ra y HỆT). Winding (a,b,d,b,c,d): mặt ngoài +lat, mặt trong −lat → pháp tuyến đúng (FrontSide).
// computeVertexNormals làm mượt cung → đỉnh tròn ăn sáng. End-cap fan 2 đầu (ẩn ở góc, tránh thủng nếu lộ).
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
  const pos: number[] = []
  const uvs: number[] = [] // triplanar BỎ QUA uv, nhưng pipeline WebGPU (MeshStandardNodeMaterial) CẦN attr này
  for (let i = 0; i <= M; i++) {
    const f = i / M
    const along = -length / 2 + f * length
    const topY = topYAt(f * length)
    for (let k = 0; k < K; k++) {
      let lat: number
      let y: number
      if (k === 0) {
        lat = r // outer-bottom
        y = baseY
      } else if (k === K - 1) {
        lat = -r // inner-bottom
        y = baseY
      } else {
        const a = (Math.PI * (k - 1)) / A // cung 0..π: outer-top → đỉnh → inner-top
        lat = r * Math.cos(a)
        y = topY - r + r * Math.sin(a)
      }
      const x = axis === 'x' ? cx + along : cx + lat
      const z = axis === 'x' ? cz + lat : cz + along
      pos.push(x, y, z)
      uvs.push(f, k / (K - 1)) // placeholder (không dùng — triplanar world-space)
    }
  }
  const idx: number[] = []
  const vid = (i: number, k: number): number => i * K + k
  // Winding: lat→z (trục X) thuận tay với (a,b,d); nhưng lat→x (trục Z) ĐẢO handedness → phải LẬT winding,
  // nếu không mặt ngoài 2 cạnh vuông góc quay pháp tuyến vào trong → back-face cull → "mất 1 mặt".
  const flip = axis === 'z'
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
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  g.setIndex(idx)
  g.computeVertexNormals() // smooth (đỉnh cung tròn ăn sáng) — TRƯỚC toNonIndexed để giữ normal đã blend
  // NON-INDEXED: cột góc (RoundedBoxGeometry) là non-indexed → trộn indexed/non-indexed = mergeGeometries NULL
  // (mất hình, KI-004). Đồng bộ về non-indexed. computeVertexNormals chạy TRƯỚC nên normal mượt bake sẵn.
  return g.toNonIndexed()
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
  const inset = fence.inset / 1000
  const h = fence.height / 1000
  const top = site.groundThick / 1000
  const halfW = site.lotWidth / 2000 - inset
  const halfD = site.lotDepth / 2000 - inset
  if (halfW <= 0 || halfD <= 0) return
  const isWall = fence.type === 'wall'
  // CỔNG (chỉ type='wall'): khoét gap 1 cạnh + 2 cột. gateClamp lo kẹp halfGap/posAlong (gap luôn trong cạnh).
  const gate = gateClamp(fence, halfW, halfD) ?? undefined
  // Đá (wallTex='stone') → geometry đỉnh-tròn-gợn + dày hơn (0.18), THEO LỰA CHỌN texture (không đợi load
  // xong: đang load vẫn ra khối đá xám tạm). Cinder/plain → box phẳng mỏng (0.12). Gỗ → cọc + thanh ngang.
  // fenceLodBox (đang kéo): stone tạm dùng box mỏng (rẻ) — material stone cached vẫn áp (triplanar lo).
  const isStone = isWall && (fence.wallTex ?? 'plain') === 'stone' && !opts.fenceLodBox
  const geos = !isWall
    ? woodFenceGeos(halfW, halfD, h, top)
    : isStone
      ? stoneWallFenceGeos(halfW, halfD, h, top, 0.18, gate)
      : wallFenceGeos(halfW, halfD, h, top, 0.12, gate)
  const merged = mergeGeometries(geos, false)
  for (const g of geos) g.dispose()
  if (!merged) return
  // Vật liệu MẶT tường: (1) fenceWallMat CACHED (editor — KHÔNG push shaders/mats, KHÔNG recompile mỗi rebuild
  // → trị tụt fps kéo cổng); (2) fenceWallTextures → tạo TexturedSurface (headless, push shaders); (3) màu phẳng.
  const wantTex = isWall && (fence.wallTex ?? 'plain') !== 'plain'
  let mat: THREE.Material
  if (wantTex && opts.fenceWallMat) {
    mat = opts.fenceWallMat // cached — caller sở hữu dispose
  } else if (wantTex && opts.fenceWallTextures) {
    const surf = new TexturedSurface({
      maps: opts.fenceWallTextures,
      tileSizeMeters: opts.fenceWallTileMeters ?? 2,
    })
    mat = surf.getMaterial()
    ctx.shaders.push(surf)
  } else {
    const flat = new THREE.MeshStandardMaterial(
      isWall ? { color: 0x9a9690, roughness: 0.95 } : { color: 0x8a6a45, roughness: 0.85 }
    )
    ctx.mats.push(flat)
    mat = flat
  }
  const mesh = new THREE.Mesh(merged, mat)
  mesh.castShadow = true
  mesh.receiveShadow = true
  ctx.geos.push(merged)
  ctx.group.add(mesh)
}
