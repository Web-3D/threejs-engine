/**
 * VỊ TRÍ   — threejs-modules/site/state.ts  (site-kit — anh em building-kit)
 * VAI TRÒ  — NGUỒN SỰ THẬT cho "lô đất là gì": SiteState schema (nền + cỏ-3D + hồ nước + hàng rào) +
 *            factory + GROUND_PRESETS + JP defaults + coverageStats (đối chiếu nhà/lô). Pure data — KHÔNG DOM.
 * LIÊN HỆ  — Lô hoàn chỉnh = building (BuildingState) + site (SiteState). Renderer: ./render/fromState.
 *            ĐỘC LẬP building/ (footprint nhà truyền vào coverageStats như số m², không import building).
 *
 * Tất cả kích thước lưu bằng mm (đồng bộ BuildingState). Renderer ÷1000 ở biên.
 * Khung: 建ぺい率 (Building Coverage Ratio) — nhà ở Nhật phủ 30–60% lô; phần còn lại = sân vườn.
 */

// ── State types ────────────────────────────────────────────────────────────────

// Loại bề mặt nền lô (tier A material — G0 màu phẳng, nâng cấp procedural sau theo material-roadmap).
export type GroundMaterialKey = 'grass' | 'soil' | 'gravel'

export interface FenceConfig {
  enabled: boolean
  type: 'wood' | 'wall' // gỗ (cọc + thanh ngang) | tường rào xây (low wall liền)
  height: number // mm
  inset: number // mm — lùi vào từ mép lô (setback)
}

// Cỏ 3D thật (tier B — GrassBlades instanced) = LỚP THỰC VẬT độc lập surface: render khi enabled, mọc trên
// nền BẤT KỲ (grass/soil/gravel) — KHÔNG còn dính ground==='grass' (tách lớp material vs vegetation).
// REBUILD TĂNG DẦN (preview-first): B0 = hình dáng trần. Thêm dần shape/màu-gradient/cong/xoắn/
// gió/cao-thấp/ngả/đổ-bóng ở các bước sau (mỗi bước thêm 1 field ở đây + 1 row panel + 1 uniform).
// Structural (density/height/width/segments/taper/curveLR/bend/cup/cupGeo/cupNormalGain/clump*) → dựng lại; uniform (color/shadow*/contact*) → live.
export interface Grass3DConfig {
  enabled: boolean
  density: number // lá/m² (cap trong GrassBlades — accent-only)
  height: number // m — cao lá
  bladeWidth: number // m — rộng GỐC lá (t=0)
  midWidth: number // m — rộng THÂN lá (t=0.5) — độc lập với gốc
  segments: number // số đốt dọc (độ mịn strip)
  taper: number // B1 — thon ngọn 0..1 (0 = chữ nhật, 1 = nhọn đỉnh, mép cong ellipse)
  curveLR: number // độ cong trái→phải -1..1 (0 = thẳng; dời tâm theo X = curveLR·H·t²)
  bend: number // cong DỌC 0..1 (1 chiều; 0 = đứng): mặt NGOÀI +Z lồi ra (Z = bend·H·t²)
  cup: number // cụp 0..1 (1 chiều, cường độ; 0 = phẳng): mặt TRONG -Z lõm vào. Shader normal / geometry nếu cupGeo
  cupGeo: boolean // BẬT geometry fold thật (trục giữa, ×3 tris, cận cảnh) thay vì shader normal. Mặc định false (ẩn/tắt)
  cupNormalGain: number // độ nghiêng normal tạo cụp (shader mode); lớn = ăn sáng cụp gắt hơn (× với cup)
  bladesPerClump: number // số lá/cụm (bụi). 1 = lá đơn; >1 = gộp K lá vào 1 instance (budget-neutral, rải cụm)
  clumpRadius: number // m — bán kính xòe bụi
  clumpSplay: number // rad — nghiêng ngọn ra ngoài tâm (mặt trong vào tâm + xòe, bớt đâm xuyên)
  color: number // màu lá mặt NGOÀI (+Z) (uniform live)
  innerColor: number // màu lá mặt TRONG (-Z) (uniform live) — two-tone 2 mặt
  shadowDark: number // bóng gốc mặt trong (uniform live): nhân màu ở gốc (0=đen, 1=tắt)
  shadowSpan: number // bóng gốc vươn tới đâu (uniform live): tỉ lệ thân lá (1/6 mặc định)
  contactOn: boolean // bật/tắt vệt tiếp đất (đậm hiệu lực = 0 khi tắt — qua tuneGrass/buildVegetation)
  contactDark: number // vệt tiếp đất dưới gốc cụm (uniform live): độ đậm alpha (0 = tắt)
  contactRadius: number // m — bán kính đĩa vệt tiếp đất (uniform live, scale shader)
}

// Hồ/ao nước phản chiếu (tier C — WaterSurface, reflector). SITE ELEMENT RỜI (khác cỏ phủ-cả-lô):
// có VỊ TRÍ (offset so tâm lô) + kích thước riêng → đặt cạnh nhà. Structural (size/offset) → dựng lại;
// uniform (color/reflectivity/flow/distortion) → live qua setX. ĐẮT: +1 render pass/RTT MỖI hồ bật →
// instance mới mặc định enabled=false (perf). ĐA-INSTANCE: site.waters[]. CHỈ kind='pool' render; pond/
// puddle = placeholder (coming soon, chưa dựng hình riêng) → renderPools() lọc ra.
export type WaterKind = 'pool' | 'pond' | 'puddle'

// Đỉnh polygon mặt nước (mm, LOCAL so tâm hồ). Dùng khi shape='free'.
export interface WaterPoint {
  x: number
  z: number
}

export interface WaterConfig {
  kind: WaterKind // pool = hồ gương (render); pond/puddle = placeholder, chưa render (lọc bởi renderPools)
  enabled: boolean
  shape: 'rect' | 'free' // rect = chữ nhật width×depth; free = polygon points[] (kéo đỉnh trong 3D)
  width: number // mm — bề ngang hồ (X) — chỉ dùng khi shape='rect'
  depth: number // mm — chiều sâu hồ (Z) — chỉ dùng khi shape='rect'
  points: WaterPoint[] // đỉnh polygon (mm, local) — chỉ dùng khi shape='free'; <3 đỉnh → fallback rect
  offsetX: number // mm — tâm hồ lệch so tâm lô (X)
  offsetZ: number // mm — tâm hồ lệch so tâm lô (Z)
  color: number // màu nước (uniform live)
  reflectivity: number // rf0 [0..1] — phản chiếu khi nhìn thẳng (uniform live)
  flow: number // tốc độ cuộn sóng (uniform live)
  distortion: number // cường độ rung mặt gương (uniform live)
  rippleScale: number // tần số gợn sóng (1/m)
  depthY: number // mm — độ sâu lòng hồ (đáy dưới mặt nền) → basin + nền khoét lỗ
  bottomColor: number // màu đáy hồ (đục) — hiện tô CẢ tường (basin 1 material; tách khi làm material thật)
  tint: number // [0..1] — ám màu nước lên ảnh khúc xạ (absorption giả; cao = đục, đáy mờ) (uniform live)
  edgeWidth: number // mm — bề rộng dải coping/mép viền quanh hồ (0 = tắt). Render rect-frame ở mặt nền.
  floorMaterial: WaterMaterialKey // chất liệu đáy — placeholder ('none'); render thật sau
  wallMaterial: WaterMaterialKey // chất liệu tường — placeholder ('none'); render thật sau
  edgeMaterial: WaterMaterialKey // chất liệu dải coping — placeholder ('none'); render thật sau
}

// Chất liệu bề mặt hồ (đáy/tường/coping) — PLACEHOLDER: chỉ 'none' hiện tại, thêm tile/stone/concrete… sau.
export type WaterMaterialKey = 'none'

export interface SiteState {
  show: boolean // bật/tắt hiện nền lô (tắt → building về y=0, không đôn)
  lotWidth: number // mm — bề ngang lô (trục X)
  lotDepth: number // mm — chiều sâu lô (trục Z)
  groundThick: number // mm — dày slab nền 10..100 (1..10cm); ≥10 để mặt trên cao hơn grid → hết z-fight
  ground: GroundMaterialKey
  grass3d: Grass3DConfig // cỏ 3D nhú lên (tier B) — phủ lên nền cỏ khi bật
  waters: WaterConfig[] // hồ nước (tier C) đa-instance — chỉ kind='pool' & enabled mới render (xem renderPools)
  fence: FenceConfig
}

// Hồ render được = pool & pond ĐANG BẬT (puddle vẫn placeholder → bỏ). Dùng bởi renderer + editor (khoét
// lỗ/drag). Pond "y như" pool (cùng WaterSurface) — phân hoá thông số sau; chỉ puddle chưa dựng hình.
export function renderWaters(site: SiteState): WaterConfig[] {
  return site.waters.filter((w) => (w.kind === 'pool' || w.kind === 'pond') && w.enabled)
}

// ── Presets ──────────────────────────────────────────────────────────────────────

export const GROUND_PRESETS: Record<GroundMaterialKey, { color: number; roughness: number }> = {
  grass: { color: 0x4a7c3a, roughness: 0.95 }, // cỏ xanh
  soil: { color: 0x6b4a2f, roughness: 1.0 }, // đất nâu
  gravel: { color: 0x8a8680, roughness: 0.9 }, // sỏi xám
}

export const GROUND_THICK_MIN = 10 // mm = 1cm — default, đáy ở y=0 → top cao hơn grid editor
export const GROUND_THICK_MAX = 100 // mm = 10cm

// ── Factory ────────────────────────────────────────────────────────────────────

// Mặc định: lô ~216 m² (15.0×14.4m = 10×9.6 ×1.5 mỗi cạnh) ≈ 22% phủ nhà (rectangle 8×6 = 48 m²) —
// sân rộng có chỗ cho hồ nước cạnh nhà (sân = lô − footprint).
export function defaultSiteState(): SiteState {
  return {
    show: true,
    lotWidth: 15000,
    lotDepth: 14400,
    groundThick: GROUND_THICK_MIN,
    ground: 'grass',
    grass3d: {
      enabled: true,
      density: 100,
      height: 0.28,
      bladeWidth: 0.006, // 6mm gốc — thấy rõ ở preview, vẫn mảnh
      midWidth: 0.006, // 6mm thân — mặc định = gốc (lá đều rồi thon ngọn)
      segments: 5,
      taper: 0.7, // B1 — thon ngọn rõ, dáng cỏ thật (0 = chữ nhật B0)
      curveLR: 0, // thẳng mặc định
      bend: 0, // đứng thẳng mặc định (ngả dọc = bước chỉnh thêm)
      cup: 0, // phẳng mặc định
      cupGeo: false, // mặc định shader normal (rẻ); bật geometry fold thủ công khi cần cận cảnh
      cupNormalGain: 4, // độ gắt cụp shading (nhân với cup)
      bladesPerClump: 1, // mặc định lá đơn; tăng để thành bụi cỏ chân thật hơn
      clumpRadius: 0.04, // 4cm xòe bụi
      clumpSplay: 0.45, // ~26° nghiêng ngọn ra ngoài (mặt trong vào tâm)
      color: 0x4f7a33, // màu mặt ngoài xanh vừa
      innerColor: 0x273d19, // màu mặt trong (~0.5× ngoài) → two-tone
      shadowDark: 0.2, // bóng gốc mặt trong đậm ×0.2
      shadowSpan: 1 / 6, // bóng vươn tới 1/6 thân
      contactOn: true, // vệt tiếp đất bật
      contactDark: 0.45, // vệt tiếp đất đậm vừa (lọt khe lá vẫn thấy ở bãi dày nền cỏ xanh)
      contactRadius: 0.07, // 7cm rộng ngang (phủ kín khe giữa lá → nền gốc liền mảng tối)
    },
    waters: defaultWaters(),
    fence: { enabled: true, type: 'wood', height: 1200, inset: 100 },
  }
}

// Bộ hồ mặc định: 1 Pool BẬT (= hồ cũ) + 1 Pond + 1 Puddle TẮT (placeholder, coming soon). Mỗi loại
// có sẵn 1 instance để hàng tab không rỗng; nút "＋" thêm tiếp (instance mới luôn enabled=false — perf).
export function defaultWaters(): WaterConfig[] {
  return [makeWater('pool', true), makeWater('pond', false), makeWater('puddle', false)]
}

// Factory 1 hồ theo kind. enabled mặc định false (instance thêm-mới); chỉ pool đầu của defaultWaters bật.
export function makeWater(kind: WaterKind, enabled = false): WaterConfig {
  return {
    kind,
    enabled,
    shape: 'rect', // mặc định chữ nhật; đổi 'free' để kéo đỉnh polygon trong 3D
    width: kind === 'puddle' ? 1500 : 4000, // puddle nhỏ; pool/pond 4m ngang
    depth: kind === 'puddle' ? 1200 : 3000, // puddle nông/nhỏ; pool/pond 3m sâu
    points: [], // rỗng khi rect; seed 4 góc khi chuyển sang free
    offsetX: 0, // giữa theo X (editor stagger khi thêm nhiều)
    offsetZ: 5000, // +5m về trước nhà (footprint z≤3m; hồ z 3.5..6.5 trong lô z≤7.2m) — "cạnh building"
    color: 0x254a59, // xanh nước biển trầm
    reflectivity: 0.35, // rf0 nhìn thẳng (grazing tự lên gần 1 qua fresnel)
    flow: 0.4, // sóng cuộn vừa
    distortion: 0.4, // rung gương vừa
    rippleScale: 4, // sóng nhỏ/dày vừa
    depthY: kind === 'puddle' ? 200 : 600, // puddle 20cm nông; pool/pond 60cm
    bottomColor: 0x3a3329, // bùn/đá đáy đục
    tint: 0.4, // ám màu nước vừa (thấy đáy nhưng có chất nước)
    edgeWidth: 500, // 500mm dải coping mặc định quanh hồ
    floorMaterial: 'none', // placeholder — material thật sau
    wallMaterial: 'none',
    edgeMaterial: 'none',
  }
}

// ── Đối chiếu nhà / lô (建ぺい率) ─────────────────────────────────────────────────

export interface CoverageStats {
  lotArea: number // m²
  footprintArea: number // m² — diện tích nhà phủ (caller tính từ building, truyền vào)
  coveragePct: number // % = footprint / lot — đối chiếu với 30–60% chuẩn Nhật
  gardenArea: number // m² — sân vườn còn lại = lot − footprint
}

export function coverageStats(site: SiteState, footprintArea: number): CoverageStats {
  const lotArea = (site.lotWidth / 1000) * (site.lotDepth / 1000)
  const coveragePct = lotArea > 0 ? (footprintArea / lotArea) * 100 : 0
  return { lotArea, footprintArea, coveragePct, gardenArea: Math.max(0, lotArea - footprintArea) }
}

// ── Parse (tolerant) — fill default cho field thiếu, KHÔNG cần version ───────────
// SiteState là data phẳng → forward/backward-compat bằng default-fill, không bump schema building.

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

function parseGround(v: unknown, fallback: GroundMaterialKey): GroundMaterialKey {
  return v === 'soil' || v === 'gravel' || v === 'grass' ? v : fallback
}

function parseFence(raw: Partial<FenceConfig> | undefined, d: FenceConfig): FenceConfig {
  const r = raw ?? {}
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : d.enabled,
    type: r.type === 'wall' ? 'wall' : 'wood',
    height: num(r.height, d.height),
    inset: num(r.inset, d.inset),
  }
}

function parseColor(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) & 0xffffff : fallback
}

function parseGrass3d(raw: Partial<Grass3DConfig> | undefined, d: Grass3DConfig): Grass3DConfig {
  const r = raw ?? {}
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : d.enabled,
    density: clamp(num(r.density, d.density), 10, 400),
    height: clamp(num(r.height, d.height), 0.05, 0.6),
    bladeWidth: clamp(num(r.bladeWidth, d.bladeWidth), 0.001, 0.03),
    midWidth: clamp(num(r.midWidth, d.midWidth), 0.001, 0.03),
    segments: clamp(Math.round(num(r.segments, d.segments)), 1, 12),
    taper: clamp(num(r.taper, d.taper), 0, 1),
    curveLR: clamp(num(r.curveLR, d.curveLR), -1, 1),
    bend: clamp(num(r.bend, d.bend), 0, 1),
    cup: clamp(num(r.cup, d.cup), 0, 1),
    cupGeo: typeof r.cupGeo === 'boolean' ? r.cupGeo : d.cupGeo,
    cupNormalGain: clamp(num(r.cupNormalGain, d.cupNormalGain), 0, 10),
    bladesPerClump: clamp(Math.round(num(r.bladesPerClump, d.bladesPerClump)), 1, 12),
    clumpRadius: clamp(num(r.clumpRadius, d.clumpRadius), 0.005, 0.2),
    clumpSplay: clamp(num(r.clumpSplay, d.clumpSplay), 0, 1.2),
    color: parseColor(r.color, d.color),
    innerColor: parseColor(r.innerColor, d.innerColor),
    shadowDark: clamp(num(r.shadowDark, d.shadowDark), 0, 1),
    shadowSpan: clamp(num(r.shadowSpan, d.shadowSpan), 0.001, 1),
    contactOn: typeof r.contactOn === 'boolean' ? r.contactOn : d.contactOn,
    contactDark: clamp(num(r.contactDark, d.contactDark), 0, 1),
    contactRadius: clamp(num(r.contactRadius, d.contactRadius), 0.005, 0.3),
  }
}

// 1 phần tử → WaterPoint hợp lệ (clamp ±50m) hoặc null. Tách riêng cho parsePoints giữ complexity thấp.
function toWaterPoint(p: unknown): WaterPoint | null {
  if (!p || typeof p !== 'object') return null
  const px = (p as { x?: unknown }).x
  const pz = (p as { z?: unknown }).z
  if (typeof px !== 'number' || typeof pz !== 'number') return null
  if (!Number.isFinite(px) || !Number.isFinite(pz)) return null
  return { x: clamp(px, -50000, 50000), z: clamp(pz, -50000, 50000) }
}

// Polygon đỉnh: lọc phần tử hợp lệ, tối đa 32 đỉnh. Sai/thiếu → [].
function parsePoints(v: unknown): WaterPoint[] {
  if (!Array.isArray(v)) return []
  const out: WaterPoint[] = []
  for (const p of v) {
    const wp = toWaterPoint(p)
    if (wp) out.push(wp)
    if (out.length >= 32) break
  }
  return out
}

function parseKind(v: unknown, fallback: WaterKind): WaterKind {
  return v === 'pool' || v === 'pond' || v === 'puddle' ? v : fallback
}

// Material placeholder: chỉ 'none' hợp lệ hiện tại; giá trị lạ → 'none' (forward-compat khi thêm material).
function parseMat(v: unknown): WaterMaterialKey {
  return v === 'none' ? v : 'none'
}

function parseWater(raw: Partial<WaterConfig> | undefined, d: WaterConfig): WaterConfig {
  const r = raw ?? {}
  return {
    kind: parseKind(r.kind, d.kind),
    enabled: typeof r.enabled === 'boolean' ? r.enabled : d.enabled,
    shape: r.shape === 'free' ? 'free' : 'rect',
    width: clamp(num(r.width, d.width), 1000, 30000),
    depth: clamp(num(r.depth, d.depth), 1000, 30000),
    points: parsePoints(r.points),
    offsetX: clamp(num(r.offsetX, d.offsetX), -20000, 20000),
    offsetZ: clamp(num(r.offsetZ, d.offsetZ), -20000, 20000),
    color: parseColor(r.color, d.color),
    reflectivity: clamp(num(r.reflectivity, d.reflectivity), 0, 1),
    flow: clamp(num(r.flow, d.flow), 0, 3),
    distortion: clamp(num(r.distortion, d.distortion), 0, 2),
    rippleScale: clamp(num(r.rippleScale, d.rippleScale), 0.5, 20),
    depthY: clamp(num(r.depthY, d.depthY), 50, 3000),
    bottomColor: parseColor(r.bottomColor, d.bottomColor),
    tint: clamp(num(r.tint, d.tint), 0, 1),
    edgeWidth: clamp(num(r.edgeWidth, d.edgeWidth), 0, 2000),
    floorMaterial: parseMat(r.floorMaterial),
    wallMaterial: parseMat(r.wallMaterial),
    edgeMaterial: parseMat(r.edgeMaterial),
  }
}

// Mảng hồ — 3 nguồn (ưu tiên giảm dần): waters[] (format mới) → water đơn cũ (MIGRATE → 1 pool + placeholder
// pond/puddle) → default. Tolerant: phần tử sai bỏ qua, tối đa 16 hồ. Giữ backward-compat không bump schema.
function parseWaters(rawArr: unknown, legacy: unknown): WaterConfig[] {
  if (Array.isArray(rawArr)) {
    const out: WaterConfig[] = []
    for (const w of rawArr) {
      const kind = parseKind((w as { kind?: unknown } | null)?.kind, 'pool')
      out.push(parseWater(w as Partial<WaterConfig>, makeWater(kind, false)))
      if (out.length >= 16) break
    }
    return out.length ? out : defaultWaters()
  }
  if (legacy && typeof legacy === 'object') {
    // design cũ: 1 hồ `water` → thành Pl1 (pool, giữ enabled cũ) + seed placeholder Pond/Puddle TẮT.
    return [
      parseWater(legacy as Partial<WaterConfig>, makeWater('pool', true)),
      makeWater('pond', false),
      makeWater('puddle', false),
    ]
  }
  return defaultWaters()
}

export function parseSite(raw: unknown): SiteState {
  const d = defaultSiteState()
  if (!raw || typeof raw !== 'object') return d
  const o = raw as Partial<SiteState> & {
    fence?: Partial<FenceConfig>
    grass3d?: Partial<Grass3DConfig>
    waters?: unknown
    water?: Partial<WaterConfig> // legacy: design cũ lưu 1 hồ đơn → migrate trong parseWaters
  }
  return {
    show: typeof o.show === 'boolean' ? o.show : d.show,
    lotWidth: num(o.lotWidth, d.lotWidth),
    lotDepth: num(o.lotDepth, d.lotDepth),
    groundThick: clamp(num(o.groundThick, d.groundThick), GROUND_THICK_MIN, GROUND_THICK_MAX),
    ground: parseGround(o.ground, d.ground),
    grass3d: parseGrass3d(o.grass3d, d.grass3d),
    waters: parseWaters(o.waters, o.water),
    fence: parseFence(o.fence, d.fence),
  }
}
