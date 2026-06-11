/**
 * VỊ TRÍ   — threejs-modules/site/render/water.ts  (site-kit)
 * VAI TRÒ  — Sub-domain NƯỚC của renderer lô: hồ phản chiếu (WaterSurface) + vũng (puddle) + basin
 *            (đáy/vách + caro tile) + coping + rào/đá viền quanh hồ + polygon dẫn xuất (pondWorldXZ
 *            = SINGLE SOURCE cho lỗ nền/carve-layer/cỏ-né).
 * LIÊN HỆ  — Tách từ fromState.ts (god-module 1966 dòng, 2026-06-11) — code di NGUYÊN VĂN.
 *            fromState (orchestrator + ground/layers/mix) import builder từ đây; file này chỉ import
 *            TYPE từ fromState (SiteRenderCtx/SiteRenderOpts — type-only, erased, không circular runtime).
 * DISPOSE: geos/mats build vào ctx — caller sở hữu (giống fromState). WaterSurface push ctx.shaders.
 */

import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type Node from 'three/src/nodes/core/Node.js'
import type { ShaderNodeObject } from 'three/tsl'
import { float, floor, fract, min, mix, smoothstep, uv, vec3 } from 'three/tsl'
import { MeshStandardNodeMaterial } from 'three/webgpu'

import type { GrassExcludeRect } from '../../components/GrassBlades'
import { PondFish } from '../../components/PondFish'
import { WaterSurface } from '../../components/WaterSurface'
import { arcLength } from '../../ops/resample' // op #1 — viền đá hồ đặt theo chiều-dài-thật, khép kín
import { offsetPolygon, shapeToLocalPolygon } from '../shapes'
import {
  renderPuddles,
  renderWaters,
  type SiteState,
  type WaterConfig,
  type WaterMaterialKey,
} from '../state'
import type { SiteRenderCtx, SiteRenderOpts } from './fromState'

// Rect 1 hồ (m, world XZ) cho cỏ né — cỏ KHÔNG mọc xuyên mặt nước LẪN dải coping. Mở rộng halfW/D theo
// edgeWidth. Free → bbox polygon (axis-aligned).
export function waterRect(w: WaterConfig): GrassExcludeRect {
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
export function buildWater(
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
  // 💧 surfaceOn=false → ẨN mesh nước (hồ cạn: đáy/lỗ/viền giữ nguyên). Mesh ẩn không vào render list
  // (Renderer.projectObject) → ReflectorNode.updateBefore KHÔNG chạy → RTT không render + không cấp (lazy).
  // VẪN build WaterSurface (không skip) để handle.waters giữ THẲNG HÀNG với renderWaters (caller zip theo index).
  mesh.visible = w.surfaceOn
  ctx.group.add(mesh)
  ctx.shaders.push(water)
  return water
}

// 🐟 Đàn cá koi trong LÒNG hồ (chỉ pool/pond — puddle phẳng không có lòng). Gốc mesh = TÂM hồ tại MẶT
// nước (khớp baseY của buildWater); cá bơi depthY ÂM = giữa cột nước (kẹp không chạm đáy/mặt). areaRadius
// nội tiếp footprint × 0.9 (NgQuan 2026-06-11 "bơi rộng hơn" — steer-về-tâm kích từ 85% nên mép thật ~0.97;
// circle/ellipse nội tiếp = bbox halfMin nên vẫn lọt lòng; free lõm dùng bbox → chấp nhận v1). Cỡ cá theo
// hồ nhỏ. Caller (editor) drive update(dt) mỗi frame qua handle.fish; dispose theo ctx.shaders chain.
export function buildPondFish(w: WaterConfig, site: SiteState, ctx: SiteRenderCtx): PondFish {
  const rimY = site.groundThick / 1000
  const yBot = rimY - w.depthY / 1000
  const baseY = Math.max(yBot + 0.03, rimY - 0.03) // = mặt nước (cùng công thức buildWater)
  const halfMin = Math.min(w.width, w.depth) / 2000
  const span = baseY - yBot // bề dày cột nước (m)
  const fishLength = Math.min(0.28, Math.max(0.08, halfMin * 0.3, span * 0.5))
  const fish = new PondFish({
    count: w.fishCount,
    areaRadius: Math.max(0.3, halfMin * 0.9),
    depthY: -Math.min(Math.max(0.05, span * 0.55), span - 0.04), // giữa cột nước, không chạm đáy
    fishLength,
    speed: w.fishSpeed,
    colorSeed: w.fishSeed,
  })
  const m = fish.getMesh()
  m.position.set(w.offsetX / 1000, baseY, w.offsetZ / 1000)
  ctx.group.add(m)
  ctx.shaders.push(fish) // dispose chain của site (PondFish có dispose())
  return fish
}

// Vũng nước (puddle) = mặt nước PHẲNG đặt TRÊN nền — KHÔNG basin (đáy/vách), KHÔNG coping, KHÔNG khoét lỗ
// nền. baseY = mặt nền + 5mm (đậu trên, né z-fight). Khúc xạ (viewportSharedTexture) xuyên thấy NỀN/cỏ phía
// sau → đúng cảm giác vũng nông; vẫn phản chiếu trời/nhà (+1 RTT như hồ). depthY/edgeWidth/bottomColor KHÔNG dùng.
export function buildPuddle(w: WaterConfig, site: SiteState, ctx: SiteRenderCtx): WaterSurface {
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
  mesh.visible = w.surfaceOn // 💧 perf toggle — như buildWater (puddle chỉ có mặt nước nên ẩn = biến cả vũng)
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

// Pool/pond đục lỗ GỒM dải EDGE/coping: polygon hồ NỞ ra edgeWidth (offsetPolygon) — khớp đúng vành coping bo-cong
// của buildPoolEdge → layer né cả viền theo đường cong, không chỉ mặt nước. (edge=0 → trùng polygon hồ.)
export function waterCarveWithEdge(w: WaterConfig): { x: number; z: number }[] {
  return offsetPolygon(pondWorldXZ(w), w.edgeWidth / 1000)
}

// Polygon (world XZ) MỌI mặt nước layer phải né: pool/pond (LÕM, GỒM dải edge/coping) + puddle (PHẲNG, đúng
// footprint, không coping). "3 đứa" — ground KHÔNG bao giờ che mặt nước LẪN viền (NgQuan 2026-06-05).
export function allWaterCarvePolygons(site: SiteState): { x: number; z: number }[][] {
  const out: { x: number; z: number }[][] = []
  for (const w of renderWaters(site)) out.push(waterCarveWithEdge(w)) // pool/pond: + dải edge
  for (const w of renderPuddles(site)) out.push(pondWorldXZ(w)) // puddle: phẳng, không edge
  return out
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
  // KHÔNG push. Share 1 instance khi wall≡floor (né compile tile 2 lần / né push trùng). 🎨 MIX (floorMix/
  // wallMix bật + caller bơm waterMixMat) THẮNG material đơn; null (đang load/tắt) → fallback như cũ.
  const floorMix = opts.waterMixMat?.(w, 'floor') ?? null
  const wallMix = opts.waterMixMat?.(w, 'wall') ?? null
  const floorMat = floorMix ?? basinMaterial(w.floorMaterial, w, ctx, opts)
  const wallMat =
    wallMix ??
    (w.wallMaterial === w.floorMaterial && !floorMix
      ? floorMat
      : basinMaterial(w.wallMaterial, w, ctx, opts))
  addBasinMesh(basinFloorGeometry(pts, yBot), floorMat, ctx, w, 'floor')
  addBasinMesh(basinWallsGeometry(pts, rimY, yBot), wallMat, ctx, w, 'wall')
}

// 1 mesh basin (floor hoặc walls): nhận bóng, track geo (material đã push ở caller — có thể share).
// Tag userData (w ref + face) → editor raycast cọ vẽ mask mix đáy/vách (như isBaseGround của nền).
function addBasinMesh(
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  ctx: SiteRenderCtx,
  w: WaterConfig,
  face: 'floor' | 'wall'
): void {
  const mesh = new THREE.Mesh(geo, mat)
  mesh.receiveShadow = true
  mesh.userData.waterMixRef = w // 🖌 editor stamp: so ref WaterConfig (sống trong site.waters)
  mesh.userData.waterMixFace = face
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
