/**
 * VỊ TRÍ   — threejs-modules/building/state.ts  (building-kit)
 * VAI TRÒ  — NGUỒN SỰ THẬT cho "nhà là gì": BuildingState schema + types + factories +
 *            SHAPE_CONFIGS + AP4 JSON export + save/load migration. Dùng chung editor (archplan)
 *            lẫn headless (BuildingFromState/BuildingRenderer). Pure data — KHÔNG DOM, không window.* (luật lõi).
 * LIÊN HỆ  — archplan/state/state.ts là SHIM re-export file này (Phase 0 thin-out, 2026-06-01).
 *            GUI-only (TURN_OPTIONS/ROT_OPTIONS) giữ ở vỏ archplan, không vào đây.
 *
 * Tất cả kích thước lưu bằng mm. Renderer ÷1000 ở biên trước Three.js (boundary _segToSpec).
 */

import type { RoofOverhang, RoofType } from './parts/RoofShape'
import type { WallMaterial } from './wallMaterials'

// ── State types ────────────────────────────────────────────────────────────────

export interface OpeningState {
  // 2 TRỤC TÁCH RỜI (v9): kind = ngữ nghĩa (default lúc tạo + export AP4 + fill cửa/kính tương lai);
  // round = DÁNG lỗ. Geometry CHỈ đọc round + yOffset — kind KHÔNG đụng hình học (lỗ door/window y hệt,
  // khác nhau do yOffset). Cũ: 1 enum 5 giá trị gộp chéo kind×shape → đã tách (migrateOpening).
  kind: 'door' | 'window' | 'loading_door'
  round: boolean // false = lỗ chữ nhật; true = lỗ ELLIP (fit bbox w×h). Cắt tròn ở mọi loại tường
  x: number // mm từ đầu trái wall
  w: number // mm
  h: number // mm
  yOffset: number // mm từ sàn
  // ── KHUNG BAO quanh lỗ (C1 joinery 2026-06-10) — OPTIONAL parse-tolerant: save cũ thiếu field = none ──
  frameStyle?: 'none' | 'wood' | 'alu' | 'steel'
  frameW?: number // mm — bản khung (face width). undefined → FRAME_DEFAULTS theo style
  frameOut?: number // mm — khung nhô khỏi mặt tường MỖI BÊN. undefined → default style
  frameColor?: number // hex. undefined → default style
}

// Default khung theo style — GUI fill khi user chọn style; render fallback khi save thiếu field.
export const FRAME_DEFAULTS = {
  wood: { w: 90, out: 20, color: 0x8a6a48 },
  alu: { w: 50, out: 10, color: 0x3a3d42 },
  steel: { w: 60, out: 15, color: 0x2e3236 },
} as const

// WallMaterial định nghĩa trong building-kit (engine chung editor + headless); re-export để file
// archplan khác (gui/sections.ts…) import từ đây như cũ. 'brick-3d'/'wood-3d'/'wood-strip' = geometry THẬT.
export type { WallMaterial }

// Task A — tấm decor khắc trên mặt NGOÀI tường (+Z local). Geometry THẬT (box) → đổ bóng thật,
// vật liệu riêng từng panel. 'raised' = ô nhô hẳn ra; 'recessed' = khung gờ molding nổi quanh ô
// (tâm phẳng → nhìn như lõm vào, không cần CSG). Lõm-khoét-thật (CSG) để deferred.
export interface DecorPanel {
  x: number // mm — mép trái panel tính từ đầu trái tường
  y: number // mm — mép dưới panel tính từ chân tường
  w: number // mm
  h: number // mm
  depth: number // mm — độ nhô (raised) / bề dày khung gờ (recessed)
  mode: 'recessed' | 'raised'
  material: WallMaterial // vật liệu riêng (vd 'wood')
  colorIndex: number // index WALL_COLORS — màu chính panel
}

export interface SegmentState {
  id: string
  length: number // mm
  turnBefore: number // deg
  wallH: number // mm — height of this wall segment
  openings: OpeningState[]
  colorIndex: number // dùng cho cả màu MeshToon ('none') lẫn màu chính của shader (AP5)
  style: 'flat' | 'reveal' | 'panel' // legacy placeholder (cách B đã bỏ) — decor dùng panels[]
  material: WallMaterial // AP5 — vật liệu bề mặt
  matScale: number // AP5 — "Pattern scale" 0.3–3, nhân feature-size tự nhiên của shader
  panels: DecorPanel[] // task A — tấm decor khắc nổi/lõm trên mặt tường
  mortarColor: number // hex — màu rãnh vữa (chỉ material 'brick'); map uMortarColor
  brickRelief: number // 0–1 — độ lõm rãnh (chỉ 'brick'); map uBumpScale (normal-relief)
  woodReveal: number // mm — chiều cao mỗi tấm ván (chỉ 'wood-strip')
  woodButt: number // mm — độ nhô mép butt (chỉ 'wood-strip')
  woodStepTilt: number // deg — nghiêng mép butt ±85 (0=phẳng, +dốc lên, −hắt xuống; chỉ 'wood-strip')
  glassReflect?: number // 0–1 — độ phản chiếu ô kính (chỉ 'jp-shoji-glass'). Optional → backward-compat
  glassOpacity?: number // 0–1 — độ mờ ô kính (thấp = trong; chỉ 'jp-shoji-glass'). Optional
  trucCell?: number // m — khoảng cách trục gỗ dọc (jp-shoji*). Optional
  nanCell?: number // m — khoảng cách nan gỗ (jp-shoji*). Optional
  woodGrain?: number // 0–1 — độ nhiễu vân gỗ / nhám koshita (jp-shoji*). Optional
  paintColor: number | null // hex sơn từ palette atelier (brush). null = dùng colorIndex/WALL_COLORS
}

export interface ColumnState {
  id: string
  type: 'round' | 'square'
  x: number // mm, local to shape center (before rotation)
  z: number // mm, local to shape center
  h: number // mm height
  r: number // mm radius (round)
  size: number // mm side (square)
}

export interface StairState {
  show: boolean
  x: number // mm — footprint center, local to shape center (trước rotation)
  z: number // mm
  runL: number // mm — chiều dài chạy bậc (theo hướng leo, dọc trục +X cục bộ trước khi xoay)
  width: number // mm — bề rộng cầu thang (vuông góc hướng leo)
  steps: number // số bậc
  rotDeg: number // độ — xoay cầu thang quanh Y (0–360), cộng thêm rotation của shape
  style?: 'solid' | 'wood-plank' | 'wood-float' | 'wood-center' | 'glass-metal' // bậc: đặc bê tông | ván gỗ+đà bên | ván gỗ nổi | ván gỗ + 2 đà GIỮA (nghệ) | mặt kính + 2 đà KIM LOẠI giữa. Optional → backward-compat
}

// Ban công: sàn vươn ra mặt ngoài 1 tường + lan can 3 phía. Gắn vào segment wallIdx.
// Nhiều ban công/shape (như cột) → thêm/xóa qua tab, không có cờ show riêng (có trong list = hiện).
export interface BalconyState {
  wallIdx: number // index tường gắn ban công
  x: number // mm — vị trí dọc tường (từ mép trái)
  width: number // mm — bề rộng ban công
  depth: number // mm — độ vươn ra ngoài
  y: number // mm — cao độ sàn ban công tính từ chân tầng này (0 = sàn tầng)
  railH: number // mm — chiều cao lan can
  slabT: number // mm — dày sàn ban công
  // Kiểu lan can: 'solid' = 3 vách bê tông đặc (mặc định cũ); 'metal-bar' = khung kim loại tròn + thanh dọc
  // (balusters); 'glass-frame' = khung kim loại tròn + 3 mặt KÍNH trong phản chiếu (IBL); 'wood-bar' = khung
  // GỖ thanh VUÔNG bo cạnh + thanh dọc thưa gấp đôi. Optional → backward-compat.
  railStyle?: 'solid' | 'metal-bar' | 'glass-frame' | 'wood-bar'
}

export interface StructureState {
  showFoundation: boolean
  foundH: number // mm — height above ground (lifts building up when shown)
  foundOh: RoofOverhang // m — móng nhô riêng 4 hướng N/E/S/W tính TỪ mặt ngoài tường (min 0, max 2)
  foundType?: 'concrete' | 'wood-deck' | 'stone-pillar' // móng: bê tông khối | sàn gỗ Nhật (lưới cột) | sàn gỗ trên 1 TRỤ ĐÁ tròn giữa + 2 tầng xà toả ra góc/cạnh + 8 trụ dọc nối. Optional → backward-compat
  deckPostSpacing?: number // mm — khoảng cách cột deck sàn gỗ (wood-deck): nhỏ = dày. Optional, default 1500
  deckPostInset?: number // mm — cột chống (wood-deck) LÙI vào từ mép deck mỗi cạnh → tách cột khỏi mép sàn. Optional, default 50
  deckPostSize?: number // mm — CẠNH tiết diện cột chống vuông (wood-deck): lớn = cột to. Optional, default 120
  pillarRadius?: number // mm — bán kính trụ đá giữa (stone-pillar): cao trụ = foundH. Optional, default 500
  beamWidth?: number // mm — bề RỘNG tiết diện 16 xà (stone-pillar). Optional, default 100
  beamHeight?: number // mm — bề CAO tiết diện 16 xà (stone-pillar); render kẹp ≤ khoảng hở dưới deck. Optional, default 120
  strutSegments?: number // số ĐỐT mỗi thanh chống xiên (stone-pillar): nhiều = cong mượt. Optional, default 6
  strutCurve?: number // mm — độ CONG thanh chống xiên (stone-pillar); 0 = thẳng. Optional, default 0
  foundMaterial?: 'none' | 'wood-tex' // gỗ móng (wood-deck/stone-pillar): 'none' = MeshToon phẳng; 'wood-tex' = texture (caller bơm). Optional
  postRadius?: number // mm — bán kính 8 cột trụ tròn (stone-pillar). Optional, default 67
  postLength?: number // mm — chiều dài 8 cột trụ = khoảng cách 2 tầng xà (xà dưới + xiên đi theo). Optional, default 1500
  understructSize?: number // mm — KÍCH THƯỚC khung-dưới (xà/trụ/xiên) ĐỘC LẬP deck — kéo deck KHÔNG ảnh hưởng. Optional, default 5000
  understructMaterial?: 'none' | 'wood-tex' | 'bark-tex' // texture RIÊNG khung-dưới (tách deck): 'wood-tex' = Old Plywood; 'bark-tex' = Tree Bark. Optional, default 'none'
  deckRailShow?: boolean // bật LAN CAN 4 mặt quanh deck (stone-pillar). Optional, default false
  deckRailH?: number // mm — cao lan can. Optional, default 900
  deckRailLength?: number // mm — DÀI (trục X) khung lan can chữ nhật, độc lập. Optional, default 5000
  deckRailWidth?: number // mm — RỘNG (trục Z) khung lan can chữ nhật, độc lập. Optional, default 5000
  showSlab: boolean
  slabThick: number // mm — floor slab thickness
  slabMaterial?: WallMaterial | 'walnut-tex' | 'planks-tex' // vật liệu sàn: 'none' = bê tông xám; 'wood' = ván gỗ procedural (demo); 'walnut-tex' = Walnut Veneer (PhotoGround); 'planks-tex' = Wooden Planks (DÙNG CHUNG material gỗ deck móng — caller bơm). Optional → backward-compat
  columns: ColumnState[]
  // Cầu thang: footprint chiếu thẳng lên Y → khoét lỗ slab tầng trên (cầu thang đi xuống)
  stairs: StairState
  balconies: BalconyState[] // nhiều ban công (như cột) — thêm/xóa qua tab
}

export interface RoofState {
  show: boolean
  type: RoofType
  pitch: number // degrees (5–60)
  overhang: RoofOverhang // m — nhô riêng 4 hướng N/E/S/W
  rotDeg: number // 0/90/180/270 — xoay mái (đổi hướng mặt đứng cho half-hip/skew)
  parapetH: number // meters — flat roof only
}

export interface ShapeInstance {
  id: string
  shapeKey: string | null // null = custom turtle
  dims: Record<string, number>
  segments: SegmentState[]
  posX: number // mm world offset
  posZ: number // mm world offset
  rotY: number // deg (0/90/180/270)
  wallDepth: number // mm — độ dày tường riêng cho shape này
  structure: StructureState
  roof: RoofState
  // Brush palette cho element KHÔNG-tường (không merge → recolor sau build). Key: 'roof'|'found'|
  // 'slab'|'col:<i>' → hex. Optional (undefined = chưa sơn, dùng token mặc định). Tường vẫn dùng seg.paintColor.
  paint?: Record<string, number>
}

export interface FloorDef {
  id: string
  instances: ShapeInstance[] // shapes on this floor
}

export interface BuildingState {
  floors: FloorDef[]
  paletteId?: string | null // palette atelier đang chọn làm khay swatch (brush). undefined = chưa chọn
  hiddenPalettes?: string[] // id khay bị ẩn khỏi picker dự án này (declutter). Additive optional,
  // backward-compat (đọc `?? []`) → KHÔNG bump DESIGN_SCHEMA_V. atelier source giữ nguyên.
}

// ── Turtle output ──────────────────────────────────────────────────────────────

export interface WallConfig {
  w: number
  h: number
  depth: number
  rotationY: number
  xOffset: number
  zOffset: number
  yBase: number // world Y of wall bottom — lifted by foundH when foundation is shown
  seg: SegmentState
}

// ── Shape config types ─────────────────────────────────────────────────────────

export interface DimDef {
  label: string
  min: number
  max: number
  step: number
  default: number
}

export interface ShapeConfig {
  label: string
  wallLabels: string[]
  dims: Record<string, DimDef>
  toSegments: (dims: Record<string, number>, base?: SegmentState[]) => SegmentState[]
}

// TURN_OPTIONS / ROT_OPTIONS (GUI dropdown label→value) GIỮ ở vỏ archplan — không nhét string GUI vào lõi.

// ── State factories ────────────────────────────────────────────────────────────

export function mkColumn(): ColumnState {
  return {
    id: Math.random().toString(36).slice(2, 7),
    type: 'round',
    x: 0,
    z: 0,
    h: 3000,
    r: 150,
    size: 200,
  }
}

export function mkBalcony(): BalconyState {
  return {
    wallIdx: 0,
    x: 1000,
    width: 2500,
    depth: 1200,
    y: 0,
    railH: 1000,
    slabT: 120,
    railStyle: 'solid',
  }
}

export function mkStructure(): StructureState {
  return {
    showFoundation: true, // default: hiện móng (preset stone-pillar nhà sàn)
    foundH: 4000, // 4m — cao móng stone-pillar (cột chống cao)
    foundOh: { n: 1, e: 1, s: 1, w: 1 }, // 1m nhô (Expand) mỗi mặt — preset stone-pillar
    foundType: 'stone-pillar', // default = trụ đá (preset nhà sàn); đổi concrete/wood-deck ở GUI ▸ Type
    deckPostSpacing: 1500, // 1.5m giữa các cột deck (wood-deck)
    deckPostInset: 50, // 5cm cột chống lùi vào từ mép deck (wood-deck)
    deckPostSize: 120, // 120mm cạnh tiết diện cột chống vuông (wood-deck)
    pillarRadius: 600, // 0.6m bán kính trụ đá giữa (stone-pillar)
    beamWidth: 210, // 210mm bề rộng tiết diện xà (stone-pillar)
    beamHeight: 250, // 250mm bề cao tiết diện xà (stone-pillar)
    strutSegments: 16, // 16 đốt mỗi thanh chống xiên (stone-pillar) — cong mượt
    strutCurve: 300, // 300mm cong thanh chống xiên (stone-pillar)
    foundMaterial: 'wood-tex', // Wood planks (texture) cho deck — preset
    postRadius: 150, // 150mm bán kính cột trụ tròn (stone-pillar)
    postLength: 1000, // 1m chiều dài cột trụ = gap 2 tầng xà
    understructSize: 4500, // 4.5m khung-dưới (độc lập deck)
    understructMaterial: 'wood-tex', // Old Plywood — preset khung-dưới
    deckRailShow: true, // lan can deck BẬT mặc định (preset)
    deckRailH: 700, // cao lan can 0.7m
    deckRailLength: 4800, // dài khung lan can 4.8m (độc lập)
    deckRailWidth: 5100, // rộng khung lan can 5.1m (độc lập)

    showSlab: false,
    slabThick: 150,
    slabMaterial: 'none', // bê tông xám mặc định; đổi 'wood' (demo ván gỗ) ở GUI Slab ▸ Material
    columns: [],
    stairs: {
      show: false,
      x: 0,
      z: 0,
      runL: 3000,
      width: 1000,
      steps: 12,
      rotDeg: 0,
      style: 'solid',
    },
    balconies: [],
  }
}

export function mkRoof(): RoofState {
  return {
    show: false,
    type: 'gabled',
    pitch: 30,
    overhang: { n: 0.5, e: 0.5, s: 0.5, w: 0.5 },
    rotDeg: 0,
    parapetH: 0.6,
  }
}

export function mkSeg(length: number, turnBefore: number): SegmentState {
  return {
    id: Math.random().toString(36).slice(2, 7),
    length,
    turnBefore,
    wallH: 3000,
    openings: [],
    colorIndex: 0,
    style: 'flat',
    material: 'none',
    matScale: 1,
    panels: [],
    mortarColor: 0xc7c4be,
    brickRelief: 0.5,
    woodReveal: 500,
    woodButt: 50,
    woodStepTilt: 1,
    glassReflect: 0.6, // jp-shoji-glass: phản chiếu vừa
    glassOpacity: 0.45, // jp-shoji-glass: hơi mờ (thấy mờ xuyên)
    trucCell: 0.25, // jp-shoji*: trục gỗ 25cm
    nanCell: 0.125, // jp-shoji*: nan gỗ 12.5cm
    woodGrain: 0.4, // jp-shoji*: độ nhiễu vân gỗ
    paintColor: null,
  }
}

function copySegExtras(to: SegmentState[], from: SegmentState[] | undefined): void {
  if (!from || from.length !== to.length) return
  to.forEach((s, i) => {
    s.wallH = from[i].wallH
    s.colorIndex = from[i].colorIndex
    s.style = from[i].style
    s.material = from[i].material
    s.matScale = from[i].matScale
    s.openings = [...from[i].openings]
    s.panels = (from[i].panels ?? []).map((p) => ({ ...p }))
    s.mortarColor = from[i].mortarColor
    s.brickRelief = from[i].brickRelief
    s.woodReveal = from[i].woodReveal
    s.woodButt = from[i].woodButt
    s.woodStepTilt = from[i].woodStepTilt
    s.paintColor = from[i].paintColor
  })
}

// ── Shape presets ──────────────────────────────────────────────────────────────

export const SHAPE_CONFIGS: Record<string, ShapeConfig> = {
  rectangle: {
    label: 'Rectangle',
    wallLabels: ['South wall', 'East wall', 'North wall', 'West wall'],
    dims: {
      totalW: { label: 'Total Width mm', min: 1000, max: 20000, step: 100, default: 8000 },
      totalD: { label: 'Total Depth mm', min: 1000, max: 20000, step: 100, default: 6000 },
    },
    toSegments(dims, base) {
      const segs = [
        mkSeg(dims.totalW, 0),
        mkSeg(dims.totalD, 90),
        mkSeg(dims.totalW, 90),
        mkSeg(dims.totalD, 90),
      ]
      copySegExtras(segs, base)
      return segs
    },
  },

  // T-Shape: top bar rộng + stem hẹp ở giữa phía dưới.
  // Wing = (totalW - stemW) / 2 — tự tính, không expose riêng.
  't-shape': {
    label: 'T-Shape',
    wallLabels: [
      'Stem — south wall',
      'Stem — east wall',
      'Top bar — right wing',
      'Top bar — east wall',
      'Top bar — north wall',
      'Top bar — west wall',
      'Top bar — left wing',
      'Stem — west wall',
    ],
    dims: {
      totalW: { label: 'Total Width mm', min: 2000, max: 20000, step: 100, default: 8000 },
      topD: { label: 'Top bar depth mm', min: 500, max: 10000, step: 100, default: 2000 },
      stemW: { label: 'Stem width mm', min: 500, max: 18000, step: 100, default: 3000 },
      stemD: { label: 'Stem depth mm', min: 500, max: 18000, step: 100, default: 4000 },
    },
    toSegments(dims, base) {
      const { totalW, topD, stemW, stemD } = dims
      const wing = Math.max(100, (totalW - stemW) / 2)
      const segs = [
        mkSeg(stemW, 0), // stem south wall → East
        mkSeg(stemD, 90), // stem east wall → North
        mkSeg(wing, -90), // right wing → East
        mkSeg(topD, 90), // top bar east wall → North
        mkSeg(totalW, 90), // top bar north wall → West
        mkSeg(topD, 90), // top bar west wall → South
        mkSeg(wing, 90), // left wing → East
        mkSeg(stemD, -90), // stem west wall → South (closes)
      ]
      copySegExtras(segs, base)
      return segs
    },
  },

  // L-Shape: cắt góc trên-phải. notchW/notchH = kích thước phần cắt.
  'l-shape': {
    label: 'L-Shape',
    wallLabels: [
      'South wall (full width)',
      'East wall — low',
      'Step wall (notch)',
      'East wall — high',
      'North wall',
      'West wall (full height)',
    ],
    dims: {
      totalW: { label: 'Total Width mm', min: 1000, max: 20000, step: 100, default: 8000 },
      totalD: { label: 'Total Depth mm', min: 1000, max: 20000, step: 100, default: 6000 },
      notchW: { label: 'Notch Width mm', min: 500, max: 15000, step: 100, default: 4000 },
      notchH: { label: 'Notch Depth mm', min: 500, max: 15000, step: 100, default: 4000 },
    },
    toSegments(dims, base) {
      const { totalW, totalD, notchW, notchH } = dims
      const segs = [
        mkSeg(totalW, 0),
        mkSeg(notchH, 90),
        mkSeg(notchW, 90),
        mkSeg(Math.max(100, totalD - notchH), -90),
        mkSeg(Math.max(100, totalW - notchW), 90),
        mkSeg(totalD, 90),
      ]
      copySegExtras(segs, base)
      return segs
    },
  },

  // U-Shape: 2 cánh song song nối bởi vách phía sau, mở phía trước.
  // notchW = totalW - 2×wingW (tự tính).
  'u-shape': {
    label: 'U-Shape',
    wallLabels: [
      'South — left arm',
      'Inner left (notch)',
      'Inner bottom (notch)',
      'Inner right (notch)',
      'South — right arm',
      'East wall',
      'North wall',
      'West wall',
    ],
    dims: {
      totalW: { label: 'Total Width mm', min: 2000, max: 20000, step: 100, default: 8000 },
      totalD: { label: 'Total Depth mm', min: 2000, max: 20000, step: 100, default: 6000 },
      wingW: { label: 'Wing Width mm', min: 500, max: 8000, step: 100, default: 2000 },
      notchD: { label: 'Notch Depth mm', min: 500, max: 15000, step: 100, default: 3000 },
    },
    toSegments(dims, base) {
      const { totalW, totalD, wingW, notchD } = dims
      const notchW = Math.max(100, totalW - 2 * wingW)
      const segs = [
        mkSeg(wingW, 0), // south — left arm → E
        mkSeg(notchD, 90), // inner left (notch) → N
        mkSeg(notchW, -90), // inner bottom (notch) → E
        mkSeg(notchD, -90), // inner right (notch) → S
        mkSeg(wingW, 90), // south — right arm → E
        mkSeg(totalD, 90), // east wall → N
        mkSeg(totalW, 90), // north wall → W
        mkSeg(totalD, 90), // west wall → S (closes)
      ]
      copySegExtras(segs, base)
      return segs
    },
  },

  // Round: tháp/khối trụ tròn = N-gon đều (industry-style arc tessellation — Revit/SketchUp cũng
  // facet hoá khi render). turtle-walk chịu góc tùy ý sẵn → mỗi facet là 1 tường thường: opening/
  // material/wallH per-facet dùng nguyên hệ hiện có. chord = 2·r·sin(π/N), turn = 360/N.
  round: {
    label: 'Round',
    wallLabels: Array.from({ length: 24 }, (_, i) => `Facet ${i + 1}`),
    dims: {
      radius: { label: 'Radius mm', min: 1000, max: 10000, step: 100, default: 3000 },
      sides: { label: 'Sides', min: 6, max: 24, step: 1, default: 16 },
    },
    toSegments(dims, base) {
      const n = Math.max(3, Math.round(dims.sides))
      const chord = 2 * dims.radius * Math.sin(Math.PI / n)
      const segs = Array.from({ length: n }, (_, i) => mkSeg(chord, i === 0 ? 0 : 360 / n))
      copySegExtras(segs, base)
      return segs
    },
  },
}

export function defaultDims(shapeKey: string): Record<string, number> {
  const cfg = SHAPE_CONFIGS[shapeKey]
  if (!cfg) return {}
  return Object.fromEntries(Object.entries(cfg.dims).map(([k, d]) => [k, d.default]))
}

export function mkInstance(shapeKey: string | null): ShapeInstance {
  const id = Math.random().toString(36).slice(2, 7)
  if (shapeKey === null) {
    return {
      id,
      shapeKey: null,
      dims: {},
      segments: [mkSeg(6000, 0), mkSeg(4000, 90), mkSeg(6000, 90), mkSeg(4000, 90)],
      posX: 0,
      posZ: 0,
      rotY: 0,
      wallDepth: 100,
      structure: mkStructure(),
      roof: mkRoof(),
    }
  }
  const dims = defaultDims(shapeKey)
  return {
    id,
    shapeKey,
    dims,
    segments: SHAPE_CONFIGS[shapeKey].toSegments(dims),
    posX: 0,
    posZ: 0,
    rotY: 0,
    wallDepth: 100,
    structure: mkStructure(),
    roof: mkRoof(),
  }
}

export function mkFloor(): FloorDef {
  return {
    id: Math.random().toString(36).slice(2, 7),
    instances: [mkInstance('rectangle')],
  }
}

export function defaultBuildingState(): BuildingState {
  return { floors: [mkFloor()] }
}

export function defaultOpening(kind: OpeningState['kind']): OpeningState {
  if (kind === 'window')
    return { kind: 'window', round: false, x: 500, w: 1200, h: 1500, yOffset: 900 }
  return { kind, round: false, x: 500, w: 900, h: 2100, yOffset: 0 } // door + loading_door: bệ chạm sàn
}

export function defaultPanel(): DecorPanel {
  return {
    x: 400,
    y: 600,
    w: 1000,
    h: 1400,
    depth: 40,
    mode: 'raised',
    material: 'wood',
    colorIndex: 0,
  }
}

// ── Save / Load — snapshot ĐẦY ĐỦ BuildingState (round-trip lossless) ─────────────
// serializeDesign = format JSON DUY NHẤT (Save + autosave + nút download copy). AP4 lossy đã bỏ
// 2026-06-01 (reader BuildingFromPlan retire). Versioned: đổi schema → tăng DESIGN_SCHEMA_V; file/
// autosave version cũ bị bỏ qua an toàn (parseDesign trả null → caller fallback về default).

export const DESIGN_SCHEMA_V = 10 // v10: seg.paintColor + state.paletteId (brush palette); v9: opening 5-enum type → kind+round; v8: balcony→balconies[]; v7: structure.balcony; v6: woodStepTilt; v5: wood; v4: mortar/relief; v3: panels

export interface DesignFile {
  v: number
  state: BuildingState
}

export function serializeDesign(state: BuildingState): string {
  const data: DesignFile = { v: DESIGN_SCHEMA_V, state }
  return JSON.stringify(data)
}

// Parse + validate. null nếu hỏng / sai version / shape không hợp lệ → caller giữ default.
// v2/v3 → v4: chỉ thiếu field mới (panels/mortarColor/brickRelief) → fill default thay vì bỏ,
// tránh mất thiết kế đang làm.
export function parseDesign(text: string): BuildingState | null {
  try {
    const obj = JSON.parse(text) as Partial<DesignFile>
    const st = obj.state
    if (!st || !Array.isArray(st.floors) || st.floors.length === 0) return null
    if (obj.v === DESIGN_SCHEMA_V) return coerceMaterials(st)
    if (typeof obj.v === 'number' && obj.v >= 2 && obj.v < DESIGN_SCHEMA_V) {
      return coerceMaterials(fillMissingSegFields(st))
    }
    return null
  } catch {
    return null
  }
}

// 'brick-disp' đã gỡ → map sang 'brick-3d' (autosave/file cũ không vỡ). + v9: tách opening type.
// Version-independent (chạy cả file current lẫn cũ) — đã v9 thì migrateOpening tự bỏ qua.
function coerceMaterials(st: BuildingState): BuildingState {
  const segs = st.floors.flatMap((f) => f.instances).flatMap((i) => i.segments)
  for (const seg of segs) {
    if ((seg.material as string) === 'brick-disp') seg.material = 'brick-3d'
    for (const op of seg.openings) migrateOpening(op)
  }
  return st
}

// v9: file ≤v8 có op.type 5-enum (vd 'round_window') → suy ra kind + round, xoá type cũ.
function migrateOpening(op: OpeningState): void {
  const legacy = op as OpeningState & { type?: string }
  if (op.kind && typeof op.round === 'boolean') return // đã v9
  const t = legacy.type ?? 'window'
  op.round = t === 'round_window' || t === 'round_door'
  op.kind =
    t === 'loading_door' ? 'loading_door' : t === 'door' || t === 'round_door' ? 'door' : 'window'
  delete legacy.type
}

// Fill field mới cho file cũ (giữ nguyên tường/material/opening). Seg fields + structure (balconies).
function fillMissingSegFields(st: BuildingState): BuildingState {
  const insts = st.floors.flatMap((f) => f.instances)
  for (const seg of insts.flatMap((i) => i.segments)) fillSegDefaults(seg)
  for (const inst of insts) {
    // v8: balcony (đơn, v7) → balconies[]. Design cũ hơn (chưa có balcony) → [].
    const s = inst.structure as StructureState & { balcony?: BalconyState }
    if (!Array.isArray(s.balconies)) s.balconies = s.balcony ? [s.balcony] : []
    delete s.balcony
  }
  return st
}

function fillSegDefaults(seg: SegmentState): void {
  if (!Array.isArray(seg.panels)) seg.panels = []
  if (typeof seg.mortarColor !== 'number') seg.mortarColor = 0xc7c4be
  if (typeof seg.brickRelief !== 'number') seg.brickRelief = 0.5
  if (typeof seg.woodReveal !== 'number') seg.woodReveal = 320
  if (typeof seg.woodButt !== 'number') seg.woodButt = 45
  if (typeof seg.woodStepTilt !== 'number') seg.woodStepTilt = -35
  if (seg.paintColor === undefined) seg.paintColor = null // v10: brush palette
}
