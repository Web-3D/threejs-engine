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
  | 'cobblestone'
  | 'cinder-blocks-wall'
  | 'stone-wall'

// Ground key dùng TEXTURE ảnh (PhotoGround) — caller (archplan) bơm opts.groundTextures theo key. Thiếu
// texture → fallback màu phẳng GROUND_PRESETS. 'grass'(procedural)/'soil'/'gravel' KHÔNG ở đây (màu/shader).
// 🧱 cinder/stone-wall = bộ TƯỜNG (assets/textures/wall/) NHÓM CHUNG kho nền (NgQuan 2026-06-11 — mix fence
// mất cinder/stone) → chọn được ở MIX board lẫn ground select (nền lát đá/blocks cũng hợp).
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
  'cobblestone',
  'cinder-blocks-wall',
  'stone-wall',
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
  // 🎨 MIX mặt tường rào (chỉ type='wall' — PhotoGroundMix mapping 'wall', NgQuan 2026-06-11 "bỏ nền mix vào
  // tất cả tường"). Bật = THAY wallTex; KHÔNG cọ vẽ tay (planar đứng không có uv chu-vi). Optional → tắt.
  mix?: GroundMixParams
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
  // 💧 BẬT/TẮT riêng MẶT NƯỚC (perf): false = hồ giữ nguyên (đáy/lỗ/viền) nhưng mesh nước ẨN → reflector
  // KHÔNG render RTT (đỡ 1 lần render scene/frame; RTT lazy nên cũng không cấp VRAM). Khác `enabled` (tắt CẢ hồ).
  surfaceOn: boolean
  // (fishOn/fishCount/fishSpeed/fishSeed per-hồ GỠ 2026-06-11 cùng ngày ship — NgQuan đổi kiến trúc: bầy cá
  //  = INSTANCE ĐỘC LẬP `SiteState.fishSchools` (tab riêng mỗi bầy); save có field cũ được parse MIGRATE.)
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
  // 🪨 RÀO/VIỀN quanh hồ (chạy dọc VÀNH NGOÀI coping). Auto theo shape: rect → hàng rào gỗ (cọc + 2 thanh
  // ngang); tròn/ellipse/free → ĐÁ CUỘI tròn xếp liền uốn theo bờ. borderHeight = cao rào / đường kính đá.
  borderEnabled: boolean // bật rào/đá quanh hồ
  borderHeight: number // mm — cao hàng rào (rect) / đường kính đá cuội (cong). 100..1200
  borderColor: number // màu rào/đá khi borderMaterial='none' (gỗ nâu / đá xám) — 1 field dùng chung 2 mode
  borderMaterial: BorderMaterialKey // 'none' = màu phẳng; texture đá (triplanar) → áp lên geometry rào/đá
  borderStoneVar: number // % 0..100 — đá TO-NHỎ xen kẽ (bán kính mỗi viên lệch ±45%×var; 0 = đều cỡ). Chỉ đá cuội
  borderStoneJag: number // % 0..100 — GÓC CẠNH: đỉnh đá lệch bán kính random từ tâm (0 = tròn icosa). Chỉ đá cuội
  // 🎨 MIX đáy/vách hồ (PhotoGroundMix — NgQuan 2026-06-11 "bỏ nền mix vào thành hồ bơi + bottom"). Bật =
  // THAY floorMaterial/wallMaterial. floor mapping 'xz' (đáy nằm, cọ vẽ world-XZ); wall mapping 'uv'
  // (vách đứng — uv mét chu-vi×cao baked, cọ vẽ theo isect.uv). Optional → tắt (material đơn như cũ).
  floorMix?: GroundMixParams
  wallMix?: GroundMixParams
  // 🏔️ GÒ ĐÁY HỒ (NgQuan 2026-06-13 "thêm chế độ gò sân vườn vào đáy hồ") — DÙNG CHUNG TerrainConfig với nền
  // sân vườn (heightAt FBM + mounds). Bật = đáy basin grid hóa + nhô gò từ yBot LÊN (đảo/cồn ngầm), kẹp dưới
  // mặt nước/rim; taper về 0 ở mép → đáy gặp chân vách phẳng. Optional → tắt = đáy phẳng như cũ (backward-compat).
  // CHỈ ÁP cho kind='pond' (hồ thiên nhiên); pool/puddle luôn đáy phẳng (NgQuan 2026-06-13 tách 3 loại nước).
  floorTerrain?: TerrainConfig
  // 🐟 ĐÀN CÁ koi sống TRONG hồ này — CHỈ pond (hồ thiên nhiên). undefined/[] = không cá (pool sạch / puddle).
  // NHIỀU đàn (chuỗi bậc: bậc cao số-nhỏ to + ăn bậc thấp — fish-tier-taxonomy.md), mỗi đàn 1 `tier` + đói RIÊNG.
  // Vùng bơi = KHÔNG GIAN THẬT trong hồ (polygon form + depthY + floorTerrain) dùng CHUNG mọi đàn. NgQuan 2026-06-13.
  fishSchools?: FishSchool[]
}

// Chất liệu bề mặt hồ (đáy/tường): 'none' = màu phẳng bottomColor; 'tile' = caro hồ bơi (procedural
// checker + grout); GroundMaterialKey texture (cát/cỏ) = PhotoGround world-XZ lát đáy (đáy basin uv=world-XZ →
// khớp). Áp floor/wall riêng. edgeMaterial: chỉ 'none'. Texture đáy = material injected (groundMatByKey) caller-owned.
export type WaterMaterialKey = 'none' | 'tile' | GroundMaterialKey

// 🪨 Vật liệu RÀO/VIỀN quanh hồ: 'none' = màu phẳng borderColor; còn lại = texture đá (TexturedSurface triplanar,
// archplan bơm opts.borderMatByKey). Triplanar → áp được cả đá cuội (icosa) lẫn rào gỗ (box).
export type BorderMaterialKey = 'none' | 'icelandic-jagged' | 'coal-stone' | 'rock-rough'

// 🪨 LỐI ĐI LÁT ĐÁ (path-zone) — tham số rải đá StoneScatter cho 1 zone có zoneKind='path' (LOẠI zone bên trong
// G-level, KHÔNG còn tab riêng). KHUÔN = CHÍNH rect zone (length×width = frameW/D, offsetX/Z = vị trí). Đá tròn/
// ellipse Poisson không chạm (chừa khe). Props map thẳng StoneScatter (mm → m). Material đá DÙNG CHUNG cache border hồ.
export interface StonePathParams {
  rMin: number // mm — bán kính phiến nhỏ nhất (50..2000)
  rMax: number // mm — bán kính phiến lớn nhất = bán kính BAO → quyết định minDist (50..2000)
  ellipseMin: number // 0.1..1 — aspect ellipse tối thiểu (1 = tròn hết; <1 = dẹt)
  gap: number // mm — khe cỏ tối thiểu giữa 2 phiến mép-mép (0..1000)
  thickness: number // mm — dày phiến nhô trên cỏ (10..300)
  seed: number // 0..9999 — đổi layout + cỡ phiến (deterministic, tái lập)
  rot: number // độ — XOAY cả khung quanh Y (-180..180); xoay mesh, khung shape dùng GroundLayer.shape ('rect'|'circle')
  color: number // màu đá khi material='none' (StoneScatter material NỘI BỘ flat)
  material: BorderMaterialKey // 'none' = màu phẳng; texture đá (triplanar) → DÙNG CHUNG cache border hồ
}

// 🧱 SÂN GẠCH bond đều (paving-zone) — tham số BrickPaving cho zone zoneKind='paving' (consumer op #3,
// 2026-06-10 "làm 2 cái đầu"). KHUÔN = CHÍNH rect zone (length×width, offsetX/Z) như path. Viên block
// chữ nhật so le chừa khe + DECAY tuổi sân. Material texture DÙNG CHUNG cache đá border hồ (triplanar).
export interface PavingParams {
  brickL: number // mm — DÀI viên dọc hướng bond (50..500). Block sân chuẩn 200×100
  brickW: number // mm — RỘNG viên (50..500)
  brickH: number // mm — DÀY viên nhô trên nền (20..150)
  joint: number // mm — khe vữa/cát giữa viên (2..50)
  bond: number // 0..1 — so le hàng lẻ ×viên (0.5 = running bond · 0 = stack thẳng)
  seed: number // 0..9999 — deterministic: đổi viên rụng/lệch decay (tái lập)
  decay: number // 0..1 — tuổi sân: mất viên + lún + xoay lệch + sạm
  rot: number // độ — XOAY khung quanh Y (-180..180) — transform mesh như path
  color: number // màu viên khi material='none'
  material: BorderMaterialKey // 'none' = màu phẳng; texture (triplanar) → DÙNG CHUNG cache border hồ
}

// 🧱 TƯỜNG CONG (wall-zone) — tham số CurvedBrickWall cho zone zoneKind='wall' (gap 3 mạch tường gạch,
// 2026-06-10 "tiếp tường cong"). Cung tròn TÂM = offsetX/Z zone, KHÔNG dùng length/width (R + góc quét
// thay thế). Viên nhô 2 mặt + decay. Material texture viên DÙNG CHUNG cache đá border hồ (triplanar).
export interface WallCurveParams {
  radius: number // mm — bán kính cung đường TIM tường (300..20000)
  sweep: number // độ — góc quét cung (10..360; 360 = vòng kín)
  height: number // mm — cao tường (100..3000)
  thickness: number // mm — dày thân vữa (40..400)
  brickL: number // mm — dài mặt lộ viên (50..500; UK 215)
  brickH: number // mm — cao mặt lộ viên (20..200; UK 65)
  joint: number // mm — mạch vữa (2..50)
  seed: number // 0..9999 — deterministic: đổi viên rụng/lệch decay
  decay: number // 0..1 — tuổi tường: mất viên + thụt + xoay lệch + sạm
  rot: number // độ — XOAY cung quanh Y (-180..180) — transform mesh như path
  color: number // màu viên khi material='none'
  material: BorderMaterialKey // 'none' = màu phẳng; texture viên (triplanar) → DÙNG CHUNG cache border hồ
}

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
  // 🏔️ DRAPE: true = zone UỐN theo gò terrain (lưới displaced bám heightAt — như nền G0); false/thiếu = slab PHẲNG
  // (terrain GIỮ PHẲNG dưới nó qua mask = "phẳng pad"/patio). Chỉ hiệu lực khi terrain.enabled. Optional → false.
  drape?: boolean
  // 🏔️ TERRAIN RIÊNG zone: noise + mounds của RIÊNG zone (độc lập G0). Bật → zone displaced theo gò riêng (cộng dồn
  // gò G0 nếu drape). Optional → undefined (zone không có gò riêng). Cấu hình = cùng TerrainConfig với G0.
  terrain?: TerrainConfig
  // 🪨 LOẠI zone (chỉ op='add'): 'surface' (mặc định) = lớp vật liệu phủ; 'path' = rải đá StoneScatter trong rect
  // zone (Poisson, không chạm); 'paving' = 🧱 sân gạch bond đều BrickPaving (viên block so le + decay);
  // 'wall' = 🧱 TƯỜNG CONG CurvedBrickWall (cung tròn, viên 2 mặt + decay).
  // Optional → 'surface' (backward-compat). op='cut' bỏ qua field này.
  zoneKind?: 'surface' | 'path' | 'paving' | 'wall'
  // 🪨 Tham số rải đá khi zoneKind='path'. Khung = CHÍNH rect zone (length×width, offsetX/Z). Optional → makeStonePathParams.
  path?: StonePathParams
  // 🧱 Tham số sân gạch khi zoneKind='paving'. Khung = CHÍNH rect zone. Optional → makePavingParams.
  paving?: PavingParams
  // 🧱 Tham số tường cong khi zoneKind='wall'. TÂM cung = offsetX/Z (length/width KHÔNG dùng). Optional → makeWallCurveParams.
  wall?: WallCurveParams
  // 🎨 MIX NỀN (PhotoGroundMix TSL — port bộ nền Lab thay texture đơn, NgQuan 2026-06-10). Optional →
  // undefined = zone texture đơn `material` như cũ (backward-compat). Plan: Factory/deferred/ground-mix-port-plan.md.
  mix?: GroundMixParams
}

// 🧱 Quy luật TRỌNG LỰC/VỊ TRÍ cho 1 slot mix trên MẶT ĐỨNG (tường rêu phong — kiểu Substance generators):
// 'foot' = bùn đất bám CHÂN tường (gradient 1−y/h) · 'streak' = vệt nước CHẢY DỌC (fbm nén trục y) ·
// 'moss' = rêu ẨM (chân + mép loang nham nhở). undefined = không rule (mask fbm thuần như nền).
// CHỈ hiệu lực khi mix nằm trên mặt đứng (vách hồ/tường rào — mapping 'uv'/'wall'); mặt nằm bỏ qua.
export type MixGravityRule = 'foot' | 'streak' | 'moss'

// 🎨 1 SLOT lớp trộn của mix nền: texture kho (CHỈ key texture — isGroundTexKey) + ngưỡng + seed fbm riêng.
export interface GroundMixSlot {
  key: GroundMaterialKey
  bias: number // ngưỡng mask 0..1 (cao = ít xuất hiện)
  seed: number // seed fbm riêng slot (loang khác chỗ)
  rule?: MixGravityRule // 🧱 quy luật trọng lực (mặt đứng) — undefined = none. Đổi = rebuild graph (structural)
}

// 🎨 Tham số mix nền per-zone — khớp 1-1 uniforms PhotoGroundMix (shaders/ground/PhotoGroundMix).
export interface GroundMixParams {
  base: GroundMaterialKey
  slots: GroundMixSlot[] // ≤ 4
  maskScale: number // 1/m world — tần mask fbm
  maskSoft: number // mềm biên smoothstep
  heightK: number // height-lerp proxy (0 = fade đều)
  macro: number // sáng/tối tần thấp
  tint: number // loang úa nhuộm ấm
  bomb: number // 0 = lát thẳng · 1 = full bombing
  rotFree: number // 0 = 90°×k · 1 = góc tự do
  seed: number
  scaleJit: number
  margin: number // mép trộn 4 ô
  farOn: number // trộn xa dual-scale
  farRange: number // m — khoảng cách đạt trộn đầy
  // 🧱 Cường độ quy luật trọng lực (slot.rule, mặt đứng) 0..1 — uniform live. 0 = rule tắt hẳn.
  gravity: number
  // 🖌 Mask VẼ TAY (stage 3): base64 raw RGBA 128² (PaintMask), kênh R/G/B/A = slot 0..3, uv = bbox zone.
  // undefined = chưa vẽ (mask chỉ fbm). Ghi khi BUÔNG nét cọ (~87KB/zone — chỉ zone có vẽ mới mang).
  paint?: string
}

// Factory mix nền — defaults khớp uniform defaults PhotoGroundMix (cùng bộ số Lab đã chốt).
export function makeGroundMixParams(base: GroundMaterialKey = 'grass-o'): GroundMixParams {
  return {
    base,
    slots: [{ key: 'construction-gravel', bias: 0.5, seed: 13.7 }],
    maskScale: 0.6,
    maskSoft: 0.18,
    heightK: 0.3,
    macro: 0.35,
    tint: 0.25,
    bomb: 1,
    rotFree: 0,
    seed: 0,
    scaleJit: 0,
    margin: 0.12,
    farOn: 0.6,
    farRange: 16,
    gravity: 0.6, // 🧱 cường độ rule trọng lực (chỉ ăn khi slot có rule + mặt đứng)
  }
}

// 🏔️ GÒ NẶN-TAY (Phase 3): bump radial trên height-field. x/z = tâm (mm, local so tâm lô); radius = bán kính
// ảnh hưởng (mm); height = cao đỉnh (+gò / −lõm, mm); falloff = mềm rìa 0..1 (1 = mượt, →0 = đỉnh phẳng rộng).
export interface TerrainMound {
  x: number
  z: number
  radius: number
  height: number
  falloff?: number
}

// 🏔️ TERRAIN — nền sân vườn lồi-lõm (height-field). enabled=false → nền PHẲNG như cũ (opt-in, perf). Sinh gò bằng
// FBM noise nền + Σ gò nặn-tay; mask GIỮ PHẲNG ở pad nhà / quanh hồ / viền lô → móng/hồ/rào không đổi. Structural →
// rebuild geometry (debounced). Chi tiết thuật toán: ./terrain.ts. Sample cao-độ qua heightAt (geometry + cỏ).
export interface TerrainConfig {
  enabled: boolean // bật nền gò (tắt = phẳng tuyệt đối, path cũ)
  amplitude: number // mm — biên độ gò tổng (0..2000); cao nhất của nhấp nhô
  frequency: number // 1/m — tần số noise nền (0.02..1.0); thấp = gò TO/thưa, cao = gợn nhỏ
  octaves: number // số lớp FBM (1..8); nhiều = chi tiết nhiều cấp
  lacunarity: number // × tần số mỗi octave (1.5..3.0; mặc định 2.0)
  gain: number // × biên độ mỗi octave / persistence (0.2..0.8; cao = ráp)
  warp: number // domain warp 0..1 (méo miền cho gò tự nhiên; 0 = tắt)
  seed: number // đổi layout gò (0..9999; cùng seed = tái lập)
  resolution: number // mật độ lưới grid base ground (32..128) — geometry cost (check-perf)
  padMargin: number // mm — vành smoothstep quanh nhà/hồ về phẳng (mềm rìa pad; 0..3000)
  edgeFlat: number // mm — bề rộng band phẳng ở viền lô (rào/skirt; 0..3000)
  detail: number // cường độ normal chi tiết bề mặt 0..1 (Phase 4; 0 = tắt) — chưa dùng ở Phase 1
  mounds: TerrainMound[] // gò nặn-tay (Phase 3); Phase 1 = []
}

// 🐟 1 ĐÀN CÁ (PondFish) — CON của 1 hồ pond (WaterConfig.fishSchools[]). Vùng bơi = KHÔNG GIAN THẬT trong hồ
// (form polygon + chiều sâu depthY + gò đáy floorTerrain), cá đụng vách quay lại — KHÔNG có vị trí/bán kính
// riêng (lấy từ hồ chứa). Mọi tham số trừ count = LIVE (setter PondFish). NgQuan 2026-06-13: cá thuộc pond.
export interface FishSchool {
  enabled: boolean
  // 🐟 BẬC (tier 1..6) — chuỗi thức ăn: bậc CAO (số NHỎ) = to + ít con + ăn bậc thấp. Pond dùng 4-6 (koi→cá
  // nhỏ→tép); 1-3 = sea (cá voi/mập, deferred). Đổi tier → áp FISH_TIER_PRESETS (size/count). fish-tier-taxonomy.md.
  tier: number
  count: number // số cá (range theo FISH_TIER_PRESETS[tier]) — REBUILD commit (tạo/huỷ instance)
  size: number // mm — chiều dài cá (per-con ±20%) — LIVE setFishLength
  speed: number // m/s tốc bơi gốc — LIVE setSpeed
  seed: number // xáo bộ màu cam/đốm cả đàn — LIVE setColorSeed
  bodyWidth: number // ×tiết diện thân (0.2..2.5; 1 = gốc) — LIVE setBodyWidth (🐟 độ mập)
  colorBase: number // 🎨 màu nền thân (hex) — LIVE setColors
  colorPatch: number // 🎨 màu mảng koi (hex)
  colorSpot: number // 🎨 màu đốm (hex)
  patchAmount: number // 🎨 tỉ lệ mảng 0..1 — LIVE setPatchAmount
  swayAmp: number // 🐟 hành vi: biên độ lượn chữ S (×, 0..2) — LIVE setSwayAmp
  wanderAmp: number // 🐟 hành vi: độ lăng xăng (×, 0..2) — LIVE setWanderAmp
  bobAmp: number // 🐟 hành vi: nhấp nhô dọc (×, 0..3) — LIVE setBobAmp
  bankAmp: number // 🎢 hình thái: NGHIÊNG thân vào cua (×, 0..2) — LIVE setBankAmp
  pitchAmp: number // 🎢 hình thái: CHÚI mũi khi lặn/ngoi (×, 0..2) — LIVE setPitchAmp
  burstRate: number // 🐟 hành vi: tần suất BỨT TỐC ngẫu nhiên (0..1; 0 = tắt) — vài con phóng vọt rồi khựng — LIVE setBurstRate
  schooling: boolean // 🐟 hành vi: BƠI THEO ĐÀN (boids cohesion+alignment) — bật/tắt; pond ít con → mặc định tắt — LIVE setSchooling
  // 🐟 ĐỘ NO (slider "Đói"): 1 = no/đầy (bơi thường, KHÔNG bâu mồi) · →0 = đói dần (sau: càng bâu nhiều khi thả
  // mồi) · 0 = CHẾT phơi bụng (trôi dưới mặt, mọi hành vi off). Tiền đề click-cho-ăn (swarm = 1−satiation, sau). LIVE setSatiation
  satiation: number
}

// 🐟 PRESET theo BẬC (tier): nhãn loài + size/count mặc định + range. Bậc cao (số nhỏ) = to + ít con; bậc thấp =
// nhỏ + đông (NgQuan 2026-06-13). Pond = bậc 4-6 (số THẬT tra cứu: koi ~24-90cm · cá nhỏ 3-40cm · tép 1mm-4cm —
// engine stylized cá non). Bậc 1-3 = SEA (cá voi/mập, deferred fish-tier-taxonomy.md) → size kẹp trong range pond
// làm placeholder (nhãn ⏳). Đổi tier ở GUI = áp size/count preset (vẫn chỉnh tay sau).
export interface FishTierPreset {
  label: string // nhãn dropdown GUI (loài tiêu biểu)
  sizeMm: number // chiều dài mặc định (mm)
  sizeMin: number // range slider Cỡ cá theo bậc (mm) — vd bậc 5 max 120 (NgQuan 2026-06-13)
  sizeMax: number
  count: number // số con mặc định
  countMin: number // range slider Số cá
  countMax: number
  speed: number // m/s base — bậc THẤP chậm hơn chút (mồi); predator nhỉnh hơn để bắt kịp
  burstRate: number // 0..1 — bậc THẤP bứt tốc thường hơn (tăng động, hoảng)
  wanderAmp: number // × lăng xăng — bậc THẤP đổi hướng bất chợt nhiều hơn
}
// label chỉ tham khảo — GUI dropdown dùng FISH_TIER_OPTS (site.ts). pond dùng bậc 4-6; 1-3 sea (deferred).
export const FISH_TIER_PRESETS: Record<number, FishTierPreset> = {
  1: {
    label: 'Bậc 1 — Cá voi',
    sizeMm: 500,
    sizeMin: 300,
    sizeMax: 600,
    count: 1,
    countMin: 1,
    countMax: 2,
    speed: 0.25,
    burstRate: 0,
    wanderAmp: 0.6,
  },
  2: {
    label: 'Bậc 2 — Mập/Orca',
    sizeMm: 460,
    sizeMin: 250,
    sizeMax: 600,
    count: 3,
    countMin: 1,
    countMax: 5,
    speed: 0.28,
    burstRate: 0.1,
    wanderAmp: 0.7,
  },
  3: {
    label: 'Bậc 3 — Cá thu',
    sizeMm: 340,
    sizeMin: 150,
    sizeMax: 500,
    count: 6,
    countMin: 1,
    countMax: 10,
    speed: 0.3,
    burstRate: 0.2,
    wanderAmp: 0.9,
  },
  4: {
    label: 'Bậc 4 — Koi',
    sizeMm: 240,
    sizeMin: 120,
    sizeMax: 600,
    count: 14,
    countMin: 10,
    countMax: 20,
    speed: 0.25,
    burstRate: 0.1,
    wanderAmp: 1,
  },
  5: {
    label: 'Bậc 5 — Cá nhỏ',
    sizeMm: 90,
    sizeMin: 40,
    sizeMax: 120,
    count: 30,
    countMin: 5,
    countMax: 64,
    speed: 0.22,
    burstRate: 0.4,
    wanderAmp: 1.5,
  },
  6: {
    label: 'Bậc 6 — Tép',
    sizeMm: 45,
    sizeMin: 20,
    sizeMax: 60,
    count: 40,
    countMin: 10,
    countMax: 64,
    speed: 0.2,
    burstRate: 0.5,
    wanderAmp: 1.8,
  },
}
// Preset của 1 tier (kẹp 1..6 → bậc 4 nếu lạ). Dùng ở makeFishSchool/parse/GUI (1 nguồn).
export function fishTierPreset(tier: number): FishTierPreset {
  return FISH_TIER_PRESETS[tier] ?? FISH_TIER_PRESETS[4]
}

// 🌉 1 CẦU bắc ngang (bridge) — instance ĐẶT TỰ DO trong lô (thường bắc ngang hồ, nhưng đặt đâu cũng được).
// Tham số parametric kiểu industry (Houdini Arch Bridge SOP / CityEngine pier / RailClone deck+pier /
// SideFX Japanese taiko-bashi): nhịp + vồng vòm + ván + lan can + trụ đỡ. Gốc cầu tại MẶT NỀN (rim).
export interface BridgeConfig {
  enabled: boolean
  material: 'wood' | 'stone'
  shape: 'arch' | 'flat' // vòm taiko-bashi | THẲNG (boardwalk đường đi trên mặt hồ — sàn phẳng nâng đều `rise`)
  offsetX: number // mm — tâm cầu lệch tâm lô (X)
  offsetZ: number // mm — (Z)
  rotDeg: number // độ — hướng bắc qua hồ (xoay quanh Y)
  span: number // mm — chiều dài nhịp (trục dọc cầu)
  deckWidth: number // mm — bề rộng mặt cầu
  rise: number // mm — arch: độ vồng vòm; flat: cao độ sàn so mặt nền (0 = sát nền)
  plankCount: number // số tấm ván chia mặt cầu — ván RỜI (chừa khe) cho cảm giác ván gỗ thật
  deckThick: number // mm — DÀY mỗi tấm ván mặt cầu
  rimSize: number // mm — tiết diện VÀNH cầu (dầm biên liền bám vòm 2 cạnh, chỗ trụ con đứng — tạo độ dày mép)
  railOn: boolean
  railHeight: number // mm — cao lan can
  railBeam: number // mm — tiết diện dầm tay vịn lan can
  postCount: number // số trụ con lan can mỗi bên
  postWidth: number // mm — tiết diện trụ con lan can
  postShape: 'square' | 'round' // dáng trụ con: hộp vuông | trụ tròn
  pierOn: boolean
  pierCount: number // số HÀNG trụ đỡ dưới gầm — mỗi hàng 2 trụ 2 bên mép (dưới vành); đứng trên hồ tự đâm tới đáy
  pierWidth: number // mm — tiết diện trụ đỡ
  mix?: GroundMixParams // 🎨 MIX phủ mặt ván (PhotoGroundMix 'xz' — áp preset qua 🎯). undefined = gỗ/đá đơn
  rimMix?: GroundMixParams // 🎨 MIX vành biên (mapping 'wall' — box đa hướng). undefined = gỗ/đá đơn
  railMix?: GroundMixParams // 🎨 MIX tay vịn lan can ('wall')
  postMix?: GroundMixParams // 🎨 MIX trụ con lan can ('wall')
}

// 💡 1 ĐÈN sân vườn (trụ đèn). Vỏ = mesh (trụ+chụp+bóng glow emissive) site-kit dựng lại mỗi rebuild; REAL
// light = POOL editor-sở-hữu gán N fixture gần nhất (perf: KHÔNG add/remove light → né recompile NodeMaterial;
// xa cap = chỉ glow). Tự bật ban đêm: real-light intensity + glow × nightFactor (1−day, hoặc 1 khi sun tắt).
export interface LampConfig {
  enabled: boolean
  x: number // mm — world X tâm trụ (gốc tâm lô)
  z: number // mm — world Z
  height: number // mm — cao trụ (đất → bóng đèn)
  color: number // hex — màu ánh sáng (real light + tint glow)
  intensity: number // cường độ real light ban đêm (×nightFactor; PointLight)
  range: number // mm — tầm sáng (PointLight.distance); 0 = vô hạn
}

export interface SiteState {
  show: boolean // bật/tắt hiện nền lô (tắt → building về y=0, không đôn)
  lotWidth: number // mm — bề ngang lô (trục X)
  lotDepth: number // mm — chiều sâu lô (trục Z)
  groundThick: number // mm — dày slab nền 10..100 (1..10cm); ≥10 để mặt trên cao hơn grid → hết z-fight
  ground: GroundMaterialKey
  // 🎨 MIX NỀN cho G0 base (PhotoGroundMix — như GroundLayer.mix nhưng cho NỀN LÔ; NgQuan 2026-06-10
  // "bên phần G0 hiện ko có phần mix"). undefined = texture/màu đơn `ground` như cũ (backward-compat).
  groundMix?: GroundMixParams
  groundLayers?: GroundLayer[] // TẦNG surface chồng lên base (xếp lớp 3D). Optional → backward-compat (cũ = [])
  groundLevels?: number // SỐ G-level tường minh (G1..GN) — cho phép tầng RỖNG (chưa có zone/cut). Optional →
  // migrate = max(level layers) (backward-compat). Editor enumerate tab theo số này; render vẫn derive từ layers.
  terrain?: TerrainConfig // 🏔️ nền sân vườn lồi-lõm (height-field). Optional → backward-compat (cũ = phẳng/tắt)
  grass3d: Grass3DConfig // cỏ 3D nhú lên (tier B) — phủ lên nền cỏ khi bật
  waters: WaterConfig[] // hồ nước (tier C) đa-instance — chỉ kind='pool' & enabled mới render (xem renderPools)
  // (SiteState.fishSchools[] top-level GỠ 2026-06-13 — cá thành CON của hồ pond: WaterConfig.fishSchools[]. Migrate ở parseSite.)
  bridges: BridgeConfig[] // 🌉 cầu đa-instance đặt TỰ DO (tab C1 C2… — thường bắc ngang hồ)
  fences: FenceConfig[] // hàng rào đa-lớp — mỗi lớp 1 vòng đồng tâm ở inset riêng (render mọi lớp enabled)
  lamps: LampConfig[] // 💡 đèn sân vườn đa-instance (trụ đèn) — vỏ mesh + real-light pool editor gán N gần nhất
  // (rocks?: RockConfig[] đã GỠ 2026-06-09 — non bộ procedural "chưa ra dáng", thay bằng Houdini-bake asset
  //  → deferred/systems/houdini-bake-accents.md. Key `rocks` trong design cũ được parseSite bỏ qua an toàn.)
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
    zoneKind: 'surface', // 🪨 mặc định lớp vật liệu; đổi 'path' ở GUI để rải đá (path field init khi đổi)
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
  cobblestone: { color: 0x626263, roughness: 0.95 }, // đá cobblestone xám — fallback khi thiếu texture
  'cinder-blocks-wall': { color: 0x9a9690, roughness: 0.95 }, // 🧱 blocks xi măng (bộ tường nhóm chung kho) — fallback
  'stone-wall': { color: 0x8d8579, roughness: 0.92 }, // 🧱 đá xếp tường (bộ tường nhóm chung kho) — fallback
}

// 🏔️ Terrain mặc định: TẮT (nền phẳng như cũ). Bật → gò ~25cm, freq 0.12 (gò ~8m, vài gò trên lô 15m), 4 octave,
// pad mềm 1.5m + viền phẳng 0.8m. resolution 96 = lưới mịn vừa (~18k verts, trong budget). mounds rỗng (Phase 3).
export function defaultTerrain(): TerrainConfig {
  return {
    enabled: false,
    amplitude: 250,
    frequency: 0.12,
    octaves: 4,
    lacunarity: 2.0,
    gain: 0.5,
    warp: 0.3,
    seed: 1,
    resolution: 96,
    padMargin: 1500,
    edgeFlat: 800,
    detail: 0,
    mounds: [],
  }
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
    terrain: defaultTerrain(), // 🏔️ nền lồi-lõm — mặc định TẮT (phẳng)
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
    waters: defaultWaters(), // pond mặc định mang sẵn 1 bầy cá (makeWater gắn fish khi kind='pond')
    bridges: [], // 🌉 chưa có cầu nào — thêm qua ＋ ở tab Cầu
    fences: [makeFence()],
    lamps: [], // 💡 chưa có đèn nào — thêm qua ＋ ở tab Đèn
  }
}

// 💡 Đèn mặc định: trụ cao 3m, ánh ấm (warm 2700K-ish), tầm 8m. Đặt gốc lô — user kéo/chỉnh.
export function makeLamp(): LampConfig {
  return { enabled: true, x: 0, z: 0, height: 3000, color: 0xffd9a0, intensity: 8, range: 8000 }
}

// 🌉 Factory 1 cầu — đặt tự do (default rơi vào tâm pool đầu, offsetZ 5000 — user kéo đặt lại). Cầu vòm
// gỗ kiểu Nhật (taiko-bashi vừa vồng), có lan can + 2 hàng trụ đỡ (2 trụ/hàng).
export function makeBridge(): BridgeConfig {
  return {
    enabled: true,
    material: 'wood',
    shape: 'arch',
    offsetX: 0,
    offsetZ: 5000,
    rotDeg: 0,
    span: 5000,
    deckWidth: 1400,
    rise: 600,
    plankCount: 14,
    deckThick: 60,
    rimSize: 140,
    railOn: true,
    railHeight: 900,
    railBeam: 50,
    postCount: 6,
    postWidth: 50,
    postShape: 'square',
    pierOn: true,
    pierCount: 2,
    pierWidth: 120,
  }
}

// 🐟 Factory 1 ĐÀN cá — CON của 1 hồ pond (WaterConfig.fishSchools[]). tier (mặc định 4 = koi) áp size/count từ
// FISH_TIER_PRESETS; vùng bơi lấy từ hồ chứa. enabled=true → đàn hiện ngay khi pond bật (rẻ — 1 draw/đàn).
export function makeFishSchool(tier = 4): FishSchool {
  const p = fishTierPreset(tier)
  return {
    enabled: true, // đàn hiện ngay khi pond bật (rẻ — 1 draw)
    tier,
    count: p.count, // 🐟 số con mặc định theo bậc (bậc cao ít, bậc thấp đông)
    size: p.sizeMm, // 🐟 cỡ mặc định theo bậc
    speed: p.speed, // 🐟 bậc thấp chậm hơn chút (mồi)
    seed: 0,
    bodyWidth: 1, // độ mập gốc
    colorBase: 0xeee8db, // kem
    colorPatch: 0xe36112, // cam koi
    colorSpot: 0x141312, // đốm đậm
    patchAmount: 0.5,
    swayAmp: 1, // 🐟 hành vi mặc định = gốc
    wanderAmp: p.wanderAmp, // 🐟 bậc thấp lăng xăng hơn
    bobAmp: 1,
    bankAmp: 1, // 🎢 nghiêng thân vào cua (gốc)
    pitchAmp: 1, // 🎢 chúi mũi khi lặn/ngoi (gốc)
    burstRate: p.burstRate, // 🐟 bậc thấp bứt tốc thường hơn (tăng động)
    schooling: false, // 🐟 bơi theo đàn — mặc định TẮT (pond ít con, chưa cần quy mô)
    satiation: 1, // 🐟 no/đầy mặc định (kéo slider Đói về min = cá chết phơi bụng)
  }
}

// Bộ hồ mặc định: 1 Pool BẬT (= hồ cũ) + 1 Pond + 1 Puddle TẮT (placeholder, coming soon). Mỗi loại
// có sẵn 1 instance để hàng tab không rỗng; nút "＋" thêm tiếp (instance mới luôn enabled=false — perf).
export function defaultWaters(): WaterConfig[] {
  return [makeWater('pool', true), makeWater('pond', false), makeWater('puddle', false)]
}

// 🪨 Factory tham số rải đá cho path-zone (zoneKind='path'). seed NGẪU NHIÊN → mỗi zone khác layout; lưu lại nên
// save/load tái lập. Phiến 0.18..0.35m, khe 6cm. Khung = rect zone (length×width) → KHÔNG có ở đây.
export function makeStonePathParams(): StonePathParams {
  return {
    rMin: 180, // 18cm phiến nhỏ
    rMax: 350, // 35cm phiến lớn (= bán kính bao)
    ellipseMin: 0.6, // aspect ellipse tối thiểu (1 = tròn hết)
    gap: 60, // 6cm khe cỏ
    thickness: 50, // 5cm dày phiến
    seed: Math.floor(Math.random() * 1000),
    rot: 0, // không xoay
    color: 0x9b948a, // xám-đá
    material: 'none', // mặc định màu phẳng; chọn texture đá ở GUI (dùng chung cache border hồ)
  }
}

// 🧱 Factory tham số sân gạch cho paving-zone (zoneKind='paving'). Block sân chuẩn 200×100×60, khe 8mm,
// running bond. seed NGẪU NHIÊN lúc tạo (mỗi sân khác viên rụng) — lưu lại nên save/load tái lập.
export function makePavingParams(): PavingParams {
  return {
    brickL: 200, // block sân chuẩn 200×100
    brickW: 100,
    brickH: 60, // dày 6cm
    joint: 8, // khe 8mm
    bond: 0.5, // running bond
    seed: Math.floor(Math.random() * 1000),
    decay: 0, // sân mới tinh — kéo slider để cũ đi
    rot: 0,
    color: 0x9a6a52, // block đất nung
    material: 'none', // mặc định màu phẳng; texture triplanar dùng chung cache đá border hồ
  }
}

// 🧱 Factory tham số tường cong cho wall-zone (zoneKind='wall'). Cung R2m quét 120°, cao 1m, viên UK.
// seed NGẪU NHIÊN lúc tạo (mỗi tường khác viên rụng) — lưu lại nên save/load tái lập.
export function makeWallCurveParams(): WallCurveParams {
  return {
    radius: 2000, // R 2m
    sweep: 120, // cung 1/3 vòng
    height: 1000, // cao 1m — tường vườn
    thickness: 100, // dày 10cm
    brickL: 215, // viên UK (khớp InstancedBrickWall)
    brickH: 65,
    joint: 10,
    seed: Math.floor(Math.random() * 1000),
    decay: 0, // tường mới — kéo slider để cũ đi
    rot: 0,
    color: 0xb86042, // terra cotta
    material: 'none',
  }
}

// Factory 1 hồ theo kind. enabled mặc định false (instance thêm-mới); chỉ pool đầu của defaultWaters bật.
export function makeWater(kind: WaterKind, enabled = false): WaterConfig {
  return {
    kind,
    enabled,
    surfaceOn: true, // 💧 mặt nước bật mặc định; tắt = perf toggle (giữ hồ, ẩn mesh nước → RTT đứng)
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
    borderEnabled: false, // 🪨 rào/đá quanh hồ — mặc định tắt
    borderHeight: 350, // 35cm — cao rào / đường kính đá cuội
    borderStoneVar: 45, // đá to-nhỏ xen kẽ vừa phải (NgQuan 2026-06-10: "to hơi đều" → default có lệch cỡ)
    borderStoneJag: 35, // góc cạnh nhẹ — bớt "tròn quá" mà chưa thành đá dăm
    borderColor: 0x9a8f80, // xám-ấm (đá); đổi nâu ở GUI cho rào gỗ
    borderMaterial: 'none', // 'none' = màu phẳng; chọn texture đá ở GUI
    // 🐟 CHỈ pond mang sẵn 1 đàn cá bậc 4 (koi). pool/puddle = undefined (không cá). Thêm đàn/đổi bậc ở GUI.
    fishSchools: kind === 'pond' ? [makeFishSchool(4)] : undefined,
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

// ── Parse (tolerant) ─────────────────────────────────────────────────────────────
// Tầng deserialization (parse* default-fill, clamp, migrate format cũ) tách sang ./state-parse.ts để file
// này thuần schema+factory. Re-export parseSite (barrel) — consumer (persistence.ts) không đổi import.
export { parseSite } from './state-parse'
