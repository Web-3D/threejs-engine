/**
 * VỊ TRÍ   — building-kit/parts/Balcony.ts
 * VAI TRÒ  — ArchPlanLab positioned balcony: sàn box vươn ra mặt ngoài 1 tường + lan can 3 phía (trước +
 *            2 đầu). 4 style lan can: solid (3 vách bê tông) · metal-bar (khung tròn + thanh dọc) ·
 *            glass-frame (khung tròn + 3 tấm kính) · wood-bar (gỗ vuông bo cạnh, thanh thưa).
 * LIÊN HỆ  — Tách từ parts/Structure.ts (part-builder độc lập). Consumer: building/render/fromState
 *            (makePositionedBalcony, re-export barrel qua Structure). Group đặt tâm tường + xoay heading →
 *            con dựng local frame (x dọc tường, z ra ngoài +Z, y world).
 * DISPOSE: trả geos/mats qua PartResult — caller (_clearParts) quản lý.
 */

import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'

import type { PartResult } from '../tokens'

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

// Bê tông sàn ban công — = COL_SLAB (parts/Structure.ts); giữ bản sao 1 hex để Balcony tự chứa, không coupling.
const COL_BAL_CONCRETE = 0x9e9b93 // sàn bê tông xám nhạt
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
    color: COL_BAL_CONCRETE,
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
