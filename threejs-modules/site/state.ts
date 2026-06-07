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
// 'grass' = procedural GrassGround; 'grass-tex' = texture ảnh (PhotoGround, cần caller bơm groundTextures —
// fallback màu phẳng nếu thiếu); 'soil'/'gravel' = màu phẳng preset.
export type GroundMaterialKey =
  | 'grass'
  | 'grass-tex'
  | 'soil'
  | 'gravel'
  | 'rippled-sand'
  | 'construction-gravel'
  | 'beach-gravel'
  | 'rough-asphalt'
  | 'worn-pavement'
  | 'roman-stone-floor'
  | 'artificial-turf'
  | 'grass-o'
  | 'thai-beach-sand-2k'
  | 'thai-beach-sand-4k'

// Ground key dùng TEXTURE ảnh (PhotoGround) — caller (archplan) bơm opts.groundTextures theo key. Thiếu
// texture → fallback màu phẳng GROUND_PRESETS. 'grass'(procedural)/'soil'/'gravel' KHÔNG ở đây (màu/shader).
const GROUND_TEX_KEYS = new Set<GroundMaterialKey>([
  'grass-tex',
  'rippled-sand',
  'construction-gravel',
  'beach-gravel',
  'rough-asphalt',
  'worn-pavement',
  'roman-stone-floor',
  'artificial-turf',
  'grass-o',
  'thai-beach-sand-2k',
  'thai-beach-sand-4k',
])
export function isGroundTexKey(k: GroundMaterialKey): boolean {
  return GROUND_TEX_KEYS.has(k)
}

export interface FenceConfig {
  enabled: boolean
  type: 'wood' | 'wall' // gỗ (cọc + thanh ngang) | tường rào xây (low wall liền)
  height: number // mm
  inset: number // mm — lùi vào từ mép lô (setback)
  // Vật liệu MẶT tường rào (chỉ áp khi type='wall'): 'plain' = màu phẳng xám; 'cinder'/'stone' = texture ảnh
  // PBR triplanar (caller bơm theo manifest assets/textures). Optional → backward-compat (file cũ = 'plain').
  wallTex?: 'plain' | 'cinder' | 'stone'
  // CỔNG ra vào (chỉ type='wall'): chừa khoảng trống 1 cạnh + 2 cột đá 2 bên. Optional → backward-compat.
  gate?: boolean
  gateSide?: number // cạnh đặt cổng: 0=trước(+Z) 1=sau(−Z) 2=phải(+X) 3=trái(−X)
  gateWidth?: number // mm — bề rộng khoảng trống cổng
  gatePos?: number // mm — dời tâm cổng dọc cạnh (0 = giữa cạnh)
  gatePostH?: number // mm — chiều cao 2 cột cổng (độc lập chiều cao tường — trụ cổng thường cao hơn)
}

// Factory 1 lớp rào. ĐA-LỚP: site.fences[] — mỗi lớp = 1 vòng rào đồng tâm ở inset RIÊNG (lớp ngoài inset
// nhỏ, lớp trong inset lớn). enabled mặc định true (lớp đầu); lớp thêm-mới editor stagger inset để khỏi chồng.
export function makeFence(overrides: Partial<FenceConfig> = {}): FenceConfig {
  return {
    enabled: true,
    type: 'wood',
    height: 1200,
    inset: 100,
    wallTex: 'plain',
    gate: false,
    gateSide: 0,
    gateWidth: 1400,
    gatePos: 0,
    gatePostH: 1600,
    ...overrides,
  }
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

// Đỉnh polygon mặt nước (mm, LOCAL so tâm hồ). Dùng khi shape='free'. Tay-cầm bezier (in/out, offset mm so anchor)
// — optional, thiếu cả 2 trên 1 đoạn → cạnh THẲNG (backward-compat polygon cũ). 2 tay-cầm độc lập = trộn góc/cong.
export interface WaterPoint {
  x: number
  z: number
  inX?: number // tay-cầm VÀO (tiếp tuyến cạnh tới đỉnh) — offset mm so anchor
  inZ?: number
  outX?: number // tay-cầm RA (tiếp tuyến cạnh rời đỉnh)
  outZ?: number
}

export interface WaterConfig {
  kind: WaterKind // pool = hồ gương (render); pond/puddle = placeholder, chưa render (lọc bởi renderPools)
  enabled: boolean
  shape: 'rect' | 'circle' | 'ellipse' | 'free' // chữ nhật | tròn | ellipse | polygon-bezier (kéo đỉnh+tay-cầm 3D)
  width: number // mm — bề ngang hồ (X): rect 2 cạnh / ellipse trục-X / circle đường-kính (=min width,depth)
  depth: number // mm — chiều sâu hồ (Z): rect 2 cạnh / ellipse trục-Z. (circle dùng min của 2)
  points: WaterPoint[] // đỉnh polygon (mm, local) — chỉ dùng khi shape='free'; <3 đỉnh → fallback rect
  offsetX: number // mm — tâm hồ lệch so tâm lô (X)
  offsetZ: number // mm — tâm hồ lệch so tâm lô (Z)
  color: number // màu nước (uniform live)
  reflectivity: number // rf0 [0..1] — phản chiếu khi nhìn thẳng (uniform live)
  flow: number // tốc độ cuộn sóng (uniform live)
  distortion: number // cường độ rung mặt gương (uniform live)
  detail: number // biên độ octave-2 FBM — độ nhiễu/turbulence chi tiết sóng (uniform live)
  refract: number // hệ số méo ảnh khúc-xạ (×distortion) — độ gợn ảnh đáy nhìn-xuyên-nước (uniform live)
  rippleScale: number // tần số gợn sóng (1/m) — thấp = sóng TO/thưa (uniform live, "Wave size")
  depthY: number // mm — độ sâu lòng hồ (đáy dưới mặt nền) → basin + nền khoét lỗ
  bottomColor: number // màu nền hồ (floor+wall) — tô khi material='none'; LÀ ô CHÍNH của caro khi 'tile'
  tileColor2: number // caro 'tile': màu ô XEN KẼ (ô kia = bottomColor). Baked vào shader → đổi = rebuild
  groutColor: number // caro 'tile': màu mạch vữa giữa các ô. Baked → đổi = rebuild
  tint: number // [0..1] — ám màu nước lên ảnh khúc xạ (absorption giả; cao = đục, đáy mờ) (uniform live)
  edgeWidth: number // mm — bề rộng dải coping/mép viền quanh hồ (0 = tắt). Render rect-frame ở mặt nền.
  floorMaterial: WaterMaterialKey // chất liệu đáy hồ: 'none' (màu bottomColor) | 'tile' (caro hồ bơi)
  wallMaterial: WaterMaterialKey // chất liệu tường hồ: 'none' | 'tile' (caro) — ĐỘC LẬP với floor
  edgeMaterial: WaterMaterialKey // chất liệu dải coping — hiện chỉ 'none' (chưa lát caro coping)
}

// Chất liệu bề mặt hồ (đáy/tường): 'none' = màu phẳng bottomColor; 'tile' = caro hồ bơi (procedural
// checker + grout); GroundMaterialKey texture (cát/cỏ) = PhotoGround world-XZ lát đáy (đáy basin uv=world-XZ →
// khớp). Áp floor/wall riêng. edgeMaterial: chỉ 'none'. Texture đáy = material injected (groundMatByKey) caller-owned.
export type WaterMaterialKey = 'none' | 'tile' | GroundMaterialKey

// TẦNG SURFACE chồng (nghệ thuật xếp lớp 3D): mỗi layer = 1 lớp vật liệu phủ kín lô, dày RIÊNG, xếp CHỒNG
// lên base ground (+ các layer trước). Top layer che layer dưới; KHOÉT lỗ 1 layer → lớp dưới lộ ra (carve =
// phase sau — chừa chỗ `holes?` để thêm). Đơn giản: material + thickness. lotShape (đã carve lỗ hồ) dùng chung.
export interface GroundLayer {
  material: GroundMaterialKey // vật liệu lớp (cùng bộ với base ground)
  thickness: number // mm — dày lớp 10..100 (1..10cm)
  length: number // mm — DÀI (trục X): rect 2 cạnh / ellipse trục-X / circle đường-kính (=min length,width). 500..40000
  width: number // mm — RỘNG (trục Z): rect 2 cạnh / ellipse trục-Z. 500..40000
  offsetX: number // mm — DỜI tâm layer theo X so tâm lô (Move tool kéo). Default 0
  offsetZ: number // mm — DỜI tâm layer theo Z. Default 0
  shape?: 'rect' | 'circle' | 'ellipse' | 'free' // hình mảng (tessellate ở shapes.ts). Optional → 'rect' (backward-compat)
  points?: WaterPoint[] // đỉnh + tay-cầm bezier khi shape='free' — DÙNG CHUNG WaterPoint. Optional
  op?: 'add' | 'cut' // 'add' = mảng phủ material riêng; 'cut' = khoét add-layer cùng/cao level hơn → LỘ level dưới. Optional → 'add'
  level?: number // G-LEVEL (1-based) — gom GUI thành G1/G2…; cut level N khoét add-layer level≥N (lộ level N−1). Optional → 1
}

export interface SiteState {
  show: boolean // bật/tắt hiện nền lô (tắt → building về y=0, không đôn)
  lotWidth: number // mm — bề ngang lô (trục X)
  lotDepth: number // mm — chiều sâu lô (trục Z)
  groundThick: number // mm — dày slab nền 10..100 (1..10cm); ≥10 để mặt trên cao hơn grid → hết z-fight
  ground: GroundMaterialKey
  groundLayers?: GroundLayer[] // TẦNG surface chồng lên base (xếp lớp 3D). Optional → backward-compat (cũ = [])
  groundLevels?: number // SỐ G-level tường minh (G1..GN) — cho phép tầng RỖNG (chưa có zone/cut). Optional →
  // migrate = max(level layers) (backward-compat). Editor enumerate tab theo số này; render vẫn derive từ layers.
  grass3d: Grass3DConfig // cỏ 3D nhú lên (tier B) — phủ lên nền cỏ khi bật
  waters: WaterConfig[] // hồ nước (tier C) đa-instance — chỉ kind='pool' & enabled mới render (xem renderPools)
  fences: FenceConfig[] // hàng rào đa-lớp — mỗi lớp 1 vòng đồng tâm ở inset riêng (render mọi lớp enabled)
}

// Factory 1 tầng surface chồng. Default soil 1cm, tấm 10×10m — lớp mới mỏng tối thiểu, vật liệu khác base.
export function makeGroundLayer(overrides: Partial<GroundLayer> = {}): GroundLayer {
  return {
    material: 'soil',
    thickness: GROUND_THICK_MIN,
    length: 10000,
    width: 10000,
    offsetX: 0,
    offsetZ: 0,
    shape: 'rect',
    op: 'add',
    level: 1,
    ...overrides,
  }
}

// Hồ LÕM render được = pool & pond ĐANG BẬT (có basin đáy+vách + KHOÉT lỗ nền). Dùng bởi renderer (basin/
// coping) + editor (khoét lỗ/lưới/drag). Pond "y như" pool (cùng WaterSurface) — phân hoá thông số sau.
export function renderWaters(site: SiteState): WaterConfig[] {
  return site.waters.filter((w) => (w.kind === 'pool' || w.kind === 'pond') && w.enabled)
}

// Vũng nước (puddle) ĐANG BẬT = mặt nước PHẲNG đặt TRÊN nền (KHÔNG đáy/vách/coping, KHÔNG khoét lỗ). Tách
// khỏi renderWaters vì khác hẳn cách dựng (flat surface) — chỉ né cỏ (exclude) + drag/tune như hồ thường.
export function renderPuddles(site: SiteState): WaterConfig[] {
  return site.waters.filter((w) => w.kind === 'puddle' && w.enabled)
}

// ── Presets ──────────────────────────────────────────────────────────────────────

export const GROUND_PRESETS: Record<GroundMaterialKey, { color: number; roughness: number }> = {
  grass: { color: 0x4a7c3a, roughness: 0.95 }, // cỏ xanh (procedural — preset chỉ fallback)
  'grass-tex': { color: 0x546029, roughness: 0.92 }, // olive (= avgColor uncut-grass) — fallback khi thiếu texture
  soil: { color: 0x6b4a2f, roughness: 1.0 }, // đất nâu
  gravel: { color: 0x8a8680, roughness: 0.9 }, // sỏi xám
  'rippled-sand': { color: 0xcbb894, roughness: 1.0 }, // cát rám — fallback khi thiếu texture
  'construction-gravel': { color: 0x8a857d, roughness: 0.95 }, // sỏi xám xây dựng
  'beach-gravel': { color: 0x9c948a, roughness: 0.92 }, // sỏi biển xám-rám
  'rough-asphalt': { color: 0x4a4a4d, roughness: 0.95 }, // nhựa đường xám đậm
  'worn-pavement': { color: 0x8f8a82, roughness: 0.93 }, // vỉa hè mòn xám
  'roman-stone-floor': { color: 0xb0a48d, roughness: 0.85 }, // sàn đá La Mã be-rám
  'artificial-turf': { color: 0x4a7d40, roughness: 0.88 }, // cỏ nhân tạo xanh — fallback khi thiếu texture
  'grass-o': { color: 0x556b2b, roughness: 0.93 }, // cỏ tự nhiên (oeeb70) xanh-olive — fallback
  'thai-beach-sand-2k': { color: 0xd6c5a0, roughness: 1.0 }, // cát biển Thái rám ấm — fallback
  'thai-beach-sand-4k': { color: 0xd6c5a0, roughness: 1.0 }, // cát biển Thái 4K (cùng màu fallback)
}

export const GROUND_THICK_MIN = 10 // mm = 1cm — default, đáy ở y=0 → top cao hơn grid editor
export const GROUND_THICK_MAX = 100 // mm = 10cm
export const GROUND_LAYER_SIZE_MIN = 500 // mm = 0.5m — cạnh nhỏ nhất tấm layer chồng
export const GROUND_LAYER_SIZE_MAX = 40000 // mm = 40m — cạnh lớn nhất (dài/rộng) tấm layer chồng

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
    groundLayers: [], // chưa có tầng chồng (thêm qua ＋ ở GUI)
    groundLevels: 0, // chưa có G-level nào (chỉ G0 base); ＋ tăng dần
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
    fences: [makeFence()],
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
    reflectivity: 0.3, // rf0 nhìn thẳng (grazing tự lên gần 1 qua fresnel) — Mirror 30% (user-tuned)
    flow: 0.1, // sóng cuộn chậm — Wave spd 10% (user-tuned)
    distortion: 0.05, // rung gương nhẹ — Ripple 5% (mặt hồ phẳng, gợn rất nhẹ)
    detail: 1.5, // nhiễu octave-2 TỐI ĐA — Turbulence 150% (sóng xáo trộn, hết "đều") (user-tuned)
    refract: 1.6, // méo khúc-xạ mạnh — Refraction 160% (caro đáy gợn rõ) (user-tuned)
    rippleScale: 1, // sóng TO/thưa — Wave size 12 (13−rippleScale; thấp = to) (user-tuned)
    depthY: kind === 'puddle' ? 200 : 600, // puddle 20cm nông; pool/pond 60cm
    bottomColor: kind === 'pool' ? 0xa8ceff : 0x3a3329, // pool: gạch xanh nhạt #a8ceff; pond/puddle: bùn đục
    tileColor2: 0xd9e8ff, // caro ô xen kẽ (sáng hơn) — khớp look dẫn-xuất cũ của #a8ceff
    groutColor: 0x7590b3, // caro mạch vữa (xanh trầm)
    tint: 0.1, // ám màu nước nhẹ — Murk 10% (nước khá trong, vẫn thấy đáy) (user-tuned)
    edgeWidth: 500, // 500mm dải coping mặc định quanh hồ
    floorMaterial: 'none', // 'tile' = caro hồ bơi (đổi ở GUI Bottom → Floor/Wall mat)
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
  return typeof v === 'string' && v in GROUND_PRESETS ? (v as GroundMaterialKey) : fallback
}

// Tầng surface chồng: mảng (cap 8 lớp) — mỗi lớp material hợp lệ + thickness clamp 1..10cm. Sai → bỏ qua an toàn.
function parseGroundLayers(raw: unknown): GroundLayer[] {
  if (!Array.isArray(raw)) return []
  return raw.slice(0, 24).map((r, idx) => {
    const o = (r ?? {}) as Partial<GroundLayer>
    return {
      material: parseGround(o.material, 'soil'),
      thickness: clamp(num(o.thickness, GROUND_THICK_MIN), GROUND_THICK_MIN, GROUND_THICK_MAX),
      length: clamp(num(o.length, 10000), GROUND_LAYER_SIZE_MIN, GROUND_LAYER_SIZE_MAX),
      width: clamp(num(o.width, 10000), GROUND_LAYER_SIZE_MIN, GROUND_LAYER_SIZE_MAX),
      offsetX: clamp(num(o.offsetX, 0), -GROUND_LAYER_SIZE_MAX, GROUND_LAYER_SIZE_MAX),
      offsetZ: clamp(num(o.offsetZ, 0), -GROUND_LAYER_SIZE_MAX, GROUND_LAYER_SIZE_MAX),
      shape: o.shape === 'circle' || o.shape === 'ellipse' || o.shape === 'free' ? o.shape : 'rect',
      points: parsePoints(o.points), // dùng chung parse với hồ (đỉnh + tay-cầm bezier)
      op: o.op === 'cut' ? 'cut' : 'add',
      level: clamp(num(o.level, idx + 1), 1, 99), // thiếu level (design cũ) → migrate idx+1 (giữ tách G1/G2…)
    }
  })
}

function parseFence(raw: Partial<FenceConfig> | undefined, d: FenceConfig): FenceConfig {
  const r = raw ?? {}
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : d.enabled,
    type: r.type === 'wall' ? 'wall' : 'wood',
    height: num(r.height, d.height),
    inset: num(r.inset, d.inset),
    wallTex: r.wallTex === 'cinder' || r.wallTex === 'stone' ? r.wallTex : 'plain',
    gate: typeof r.gate === 'boolean' ? r.gate : false,
    gateSide: r.gateSide === 1 || r.gateSide === 2 || r.gateSide === 3 ? r.gateSide : 0,
    gateWidth: clamp(num(r.gateWidth, 1400), 600, 6000),
    gatePos: num(r.gatePos, 0),
    gatePostH: clamp(num(r.gatePostH, 1600), 600, 3500),
  }
}

// Mảng rào — 2 nguồn (ưu tiên giảm dần): fences[] (format mới) → fence đơn cũ (MIGRATE → [fence]) → default.
// Tolerant: phần tử sai vẫn parse (parseFence default-fill), tối đa 8 lớp. Backward-compat không bump schema.
function parseFences(
  rawArr: unknown,
  legacy: Partial<FenceConfig> | undefined,
  d: FenceConfig
): FenceConfig[] {
  if (Array.isArray(rawArr)) {
    const out: FenceConfig[] = []
    for (const f of rawArr) {
      out.push(parseFence(f as Partial<FenceConfig>, d))
      if (out.length >= 8) break
    }
    return out.length ? out : [makeFence()]
  }
  if (legacy && typeof legacy === 'object') return [parseFence(legacy, d)] // design cũ: 1 rào đơn → [rào]
  return [makeFence()]
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
// Tay-cầm bezier (in/out): optional, chỉ nhận khi là số hữu hạn (clamp ±50m) → giữ undefined nếu thiếu (cạnh thẳng).
function toWaterPoint(p: unknown): WaterPoint | null {
  if (!p || typeof p !== 'object') return null
  const px = (p as { x?: unknown }).x
  const pz = (p as { z?: unknown }).z
  if (typeof px !== 'number' || typeof pz !== 'number') return null
  if (!Number.isFinite(px) || !Number.isFinite(pz)) return null
  const r = p as Record<string, unknown>
  const wp: WaterPoint = { x: clamp(px, -50000, 50000), z: clamp(pz, -50000, 50000) }
  for (const k of ['inX', 'inZ', 'outX', 'outZ'] as const) {
    const v = r[k]
    if (typeof v === 'number' && Number.isFinite(v)) wp[k] = clamp(v, -50000, 50000)
  }
  return wp
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

// Material hồ: 'none' | 'tile' (caro) | GroundMaterialKey texture (cát/cỏ đáy hồ). Lạ → 'none' (forward-compat).
function parseMat(v: unknown): WaterMaterialKey {
  if (v === 'tile') return 'tile'
  if (typeof v === 'string' && v in GROUND_PRESETS) return v as GroundMaterialKey // texture/ground key
  return 'none'
}

function parseWater(raw: Partial<WaterConfig> | undefined, d: WaterConfig): WaterConfig {
  const r = raw ?? {}
  return {
    kind: parseKind(r.kind, d.kind),
    enabled: typeof r.enabled === 'boolean' ? r.enabled : d.enabled,
    shape: r.shape === 'free' || r.shape === 'circle' || r.shape === 'ellipse' ? r.shape : 'rect',
    width: clamp(num(r.width, d.width), 1000, 30000),
    depth: clamp(num(r.depth, d.depth), 1000, 30000),
    points: parsePoints(r.points),
    offsetX: clamp(num(r.offsetX, d.offsetX), -20000, 20000),
    offsetZ: clamp(num(r.offsetZ, d.offsetZ), -20000, 20000),
    color: parseColor(r.color, d.color),
    reflectivity: clamp(num(r.reflectivity, d.reflectivity), 0, 1),
    flow: clamp(num(r.flow, d.flow), 0, 3),
    distortion: clamp(num(r.distortion, d.distortion), 0, 2),
    detail: clamp(num(r.detail, d.detail), 0, 1.5),
    refract: clamp(num(r.refract, d.refract), 0, 2),
    rippleScale: clamp(num(r.rippleScale, d.rippleScale), 0.5, 20),
    depthY: clamp(num(r.depthY, d.depthY), 50, 3000),
    bottomColor: parseColor(r.bottomColor, d.bottomColor),
    tileColor2: parseColor(r.tileColor2, d.tileColor2),
    groutColor: parseColor(r.groutColor, d.groutColor),
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
    fences?: unknown
    fence?: Partial<FenceConfig> // legacy: design cũ lưu 1 rào đơn → migrate trong parseFences
    grass3d?: Partial<Grass3DConfig>
    waters?: unknown
    water?: Partial<WaterConfig> // legacy: design cũ lưu 1 hồ đơn → migrate trong parseWaters
  }
  const groundLayers = parseGroundLayers(o.groundLayers)
  return {
    show: typeof o.show === 'boolean' ? o.show : d.show,
    lotWidth: num(o.lotWidth, d.lotWidth),
    lotDepth: num(o.lotDepth, d.lotDepth),
    groundThick: clamp(num(o.groundThick, d.groundThick), GROUND_THICK_MIN, GROUND_THICK_MAX),
    ground: parseGround(o.ground, d.ground),
    groundLayers,
    groundLevels: parseGroundLevels(o.groundLevels, groundLayers),
    grass3d: parseGrass3d(o.grass3d, d.grass3d),
    waters: parseWaters(o.waters, o.water),
    fences: parseFences(o.fences, o.fence, d.fences[0]),
  }
}

// Số G-level tường minh. Thiếu (design cũ) → max(level) của layers (mọi level đang có layer đều hiện). Luôn ≥
// max(level) để KHÔNG ẩn tầng đang có zone/cut. clamp 0..99.
function parseGroundLevels(raw: unknown, layers: GroundLayer[]): number {
  const maxLv = layers.reduce((m, l) => Math.max(m, l.level ?? 1), 0)
  const n = typeof raw === 'number' && Number.isFinite(raw) ? Math.floor(raw) : maxLv
  return clamp(Math.max(n, maxLv), 0, 99)
}
