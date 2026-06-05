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
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'

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
  foundType?: 'concrete' | 'wood-deck' | 'stone-pillar' // bê tông khối | sàn gỗ Nhật (lưới cột) | sàn gỗ trên 1 trụ đá giữa + váy
  deckPostSpacing?: number // m? KHÔNG — mm (đồng bộ state); #10 khoảng cách lưới cột deck (default 1500mm)
  pillarRadius?: number // mm — bán kính trụ đá giữa (stone-pillar); cao trụ = h. Default 500
  beamWidth?: number // mm — bề rộng tiết diện 16 xà (stone-pillar). Default 100
  beamHeight?: number // mm — bề cao tiết diện 16 xà (stone-pillar); kẹp ≤ khoảng hở dưới deck. Default 120
  strutSegments?: number // số ĐỐT mỗi thanh chống xiên (stone-pillar): nhiều = cong mượt. Default 6
  strutCurve?: number // mm — độ CONG thanh chống xiên (bulge control-point); 0 = thẳng. Default 0
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

// #6 Móng sàn gỗ Nhật (engawa/高床式): MẶT GỖ NGANG (deck) ở đỉnh + 4 CỘT VUÔNG ở 4 góc (thay 4 vách bê
// tông). deck dày ~120mm đỡ tường; cột vuông 120mm chống từ đất lên đáy deck. Merge 1 mesh gỗ nâu (toon).
function makeWoodDeckFoundation(
  fw: number,
  fd: number,
  cx: number,
  cz: number,
  opts: PositionedFoundationOpts
): PartResult {
  const h = opts.h
  const deckThick = Math.min(0.12, h * 0.5) // ván deck ~120mm (hoặc nửa chiều cao nếu móng thấp)
  const postSize = 0.12 // cột vuông 120mm
  const postH = Math.max(0.05, h - deckThick)
  const boxes: THREE.BufferGeometry[] = []
  const deck = new THREE.BoxGeometry(fw, deckThick, fd) // mặt gỗ ngang ở đỉnh
  deck.translate(cx, h / 2 - deckThick / 2, cz)
  boxes.push(deck)
  // #10 Lưới cột ĐỀU theo diện tích deck (gồm 4 góc). Mật độ = deckPostSpacing (mm→m). Merge nên rẻ (12 tri/cột, 1 draw).
  const spacing = Math.max(0.6, (opts.deckPostSpacing ?? 1500) / 1000)
  const nx = Math.max(2, Math.round(fw / spacing) + 1)
  const nz = Math.max(2, Math.round(fd / spacing) + 1)
  const x0 = cx - fw / 2 + postSize / 2
  const z0 = cz - fd / 2 + postSize / 2
  const sx = nx > 1 ? (fw - postSize) / (nx - 1) : 0
  const sz = nz > 1 ? (fd - postSize) / (nz - 1) : 0
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const post = new THREE.BoxGeometry(postSize, postH, postSize)
      post.translate(x0 + i * sx, -h / 2 + postH / 2, z0 + j * sz)
      boxes.push(post)
    }
  }
  const geo = mergeGeometries(boxes, false) ?? new THREE.BufferGeometry()
  for (const b of boxes) b.dispose()
  const mat = new THREE.MeshToonMaterial({ color: 0x9b6b43 }) // gỗ nâu (demo)
  const m = new THREE.Mesh(geo, mat)
  m.rotation.y = (opts.rotY * Math.PI) / 180
  m.position.set(opts.worldX, h / 2, opts.worldZ)
  m.castShadow = true
  m.receiveShadow = true
  return { geos: [geo], mats: [mat], meshes: [m] }
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
      const m = new THREE.Matrix4().compose(prev.clone().lerp(cur, 0.5), q, new THREE.Vector3(1, 1, 1))
      box.applyMatrix4(m)
      out.push(box)
    }
    prev = cur
  }
}

// 8 thanh chống XIÊN từ TRUNG ĐIỂM mỗi xà dưới đâm vào TRỤC trụ giữa @45° (drop = run = L/2). Dạng chuỗi đốt
// UỐN CONG được (seg = số đốt, curve = độ cong m). Bend trong MẶT PHẲNG ĐỨNG chứa thanh (bendDir = side⟂radial × chord).
function pushDiagonalStruts(
  out: THREE.BufferGeometry[],
  cx: number,
  cz: number,
  hw: number,
  hd: number,
  yBot: number,
  w: number,
  seg: number,
  curve: number
): void {
  for (const [dx, dz] of radialTargets(hw, hd)) {
    const L = Math.hypot(dx, dz)
    if (L < 0.2) continue
    const start = new THREE.Vector3(cx + dx / 2, yBot, cz + dz / 2) // trung điểm xà dưới
    const end = new THREE.Vector3(cx, yBot - L / 2, cz) // trục trụ giữa, 45°
    const side = new THREE.Vector3(-dz / L, 0, dx / L) // ngang ⟂ bán kính = pháp tuyến mặt phẳng đứng
    const chord = end.clone().sub(start).normalize()
    const bendDir = new THREE.Vector3().crossVectors(side, chord).normalize() // ⟂ chord, trong mặt phẳng đứng
    pushBentStrut(out, start, end, bendDir, seg, curve, w)
  }
}

// Móng 'stone-pillar' (NgQuan 2026-06-05): sàn gỗ NGANG ở đỉnh + 1 TRỤ ĐÁ TRÒN TO ở giữa (đỡ chính) + 2 TẦNG
// XÀ NGANG gỗ dưới đáy deck TOẢ ĐỒNG TÂM ra 4 GÓC + 4 TRUNG ĐIỂM cạnh (tầng dưới nhích xuống 150cm, song song;
// bỏ qua nếu chui xuống đất) + 8 TRỤ DỌC TRÒN nối mút-ngoài 2 tầng xà (lùi 30cm, thò 30cm qua xà dưới) + 8 THANH
// CHỐNG XIÊN từ trung điểm xà-dưới đâm vào trục trụ giữa @45° (chuỗi đốt uốn cong được: strutSegments/strutCurve).
// 2 mesh: gỗ (deck + xà + trụ + chống merge) + đá (trụ giữa) riêng material. Trụ giữa cao = postH; r = pillarRadius. Cao tổng = foundH (≤4m).
function makeStonePillarFoundation(
  fw: number,
  fd: number,
  cx: number,
  cz: number,
  opts: PositionedFoundationOpts
): PartResult {
  const h = opts.h
  const deckThick = Math.min(0.12, h * 0.5)
  const postH = Math.max(0.05, h - deckThick) // trụ chạy từ đất tới đáy deck
  const wood: THREE.BufferGeometry[] = []
  const deck = new THREE.BoxGeometry(fw, deckThick, fd) // mặt gỗ ngang ở đỉnh
  deck.translate(cx, h / 2 - deckThick / 2, cz)
  wood.push(deck)
  // 8 XÀ NGANG dưới đáy deck, ĐỒNG TÂM (toả từ tâm/đỉnh-trụ) ra 4 GÓC + 4 TRUNG ĐIỂM cạnh. top xà = đáy deck
  // (= đỉnh trụ) → xà gác trên trụ, đỡ deck ra mép. ang = atan2(-uz,ux) (local +X → hướng target, như woodEdge).
  const beamTk = (opts.beamWidth ?? 100) / 1000 // bề rộng tiết diện xà (slider)
  const beamH = Math.min((opts.beamHeight ?? 120) / 1000, postH) // bề cao (slider), kẹp ≤ khoảng hở dưới deck
  const beamY = h / 2 - deckThick - beamH / 2 // tầng TRÊN: tâm y ngay dưới đáy deck
  const hw = fw / 2
  const hd = fd / 2
  pushRadialBeams(wood, cx, cz, hw, hd, beamY, beamH, beamTk) // 8 xà tầng trên
  const lowerY = beamY - 1.5 // tầng DƯỚI: 8 xà song song, nhích xuống 150cm
  if (lowerY - beamH / 2 > -h / 2) {
    pushRadialBeams(wood, cx, cz, hw, hd, lowerY, beamH, beamTk) // 8 xà tầng dưới (chỉ khi còn trên đất)
    const postR = (0.1 / 2) * (4 / 3) // bán kính trụ tròn: cũ 0.05 (½×0.1) +1/3 = 0.0667
    pushBeamPosts(wood, cx, cz, hw, hd, beamY, lowerY, beamH, postR, 0.3, 0.3) // 8 trụ tròn, lùi 30cm, thò 30cm qua xà dưới
    const seg = opts.strutSegments ?? 6
    const curve = (opts.strutCurve ?? 0) / 1000
    pushDiagonalStruts(wood, cx, cz, hw, hd, lowerY, beamTk, seg, curve) // 8 thanh chống xiên @45° (đốt+cong)
  }
  const woodGeo = mergeGeometries(wood, false) ?? new THREE.BufferGeometry()
  for (const b of wood) b.dispose()
  const woodMat = new THREE.MeshToonMaterial({ color: 0x9b6b43 }) // gỗ nâu (như wood-deck)
  // Trụ đá tròn giữa: bán kính clamp để luôn nằm gọn trong deck.
  const r = Math.max(0.15, Math.min((opts.pillarRadius ?? 500) / 1000, Math.min(fw, fd) / 2 - 0.05))
  const pillarGeo = new THREE.CylinderGeometry(r, r, postH, 20, 1)
  pillarGeo.translate(cx, -h / 2 + postH / 2, cz)
  const stoneMat = new THREE.MeshToonMaterial({ color: COL_STONE_PILLAR })
  const woodMesh = new THREE.Mesh(woodGeo, woodMat)
  const stoneMesh = new THREE.Mesh(pillarGeo, stoneMat)
  for (const m of [woodMesh, stoneMesh]) {
    m.rotation.y = (opts.rotY * Math.PI) / 180
    m.position.set(opts.worldX, h / 2, opts.worldZ)
    m.castShadow = true
    m.receiveShadow = true
  }
  return { geos: [woodGeo, pillarGeo], mats: [woodMat, stoneMat], meshes: [woodMesh, stoneMesh] }
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
  const geo = opts.openings?.length
    ? makeSlabWithHoles(fw, fd, opts.h, opts.openings, cx, cz)
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

// Sàn có lỗ khoét — dùng ExtrudeGeometry từ THREE.Shape với holes
// Shape định nghĩa trong mặt phẳng XY (shape.x=worldX, shape.y→worldZ sau rotateX)
// ExtrudeGeometry extrude theo +Z (local) → rotateX(-PI/2) nằm ngang
function makeSlabWithHoles(
  w: number,
  d: number,
  thick: number,
  holes: SlabOpening[],
  ocx = 0, // dời tâm OUTER rect (overhang móng) — lỗ giữ toạ độ local thật nên vẫn khớp shape lồng
  ocz = 0
): THREE.BufferGeometry {
  const shape = new THREE.Shape()
  shape.moveTo(-w / 2 + ocx, -d / 2 - ocz)
  shape.lineTo(w / 2 + ocx, -d / 2 - ocz)
  shape.lineTo(w / 2 + ocx, d / 2 - ocz)
  shape.lineTo(-w / 2 + ocx, d / 2 - ocz)
  shape.closePath()
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
  const geo = opts.openings?.length
    ? makeSlabWithHoles(opts.bboxW, opts.bboxD, opts.thick, opts.openings)
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
  if (style === 'solid') {
    buildSolidRails(add, concrete, opts, z0, cz)
  } else {
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
  return { geos, mats, meshes: [grp] }
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
