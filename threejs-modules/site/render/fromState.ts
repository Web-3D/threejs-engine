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

import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

import { GrassBlades, type GrassExcludeRect } from '../../components/GrassBlades'
import { WaterSurface } from '../../components/WaterSurface'
import { GrassGround } from '../../shaders/ground/GrassGround'
import {
  GROUND_PRESETS,
  renderPuddles,
  renderWaters,
  type SiteState,
  type WaterConfig,
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
}

// Dựng lô vào ctx. show=false → không dựng gì (caller để building về y=0). Trả handle (grass) cho live-tune.
export function renderSiteState(
  site: SiteState,
  ctx: SiteRenderCtx,
  opts: SiteRenderOpts = {}
): SiteHandle {
  if (!site.show) return { grass: null, waters: [] }
  buildGround(site, ctx)
  const pools = renderWaters(site) // pool + pond ĐANG BẬT (puddle placeholder bỏ qua)
  // Cỏ né cả foundation (caller) LẪN footprint+coping MỖI hồ → không mọc xuyên mặt nước/dải viền.
  const exclude = siteGrassExclude(site, opts.exclude ?? [])
  // skipGrass → caller TỰ dựng cỏ (buildSiteGrass) + giữ bền qua dirty-check (né re-scatter mỗi edit).
  const grass = opts.skipGrass ? null : buildVegetation(site, ctx, exclude)
  // waters: hồ LÕM (pool/pond, có basin) TRƯỚC rồi VŨNG phẳng (puddle) SAU — caller zip theo ĐÚNG thứ tự
  // [...renderWaters, ...renderPuddles] để drag/tune/handle nhắm đúng instance.
  const waters = pools.map((w) => buildWater(w, site, ctx)) // 1 WaterSurface (+1 RTT) mỗi hồ bật
  for (const w of renderPuddles(site)) waters.push(buildPuddle(w, site, ctx)) // mặt nước phẳng trên nền
  if (site.fence.enabled) buildFence(site, ctx)
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
function buildWater(w: WaterConfig, site: SiteState, ctx: SiteRenderCtx): WaterSurface {
  buildBasin(w, site, ctx) // đáy hồ vẽ TRƯỚC (opaque) → nước (transparent) khúc xạ thấy đáy
  buildPoolEdge(w, site, ctx) // dải coping/mép viền quanh hồ (rect-frame ở mặt nền)
  const points =
    w.shape === 'free' && w.points.length >= 3
      ? w.points.map((p) => ({ x: p.x / 1000, z: p.z / 1000 })) // mm → m, local
      : undefined
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
  const points =
    w.shape === 'free' && w.points.length >= 3
      ? w.points.map((p) => ({ x: p.x / 1000, z: p.z / 1000 }))
      : undefined
  const water = new WaterSurface({
    width: w.width / 1000,
    depth: w.depth / 1000,
    baseY: site.groundThick / 1000 + 0.005, // 5mm trên mặt nền (đậu trên, không lõm)
    waterColor: w.color,
    reflectivity: w.reflectivity,
    flow: w.flow,
    distortion: w.distortion,
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
export function pondWorldXZ(w: WaterConfig): { x: number; z: number }[] {
  const ox = w.offsetX / 1000
  const oz = w.offsetZ / 1000
  if (w.shape === 'free' && w.points.length >= 3) {
    return w.points.map((p) => ({ x: ox + p.x / 1000, z: oz + p.z / 1000 }))
  }
  const hw = w.width / 2000
  const hd = w.depth / 2000
  return [
    { x: ox - hw, z: oz - hd },
    { x: ox + hw, z: oz - hd },
    { x: ox + hw, z: oz + hd },
    { x: ox - hw, z: oz + hd },
  ]
}

// Polygon (world XZ) của MỌI hồ đang bật — vỏ (editor) khoét lỗ nền/lưới CÙNG các lỗ này (nhiều hồ).
export function waterPolygons(site: SiteState): { x: number; z: number }[][] {
  return renderWaters(site).map((w) => pondWorldXZ(w))
}

// Dải coping/mép viền quanh 1 hồ = rect-frame (outer = bbox + edgeWidth, hole = polygon hồ) ở mặt nền
// (+3mm né z-fight). Placeholder material → màu đá xám mặc định; render thật theo edgeMaterial sau.
function buildPoolEdge(w: WaterConfig, site: SiteState, ctx: SiteRenderCtx): void {
  if (w.edgeWidth <= 0) return
  const ew = w.edgeWidth / 1000
  const poly = pondWorldXZ(w)
  let x0 = Infinity
  let x1 = -Infinity
  let z0 = Infinity
  let z1 = -Infinity
  for (const p of poly) {
    x0 = Math.min(x0, p.x)
    x1 = Math.max(x1, p.x)
    z0 = Math.min(z0, p.z)
    z1 = Math.max(z1, p.z)
  }
  // Shape XY (x=worldX, y=−worldZ) → rotateX(−90) đặt nằm ngang. Outer rect bbox±ew, hole = polygon hồ.
  const s = new THREE.Shape()
  s.moveTo(x0 - ew, -(z0 - ew))
  s.lineTo(x1 + ew, -(z0 - ew))
  s.lineTo(x1 + ew, -(z1 + ew))
  s.lineTo(x0 - ew, -(z1 + ew))
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

// Đáy 1 hồ = vách (quad mỗi cạnh, RIM → floor) + sàn (ShapeGeometry). Material đục, DoubleSide (né winding).
// Vách chạy từ MẶT NỀN (rim) thẳng xuống đáy → liền "thành hồ" (coping) ↔ "tường hồ", KHÔNG lộ mặt-cắt
// slab nền (đường xanh cỏ). Nền lô khi có hồ dựng PHẲNG (buildGround) nên không còn cut-face để hở.
function buildBasin(w: WaterConfig, site: SiteState, ctx: SiteRenderCtx): void {
  const rimY = site.groundThick / 1000 // mặt nền = đỉnh vách
  const yBot = rimY - w.depthY / 1000 // floor dưới rim depthY
  const geo = basinGeometry(pondWorldXZ(w), rimY, yBot)
  const mat = new THREE.MeshStandardMaterial({
    color: w.bottomColor,
    roughness: 0.95,
    side: THREE.DoubleSide,
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.receiveShadow = true
  ctx.geos.push(geo)
  ctx.mats.push(mat)
  ctx.group.add(mesh)
}

// Geometry basin: vách (pts world XZ, yTop→yBot) + sàn (ShapeGeometry ở yBot). Merge 1 mesh.
function basinGeometry(
  pts: { x: number; z: number }[],
  yTop: number,
  yBot: number
): THREE.BufferGeometry {
  const pos: number[] = []
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    pos.push(a.x, yTop, a.z, b.x, yTop, b.z, b.x, yBot, b.z) // quad cạnh → 2 tris
    pos.push(a.x, yTop, a.z, b.x, yBot, b.z, a.x, yBot, a.z)
  }
  const walls = new THREE.BufferGeometry()
  walls.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  walls.computeVertexNormals()
  const s = new THREE.Shape()
  pts.forEach((q, i) => (i === 0 ? s.moveTo(q.x, -q.z) : s.lineTo(q.x, -q.z))) // XY: x=worldX, y=−worldZ
  s.closePath()
  const floorIdx = new THREE.ShapeGeometry(s)
  floorIdx.rotateX(-Math.PI / 2)
  floorIdx.translate(0, yBot, 0)
  floorIdx.deleteAttribute('uv') // khớp attribute với walls (position+normal) để merge
  // walls = NON-indexed (raw position), ShapeGeometry = INDEXED → mergeGeometries trộn 2 loại = NULL
  // (mất sàn đáy!). Ép floor về non-indexed cho đồng nhất trước khi merge.
  const floor = floorIdx.toNonIndexed()
  floorIdx.dispose()
  const merged = mergeGeometries([walls, floor], false)
  walls.dispose()
  floor.dispose()
  return merged ?? new THREE.BufferGeometry()
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
function buildGround(site: SiteState, ctx: SiteRenderCtx): void {
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
  const mesh = new THREE.Mesh(geo, groundMaterial(site, ctx))
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

// grass = procedural shader (GrassGround, tier A — trông thật); soil/gravel = màu phẳng (nâng cấp sau).
// Track đúng nơi: shader có dispose() riêng → ctx.shaders; material phẳng → ctx.mats.
function groundMaterial(site: SiteState, ctx: SiteRenderCtx): THREE.Material {
  if (site.ground === 'grass') {
    const grass = new GrassGround({ scale: 1.0 })
    ctx.shaders.push(grass)
    return grass.getMaterial()
  }
  const preset = GROUND_PRESETS[site.ground]
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

// Tường rào: 4 cạnh low-wall liền. tk = bề dày. Đứng trên mặt nền (y bắt đầu từ top).
function wallFenceGeos(
  halfW: number,
  halfD: number,
  h: number,
  top: number,
  tk: number
): THREE.BufferGeometry[] {
  const cy = top + h / 2
  return [
    box(halfW * 2 + tk, h, tk, 0, cy, halfD),
    box(halfW * 2 + tk, h, tk, 0, cy, -halfD),
    box(tk, h, halfD * 2 - tk, halfW, cy, 0),
    box(tk, h, halfD * 2 - tk, -halfW, cy, 0),
  ]
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
function buildFence(site: SiteState, ctx: SiteRenderCtx): void {
  const inset = site.fence.inset / 1000
  const h = site.fence.height / 1000
  const top = site.groundThick / 1000
  const halfW = site.lotWidth / 2000 - inset
  const halfD = site.lotDepth / 2000 - inset
  if (halfW <= 0 || halfD <= 0) return
  const isWall = site.fence.type === 'wall'
  const geos = isWall
    ? wallFenceGeos(halfW, halfD, h, top, 0.12)
    : woodFenceGeos(halfW, halfD, h, top)
  const merged = mergeGeometries(geos, false)
  for (const g of geos) g.dispose()
  if (!merged) return
  const mat = new THREE.MeshStandardMaterial(
    isWall ? { color: 0x9a9690, roughness: 0.95 } : { color: 0x8a6a45, roughness: 0.85 }
  )
  const mesh = new THREE.Mesh(merged, mat)
  mesh.castShadow = true
  mesh.receiveShadow = true
  ctx.geos.push(merged)
  ctx.mats.push(mat)
  ctx.group.add(mesh)
}
