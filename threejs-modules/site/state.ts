/**
 * VỊ TRÍ   — threejs-modules/site/state.ts  (site-kit — anh em building-kit)
 * VAI TRÒ  — NGUỒN SỰ THẬT cho "lô đất là gì": SiteState schema (nền + hàng rào) + factory +
 *            GROUND_PRESETS + JP defaults + coverageStats (đối chiếu nhà/lô). Pure data — KHÔNG DOM.
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

// Cỏ 3D thật (tier B — GrassBlades instanced). Chỉ render khi ground==='grass'.
// REBUILD TĂNG DẦN (preview-first): B0 = hình dáng trần. Thêm dần shape/màu-gradient/cong/xoắn/
// gió/cao-thấp/ngả/đổ-bóng ở các bước sau (mỗi bước thêm 1 field ở đây + 1 row panel + 1 uniform).
// Structural (density/height/width/segments/taper/curveLR/bend/cup/cupGeo/bladesPerClump/clumpRadius) → dựng lại; uniform (color) → live.
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
  bladesPerClump: number // số lá/cụm (bụi). 1 = lá đơn; >1 = gộp K lá vào 1 instance (budget-neutral, rải cụm)
  clumpRadius: number // m — bán kính xòe bụi
  clumpSplay: number // rad — nghiêng ngọn ra ngoài tâm (mặt trong vào tâm + xòe, bớt đâm xuyên)
  color: number // màu lá (B0: 1 màu phẳng; gradient = bước sau)
}

export interface SiteState {
  show: boolean // bật/tắt hiện nền lô (tắt → building về y=0, không đôn)
  lotWidth: number // mm — bề ngang lô (trục X)
  lotDepth: number // mm — chiều sâu lô (trục Z)
  groundThick: number // mm — dày slab nền 10..100 (1..10cm); ≥10 để mặt trên cao hơn grid → hết z-fight
  ground: GroundMaterialKey
  grass3d: Grass3DConfig // cỏ 3D nhú lên (tier B) — phủ lên nền cỏ khi bật
  fence: FenceConfig
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

// Mặc định: lô ~96 m² (10.0×9.6m) ≈ 50% phủ nhà mặc định (rectangle 8×6 = 48 m²) — sân vừa, không quá to.
export function defaultSiteState(): SiteState {
  return {
    show: true,
    lotWidth: 10000,
    lotDepth: 9600,
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
      bladesPerClump: 1, // mặc định lá đơn; tăng để thành bụi cỏ chân thật hơn
      clumpRadius: 0.04, // 4cm xòe bụi
      clumpSplay: 0.45, // ~26° nghiêng ngọn ra ngoài (mặt trong vào tâm)
      color: 0x4f7a33, // 1 màu lá xanh vừa
    },
    fence: { enabled: true, type: 'wood', height: 1200, inset: 100 },
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
    bladesPerClump: clamp(Math.round(num(r.bladesPerClump, d.bladesPerClump)), 1, 12),
    clumpRadius: clamp(num(r.clumpRadius, d.clumpRadius), 0.005, 0.2),
    clumpSplay: clamp(num(r.clumpSplay, d.clumpSplay), 0, 1.2),
    color: parseColor(r.color, d.color),
  }
}

export function parseSite(raw: unknown): SiteState {
  const d = defaultSiteState()
  if (!raw || typeof raw !== 'object') return d
  const o = raw as Partial<SiteState> & {
    fence?: Partial<FenceConfig>
    grass3d?: Partial<Grass3DConfig>
  }
  return {
    show: typeof o.show === 'boolean' ? o.show : d.show,
    lotWidth: num(o.lotWidth, d.lotWidth),
    lotDepth: num(o.lotDepth, d.lotDepth),
    groundThick: clamp(num(o.groundThick, d.groundThick), GROUND_THICK_MIN, GROUND_THICK_MAX),
    ground: parseGround(o.ground, d.ground),
    grass3d: parseGrass3d(o.grass3d, d.grass3d),
    fence: parseFence(o.fence, d.fence),
  }
}
