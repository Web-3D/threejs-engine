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
  const waters = pools.map((w) => buildWater(w, site, ctx)) // 1 WaterSurface (+1 RTT) mỗi hồ bật
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
function buildWater(w: WaterConfig, site: SiteState, ctx: SiteRenderCtx): WaterSurface {
  buildBasin(w, site, ctx) // đáy hồ vẽ TRƯỚC (opaque) → nước (transparent) khúc xạ thấy đáy
  buildPoolEdge(w, site, ctx) // dải coping/mép viền quanh hồ (rect-frame ở mặt nền)
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

// Đáy 1 hồ = SÀN (ShapeGeometry @yBot) + VÁCH (quad mỗi cạnh RIM→floor) — 2 MESH RIÊNG để floor/wall mang
// material ĐỘC LẬP (floorMaterial/wallMaterial). 'none' = màu phẳng bottomColor; 'tile' = caro hồ bơi.
// Vách chạy từ MẶT NỀN (rim) xuống đáy → liền "thành hồ", KHÔNG lộ mặt-cắt slab (nền dựng PHẲNG khi có hồ).
// KHÔNG merge (trước gộp 1 mesh để tiết draw call; nay tách → thoát luôn rủi ro mergeGeometries mixed-index, KI-004).
function buildBasin(w: WaterConfig, site: SiteState, ctx: SiteRenderCtx): void {
  const rimY = site.groundThick / 1000 // mặt nền = đỉnh vách
  const yBot = rimY - w.depthY / 1000 // floor dưới rim depthY
  const pts = pondWorldXZ(w)
  // 'tile' = NodeMaterial (compile shader): share 1 instance khi wall≡floor → né compile 2 lần (hồ bơi
  // thường floor=wall=tile). Caller push ctx.mats (không push 2 lần khi share).
  const floorMat = basinMaterial(w.floorMaterial, w)
  const wallMat = w.wallMaterial === w.floorMaterial ? floorMat : basinMaterial(w.wallMaterial, w)
  ctx.mats.push(floorMat)
  if (wallMat !== floorMat) ctx.mats.push(wallMat)
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

// Material 1 mặt basin theo key. 'none' = MeshStandardMaterial màu phẳng (bottomColor); 'tile' = caro hồ bơi
// (MeshStandardNodeMaterial — GIỮ PBR + nhận bóng, chỉ override colorNode). Caller push ctx.mats.
function basinMaterial(key: WaterMaterialKey, w: WaterConfig): THREE.Material {
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
    return mat
  }
  return new THREE.MeshStandardMaterial({
    color: w.bottomColor,
    roughness: 0.95,
    side: THREE.DoubleSide,
  })
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

type P2 = { x: number; y: number }

// 1 pass Sutherland-Hodgman: giữ đỉnh "inside" half-plane; cạnh cắt biên → chèn giao điểm (isect).
function clipHalfPlane(poly: P2[], inside: (p: P2) => boolean, isect: (a: P2, b: P2) => P2): P2[] {
  const out: P2[] = []
  for (let i = 0; i < poly.length; i++) {
    const a = poly[(i + poly.length - 1) % poly.length]
    const b = poly[i]
    const inb = inside(b)
    if (inside(a) !== inb) out.push(isect(a, b))
    if (inb) out.push(b)
  }
  return out
}

// Diện tích có dấu (XY) → winding (>0 = CCW).
function polyAreaXY(poly: P2[]): number {
  let a = 0
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]
    const q = poly[(i + 1) % poly.length]
    a += p.x * q.y - q.x * p.y
  }
  return a
}

// Giao SEGMENT p→q với ĐƯỜNG THẲNG vô hạn qua a→b (clip Sutherland-Hodgman cạnh bất kỳ, không chỉ axis-aligned).
function segLineIsect(p: P2, q: P2, a: P2, b: P2): P2 {
  const ex = b.x - a.x
  const ey = b.y - a.y
  const dx = q.x - p.x
  const dy = q.y - p.y
  const denom = ex * dy - ey * dx
  if (Math.abs(denom) < 1e-9) return { x: p.x, y: p.y } // song song (hiếm) → trả p
  const t = -(ex * (p.y - a.y) - ey * (p.x - a.x)) / denom
  return { x: p.x + t * dx, y: p.y + t * dy }
}

// Clip subject qua 1 CẠNH (a→b) của clip polygon. Interior bên TRÁI nếu CCW (cross≥0). Tách ra né closure-in-loop.
function clipEdge(subject: P2[], a: P2, b: P2, ccw: boolean): P2[] {
  const ex = b.x - a.x
  const ey = b.y - a.y
  const inside = (p: P2): boolean => {
    const cross = ex * (p.y - a.y) - ey * (p.x - a.x)
    return ccw ? cross >= 0 : cross <= 0
  }
  return clipHalfPlane(subject, inside, (p, q) => segLineIsect(p, q, a, b))
}

// Clip subject vào CONVEX clip polygon (Sutherland-Hodgman mỗi cạnh). Tổng quát clipToRect cho contour LỒI
// (rect/circle/ellipse). Trả [] nếu subject ngoài hẳn.
function clipToConvexPolygon(subject: P2[], clip: P2[]): P2[] {
  const ccw = polyAreaXY(clip) > 0
  let out = subject
  for (let i = 0; i < clip.length && out.length >= 3; i++) {
    out = clipEdge(out, clip[i], clip[(i + 1) % clip.length], ccw)
  }
  return out
}

// Point-in-polygon (XY, ray-casting) — cho contour CONCAVE (free): hole hợp lệ khi MỌI đỉnh nằm trong.
function pointInPolyXY(p: P2, poly: P2[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x
    const yi = poly[i].y
    const xj = poly[j].x
    const yj = poly[j].y
    if (yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
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

// Hole (XY) → clip về contour layer. Convex (rect/circle/ellipse) = clip thật; free (concave) = chỉ giữ nếu NẰM
// TRỌN trong contour (cắt-biên-concave bỏ — polygon-boolean defer).
function clipHoleToContour(holeXY: P2[], contour: P2[], convex: boolean): P2[] {
  if (convex) return clipToConvexPolygon(holeXY, contour)
  return holeXY.every((p) => pointInPolyXY(p, contour)) ? holeXY : []
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
// dày th, ĐỤC LỖ mọi `holes` (nước + vùng CUT) rơi trong contour (clip convex / fully-inside concave). Shape XY
// (x=worldX, y=−worldZ) → rotateX(−90) nằm ngang (đáy y=0, đỉnh th).
function layerGeometry(
  layer: GroundLayer,
  th: number,
  holes: { x: number; z: number }[][]
): THREE.BufferGeometry {
  const contour = layerWorldPolygon(layer).map((q) => ({ x: q.x, y: -q.z })) // world XZ → XY (x, −z)
  const shape = new THREE.Shape()
  contour.forEach((p, i) => (i === 0 ? shape.moveTo(p.x, p.y) : shape.lineTo(p.x, p.y)))
  shape.closePath()
  const convex = (layer.shape ?? 'rect') !== 'free' // rect/circle/ellipse = lồi → clip thật; free = fully-inside
  for (const poly of holes) {
    const clipped = clipHoleToContour(
      poly.map((q) => ({ x: q.x, y: -q.z })),
      contour,
      convex
    )
    if (clipped.length < 3) continue
    const hole = new THREE.Path()
    clipped.forEach((p, i) => (i === 0 ? hole.moveTo(p.x, p.y) : hole.lineTo(p.x, p.y)))
    hole.closePath()
    shape.holes.push(hole)
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth: th, bevelEnabled: false })
  geo.rotateX(-Math.PI / 2) // XY → XZ; depth +Z → +Y (đáy y=0, đỉnh y=th)
  return geo
}

// TẦNG surface chồng: mỗi ADD-layer = ExtrudeGeometry RIÊNG (shape + offset, ĐỤC LỖ nước + vùng CUT), XẾP CHỒNG
// Y lên base. Layer `op:'cut'` = KHÔNG dựng mesh — polygon của nó vào `holes` → khoét MỌI add-layer → LỘ base
// (đáy hồ "form trống tự do"). KÉO live = dời mesh.position. PhotoGround world-XZ map đúng mặt trên.
function buildGroundLayers(site: SiteState, ctx: SiteRenderCtx, opts: SiteRenderOpts): void {
  const layers = site.groundLayers
  if (!layers?.length) return
  const holes = allWaterCarvePolygons(site) // nước (pool/pond+edge, puddle)
  for (const l of layers) if (l.op === 'cut') holes.push(layerWorldPolygon(l)) // + vùng CUT khoét lộ base
  let baseY = site.groundThick / 1000 // mặt base ground = đáy add-layer đầu
  layers.forEach((layer, i) => {
    if (layer.op === 'cut') return // cut: không mesh (polygon đã vào holes); KHÔNG cộng baseY (không bề dày)
    const th = layer.thickness / 1000
    const geo = layerGeometry(layer, th, holes)
    geo.translate(0, baseY, 0) // đáy = đỉnh lớp dưới (offset XZ đã nằm trong shape)
    const mesh = new THREE.Mesh(geo, resolveGroundMat(layer.material, ctx, opts))
    mesh.userData.groundLayerIdx = i // editor: Move tool nhận diện để kéo (G1+); base G0 KHÔNG có tag
    mesh.receiveShadow = true
    mesh.castShadow = true
    ctx.geos.push(geo)
    ctx.group.add(mesh)
    baseY += th
  })
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
