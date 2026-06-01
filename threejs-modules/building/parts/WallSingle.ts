/**
 * VỊ TRÍ   — building-kit/parts/WallSingle.ts
 * VAI TRÒ  — Phase 7: 1 mặt tường đơn lẻ — xOffset / zOffset / rotationY (0/90/180/270°)
 *             Ghép nhiều wall_single → mặt bằng L / U / T / tùy ý không giới hạn
 * LIÊN HỆ  — BuildingLab._showWallSingle*(); FloorSystem.ts dùng make* để stack tầng
 *
 * Convention rotationY:
 *   0°   → mặt ngoài hướng +Z (front face, viewer phía trước)
 *   90°  → mặt ngoài hướng +X (right face)
 *   180° → mặt ngoài hướng -Z (back face)
 *   270° → mặt ngoài hướng -X (left face)
 *
 * SDF mapping: sdBox( rotate(p − center, −rotY), halfExtents )
 * DISPOSE: geos + mats qua PartResult — BuildingLab._clearSlot() quản lý
 *          Geometry được chia sẻ qua instances trong Group (không dispose trùng)
 */

import * as THREE from 'three'

import type { PartResult } from '../tokens'
import { OFFICE_GLASS_COLORS, WALL_COLORS } from '../tokens'

// ── Interfaces ─────────────────────────────────────────────────────────────────

export interface WallSingleFlatConfig {
  wallW: number // chiều rộng mặt tường
  wallH: number // chiều cao mặt tường
  wallT: number // độ dày (depth theo trục Z cục bộ)
  xOffset: number // world X position của tâm tường
  zOffset: number // world Z position của tâm tường
  rotationY: number // degrees: 0 / 90 / 180 / 270
  colorIndex: number
}

export interface WallSingleRevealConfig extends WallSingleFlatConfig {
  numFloors: number // số panel tầng (groove ở giữa mỗi tầng)
  revealH: number // chiều cao groove giữa các tầng
  showParapet: boolean
  parapetH: number
  parapetT: number
}

export interface WallSinglePanelConfig extends WallSingleFlatConfig {
  panelW: number // rộng 1 ô panel (bao gồm groove)
  panelH: number // cao 1 ô panel
  grooveW: number // rộng mullion/groove giữa panels
  frameIndex: number
  glassIndex: number
}

// ── Palette ────────────────────────────────────────────────────────────────────
// FRAME_COLORS same as WallDetail.ts — define locally, không export ra ngoài
const FRAME_COLORS = [
  0x28282c, // thép đen anodized
  0x383640, // xám xanh aluminium
  0x383028, // đồng tối bronze
  0x283428, // xanh rêu tối industrial
] as const

const PARAPET_COLOR = 0xccc8c0

// ── Helpers ────────────────────────────────────────────────────────────────────

// Áp dụng position/rotationY cho Object3D — tách ra để dùng lại cho Group & Mesh
function applyTransform(obj: THREE.Object3D, cfg: WallSingleFlatConfig): void {
  obj.position.set(cfg.xOffset, 0, cfg.zOffset)
  obj.rotation.y = (cfg.rotationY * Math.PI) / 180
}

// ── makeWallSingleFlat ─────────────────────────────────────────────────────────
// sdBox(p, halfExtents) — 1 mặt phẳng đơn giản nhất

export function makeWallSingleFlat(cfg: WallSingleFlatConfig): PartResult {
  const geo = new THREE.BoxGeometry(cfg.wallW, cfg.wallH, cfg.wallT)
  const mat = new THREE.MeshToonMaterial({
    color: WALL_COLORS[cfg.colorIndex % WALL_COLORS.length],
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  })
  const mesh = new THREE.Mesh(geo, mat)
  // position.y = wallH/2: gốc tọa độ tại đáy tường, tâm mesh tại giữa chiều cao
  mesh.position.set(cfg.xOffset, cfg.wallH / 2, cfg.zOffset)
  mesh.rotation.y = (cfg.rotationY * Math.PI) / 180
  mesh.castShadow = true
  mesh.receiveShadow = true
  return { geos: [geo], mats: [mat], meshes: [mesh] }
}

// ── makeWallSingleSet ──────────────────────────────────────────────────────────
// N wall_single trong cùng 1 PartResult — dùng cho presets L-shape, U-shape
// Mỗi config tạo riêng (wallW/wallH/rotationY khác nhau → không share geo)

export function makeWallSingleSet(walls: WallSingleFlatConfig[]): PartResult {
  const geos: THREE.BufferGeometry[] = []
  const mats: THREE.Material[] = []
  const meshes: THREE.Object3D[] = []

  for (const cfg of walls) {
    const r = makeWallSingleFlat(cfg)
    geos.push(...r.geos)
    mats.push(...r.mats)
    meshes.push(...r.meshes)
  }
  return { geos, mats, meshes }
}

// ── makeWallSingleReveal ───────────────────────────────────────────────────────
// N floor panels với groove giữa các tầng — single face
// Dùng Group để áp position/rotationY cho toàn bộ stack panel cùng lúc

export function makeWallSingleReveal(cfg: WallSingleRevealConfig): PartResult {
  const grp = new THREE.Group()
  applyTransform(grp, cfg)

  const geos: THREE.BufferGeometry[] = []
  const mats: THREE.Material[] = []

  const floors = Math.max(1, Math.round(cfg.numFloors))
  const floorH = cfg.wallH / floors
  // Mỗi panel = 1 tầng trừ groove: void gap tạo shadow line
  const panelH = Math.max(0.05, floorH - cfg.revealH)

  const matWall = new THREE.MeshToonMaterial({
    color: WALL_COLORS[cfg.colorIndex % WALL_COLORS.length],
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  })
  mats.push(matWall)

  // Shared geo: tất cả panels cùng wallW × panelH × wallT
  const panelGeo = new THREE.BoxGeometry(cfg.wallW, panelH, cfg.wallT)
  geos.push(panelGeo)

  for (let i = 0; i < floors; i++) {
    const m = new THREE.Mesh(panelGeo, matWall)
    m.position.y = floorH * i + panelH / 2
    m.castShadow = true
    m.receiveShadow = true
    grp.add(m)
  }

  // Parapet: sdBox(outer) − sdBox(inner) → ở đây = 1 slab ngang rộng hơn tường chút
  if (cfg.showParapet) {
    const pH = cfg.parapetH
    const pT = cfg.parapetT
    const matPar = new THREE.MeshToonMaterial({ color: PARAPET_COLOR })
    mats.push(matPar)
    // Parapet rộng hơn tường 2× pT để che góc khi nhìn nghiêng
    const parGeo = new THREE.BoxGeometry(cfg.wallW + pT * 2, pH, cfg.wallT + pT)
    geos.push(parGeo)
    const parMesh = new THREE.Mesh(parGeo, matPar)
    parMesh.position.y = cfg.wallH + pH / 2
    grp.add(parMesh)
  }

  // Group IS the "mesh" — position/rotation applied at Group level
  return { geos, mats, meshes: [grp] }
}

// ── makeWallSinglePanel ────────────────────────────────────────────────────────
// Curtain wall panel — frame body + glass inserts trên LOCAL +Z face
// Group đảm bảo panel inserts luôn đúng face dù rotationY bất kỳ

export function makeWallSinglePanel(cfg: WallSinglePanelConfig): PartResult {
  const grp = new THREE.Group()
  applyTransform(grp, cfg)

  const matFrame = new THREE.MeshToonMaterial({
    color: FRAME_COLORS[cfg.frameIndex % FRAME_COLORS.length],
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  })
  const matGlass = new THREE.MeshToonMaterial({
    color: OFFICE_GLASS_COLORS[cfg.glassIndex % OFFICE_GLASS_COLORS.length],
  })

  // Frame body — full wall depth
  const frameGeo = new THREE.BoxGeometry(cfg.wallW, cfg.wallH, cfg.wallT)
  const frameMesh = new THREE.Mesh(frameGeo, matFrame)
  // Center Y tại wallH/2 trong local space của Group (Group.y = 0)
  frameMesh.position.y = cfg.wallH / 2
  frameMesh.castShadow = true
  frameMesh.receiveShadow = true
  grp.add(frameMesh)

  // Panel inserts: grid theo X/Y, offset theo LOCAL +Z (front face của wall)
  const numCols = Math.max(1, Math.floor(cfg.wallW / cfg.panelW))
  const numRows = Math.max(1, Math.floor(cfg.wallH / cfg.panelH))
  const insertW = Math.max(0.05, cfg.panelW - cfg.grooveW)
  const insertH = Math.max(0.05, cfg.panelH - cfg.grooveW)
  // insertGeo mỏng 0.04m — nổi lên khỏi frame surface
  const insertGeo = new THREE.BoxGeometry(insertW, insertH, 0.04)

  // Căn giữa grid theo X và Y (trong local space của Group)
  const startX = -(numCols * cfg.panelW) / 2 + cfg.panelW / 2
  const startY = (cfg.wallH - numRows * cfg.panelH) / 2 + cfg.panelH / 2

  for (let row = 0; row < numRows; row++) {
    for (let col = 0; col < numCols; col++) {
      const x = startX + col * cfg.panelW
      const y = startY + row * cfg.panelH
      const m = new THREE.Mesh(insertGeo, matGlass)
      // +Z local = front face của frame. wallT/2 + 0.02 = vừa nhô qua surface
      m.position.set(x, y, cfg.wallT / 2 + 0.02)
      grp.add(m)
    }
  }

  return {
    geos: [frameGeo, insertGeo],
    mats: [matFrame, matGlass],
    meshes: [grp],
  }
}

// ── Presets ────────────────────────────────────────────────────────────────────

// L-shape: 3 tường — mặt sau + mặt trái + mặt trước một nửa bên trái
// Plan view (top-down, viewer ở phía +Z):
//   +----+----+
//   |    |    |  ← trước: chỉ nửa trái (mở góc phải)
//   |    +----+
//   |         |  ← trái và sau đầy đủ
//   +----+----+
export function presetLShape(bodyW: number, bodyH: number, bodyD: number): WallSingleFlatConfig[] {
  const hW = bodyW / 2
  const hD = bodyD / 2
  const wallT = 0.25
  return [
    // Back (full width)
    { wallW: bodyW, wallH: bodyH, wallT, xOffset: 0, zOffset: -hD, rotationY: 180, colorIndex: 0 },
    // Left (full depth)
    { wallW: bodyD, wallH: bodyH, wallT, xOffset: -hW, zOffset: 0, rotationY: 270, colorIndex: 0 },
    // Front-left half (tạo "chân" chữ L)
    {
      wallW: bodyW / 2,
      wallH: bodyH,
      wallT,
      xOffset: -hW / 2,
      zOffset: hD,
      rotationY: 0,
      colorIndex: 0,
    },
  ]
}

// U-shape: 5 tường — sau + trái + phải + 2 cánh trước (hở ở giữa mặt trước)
// Plan view:
//   +--+     +--+
//   |  +-----+  |  ← 2 cánh trước, hở giữa
//   |           |
//   +-----------+  ← sau đầy đủ
export function presetUShape(bodyW: number, bodyH: number, bodyD: number): WallSingleFlatConfig[] {
  const hW = bodyW / 2
  const hD = bodyD / 2
  // Mỗi cánh trước = 30% tổng chiều rộng
  const wingW = bodyW * 0.3
  const wallT = 0.25
  return [
    // Back (full width)
    { wallW: bodyW, wallH: bodyH, wallT, xOffset: 0, zOffset: -hD, rotationY: 180, colorIndex: 0 },
    // Left (full depth)
    { wallW: bodyD, wallH: bodyH, wallT, xOffset: -hW, zOffset: 0, rotationY: 270, colorIndex: 0 },
    // Right (full depth)
    { wallW: bodyD, wallH: bodyH, wallT, xOffset: hW, zOffset: 0, rotationY: 90, colorIndex: 0 },
    // Front-left wing
    {
      wallW: wingW,
      wallH: bodyH,
      wallT,
      xOffset: -(hW - wingW / 2),
      zOffset: hD,
      rotationY: 0,
      colorIndex: 0,
    },
    // Front-right wing
    {
      wallW: wingW,
      wallH: bodyH,
      wallT,
      xOffset: hW - wingW / 2,
      zOffset: hD,
      rotationY: 0,
      colorIndex: 0,
    },
  ]
}

// ── PositionedWall ─────────────────────────────────────────────────────────────
// makePositionedWall — dùng bởi ArchPlanLab: khoét lỗ cửa/sổ tại đúng toạ độ x
// từ bản vẽ kiến trúc, thay thế even-distribution của OpeningDetail.
//
// Kỹ thuật: sort openings theo x → tạo BoxGeometry segment cho từng phần solid,
// lintel (trên opening) và sill (dưới cửa sổ). Tất cả trong 1 Group.
//
// Phase AP5: caller tạo material với Surface Shader rồi truyền vào wallMaterial.
// Khi wallMaterial = null (default), dùng MeshToonMaterial placeholder.
// Caller sở hữu material khi truyền vào — PartResult.mats sẽ KHÔNG dispose nó.

export interface PositionedOpening {
  type: 'door' | 'window' | 'loading_door'
  x: number // từ góc trái mặt tường (mét)
  yOffset?: number // từ sàn tầng (default: door=0, window=0.9m)
  w: number
  h: number
  round?: boolean // true = lỗ ELLIP (fit bbox w×h) → dùng custom holes-geo thay post-and-lintel
}

// Task A — tấm decor khắc trên mặt NGOÀI tường (+Z local). Đơn vị MÉT (caller đã ÷1000).
// material/matKey do caller resolve (ArchPlanLab cache) — mesh gắn userData.matKey để bake
// gom đúng bucket vật liệu riêng. 'raised' = ô nhô; 'recessed' = khung gờ molding nổi quanh ô.
export interface PositionedPanel {
  x: number // mép trái panel từ đầu trái tường
  y: number // mép dưới panel từ chân tường
  w: number
  h: number
  depth: number // độ nhô / bề dày khung
  mode: 'recessed' | 'raised'
  material: THREE.Material
  matKey: string
}

export interface PositionedWallOpts {
  w: number
  h: number
  depth: number
  /** AP1: chỉ 'flat' có hiệu lực về geometry. 'reveal'|'panel' reserved cho AP5. */
  style: 'flat' | 'reveal' | 'panel'
  xOffset?: number
  zOffset?: number
  yBase?: number // world Y of wall bottom (default 0) — lifted when foundation is shown
  rotationY?: number
  openings: PositionedOpening[]
  // ── Phase AP5 hook ──────────────────────────────────────────────────────────
  // null (default) → dùng MeshToonMaterial placeholder, thêm vào PartResult.mats
  // AP5: caller inject NodeMaterial từ Phase 6 Surface Shaders (BrickWall, ConcretePanel...)
  //      Caller owns material — KHÔNG có trong PartResult.mats → caller tự dispose
  wallMaterial?: THREE.Material | null
  panels?: PositionedPanel[] // task A — decor khắc nổi/lõm; mỗi mesh có userData.matKey riêng
}

export function makePositionedWall(opts: PositionedWallOpts): PartResult {
  const { w, h, depth, openings } = opts
  const sorted = [...openings].sort((a, b) => a.x - b.x)

  const group = new THREE.Group()
  const geos: THREE.BufferGeometry[] = []
  const mats: THREE.Material[] = []

  const wallMat: THREE.Material = opts.wallMaterial ?? _mkDefaultWallMat()
  if (!opts.wallMaterial) mats.push(wallMat)

  // Lỗ tròn (round) → post-and-lintel box không tạo ellipse được → dựng 1 custom geo khoét lỗ
  // (front/back + reveal, rect+ellip). Tường chỉ-chữ-nhật giữ post-and-lintel cũ (đã ổn).
  if (openings.some((o) => o.round)) {
    const geo = _buildWallHolesGeo(w, h, depth, openings)
    geos.push(geo)
    const mesh = new THREE.Mesh(geo, wallMat)
    mesh.castShadow = true
    mesh.receiveShadow = true
    group.add(mesh)
  } else {
    const addBox = _mkBoxAdder(group, geos, depth, w)
    _buildWallSegments(sorted, w, h, wallMat, addBox)
  }
  _buildDecorPanels(group, geos, opts.panels ?? [], w, depth)

  group.position.set(opts.xOffset ?? 0, opts.yBase ?? 0, opts.zOffset ?? 0)
  group.rotation.y = ((opts.rotationY ?? 0) * Math.PI) / 180

  return { geos, mats, meshes: [group] }
}

// Decor panels trên mặt ngoài +Z. raised = 1 box nhô; recessed = 4 thanh khung gờ nổi quanh ô
// (tâm để trống → nhìn như lõm vào, không cần CSG). Mỗi mesh gắn userData.matKey để caller
// bake gom đúng bucket vật liệu riêng của panel.
function _buildDecorPanels(
  group: THREE.Group,
  geos: THREE.BufferGeometry[],
  panels: PositionedPanel[],
  wallW: number,
  wallDepth: number
): void {
  const frontZ = wallDepth / 2
  const addBox = (bw: number, bh: number, cx: number, cy: number, p: PositionedPanel): void => {
    if (bw < 0.001 || bh < 0.001 || p.depth < 0.001) return
    const geo = new THREE.BoxGeometry(bw, bh, p.depth)
    geos.push(geo)
    const mesh = new THREE.Mesh(geo, p.material)
    mesh.position.set(cx, cy, frontZ + p.depth / 2)
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.userData.matKey = p.matKey
    group.add(mesh)
  }
  for (const p of panels) {
    const cx = p.x + p.w / 2 - wallW / 2
    const cy = p.y + p.h / 2
    if (p.mode === 'raised') {
      addBox(p.w, p.h, cx, cy, p)
      continue
    }
    const bt = Math.min(Math.min(p.w, p.h) * 0.14, 0.2) // bề rộng khung gờ
    addBox(p.w, bt, cx, cy + p.h / 2 - bt / 2, p) // thanh trên
    addBox(p.w, bt, cx, cy - p.h / 2 + bt / 2, p) // thanh dưới
    const innerH = p.h - 2 * bt
    addBox(bt, innerH, cx - p.w / 2 + bt / 2, cy, p) // thanh trái
    addBox(bt, innerH, cx + p.w / 2 - bt / 2, cy, p) // thanh phải
  }
}

// ── Helpers (module-private) ────────────────────────────────────────────────────

// Closure factory — captures group/geos/depth/wallW để addBox compact
function _mkBoxAdder(
  group: THREE.Group,
  geos: THREE.BufferGeometry[],
  depth: number,
  wallW: number
) {
  return (bw: number, bh: number, cx: number, cy: number, mat: THREE.Material): void => {
    if (bw < 0.001 || bh < 0.001) return
    const geo = new THREE.BoxGeometry(bw, bh, depth)
    geos.push(geo)
    const mesh = new THREE.Mesh(geo, mat)
    // cx: tâm segment tính từ trái tường (0 → wallW); chuyển về local: -wallW/2 → +wallW/2
    mesh.position.set(cx - wallW / 2, cy, 0)
    mesh.castShadow = true
    mesh.receiveShadow = true
    group.add(mesh)
  }
}

function _buildWallSegments(
  sorted: PositionedOpening[],
  w: number,
  h: number,
  mat: THREE.Material,
  add: (bw: number, bh: number, cx: number, cy: number, m: THREE.Material) => void
): void {
  let cursor = 0
  for (const op of sorted) {
    const opBottom = op.yOffset ?? (op.type === 'door' ? 0 : 0.9)
    const opTop = opBottom + op.h

    // Solid column trái của opening (full height)
    if (op.x > cursor + 0.001) {
      const sw = op.x - cursor
      add(sw, h, cursor + sw / 2, h / 2, mat)
    }
    // Lintel trên opening (tường trên cửa/sổ)
    const lintelH = h - opTop
    if (lintelH > 0.001) add(op.w, lintelH, op.x + op.w / 2, opTop + lintelH / 2, mat)
    // Sill dưới cửa sổ (không có cho cửa đi, bắt đầu từ sàn)
    if (opBottom > 0.001) add(op.w, opBottom, op.x + op.w / 2, opBottom / 2, mat)

    cursor = op.x + op.w
  }
  // Solid column cuối (hoặc toàn tường nếu không có opening)
  if (w - cursor > 0.001) {
    const sw = w - cursor
    add(sw, h, cursor + sw / 2, h / 2, mat)
  }
}

// ── Holed wall geometry (rect + ellip openings) ─────────────────────────────────
// Tường phẳng KHOÉT lỗ chữ nhật + ELLIP (round) — 1 BufferGeometry: front(+z)/back(−z) + reveal
// tunnel 4 mặt + 4 cạnh ngoài. Mép lỗ chia trapezoid-band nghiêng theo chord top/bottom → mượt +
// kín (không bậc). Ellipse theo y/h THẬT (chưa clamp) → kéo qua mép trên/dưới thì tường clip thành
// cửa bán nguyệt/cung. CÙNG kỹ thuật InstancedBrickWall._buildBackingGeo (chưa unify → xem deferred
// holed-wall-geometry-util). Dùng cho mọi vật liệu phẳng (none + surface shader) khi có lỗ round.

interface _HoleOp {
  xa: number
  xb: number
  y0: number // mép RENDER (clamp vào tường)
  y1: number
  ey0: number // mép ELLIP THẬT (chưa clamp) → bán nguyệt khi kéo qua mép
  ey1: number
  round: boolean
}
interface _Trap {
  lB: number
  lT: number
  rB: number
  rT: number
  jL: boolean
  jR: boolean
}
type _Quad = (c: number[][]) => void

function _mapHoleOps(openings: PositionedOpening[], x0: number, x1: number, h: number): _HoleOp[] {
  return openings
    .map((o) => {
      const oy = o.yOffset ?? (o.type === 'door' ? 0 : 0.9)
      return {
        xa: Math.max(x0, x0 + o.x),
        xb: Math.min(x1, x0 + o.x + o.w),
        y0: Math.max(0, oy),
        y1: Math.min(h, oy + o.h),
        ey0: oy,
        ey1: oy + o.h,
        round: o.round ?? false,
      }
    })
    .filter((o) => o.xb - o.xa > 1e-4 && o.y1 - o.y0 > 1e-4)
}

// Chord lỗ tại yy (round THU VỀ điểm cx ở 2 cực; mép clamp = chord phẳng cắt ngang ellipse).
function _holeChord(o: _HoleOp, yy: number): [number, number] | null {
  if (yy < o.y0 - 1e-9 || yy > o.y1 + 1e-9) return null
  if (!o.round) return [o.xa, o.xb]
  const cx = (o.xa + o.xb) / 2
  const cy = (o.ey0 + o.ey1) / 2
  const kk = 1 - ((yy - cy) / ((o.ey1 - o.ey0) / 2)) ** 2
  const hw = ((o.xb - o.xa) / 2) * Math.sqrt(Math.max(0, kk))
  return [cx - hw, cx + hw]
}

// Bound lỗ tại 2 cao độ ya/yb, sort theo tâm x (band null ở 1 đầu → lấy đầu kia).
function _holeBoundsAt(
  ops: _HoleOp[],
  ya: number,
  yb: number
): { lB: number; lT: number; rB: number; rT: number; c: number }[] {
  const ht: { lB: number; lT: number; rB: number; rT: number; c: number }[] = []
  for (const o of ops) {
    const b = _holeChord(o, ya)
    const t = _holeChord(o, yb)
    // CẢ HAI mép phải có chord; chỉ 1 null = band chạm mép lỗ từ ngoài → KHÔNG cắt (KI-001, fix 7b171a6).
    if (!b || !t) continue
    ht.push({ lB: b[0], lT: t[0], rB: b[1], rT: t[1], c: (b[0] + b[1]) / 2 })
  }
  return ht.sort((a, b) => a.c - b.c)
}

// Hình thang ĐẶC của band [ya,yb]: full width trừ trapezoid lỗ. jL/jR = cạnh là mép lỗ (cần reveal).
function _solidTraps(ops: _HoleOp[], x0: number, x1: number, ya: number, yb: number): _Trap[] {
  const out: _Trap[] = []
  let cB = x0
  let cT = x0
  for (const hl of _holeBoundsAt(ops, ya, yb)) {
    if (hl.lB > cB + 1e-6 || hl.lT > cT + 1e-6) {
      const jL = cB > x0 + 1e-6 || cT > x0 + 1e-6
      out.push({ lB: cB, lT: cT, rB: hl.lB, rT: hl.lT, jL, jR: true })
    }
    cB = Math.max(cB, hl.rB)
    cT = Math.max(cT, hl.rT)
  }
  out.push({ lB: cB, lT: cT, rB: x1, rT: x1, jL: cB > x0 + 1e-6 || cT > x0 + 1e-6, jR: false })
  return out.filter((t) => t.rB - t.lB > 1e-6 || t.rT - t.lT > 1e-6)
}

// Cao độ cắt band: 0, h, mép mỗi lỗ + (round) lấy mẫu Y ~25mm cho cung mượt.
function _yCutsForHoles(ops: _HoleOp[], h: number): number[] {
  const yCuts = [0, h]
  for (const o of ops) {
    yCuts.push(o.y0, o.y1)
    if (!o.round) continue
    const ns = Math.max(2, Math.ceil((o.y1 - o.y0) / 0.025))
    for (let s = 1; s < ns; s++) yCuts.push(o.y0 + ((o.y1 - o.y0) * s) / ns)
  }
  return [...new Set(yCuts)].filter((y) => y >= -1e-9 && y <= h + 1e-9).sort((a, b) => a - b)
}

// Front/back face từng band + reveal trái/phải (mép lỗ nghiêng front zf→back zb).
function _emitHoleBands(
  ops: _HoleOp[],
  bnd: { x0: number; x1: number; zf: number; zb: number; h: number },
  quad: _Quad
): void {
  const { x0, x1, zf, zb, h } = bnd
  const reveal = (xB: number, xT: number, ya: number, yb: number, plus: boolean): void => {
    const fa = [xB, ya, zf]
    const fb = [xT, yb, zf]
    const ba = [xB, ya, zb]
    const bb = [xT, yb, zb]
    if (plus) quad([ba, bb, fb, fa])
    else quad([fa, fb, bb, ba])
  }
  const ys = _yCutsForHoles(ops, h)
  for (let k = 0; k < ys.length - 1; k++) {
    const ya = ys[k]
    const yb = ys[k + 1]
    if (yb - ya < 1e-6) continue
    for (const tr of _solidTraps(ops, x0, x1, ya, yb)) {
      quad([
        [tr.lB, ya, zf],
        [tr.rB, ya, zf],
        [tr.rT, yb, zf],
        [tr.lT, yb, zf],
      ]) // front +Z
      quad([
        [tr.rB, ya, zb],
        [tr.lB, ya, zb],
        [tr.lT, yb, zb],
        [tr.rT, yb, zb],
      ]) // back −Z
      if (tr.jL) reveal(tr.lB, tr.lT, ya, yb, false) // cạnh trái = mép phải lỗ → −X
      if (tr.jR) reveal(tr.rB, tr.rT, ya, yb, true) // cạnh phải = mép trái lỗ → +X
    }
  }
}

function _buildWallHolesGeo(
  w: number,
  h: number,
  depth: number,
  openings: PositionedOpening[]
): THREE.BufferGeometry {
  const x0 = -w / 2
  const x1 = w / 2
  const zf = depth / 2
  const zb = -depth / 2
  const ops = _mapHoleOps(openings, x0, x1, h)
  const pos: number[] = []
  const idx: number[] = []
  let v = 0
  const quad: _Quad = (c) => {
    for (const p of c) pos.push(p[0], p[1], p[2])
    idx.push(v, v + 1, v + 2, v, v + 2, v + 3)
    v += 4
  }
  const bnd = { x0, x1, zf, zb, h }
  _emitHoleBands(ops, bnd, quad)
  _emitOuterFaces(bnd, quad)
  _emitHeadSill(ops, zf, zb, quad)
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  // uv dummy (zeros): shader bề mặt dùng triplanar world-space nên uv KHÔNG ảnh hưởng hình, nhưng
  // PHẢI tồn tại để mergeGeometries gộp được với BoxGeometry (tường chữ-nhật) cùng bucket — nếu
  // thiếu uv ở 1 geo trong khi geo khác có → "mergeGeometries failed ... uv attribute".
  geo.setAttribute(
    'uv',
    new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2)
  )
  geo.setIndex(idx)
  geo.computeVertexNormals()
  return geo
}

// 4 cạnh ngoài tường (lỗ nằm trong; cửa chạm đáy → quad đáy còn 1 dải ngạch mỏng, chấp nhận).
function _emitOuterFaces(
  bnd: { x0: number; x1: number; zf: number; zb: number; h: number },
  quad: _Quad
): void {
  const { x0, x1, zf, zb, h } = bnd
  quad([
    [x0, 0, zb],
    [x0, 0, zf],
    [x0, h, zf],
    [x0, h, zb],
  ]) // trái −X
  quad([
    [x1, 0, zf],
    [x1, 0, zb],
    [x1, h, zb],
    [x1, h, zf],
  ]) // phải +X
  quad([
    [x0, h, zf],
    [x1, h, zf],
    [x1, h, zb],
    [x0, h, zb],
  ]) // đỉnh +Y
  quad([
    [x0, 0, zb],
    [x1, 0, zb],
    [x1, 0, zf],
    [x0, 0, zf],
  ]) // đáy −Y
}

// Reveal bệ + đầu (head/sill) cho lỗ CHỮ NHẬT — trái/phải đã do band phát. Round: band lo hết.
function _emitHeadSill(ops: _HoleOp[], zf: number, zb: number, quad: _Quad): void {
  for (const o of ops) {
    if (o.round) continue
    quad([
      [o.xa, o.y0, zb],
      [o.xa, o.y0, zf],
      [o.xb, o.y0, zf],
      [o.xb, o.y0, zb],
    ]) // bệ +Y
    quad([
      [o.xb, o.y1, zb],
      [o.xb, o.y1, zf],
      [o.xa, o.y1, zf],
      [o.xa, o.y1, zb],
    ]) // đầu −Y
  }
}

function _mkDefaultWallMat(): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({
    color: WALL_COLORS[0],
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  })
}
