/**
 * VỊ TRÍ   — building-kit/parts/Structure.ts
 * VAI TRÒ  — Phase 1: khung kết cấu — móng + cột + xà + gờ sàn
 * LIÊN HỆ  — Dùng bởi BuildingLab._showStructure(); params từ structure.config.json
 *
 * IQ SDF mapping (geometry là xấp xỉ — SDF bake sẽ thay sau):
 *   foundation     → sdBox rộng hơn body theo outset
 *   column_round   → sdCylinder(p, r, h) — 4 góc, outer face flush với wall
 *   column_square  → sdRoundBox(p, b, r_small) — xấp xỉ bằng BoxGeometry
 *   beam_horizontal→ sdCapsule(p, a, b, r) — BoxGeometry cho Lab preview
 *   floor_slab_edge→ sdBox mỏng tại mỗi ranh giới tầng
 *
 * DISPOSE: geos + mats trả về qua PartResult — BuildingLab._clearParts() quản lý
 */

import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

import type { PartResult } from '../tokens'

export interface StructureConfig {
  bodyW: number
  bodyH: number
  bodyD: number
  numFloors: number
  columnType: number // 0 = round (sdCylinder), 1 = square (sdRoundBox)
  columnRadius: number
  columnSide: number
  foundationH: number
  foundationOutset: number
  floorBandH: number
  floorBandOutset: number
  showBeams: boolean
  beamRadius: number
}

// ── Palette ────────────────────────────────────────────────────────────────────
const COL_FOUNDATION = 0x8e8c84 // bê tông xám ấm
const COL_COLUMN_ROUND = 0xd0b488 // gỗ ấm — truyền thống
const COL_COLUMN_SQ = 0xe6e4e0 // RC trắng — hiện đại
const COL_FLOOR_BAND = 0xb0ada6 // bê tông shadow line
const COL_BEAM = 0xc49260 // gỗ xà ngang

// ── Helpers ────────────────────────────────────────────────────────────────────

type GeoMeshPair = { geos: THREE.BufferGeometry[]; meshes: THREE.Mesh[] }

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat)
  m.position.set(x, y, z)
  return m
}

// Foundation — sdBox(p, b): b = halfBody + outset, height = foundationH
function buildFoundation(cfg: StructureConfig, mat: THREE.Material): GeoMeshPair {
  const fw = cfg.bodyW + cfg.foundationOutset * 2
  const fd = cfg.bodyD + cfg.foundationOutset * 2
  const geo = new THREE.BoxGeometry(fw, cfg.foundationH, fd)
  return { geos: [geo], meshes: [mesh(geo, mat, 0, cfg.foundationH / 2, 0)] }
}

// Columns — sdCylinder (round) hoặc sdRoundBox (square) tại 4 góc
function buildColumns(cfg: StructureConfig, mat: THREE.Material): GeoMeshPair {
  const { bodyW, bodyH, bodyD, foundationH } = cfg
  const isRound = cfg.columnType === 0

  const colGeo = isRound
    ? new THREE.CylinderGeometry(cfg.columnRadius, cfg.columnRadius, bodyH, 16, 1)
    : new THREE.BoxGeometry(cfg.columnSide, bodyH, cfg.columnSide)

  // Outer face flush với wall: center offset = halfBody - halfColumn
  const cx = isRound ? bodyW / 2 - cfg.columnRadius : bodyW / 2 - cfg.columnSide / 2
  const cz = isRound ? bodyD / 2 - cfg.columnRadius : bodyD / 2 - cfg.columnSide / 2
  const cy = foundationH + bodyH / 2

  const meshes: THREE.Mesh[] = []
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) meshes.push(mesh(colGeo, mat, sx * cx, cy, sz * cz))
  }
  return { geos: [colGeo], meshes }
}

// Floor bands — sdBox mỏng tại mỗi ranh giới tầng (opRepLim trên Y)
function buildFloorBands(cfg: StructureConfig, mat: THREE.Material): GeoMeshPair {
  if (cfg.floorBandH < 0.005) return { geos: [], meshes: [] }
  const floors = Math.max(1, Math.round(cfg.numFloors))
  const floorH = cfg.bodyH / floors
  const bw = cfg.bodyW + cfg.floorBandOutset * 2
  const bd = cfg.bodyD + cfg.floorBandOutset * 2
  const geo = new THREE.BoxGeometry(bw, cfg.floorBandH, bd)
  const meshes: THREE.Mesh[] = []
  for (let i = 1; i <= floors; i++) {
    meshes.push(mesh(geo, mat, 0, cfg.foundationH + floorH * i, 0))
  }
  return { geos: [geo], meshes }
}

// Beams — sdCapsule(a, b, r): BoxGeometry nối tâm cột đối diện
function buildBeams(cfg: StructureConfig, mat: THREE.Material): GeoMeshPair {
  if (!cfg.showBeams) return { geos: [], meshes: [] }
  const floors = Math.max(1, Math.round(cfg.numFloors))
  const floorH = cfg.bodyH / floors
  const br = cfg.beamRadius
  const bd2 = br * 2
  const isRound = cfg.columnType === 0
  const halfCol = isRound ? cfg.columnRadius : cfg.columnSide / 2

  // Span = cột đến cột (tâm đến tâm)
  const spanX = cfg.bodyW - halfCol * 2
  const spanZ = cfg.bodyD - halfCol * 2
  const cx = cfg.bodyW / 2 - halfCol
  const cz = cfg.bodyD / 2 - halfCol

  const bgX = new THREE.BoxGeometry(spanX, bd2, bd2) // front/back beams
  const bgZ = new THREE.BoxGeometry(bd2, bd2, spanZ) // left/right beams
  const meshes: THREE.Mesh[] = []

  for (let i = 1; i <= floors; i++) {
    const by = cfg.foundationH + floorH * i - br // ngay dưới ranh giới tầng
    meshes.push(mesh(bgX, mat, 0, by, cz), mesh(bgX, mat, 0, by, -cz))
    meshes.push(mesh(bgZ, mat, cx, by, 0), mesh(bgZ, mat, -cx, by, 0))
  }
  return { geos: [bgX, bgZ], meshes }
}

// ── AP2 — ArchPlanLab: positioned foundation / slab / column ──────────────────
// Dùng bởi ArchPlanLab._buildStructureForInstance().
// Kích thước từ turtle bbox — không cần bodyW/bodyH/numFloors.

// Vùng nền HẠ THẤP (vd lòng hồ pool/pond) trong frame WORLD (mét). Cột chống móng nằm TRONG polygon này đâm
// sâu thêm `dropY` xuống đáy. DOMAIN-NEUTRAL: building-kit KHÔNG biết "nước" — integrator (editor) tính từ
// site.waters rồi bơm qua ctx. poly = footprint world (rect → 4 góc; free → polygon). NgQuan 2026-06-06.
export interface GroundDrop {
  poly: { x: number; z: number }[] // world meters — polygon footprint vùng nền tụt
  dropY: number // mét — đáy sâu hơn mặt nền móng bao nhiêu → cột trong vùng kéo dài thêm bấy nhiêu
}

export interface PositionedFoundationOpts {
  bboxW: number // meters — turtle polygon bbox width (wall centerlines)
  bboxD: number // meters — turtle polygon bbox depth
  wallDepth: number // meters — neo cạnh móng vào MẶT NGOÀI tường: base mỗi cạnh = bbox/2 + wallDepth/2
  oh: { n: number; e: number; s: number; w: number } // m — nhô riêng 4 hướng (0 = sát mặt tường)
  h: number // meters — height above ground (bottom sits at y=0)
  worldX: number
  worldZ: number
  rotY: number // degrees
  openings?: SlabOpening[] // lỗ khoét móng — shape LỒNG (#3): khoét móng shape lớn để nhét shape nhỏ (né z-fight)
  outline?: [number, number][] // m, local centered (tim-tường) — shape 'round': móng đa giác thay bbox; chỉ nhánh concrete dùng (deck/stone-pillar giữ rect/radial)
  foundType?: 'concrete' | 'wood-deck' | 'stone-pillar' // bê tông khối | sàn gỗ Nhật (lưới cột) | sàn gỗ trên 1 trụ đá giữa + váy
  deckPostSpacing?: number // m? KHÔNG — mm (đồng bộ state); #10 khoảng cách lưới cột deck (default 1500mm)
  deckPostInset?: number // mm — cột chống (wood-deck) LÙI vào từ mép deck mỗi cạnh → cột không sát mép sàn. Default 50
  deckPostSize?: number // mm — CẠNH tiết diện cột chống vuông (wood-deck): lớn = cột to. Default 120
  groundDrops?: GroundDrop[] // vùng nền tụt (lòng hồ pool/pond) — cột chống nằm trên đâm sâu tới đáy. Default rỗng
  pillarRadius?: number // mm — bán kính trụ đá giữa (stone-pillar); cao trụ = h. Default 500
  beamWidth?: number // mm — bề rộng tiết diện 16 xà (stone-pillar). Default 100
  beamHeight?: number // mm — bề cao tiết diện 16 xà (stone-pillar); kẹp ≤ khoảng hở dưới deck. Default 120
  strutSegments?: number // số ĐỐT mỗi thanh chống xiên (stone-pillar): nhiều = cong mượt. Default 6
  strutCurve?: number // mm — độ CONG thanh chống xiên (bulge control-point); 0 = thẳng. Default 0
  woodMaterial?: THREE.Material // gỗ móng (caller bơm, vd TexturedSurface) — thay MeshToon phẳng. KHÔNG vào mats (caller dispose)
  postRadius?: number // mm — bán kính 8 cột trụ tròn (stone-pillar). Default 67
  postLength?: number // mm — chiều dài cột = gap 2 tầng xà (lowerY = beamY − postLength); xà dưới + xiên đi theo. Default 1500
  understructHalf?: number // m — NỬA-SPAN khung-dưới (xà/trụ/xiên), ĐỘC LẬP deck fw/fd. Default 2.5
  understructMat?: THREE.Material // material khung-dưới (caller bơm, riêng deck). KHÔNG vào mats (caller dispose)
  deckRailShow?: boolean // bật LAN CAN 4 mặt quanh deck (stone-pillar). Default false
  deckRailH?: number // mm — cao lan can. Default 900
  deckRailLength?: number // mm — DÀI (trục X) khung lan can chữ nhật, độc lập. Default 5000
  deckRailWidth?: number // mm — RỘNG (trục Z) khung lan can chữ nhật, độc lập. Default 5000
}

export interface SlabOpening {
  x: number // local X relative to slab center (meters)
  z: number // local Z relative to slab center (meters)
  w: number // opening width along local X trước khi xoay (meters)
  d: number // opening depth along local Z trước khi xoay (meters)
  rot?: number // độ — xoay rect quanh tâm lỗ (default 0 = axis-aligned)
}

export interface PositionedSlabOpts {
  bboxW: number
  bboxD: number
  thick: number // meters — slab thickness
  yBase?: number // meters — bottom of slab in world Y (default 0)
  worldX: number
  worldZ: number
  rotY: number
  openings?: SlabOpening[] // lỗ khoét trên sàn (cầu thang, ban công, ống nước...)
  outline?: [number, number][] // m, local centered (tim-tường) — shape 'round': slab đa giác N-gon thay bbox chữ nhật
  material?: THREE.Material // override vật liệu (vd gỗ từ WallMaterialCache); KHÔNG set → MeshToon bê tông tự tạo
}

export interface PositionedColumnOpts {
  type: 'round' | 'square'
  worldX: number
  worldZ: number
  h: number // meters
  r: number // meters — radius (round)
  size: number // meters — side (square)
  yBase?: number // meters — bottom of column in world Y (default 0)
}

const COL_SLAB = 0x9e9b93 // sàn bê tông xám nhạt
const COL_COLUMN_AP = 0xe2ddd6 // cột bê tông sáng
const COL_STONE_PILLAR = 0x8d8880 // trụ đá móng stone-pillar — xám đá (khớp tông fence stone phẳng)

// Geo móng ĐẶC (không lỗ) — box dời theo overhang offset (cx,cz). Tách để makePositionedFoundation chọn nhánh.
function boxFoundationGeo(
  fw: number,
  h: number,
  fd: number,
  cx: number,
  cz: number
): THREE.BoxGeometry {
  const geo = new THREE.BoxGeometry(fw, h, fd)
  if (cx !== 0 || cz !== 0) geo.translate(cx, 0, cz)
  return geo
}

// #6 Móng sàn gỗ Nhật (engawa/高床式): MẶT GỖ NGANG (deck) ở đỉnh + LƯỚI CỘT VUÔNG chống xuống đất. Deck và cột
// chống = 2 MESH RIÊNG, 2 material riêng (deck = woodMaterial; cột = understructMat) → vân khác nhau, KHÔNG
// chung texture. Cột LÙI `deckPostInset` (mm) vào từ mép deck → không sát mép sàn. NgQuan 2026-06-06.
function makeWoodDeckFoundation(
  fw: number,
  fd: number,
  cx: number,
  cz: number,
  opts: PositionedFoundationOpts
): PartResult {
  const h = opts.h
  const deckThick = Math.min(0.12, h * 0.5) // ván deck ~120mm (hoặc nửa chiều cao nếu móng thấp)
  const postH = Math.max(0.05, h - deckThick)
  const deckGeo = new THREE.BoxGeometry(fw, deckThick, fd) // (1) DECK — mặt gỗ ngang ở đỉnh
  deckGeo.translate(cx, h / 2 - deckThick / 2, cz)
  const postsGeo = buildDeckPosts(fw, fd, cx, cz, h, postH, opts) // (2) CỘT CHỐNG — lưới, lùi mép
  const deckMat = opts.woodMaterial ?? new THREE.MeshToonMaterial({ color: 0x9b6b43 }) // gỗ deck (planks/nâu)
  const postMat = opts.understructMat ?? new THREE.MeshToonMaterial({ color: 0x7d5a39 }) // cột: vân RIÊNG, nâu sậm hơn
  const deckMesh = new THREE.Mesh(deckGeo, deckMat)
  const postMesh = new THREE.Mesh(postsGeo, postMat)
  for (const m of [deckMesh, postMesh]) {
    m.rotation.y = (opts.rotY * Math.PI) / 180
    m.position.set(opts.worldX, h / 2, opts.worldZ)
    m.castShadow = true
    m.receiveShadow = true
  }
  const mats: THREE.Material[] = [] // chỉ fallback MeshToon vào mats (caller dispose); injected → caller sở hữu
  if (!opts.woodMaterial) mats.push(deckMat)
  if (!opts.understructMat) mats.push(postMat)
  return { geos: [deckGeo, postsGeo], mats, meshes: [deckMesh, postMesh] }
}

// Ray-casting point-in-polygon (XZ). poly = world meters. Dùng test cột có nằm trên lòng hồ không.
function pointInPoly(x: number, z: number, poly: { x: number; z: number }[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x
    const zi = poly[i].z
    const xj = poly[j].x
    const zj = poly[j].z
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside
  }
  return inside
}

// Cột tại LOCAL (lx,lz) trong frame móng → WORLD xz (xoay rotY quanh tâm building Ry: x'=x·cos+z·sin,
// z'=−x·sin+z·cos, rồi +worldX/Z). Trả dropY LỚN NHẤT của các GroundDrop chứa điểm (0 = không trên hồ nào).
function postDropAt(lx: number, lz: number, opts: PositionedFoundationOpts): number {
  const drops = opts.groundDrops
  if (!drops?.length) return 0
  const a = (opts.rotY * Math.PI) / 180
  const c = Math.cos(a)
  const s = Math.sin(a)
  const wx = opts.worldX + lx * c + lz * s
  const wz = opts.worldZ - lx * s + lz * c
  let best = 0
  for (const d of drops) {
    if (d.dropY > best && pointInPoly(wx, wz, d.poly)) best = d.dropY
  }
  return best
}

// Lưới cột vuông 120mm chống từ đất lên đáy deck, ĐỀU theo diện tích deck (gồm 4 góc). Mật độ = deckPostSpacing
// (mm→m). LÙI `deckPostInset` (mm) vào trong từ mép deck mỗi cạnh → cột không trồi sát mép sàn. Cột nằm trên
// lòng hồ (groundDrops) → đáy đâm sâu thêm tới đáy hồ. Merge 1 geo (rẻ: 12 tri/cột, 1 draw). Tách hàm Rule-50.
function buildDeckPosts(
  fw: number,
  fd: number,
  cx: number,
  cz: number,
  h: number,
  postH: number,
  opts: PositionedFoundationOpts
): THREE.BufferGeometry {
  const postSize = Math.max(0.02, (opts.deckPostSize ?? 120) / 1000) // mm→m, cạnh tiết diện cột vuông
  const ins = Math.max(0, (opts.deckPostInset ?? 50) / 1000) // mm→m, lùi mép mỗi cạnh
  const spanW = Math.max(postSize, fw - 2 * ins) // vùng đặt cột sau khi lùi
  const spanD = Math.max(postSize, fd - 2 * ins)
  const spacing = Math.max(0.6, (opts.deckPostSpacing ?? 1500) / 1000)
  const nx = Math.max(2, Math.round(spanW / spacing) + 1)
  const nz = Math.max(2, Math.round(spanD / spacing) + 1)
  const x0 = cx - spanW / 2 + postSize / 2 // tâm cột đầu (mặt ngoài = mép deck − ins)
  const z0 = cz - spanD / 2 + postSize / 2
  const sx = (spanW - postSize) / (nx - 1)
  const sz = (spanD - postSize) / (nz - 1)
  const boxes: THREE.BufferGeometry[] = []
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const px = x0 + i * sx
      const pz = z0 + j * sz
      const drop = postDropAt(px, pz, opts) // cột trên lòng hồ → kéo dài thêm tới đáy
      const post = new THREE.BoxGeometry(postSize, postH + drop, postSize)
      post.translate(px, -h / 2 + postH / 2 - drop / 2, pz) // đỉnh giữ dưới deck, đáy tụt drop
      boxes.push(post)
    }
  }
  const geo = mergeGeometries(boxes, false) ?? new THREE.BufferGeometry()
  for (const b of boxes) b.dispose()
  return geo
}

// 8 hướng toả từ tâm: 4 GÓC + 4 TRUNG ĐIỂM cạnh (offset dx,dz so tâm). Dùng chung xà + trụ-nối (DRY).
function radialTargets(hw: number, hd: number): [number, number][] {
  return [
    [hw, hd],
    [-hw, hd],
    [hw, -hd],
    [-hw, -hd], // 4 góc
    [hw, 0],
    [-hw, 0],
    [0, hd],
    [0, -hd], // 4 trung điểm cạnh
  ]
}

// 8 xà ngang gỗ TOẢ ĐỒNG TÂM từ tâm (cx,cz) ra 8 hướng, ở cao độ yc (local). Push vào out (merge với deck sau).
// ang = atan2(-uz,ux) (local +X → hướng target, khớp woodEdge). Gọi nhiều lần = nhiều tầng.
function pushRadialBeams(
  out: THREE.BufferGeometry[],
  cx: number,
  cz: number,
  hw: number,
  hd: number,
  yc: number,
  beamH: number,
  beamTk: number
): void {
  for (const [dx, dz] of radialTargets(hw, hd)) {
    const L = Math.hypot(dx, dz)
    if (L < 0.05) continue
    const beam = new THREE.BoxGeometry(L, beamH, beamTk) // dài L theo local +X (tâm→target)
    beam.rotateY(Math.atan2(-dz / L, dx / L))
    beam.translate(cx + dx / 2, yc, cz + dz / 2) // giữa xà tại nửa đường tâm→target
    out.push(beam)
  }
}

// 8 trụ dọc gỗ HÌNH TRỤ TRÒN nối MÚT-NGOÀI 2 tầng xà (yTop↔yBot) trên mỗi hướng, LÙI vào `inset` (m) từ mút xà.
// Trụ từ đỉnh xà trên xuống, THÒ QUA xà dưới thêm `extend` (m) (như chân). r = bán kính trụ. Push vào out (merge
// với deck — Cylinder + Box đều indexed, cùng attr → merge OK). Gọi khi có đủ 2 tầng (caller guard).
function pushBeamPosts(
  out: THREE.BufferGeometry[],
  cx: number,
  cz: number,
  hw: number,
  hd: number,
  yTop: number,
  yBot: number,
  beamH: number,
  r: number,
  inset: number,
  extend: number
): void {
  const top = yTop + beamH / 2 // đỉnh trụ = mặt trên xà trên
  const bot = yBot - beamH / 2 - extend // đáy trụ = thò qua xà dưới thêm `extend`
  const postH = top - bot
  const yc = (top + bot) / 2
  for (const [dx, dz] of radialTargets(hw, hd)) {
    const L = Math.hypot(dx, dz)
    if (L < inset + 0.05) continue
    const k = (L - inset) / L
    const post = new THREE.CylinderGeometry(r, r, postH, 12, 1) // trụ tròn (trục Y dọc — không cần xoay)
    post.translate(cx + dx * k, yc, cz + dz * k) // lùi `inset` từ mút xà vào trong
    out.push(post)
  }
}

// 1 thanh chống dạng CHUỖI ĐỐT (box) từ start→end, uốn cong qua quadratic-bezier (control = trung điểm chord +
// bendDir×curve). seg = số đốt; w = tiết diện vuông. curve=0 → thẳng. Mỗi đốt = box xoay theo hướng đốt (local
// +Y → hướng đốt qua quaternion + Matrix4.compose). Nhiều đốt → cong mượt (đốt thẳng nối nhau xấp xỉ cung).
function pushBentStrut(
  out: THREE.BufferGeometry[],
  start: THREE.Vector3,
  end: THREE.Vector3,
  bendDir: THREE.Vector3,
  seg: number,
  curve: number,
  w: number
): void {
  const n = Math.max(1, Math.round(seg))
  const ctrl = start.clone().lerp(end, 0.5).addScaledVector(bendDir, curve)
  const at = (t: number): THREE.Vector3 => {
    const u = 1 - t // quadratic bezier B(t) = u²·start + 2ut·ctrl + t²·end
    return start
      .clone()
      .multiplyScalar(u * u)
      .addScaledVector(ctrl, 2 * u * t)
      .addScaledVector(end, t * t)
  }
  const up = new THREE.Vector3(0, 1, 0)
  let prev = at(0)
  for (let i = 1; i <= n; i++) {
    const cur = at(i / n)
    const d = cur.clone().sub(prev)
    const len = d.length()
    if (len > 1e-4) {
      const box = new THREE.BoxGeometry(w, len, w) // local +Y = trục đốt
      const q = new THREE.Quaternion().setFromUnitVectors(up, d.clone().normalize())
      const m = new THREE.Matrix4().compose(
        prev.clone().lerp(cur, 0.5),
        q,
        new THREE.Vector3(1, 1, 1)
      )
      box.applyMatrix4(m)
      out.push(box)
    }
    prev = cur
  }
}

// 8 thanh chống XIÊN 45°: CHỈ 4 hướng CẠNH (trung điểm cạnh) xiên xuống-vào trục trụ giữa, MỖI cái + 1 BẢN SAO
// xoay ngang 45° quanh tâm → vào 4 vị trí GÓC (cùng profile/chiều dài thanh cạnh, KHÔNG dùng radial góc dài hơn).
// Xuất phát từ trụ dọc (rp = cạnh−inset, cao độ yBot), chuỗi đốt uốn cong (seg/curve).
function pushDiagonalStruts(
  out: THREE.BufferGeometry[],
  cx: number,
  cz: number,
  hw: number,
  hd: number,
  yBot: number,
  w: number,
  seg: number,
  curve: number,
  inset: number
): void {
  const run = (hw + hd) / 2 - inset // 45° → thành phần ngang = đứng = run; S = run·√2
  const c = Math.cos(Math.PI / 4)
  const s = Math.sin(Math.PI / 4)
  const edges: [number, number][] = [
    [hw, 0],
    [-hw, 0],
    [0, hd],
    [0, -hd],
  ]
  for (const [dx, dz] of edges) {
    const L = Math.hypot(dx, dz)
    if (L < inset + 0.1) continue
    const ux = dx / L
    const uz = dz / L
    const rp = L - inset
    for (const rot of [false, true]) {
      const ax = rot ? ux * c - uz * s : ux // bản sao GÓC = xoay radial 45° ngang quanh tâm
      const az = rot ? ux * s + uz * c : uz
      const start = new THREE.Vector3(cx + ax * rp, yBot, cz + az * rp)
      const end = new THREE.Vector3(cx + ax * (rp - run), yBot - run, cz + az * (rp - run))
      const side = new THREE.Vector3(-az, 0, ax) // ngang ⟂ bán kính = pháp tuyến mặt phẳng đứng
      const chord = end.clone().sub(start).normalize()
      const bendDir = new THREE.Vector3().crossVectors(side, chord).normalize()
      pushBentStrut(out, start, end, bendDir, seg, curve, w)
    }
  }
}

// KHUNG-DƯỚI stone-pillar (2 tầng 8 xà + 8 trụ + 8 chống xiên) — MESH RIÊNG + số đo RIÊNG `half` (nửa-span,
// ĐỘC LẬP deck fw/fd → kéo deck KHÔNG ảnh hưởng). beamY = tầng trên (ngay dưới deck). Merge 1 geo. NgQuan 2026-06-05.
function buildUnderstructure(
  cx: number,
  cz: number,
  half: number,
  beamY: number,
  beamH: number,
  beamTk: number,
  h: number,
  opts: PositionedFoundationOpts
): THREE.BufferGeometry {
  const out: THREE.BufferGeometry[] = []
  pushRadialBeams(out, cx, cz, half, half, beamY, beamH, beamTk) // 8 xà tầng trên (span riêng, vuông)
  const lowerY = beamY - (opts.postLength ?? 1500) / 1000 // chiều dài cột → vị trí xà dưới (+ xiên đi theo)
  if (lowerY - beamH / 2 > -h / 2) {
    pushRadialBeams(out, cx, cz, half, half, lowerY, beamH, beamTk) // 8 xà tầng dưới (chỉ khi còn trên đất)
    const postR = (opts.postRadius ?? 67) / 1000 // bán kính cột trụ tròn (slider)
    pushBeamPosts(out, cx, cz, half, half, beamY, lowerY, beamH, postR, 0.3, 0.3) // 8 trụ, lùi 30cm, thò 30cm
    const seg = opts.strutSegments ?? 6
    const curve = (opts.strutCurve ?? 0) / 1000
    pushDiagonalStruts(out, cx, cz, half, half, lowerY, beamTk, seg, curve, 0.3) // 8 chống xiên @45° vào trụ giữa
  }
  const geo = mergeGeometries(out, false) ?? new THREE.BufferGeometry()
  for (const b of out) b.dispose()
  return geo
}

type BoxFn = (w: number, h: number, d: number, x: number, y: number, z: number) => void

// Gom deck (+ lan can) thành 1 geometry. 1 box → trả thẳng (không merge thừa); >1 → merge (BoxGeometry đều
// indexed → an toàn, né KI-004) rồi dispose box tạm.
function mergeDeck(boxes: THREE.BufferGeometry[]): THREE.BufferGeometry {
  if (boxes.length === 1) return boxes[0]
  const geo = mergeGeometries(boxes, false) ?? boxes[0]
  for (const b of boxes) if (b !== geo) b.dispose()
  return geo
}

// Balusters (thanh dọc thưa ~250mm) chạy theo 4 cạnh khung lan can. nx/nz chia đều, bỏ 2 đầu (đã có trụ góc).
function pushBalustersAlong(
  box: BoxFn,
  cx: number,
  cz: number,
  halfL: number,
  halfW: number,
  y: number,
  balH: number,
  sec: number
): void {
  const gap = 0.25
  const nx = Math.max(1, Math.round((2 * halfL) / gap))
  for (let i = 1; i < nx; i++) {
    const x = cx - halfL + (2 * halfL * i) / nx
    box(sec, balH, sec, x, y, cz + halfW)
    box(sec, balH, sec, x, y, cz - halfW)
  }
  const nz = Math.max(1, Math.round((2 * halfW) / gap))
  for (let i = 1; i < nz; i++) {
    const z = cz - halfW + (2 * halfW * i) / nz
    box(sec, balH, sec, cx + halfL, y, z)
    box(sec, balH, sec, cx - halfL, y, z)
  }
}

// LAN CAN 4 mặt quanh deck — frame chữ nhật (halfL×halfW) đặt trên mặt deck (baseY local). 4 trụ góc + thanh
// trên (2 cạnh X + 2 cạnh Z) + balusters thưa. Box gom vào `out` để merge CHUNG deckGeo → dùng deck material.
function pushDeckRailing(
  out: THREE.BufferGeometry[],
  cx: number,
  cz: number,
  halfL: number,
  halfW: number,
  baseY: number,
  railH: number
): void {
  const postSec = 0.08 // 80mm trụ góc
  const railSec = 0.05 // 50mm thanh trên
  const balSec = 0.03 // 30mm baluster
  const topY = baseY + railH
  const box: BoxFn = (w, h, d, x, y, z) => {
    const g = new THREE.BoxGeometry(w, h, d)
    g.translate(x, y, z)
    out.push(g)
  }
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      box(postSec, railH, postSec, cx + sx * halfL, baseY + railH / 2, cz + sz * halfW) // 4 trụ góc
  for (const sz of [-1, 1])
    box(2 * halfL, railSec, railSec, cx, topY - railSec / 2, cz + sz * halfW) // thanh trên cạnh X
  for (const sx of [-1, 1])
    box(railSec, railSec, 2 * halfW, cx + sx * halfL, topY - railSec / 2, cz) // thanh trên cạnh Z
  pushBalustersAlong(
    box,
    cx,
    cz,
    halfL,
    halfW,
    baseY + (railH - railSec) / 2,
    railH - railSec,
    balSec
  )
}

// Deck geometry: tấm gỗ ngang fw×deckThick×fd (+ lan can 4 mặt tuỳ chọn, merge chung → cùng material). baseY
// local mặt deck = h/2 (sau mesh translate → world = h). Tách khỏi makeStonePillarFoundation (complexity ≤10).
function buildDeckGeo(
  fw: number,
  fd: number,
  cx: number,
  cz: number,
  h: number,
  deckThick: number,
  opts: PositionedFoundationOpts
): THREE.BufferGeometry {
  const boxes: THREE.BufferGeometry[] = []
  const deckBox = new THREE.BoxGeometry(fw, deckThick, fd)
  deckBox.translate(cx, h / 2 - deckThick / 2, cz)
  boxes.push(deckBox)
  if (opts.deckRailShow) {
    const halfL = Math.max(0.1, (opts.deckRailLength ?? 5000) / 2000) // mm→m, nửa-dài
    const halfW = Math.max(0.1, (opts.deckRailWidth ?? 5000) / 2000) // mm→m, nửa-rộng
    const railH = Math.max(0.1, (opts.deckRailH ?? 900) / 1000)
    pushDeckRailing(boxes, cx, cz, halfL, halfW, h / 2, railH) // baseY local = mặt deck (h/2)
  }
  return mergeDeck(boxes)
}

// Móng 'stone-pillar' (NgQuan 2026-06-05): 3 MESH RIÊNG material → (1) DECK gỗ ngang (theo fw/fd / mặt phẳng);
// (2) KHUNG-DƯỚI gỗ (2 tầng 8 xà + 8 trụ tròn + 8 chống xiên 45°) — số đo RIÊNG `understructHalf` ĐỘC LẬP deck,
// texture riêng (opts.understructMat); (3) TRỤ ĐÁ tròn giữa. Trụ giữa cao = postH; r = pillarRadius. Cao tổng = foundH (≤4m).
function makeStonePillarFoundation(
  fw: number,
  fd: number,
  cx: number,
  cz: number,
  opts: PositionedFoundationOpts
): PartResult {
  const h = opts.h
  const deckThick = Math.min(0.12, h * 0.5)
  const postH = Math.max(0.05, h - deckThick) // trụ đá chạy từ đất tới đáy deck
  // (1) DECK — mesh riêng, theo mặt-phẳng fw/fd (+ LAN CAN 4 mặt tuỳ chọn, merge chung → dùng deck material).
  const deckGeo = buildDeckGeo(fw, fd, cx, cz, h, deckThick, opts)
  const deckMat = opts.woodMaterial ?? new THREE.MeshToonMaterial({ color: 0x9b6b43 }) // gỗ texture / nâu phẳng
  // (2) KHUNG-DƯỚI — mesh riêng, số đo RIÊNG (half ĐỘC LẬP deck; mặc định chuẩn 2.5m nửa-span).
  const beamTk = (opts.beamWidth ?? 100) / 1000
  const beamH = Math.min((opts.beamHeight ?? 120) / 1000, postH)
  const beamY = h / 2 - deckThick - beamH / 2
  const half = opts.understructHalf ?? 2.5
  const underGeo = buildUnderstructure(cx, cz, half, beamY, beamH, beamTk, h, opts)
  const underMat = opts.understructMat ?? new THREE.MeshToonMaterial({ color: 0x9b6b43 }) // texture/màu RIÊNG deck
  // (3) TRỤ ĐÁ giữa — bán kính clamp gọn trong deck. Tâm trụ trên lòng hồ → đâm sâu thêm tới đáy.
  const r = Math.max(0.15, Math.min((opts.pillarRadius ?? 500) / 1000, Math.min(fw, fd) / 2 - 0.05))
  const drop = postDropAt(cx, cz, opts)
  const pillarGeo = new THREE.CylinderGeometry(r, r, postH + drop, 20, 1)
  pillarGeo.translate(cx, -h / 2 + postH / 2 - drop / 2, cz)
  const stoneMat = new THREE.MeshToonMaterial({ color: COL_STONE_PILLAR })
  const deckMesh = new THREE.Mesh(deckGeo, deckMat)
  const underMesh = new THREE.Mesh(underGeo, underMat)
  const stoneMesh = new THREE.Mesh(pillarGeo, stoneMat)
  for (const m of [deckMesh, underMesh, stoneMesh]) {
    m.rotation.y = (opts.rotY * Math.PI) / 180
    m.position.set(opts.worldX, h / 2, opts.worldZ)
    m.castShadow = true
    m.receiveShadow = true
  }
  // Material injected (caller-owned) → KHÔNG push mats (caller dispose); stoneMat + MeshToon tự tạo → push.
  const mats: THREE.Material[] = [stoneMat]
  if (!opts.woodMaterial) mats.push(deckMat)
  if (!opts.understructMat) mats.push(underMat)
  return { geos: [deckGeo, underGeo, pillarGeo], mats, meshes: [deckMesh, underMesh, stoneMesh] }
}

// Shape round: outline tim-tường nở ĐỀU ra `grow` m (mặt ngoài tường + overhang) — N-gon đều quanh tâm
// nên offset cạnh ≈ scale bán kính quanh gốc (outline đã centered).
function expandOutline(outline: [number, number][], grow: number): [number, number][] {
  const r = outline.reduce((s, [x, z]) => s + Math.hypot(x, z), 0) / outline.length
  const k = (Math.max(r, 0.01) + grow) / Math.max(r, 0.01)
  return outline.map(([x, z]) => [x * k, z * k])
}

export function makePositionedFoundation(opts: PositionedFoundationOpts): PartResult {
  const { oh } = opts
  // base mỗi cạnh = bbox/2 + wallDepth/2 (mặt ngoài tường) → tổng base 2 cạnh = wallDepth.
  // Nhô 4 hướng cộng thêm; dựng đối xứng rồi translate tâm để wall/shape KHÔNG bị kéo theo.
  const fw = opts.bboxW + opts.wallDepth + oh.e + oh.w
  const fd = opts.bboxD + opts.wallDepth + oh.n + oh.s
  const cx = (oh.e - oh.w) / 2 // đông nhô nhiều → lệch +X (local, trước rotY)
  const cz = (oh.n - oh.s) / 2 // bắc nhô nhiều → lệch +Z
  if (opts.foundType === 'wood-deck') return makeWoodDeckFoundation(fw, fd, cx, cz, opts) // #6 sàn gỗ Nhật
  if (opts.foundType === 'stone-pillar') return makeStonePillarFoundation(fw, fd, cx, cz, opts) // sàn gỗ + trụ đá giữa
  // Có lỗ (shape lồng) → ExtrudeGeometry khoét (overhang bake vào outer rect qua ocx/ocz, lỗ giữ local thật);
  // không → BoxGeometry + translate như cũ. Lỗ vẫn khớp shape nhỏ bất kể overhang.
  // Shape round: móng đa giác = outline nở wallDepth/2 + overhang trung bình 4 hướng (đa giác không có hướng N/E/S/W riêng).
  const outline = opts.outline?.length
    ? expandOutline(opts.outline, opts.wallDepth / 2 + (oh.n + oh.e + oh.s + oh.w) / 4)
    : undefined
  const geo =
    opts.openings?.length || outline
      ? makeSlabWithHoles(fw, fd, opts.h, opts.openings ?? [], cx, cz, outline)
      : boxFoundationGeo(fw, opts.h, fd, cx, cz)
  const mat = new THREE.MeshToonMaterial({
    color: COL_FOUNDATION,
    polygonOffset: true,
    polygonOffsetFactor: 2,
    polygonOffsetUnits: 2,
  })
  const m = new THREE.Mesh(geo, mat)
  m.rotation.y = (opts.rotY * Math.PI) / 180
  // Bottom tại y=0 — toàn bộ foundation nằm trên mặt phẳng XZ
  m.position.set(opts.worldX, opts.h / 2, opts.worldZ)
  m.receiveShadow = true
  return { geos: [geo], mats: [mat], meshes: [m] }
}

// Biên ngoài slab/móng: đa giác outline (shape round N-gon) hoặc rect w×d. Quy ước shape.y = -localZ
// (do rotateX(-PI/2) bên dưới); (ocx,ocz) dời tâm outer (overhang móng lệch 4 hướng).
function outerBoundary(
  w: number,
  d: number,
  ocx: number,
  ocz: number,
  outline?: [number, number][]
): THREE.Shape {
  const shape = new THREE.Shape()
  if (outline && outline.length >= 3) {
    outline.forEach(([x, z], i) => {
      if (i === 0) shape.moveTo(x + ocx, -z - ocz)
      else shape.lineTo(x + ocx, -z - ocz)
    })
  } else {
    shape.moveTo(-w / 2 + ocx, -d / 2 - ocz)
    shape.lineTo(w / 2 + ocx, -d / 2 - ocz)
    shape.lineTo(w / 2 + ocx, d / 2 - ocz)
    shape.lineTo(-w / 2 + ocx, d / 2 - ocz)
  }
  shape.closePath()
  return shape
}

// Sàn có lỗ khoét — dùng ExtrudeGeometry từ THREE.Shape với holes
// Shape định nghĩa trong mặt phẳng XY (shape.x=worldX, shape.y→worldZ sau rotateX)
// ExtrudeGeometry extrude theo +Z (local) → rotateX(-PI/2) nằm ngang
function makeSlabWithHoles(
  w: number,
  d: number,
  thick: number,
  holes: SlabOpening[],
  ocx = 0, // dời tâm OUTER rect (overhang móng) — lỗ giữ toạ độ local thật nên vẫn khớp shape lồng
  ocz = 0,
  outline?: [number, number][] // biên đa giác (shape round) thay rect
): THREE.BufferGeometry {
  const shape = outerBoundary(w, d, ocx, ocz, outline)
  for (const op of holes) {
    // Rect lỗ xoay quanh tâm (op.rot, Three Ry). shape.y = -localZ (do rotateX(-PI/2)).
    // slab-local: sx = ex*cos + ez*sin + op.x ; sz = -ex*sin + ez*cos + op.z
    const rot = ((op.rot ?? 0) * Math.PI) / 180
    const c = Math.cos(rot)
    const s = Math.sin(rot)
    const hw = op.w / 2
    const hd = op.d / 2
    // Thứ tự góc giữ winding khớp bản axis-aligned cũ (CCW trong shape XY)
    const corners: [number, number][] = [
      [-hw, hd],
      [hw, hd],
      [hw, -hd],
      [-hw, -hd],
    ]
    const hole = new THREE.Path()
    corners.forEach(([ex, ez], i) => {
      const sx = ex * c + ez * s + op.x
      const sz = -ex * s + ez * c + op.z
      if (i === 0) hole.moveTo(sx, -sz)
      else hole.lineTo(sx, -sz)
    })
    hole.closePath()
    shape.holes.push(hole)
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false })
  geo.rotateX(-Math.PI / 2) // lay flat: shape XY → world XZ; extrude dir → world Y
  geo.translate(0, -thick / 2, 0) // center at y=0; mesh.position sẽ set yBase+thick/2
  return geo
}

export function makePositionedSlab(opts: PositionedSlabOpts): PartResult {
  const geo =
    opts.openings?.length || opts.outline
      ? makeSlabWithHoles(
          opts.bboxW,
          opts.bboxD,
          opts.thick,
          opts.openings ?? [],
          0,
          0,
          opts.outline
        )
      : new THREE.BoxGeometry(opts.bboxW, opts.thick, opts.bboxD)
  // material ngoài (gỗ từ WallMaterialCache) → cache SỞ HỮU dispose ⇒ KHÔNG đưa vào mats; không set → MeshToon bê tông.
  const mat =
    opts.material ??
    new THREE.MeshToonMaterial({
      color: COL_SLAB,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    })
  const m = new THREE.Mesh(geo, mat)
  m.rotation.y = (opts.rotY * Math.PI) / 180
  m.position.set(opts.worldX, (opts.yBase ?? 0) + opts.thick / 2, opts.worldZ)
  m.receiveShadow = true
  return { geos: [geo], mats: opts.material ? [] : [mat], meshes: [m] }
}

export function makePositionedColumn(opts: PositionedColumnOpts): PartResult {
  const isRound = opts.type === 'round'
  const geo = isRound
    ? new THREE.CylinderGeometry(opts.r, opts.r, opts.h, 16, 1)
    : new THREE.BoxGeometry(opts.size, opts.h, opts.size)
  const mat = new THREE.MeshToonMaterial({ color: COL_COLUMN_AP })
  const m = new THREE.Mesh(geo, mat)
  m.position.set(opts.worldX, (opts.yBase ?? 0) + opts.h / 2, opts.worldZ)
  m.castShadow = true
  return { geos: [geo], mats: [mat], meshes: [m] }
}

export interface PositionedBalconyOpts {
  wallX: number // world X tâm tường gắn
  wallZ: number
  wallRotDeg: number // heading tường (độ)
  wallDepth: number // m — độ dày tường (ban công bắt đầu từ mặt ngoài +Z local)
  alongOffset: number // m — tâm ban công dọc tường (local x, đã trừ w/2)
  width: number // m
  projection: number // m — độ vươn ra ngoài
  y: number // world Y — mặt sàn ban công (slab nằm ngay dưới mặt này)
  slabT: number // m
  railH: number // m
  railStyle?: 'solid' | 'metal-bar' | 'glass-frame' | 'wood-bar' // 'solid'=3 vách bê tông; metal-bar/glass-frame=khung tròn; wood-bar=gỗ vuông bo cạnh
}

const COL_BAL_METAL = 0x9097a0 // thép lan can — xám xanh, metalness cao (phản chiếu IBL)
const COL_BAL_GLASS = 0xbfd8e0 // kính lan can — xanh nhạt, trong + phản chiếu IBL
const COL_BAL_WOOD = 0x9b6b43 // gỗ lan can — nâu ấm (như slab gỗ demo)

// 1 run lan can (đoạn thẳng XZ local): [ax, az, bx, bz]. 3 mặt = trước + 2 đầu (mặt sau giáp tường, hở).
type Run = [number, number, number, number]

// Ban công: sàn box vươn ra mặt ngoài (+Z local) 1 tường + lan can 3 phía (trước + 2 đầu). Group đặt tâm
// tường, xoay theo heading → con dựng trong local frame (x dọc tường, z ra ngoài, y world). railStyle:
// 'solid' = 3 vách bê tông đặc (cũ); 'metal-bar' = khung tròn + thanh dọc; 'glass-frame' = khung tròn + 3 mặt kính.
export function makePositionedBalcony(opts: PositionedBalconyOpts): PartResult {
  const grp = new THREE.Group()
  grp.position.set(opts.wallX, 0, opts.wallZ)
  grp.rotation.y = (opts.wallRotDeg * Math.PI) / 180
  const z0 = opts.wallDepth / 2 // mặt ngoài tường
  const cz = z0 + opts.projection / 2 // tâm ban công theo z local
  const geos: THREE.BufferGeometry[] = []
  const mats: THREE.Material[] = []
  const concrete = new THREE.MeshToonMaterial({
    color: COL_SLAB,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  })
  mats.push(concrete)
  // adder chung: thêm mesh vào group + track geo (mat track riêng). rx/rz = xoay trục (cylinder ngang).
  const add = (
    g: THREE.BufferGeometry,
    mat: THREE.Material,
    lx: number,
    ly: number,
    lz: number,
    rx = 0,
    rz = 0
  ): void => {
    geos.push(g)
    const m = new THREE.Mesh(g, mat)
    m.position.set(lx, ly, lz)
    if (rx) m.rotation.x = rx
    if (rz) m.rotation.z = rz
    m.castShadow = true
    m.receiveShadow = true
    grp.add(m)
  }
  // sàn (mọi style)
  add(
    new THREE.BoxGeometry(opts.width, opts.slabT, opts.projection),
    concrete,
    opts.alongOffset,
    opts.y - opts.slabT / 2,
    cz
  )

  const style = opts.railStyle ?? 'solid'
  if (style === 'solid') buildSolidRails(add, concrete, opts, z0, cz)
  else buildFancyRails(add, opts, mats, z0, style) // metal-bar | glass-frame | wood-bar (khung + thanh/kính)
  return { geos, mats, meshes: [grp] }
}

// Lan can KHÔNG-solid (metal-bar | glass-frame | wood-bar): 3 mặt (trước + 2 đầu) = khung (railKit) + thanh dọc
// HOẶC tấm kính. Tách khỏi makePositionedBalcony để hàm đó ≤50 dòng (Rule-50). add/mats do caller chia sẻ.
function buildFancyRails(
  add: BalconyAdder,
  opts: PositionedBalconyOpts,
  mats: THREE.Material[],
  z0: number,
  style: 'metal-bar' | 'glass-frame' | 'wood-bar'
): void {
  // 3 mặt lan can (local XZ): trước (z xa) + 2 đầu (x trái/phải, z gần→xa).
  const x0 = opts.alongOffset - opts.width / 2
  const x1 = opts.alongOffset + opts.width / 2
  const zF = z0 + opts.projection
  const sides: Run[] = [
    [x0, zF, x1, zF],
    [x0, z0, x0, zF],
    [x1, z0, x1, zF],
  ]
  const kit = railKit(style, mats) // metal tròn (metal-bar/glass-frame) | gỗ vuông bo cạnh (wood-bar)
  buildFrame(add, kit, sides, opts.y, opts.railH)
  if (style === 'glass-frame') {
    const glass = new THREE.MeshStandardMaterial({
      color: COL_BAL_GLASS,
      metalness: 0,
      roughness: 0.05,
      transparent: true,
      opacity: 0.32, // trong suốt thấy xuyên; roughness thấp → phản chiếu IBL (room env) = "kính phản chiếu"
    })
    mats.push(glass)
    buildGlassPanels(add, glass, sides, opts.y, opts.railH)
  } else {
    buildBars(add, kit, sides, opts.y, opts.railH) // metal-bar (tròn ×1) | wood-bar (vuông bo, thưa ×2)
  }
}

// Bộ thông số 1 kiểu khung lan can: hình (tròn cylinder / vuông RoundedBox), bán kính rail/cột/thanh,
// khoảng cách thanh dọc, có ball-joint góc không (chỉ tròn), bán kính bo cạnh (chỉ vuông).
interface RailKit {
  mat: THREE.Material
  square: boolean // true = gỗ vuông (RoundedBox bo cạnh); false = kim loại tròn (Cylinder)
  railR: number // nửa bề rail ngang
  postR: number // nửa bề cột góc
  barR: number // nửa bề thanh dọc
  barGap: number // m — khoảng cách thanh dọc (wood ×2 = thưa hơn)
  joints: boolean // ball-joint bo góc (chỉ tròn cần — vuông đã khít)
  bevel: number // m — bo cạnh RoundedBox (chỉ square)
}

// Tạo material + đẩy vào mats, trả RailKit theo style. wood-bar = gỗ vuông bo cạnh, thanh thưa gấp đôi.
function railKit(style: 'metal-bar' | 'glass-frame' | 'wood-bar', mats: THREE.Material[]): RailKit {
  if (style === 'wood-bar') {
    const wood = new THREE.MeshStandardMaterial({
      color: COL_BAL_WOOD,
      metalness: 0,
      roughness: 0.72,
    })
    mats.push(wood)
    return {
      mat: wood,
      square: true,
      railR: 0.028,
      postR: 0.032,
      barR: 0.018,
      barGap: 0.24,
      joints: false,
      bevel: 0.008,
    }
  }
  const metal = new THREE.MeshStandardMaterial({
    color: COL_BAL_METAL,
    metalness: 0.9,
    roughness: 0.32,
  })
  mats.push(metal)
  return {
    mat: metal,
    square: false,
    railR: 0.022,
    postR: 0.03,
    barR: 0.012,
    barGap: 0.12,
    joints: true,
    bevel: 0,
  }
}

// Adder closure ký hiệu chung cho các helper lan can.
type BalconyAdder = (
  g: THREE.BufferGeometry,
  mat: THREE.Material,
  lx: number,
  ly: number,
  lz: number,
  rx?: number,
  rz?: number
) => void

// 'solid' (cũ): 3 vách bê tông đặc (trước + 2 đầu).
function buildSolidRails(
  add: BalconyAdder,
  mat: THREE.Material,
  opts: PositionedBalconyOpts,
  z0: number,
  cz: number
): void {
  const railT = 0.06
  const ry = opts.y + opts.railH / 2
  add(
    new THREE.BoxGeometry(opts.width, opts.railH, railT),
    mat,
    opts.alongOffset,
    ry,
    z0 + opts.projection - railT / 2
  ) // trước
  add(
    new THREE.BoxGeometry(railT, opts.railH, opts.projection),
    mat,
    opts.alongOffset - opts.width / 2 + railT / 2,
    ry,
    cz
  ) // đầu trái
  add(
    new THREE.BoxGeometry(railT, opts.railH, opts.projection),
    mat,
    opts.alongOffset + opts.width / 2 - railT / 2,
    ry,
    cz
  ) // đầu phải
}

const BAL_RAIL_BOT = 0.05 // m — cao độ rail dưới so mặt sàn ban công (chia chung balusters)

// Khung lan can (kit-based): rail trên + dưới (beam ngang mỗi run) + 4 cột góc + BALL-JOINT bo góc (chỉ
// kit tròn — vuông đã khít nhờ cột góc + bo cạnh). Tròn = cylinder; vuông = RoundedBox bo cạnh (gỗ).
function buildFrame(
  add: BalconyAdder,
  kit: RailKit,
  sides: Run[],
  yBase: number,
  railH: number
): void {
  const yTop = yBase + railH
  const yBot = yBase + BAL_RAIL_BOT
  for (const run of sides) {
    addBeam(add, kit, run, yTop) // rail trên
    addBeam(add, kit, run, yBot) // rail dưới (sát sàn)
  }
  // 4 góc khung: 2 đầu run "trước" + 2 đầu giáp tường (điểm gần của 2 run đầu).
  const corners: [number, number][] = [
    [sides[0][0], sides[0][1]],
    [sides[0][2], sides[0][3]],
    [sides[1][0], sides[1][1]],
    [sides[2][0], sides[2][1]],
  ]
  for (const [px, pz] of corners) {
    addPost(add, kit, px, pz, yBase, railH) // cột góc
    if (kit.joints) {
      add(new THREE.SphereGeometry(kit.postR, 10, 8), kit.mat, px, yTop, pz) // bo tròn góc rail TRÊN
      add(new THREE.SphereGeometry(kit.postR, 10, 8), kit.mat, px, yBot, pz) // bo tròn góc rail DƯỚI
    }
  }
}

// 1 rail NGANG theo run (axis-aligned). Tròn = cylinder xoay; vuông = RoundedBox dài theo trục run (no rotate).
function addBeam(add: BalconyAdder, kit: RailKit, run: Run, y: number): void {
  const [ax, az, bx, bz] = run
  const len = Math.hypot(bx - ax, bz - az)
  const alongX = Math.abs(bx - ax) > Math.abs(bz - az)
  const cx = (ax + bx) / 2
  const cz = (az + bz) / 2
  if (kit.square) {
    const s = kit.railR * 2
    const geo = alongX
      ? new RoundedBoxGeometry(len, s, s, 2, kit.bevel)
      : new RoundedBoxGeometry(s, s, len, 2, kit.bevel)
    add(geo, kit.mat, cx, y, cz)
  } else {
    add(
      new THREE.CylinderGeometry(kit.railR, kit.railR, len, 8),
      kit.mat,
      cx,
      y,
      cz,
      alongX ? 0 : Math.PI / 2,
      alongX ? Math.PI / 2 : 0
    )
  }
}

// 1 cột ĐỨNG ở góc. Tròn = cylinder; vuông = RoundedBox bo cạnh.
function addPost(
  add: BalconyAdder,
  kit: RailKit,
  px: number,
  pz: number,
  yBase: number,
  railH: number
): void {
  const cy = yBase + railH / 2
  if (kit.square) {
    const s = kit.postR * 2
    add(new RoundedBoxGeometry(s, railH, s, 2, kit.bevel), kit.mat, px, cy, pz)
  } else {
    add(new THREE.CylinderGeometry(kit.postR, kit.postR, railH, 8), kit.mat, px, cy, pz)
  }
}

// Thanh dọc (balusters) cách `kit.barGap` dọc mỗi run, nối ĐÚNG tâm rail dưới → tâm rail trên (chọc nhẹ vào
// 2 rail → khít). Bỏ 2 đầu (cột góc đã có). Tròn = cylinder; vuông = RoundedBox bo cạnh (gỗ, thưa gấp đôi).
function buildBars(
  add: BalconyAdder,
  kit: RailKit,
  sides: Run[],
  yBase: number,
  railH: number
): void {
  const yTop = yBase + railH
  const yBot = yBase + BAL_RAIL_BOT
  const h = yTop - yBot
  const cy = (yTop + yBot) / 2
  for (const [ax, az, bx, bz] of sides) {
    const len = Math.hypot(bx - ax, bz - az)
    const n = Math.max(2, Math.round(len / kit.barGap))
    for (let i = 1; i < n; i++) {
      const t = i / n
      addBar(add, kit, ax + (bx - ax) * t, az + (bz - az) * t, cy, h)
    }
  }
}

// 1 thanh dọc. Tròn = cylinder mảnh; vuông = RoundedBox bo cạnh (đừng sắc).
function addBar(
  add: BalconyAdder,
  kit: RailKit,
  px: number,
  pz: number,
  cy: number,
  h: number
): void {
  if (kit.square) {
    const s = kit.barR * 2
    add(new RoundedBoxGeometry(s, h, s, 2, kit.bevel), kit.mat, px, cy, pz)
  } else {
    add(new THREE.CylinderGeometry(kit.barR, kit.barR, h, 6), kit.mat, px, cy, pz)
  }
}

// 3 tấm KÍNH (mỗi run 1 tấm box mỏng) giữa khung, hở mép trên/dưới cho rail. Trong + phản chiếu IBL.
function buildGlassPanels(
  add: BalconyAdder,
  mat: THREE.Material,
  sides: Run[],
  yBase: number,
  railH: number
): void {
  const gh = railH - 0.1 // hở mép trên/dưới
  for (const [ax, az, bx, bz] of sides) {
    const len = Math.hypot(bx - ax, bz - az)
    const alongX = Math.abs(bx - ax) > Math.abs(bz - az)
    const gw = Math.max(0.1, len - 0.06) // hở 2 mép cho cột góc
    const geo = alongX ? new THREE.BoxGeometry(gw, gh, 0.02) : new THREE.BoxGeometry(0.02, gh, gw)
    add(geo, mat, (ax + bx) / 2, yBase + railH / 2, (az + bz) / 2)
  }
}

// ── Stairs (ArchPlanLab) — N bậc box dần lên, 1 tầng, xoay tự do quanh Y ──────
// Outer group: world + rotation.y = rotY (theo shape). Inner group: tại tâm
// footprint (local) + rotation.y = rotDeg → bậc dựng dọc +X của inner; Three lo
// phần xoay. Footprint (runL × width) chiếu thẳng lên Y = lỗ slab tầng trên.

const COL_STAIRS = 0xb0a89c // bê tông bậc thang xám ấm

export interface PositionedStairsOpts {
  localX: number // m — footprint center, local to shape center (trước rotation shape)
  localZ: number
  runL: number // m — chiều dài chạy bậc (dọc +X cục bộ trước khi xoay rotDeg)
  width: number // m — bề rộng cầu thang
  totalH: number // m — chiều cao leo (1 tầng)
  steps: number
  rotDeg: number // độ — xoay cầu thang quanh Y, quanh tâm footprint
  worldX: number // m — tâm shape (world)
  worldZ: number
  rotY: number // deg — rotation của shape
  yBase: number // m — cao độ sàn (đáy bậc)
  style?: 'solid' | 'wood-plank' | 'wood-float' | 'wood-center' | 'glass-metal' // #8: đặc | ván gỗ đà-bên | gỗ nổi | gỗ đà-GIỮA | kính + đà kim-loại GIỮA
}

// #8 Bậc ĐẶC (bê tông): mỗi bậc box từ SÀN lên mặt bậc → khối liền. (kiểu mặc định cũ)
function solidStepGeos(
  inner: THREE.Group,
  mat: THREE.Material,
  opts: PositionedStairsOpts,
  n: number,
  riser: number,
  tread: number
): THREE.BufferGeometry[] {
  const geos: THREE.BufferGeometry[] = []
  for (let i = 0; i < n; i++) {
    const stepH = (i + 1) * riser
    const ax = -opts.runL / 2 + (i + 0.5) * tread
    const geo = new THREE.BoxGeometry(tread, stepH, opts.width)
    geos.push(geo)
    const m = new THREE.Mesh(geo, mat)
    m.position.set(ax, stepH / 2, 0)
    m.castShadow = true
    m.receiveShadow = true
    inner.add(m)
  }
  return geos
}

// #8 Bậc VÁN MỎNG xếp dần (gỗ/kính): mỗi bậc 1 tấm ~40mm ở cao độ bậc (hở dưới = open riser).
// stringerPos: 'none' (ván nổi) | 'side' (2 đà 2 BÊN) | 'center' (2 đà sát TÂM cách 1 khe nhỏ ~100mm — nghệ thuật).
// treadMat (gỗ/kính) + stringerMat (gỗ/kim loại) RIÊNG → kiểu kính+kim-loại.
function plankStairGeos(
  inner: THREE.Group,
  treadMat: THREE.Material,
  stringerMat: THREE.Material,
  opts: PositionedStairsOpts,
  rt: { n: number; riser: number; tread: number },
  stringerPos: 'none' | 'side' | 'center'
): THREE.BufferGeometry[] {
  const geos: THREE.BufferGeometry[] = []
  const plankT = 0.04 // ván dày 40mm
  for (let i = 0; i < rt.n; i++) {
    const ax = -opts.runL / 2 + (i + 0.5) * rt.tread
    const geo = new THREE.BoxGeometry(rt.tread, plankT, opts.width)
    geos.push(geo)
    const m = new THREE.Mesh(geo, treadMat)
    m.position.set(ax, (i + 1) * rt.riser - plankT / 2, 0) // mặt ván tại cao độ bậc
    m.castShadow = true
    m.receiveShadow = true
    inner.add(m)
  }
  if (stringerPos === 'none') return geos
  const len = Math.hypot(opts.runL, opts.totalH) // đà chạy chéo sàn→đỉnh
  const ang = Math.atan2(opts.totalH, opts.runL)
  const strT = 0.04
  const zpos = stringerPos === 'side' ? opts.width / 2 - strT / 2 : 0.07 // center: 2 đà cách tâm 70mm (khe ~100mm)
  for (const sz of [-1, 1]) {
    const geo = new THREE.BoxGeometry(len, 0.14, strT)
    geo.rotateZ(ang)
    geos.push(geo)
    const m = new THREE.Mesh(geo, stringerMat)
    m.position.set(0, opts.totalH / 2, sz * zpos)
    m.castShadow = true
    m.receiveShadow = true
    inner.add(m)
  }
  return geos
}

// Vật liệu bậc: gỗ (toon nâu) · kính (trong mờ xanh) · kim loại (metalness cao).
function stairWoodMat(): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({
    color: 0x9b6b43,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  })
}
function stairGlassMat(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0xbfe0ee,
    transparent: true,
    opacity: 0.34,
    roughness: 0.08,
    metalness: 0,
  })
}
function stairMetalMat(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: 0x8a8f94, metalness: 0.9, roughness: 0.35 })
}

// Map style → vị trí đà: nổi (none) | 2 bên (side) | 2 giữa (center, gồm wood-center + glass-metal).
function stringerPosOf(style: string): 'none' | 'side' | 'center' {
  if (style === 'wood-float') return 'none'
  if (style === 'wood-plank') return 'side'
  return 'center' // wood-center, glass-metal
}

export function makePositionedStairs(opts: PositionedStairsOpts): PartResult {
  const outer = new THREE.Group()
  outer.position.set(opts.worldX, opts.yBase, opts.worldZ)
  outer.rotation.y = (opts.rotY * Math.PI) / 180
  const inner = new THREE.Group()
  inner.position.set(opts.localX, 0, opts.localZ)
  inner.rotation.y = (opts.rotDeg * Math.PI) / 180
  outer.add(inner)

  const style = opts.style ?? 'solid'
  const n = Math.max(2, Math.round(opts.steps))
  const rt = { n, riser: opts.totalH / n, tread: opts.runL / n }

  if (style === 'solid') {
    const mat = new THREE.MeshToonMaterial({
      color: COL_STAIRS,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    })
    return {
      geos: solidStepGeos(inner, mat, opts, n, rt.riser, rt.tread),
      mats: [mat],
      meshes: [outer],
    }
  }
  // ván: mặt = gỗ/kính, đà = gỗ/kim loại theo style. Gỗ dùng CHUNG 1 material cho mặt + đà.
  const treadMat = style === 'glass-metal' ? stairGlassMat() : stairWoodMat()
  const stringerMat = style === 'glass-metal' ? stairMetalMat() : treadMat
  const geos = plankStairGeos(inner, treadMat, stringerMat, opts, rt, stringerPosOf(style))
  const mats = stringerMat === treadMat ? [treadMat] : [treadMat, stringerMat]
  return { geos, mats, meshes: [outer] }
}

// ── Public API ─────────────────────────────────────────────────────────────────

export function makeStructure(cfg: StructureConfig): PartResult {
  // polygonOffset: foundation là lớp thấp nhất — wall panels, columns đều trên nó
  const matFound = new THREE.MeshToonMaterial({
    color: COL_FOUNDATION,
    polygonOffset: true,
    polygonOffsetFactor: 2,
    polygonOffsetUnits: 2,
  })
  const matCol = new THREE.MeshToonMaterial({
    color: cfg.columnType === 0 ? COL_COLUMN_ROUND : COL_COLUMN_SQ,
  })
  const matBand = new THREE.MeshToonMaterial({ color: COL_FLOOR_BAND })
  const matBeam = new THREE.MeshToonMaterial({ color: COL_BEAM })

  const parts = [
    buildFoundation(cfg, matFound),
    buildColumns(cfg, matCol),
    buildFloorBands(cfg, matBand),
    buildBeams(cfg, matBeam),
  ]

  return {
    geos: parts.flatMap((p) => p.geos),
    mats: [matFound, matCol, matBand, matBeam],
    meshes: parts.flatMap((p) => p.meshes),
  }
}
