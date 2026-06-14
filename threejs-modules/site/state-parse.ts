/**
 * VỊ TRÍ   — threejs-modules/site/state-parse.ts  (site-kit — anh em state.ts)
 * VAI TRÒ  — Tầng DESERIALIZATION cho SiteState: parse* tolerant (default-fill field thiếu, clamp range,
 *            migrate format cũ) — KHÔNG cần version. Tách khỏi state.ts (962 dòng) để state.ts thuần
 *            schema+factory; file này thuần "đọc data lỏng → SiteState chắc".
 * LIÊN HỆ  — Import types + factory (make… / default… / GROUND_PRESETS) từ ./state. state.ts re-export parseSite
 *            (barrel) nên consumer (persistence.ts) không đổi import. Cặp circular an toàn: parse chỉ chạm
 *            giá trị state.ts lúc RUNTIME (trong thân hàm), không lúc module-init.
 *
 * Tất cả kích thước mm (đồng bộ state.ts). SiteState là data phẳng → forward/backward-compat bằng
 * default-fill, KHÔNG bump schema building.
 */

import type {
  BorderMaterialKey,
  BridgeConfig,
  FenceConfig,
  FishSchool,
  Grass3DConfig,
  GroundLayer,
  GroundMaterialKey,
  GroundMixParams,
  GroundMixSlot,
  LampConfig,
  PavingParams,
  SiteState,
  StonePathParams,
  TerrainConfig,
  TerrainMound,
  WallCurveParams,
  WaterConfig,
  WaterKind,
  WaterMaterialKey,
  WaterPoint,
} from './state'
import {
  defaultSiteState,
  defaultTerrain,
  defaultWaters,
  GROUND_LAYER_SIZE_MAX,
  GROUND_LAYER_SIZE_MIN,
  GROUND_PRESETS,
  GROUND_THICK_MAX,
  GROUND_THICK_MIN,
  makeBridge,
  makeFence,
  makeFishSchool,
  makeGroundMixParams,
  makeLamp,
  makePavingParams,
  makeStonePathParams,
  makeWallCurveParams,
  makeWater,
} from './state'

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

function parseColor(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) & 0xffffff : fallback
}

function parseGround(v: unknown, fallback: GroundMaterialKey): GroundMaterialKey {
  return typeof v === 'string' && v in GROUND_PRESETS ? (v as GroundMaterialKey) : fallback
}

// 🎨 Field mix OPTIONAL (fence/water/zone) — thiếu = tắt (undefined, KHÔNG default-fill: backward-compat).
function optMix(v: unknown): GroundMixParams | undefined {
  return v !== undefined ? parseGroundMix(v) : undefined
}

// Parse mix nền — số sai/thiếu → default; slots cap 4, key texture sai → construction-gravel. Backward-safe.
function parseGroundMix(raw: unknown): GroundMixParams {
  const o = (raw ?? {}) as Partial<GroundMixParams>
  const d = makeGroundMixParams()
  const f = (v: unknown, dv: number, lo: number, hi: number): number => clamp(num(v, dv), lo, hi)
  const slots = Array.isArray(o.slots)
    ? o.slots.slice(0, 4).map((s) => {
        const so = (s ?? {}) as Partial<GroundMixSlot>
        return {
          key: parseGround(so.key, 'construction-gravel'),
          bias: f(so.bias, 0.5, 0, 1),
          seed: num(so.seed, 13.7),
          // 🧱 rule trọng lực — giá trị lạ/thiếu → undefined (none)
          rule:
            so.rule === 'foot' || so.rule === 'streak' || so.rule === 'moss' ? so.rule : undefined,
        }
      })
    : d.slots
  return {
    base: parseGround(o.base, d.base),
    slots,
    maskScale: f(o.maskScale, d.maskScale, 0.05, 5),
    maskSoft: f(o.maskSoft, d.maskSoft, 0.01, 0.5),
    heightK: f(o.heightK, d.heightK, 0, 1),
    macro: f(o.macro, d.macro, 0, 1),
    tint: f(o.tint, d.tint, 0, 1),
    bomb: f(o.bomb, d.bomb, 0, 1),
    rotFree: f(o.rotFree, d.rotFree, 0, 1),
    seed: f(o.seed, d.seed, 0, 999),
    scaleJit: f(o.scaleJit, d.scaleJit, 0, 0.5),
    margin: f(o.margin, d.margin, 0.02, 0.49),
    farOn: f(o.farOn, d.farOn, 0, 1),
    farRange: f(o.farRange, d.farRange, 4, 60),
    gravity: f(o.gravity, d.gravity, 0, 1), // 🧱 file cũ thiếu → default 0.6
    // 🖌 mask vẽ tay — chuỗi base64 giữ nguyên (PaintMask.loadBase64 tự bỏ qua nếu hỏng/lệch size)
    paint: typeof o.paint === 'string' && o.paint !== '' ? o.paint : undefined,
  }
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
      drape: o.drape === true, // 🏔️ zone bám gò (lưới displaced) — thiếu = false (slab phẳng pad)
      terrain: o.terrain !== undefined ? parseTerrain(o.terrain, defaultTerrain()) : undefined, // 🏔️ gò riêng zone
      zoneKind: parseZoneKind(o.zoneKind), // 🪨🧱 LOẠI zone — thiếu = 'surface' (backward-compat)
      ...parseZoneKindParams(o), // 🪨🧱 path/paving/wall — tách hàm (callback chạm trần complexity)
      mix: o.mix !== undefined ? parseGroundMix(o.mix) : undefined, // 🎨 mix nền — thiếu = texture đơn
    }
  })
}

// 🪨 Tham số rải đá path-zone — clamp khớp slider GUI. rMin kẹp ≤ rMax. Thiếu → makeStonePathParams default.
function parseStonePathParams(raw: unknown): StonePathParams {
  const r = (raw ?? {}) as Partial<StonePathParams>
  const d = makeStonePathParams()
  const rMax = clamp(num(r.rMax, d.rMax), 50, 2000)
  return {
    rMin: Math.min(clamp(num(r.rMin, d.rMin), 50, 2000), rMax),
    rMax,
    ellipseMin: clamp(num(r.ellipseMin, d.ellipseMin), 0.1, 1),
    gap: clamp(num(r.gap, d.gap), 0, 1000),
    thickness: clamp(num(r.thickness, d.thickness), 10, 300),
    seed: Math.round(clamp(num(r.seed, d.seed), 0, 9999)),
    rot: clamp(num(r.rot, d.rot), -180, 180),
    color: parseColor(r.color, d.color),
    material: parseBorderMat(r.material),
  }
}

// 🪨🧱 LOẠI zone từ raw — tách hàm (callback parseGroundLayers chạm trần complexity 10).
function parseZoneKind(v: unknown): 'surface' | 'path' | 'paving' | 'wall' {
  return v === 'path' || v === 'paving' || v === 'wall' ? v : 'surface'
}

// 🪨🧱 3 bộ tham số zone-kind optional (path/paving/wall) — tách khỏi callback parseGroundLayers (≤10).
function parseZoneKindParams(
  o: Partial<GroundLayer>
): Pick<GroundLayer, 'path' | 'paving' | 'wall'> {
  return {
    path: o.path !== undefined ? parseStonePathParams(o.path) : undefined,
    paving: o.paving !== undefined ? parsePavingParams(o.paving) : undefined,
    wall: o.wall !== undefined ? parseWallCurveParams(o.wall) : undefined,
  }
}

// 🧱 Tham số tường cong wall-zone — clamp khớp slider GUI. Thiếu → makeWallCurveParams default.
function parseWallCurveParams(raw: unknown): WallCurveParams {
  const r = (raw ?? {}) as Partial<WallCurveParams>
  const d = makeWallCurveParams()
  return {
    radius: clamp(num(r.radius, d.radius), 300, 20000),
    sweep: clamp(num(r.sweep, d.sweep), 10, 360),
    height: clamp(num(r.height, d.height), 100, 3000),
    thickness: clamp(num(r.thickness, d.thickness), 40, 400),
    brickL: clamp(num(r.brickL, d.brickL), 50, 500),
    brickH: clamp(num(r.brickH, d.brickH), 20, 200),
    joint: clamp(num(r.joint, d.joint), 2, 50),
    seed: Math.round(clamp(num(r.seed, d.seed), 0, 9999)),
    decay: clamp(num(r.decay, d.decay), 0, 1),
    rot: clamp(num(r.rot, d.rot), -180, 180),
    color: parseColor(r.color, d.color),
    material: parseBorderMat(r.material),
  }
}

// 🧱 Tham số sân gạch paving-zone — clamp khớp slider GUI. Thiếu → makePavingParams default.
function parsePavingParams(raw: unknown): PavingParams {
  const r = (raw ?? {}) as Partial<PavingParams>
  const d = makePavingParams()
  return {
    brickL: clamp(num(r.brickL, d.brickL), 50, 500),
    brickW: clamp(num(r.brickW, d.brickW), 50, 500),
    brickH: clamp(num(r.brickH, d.brickH), 20, 150),
    joint: clamp(num(r.joint, d.joint), 2, 50),
    bond: clamp(num(r.bond, d.bond), 0, 1),
    seed: Math.round(clamp(num(r.seed, d.seed), 0, 9999)),
    decay: clamp(num(r.decay, d.decay), 0, 1),
    rot: clamp(num(r.rot, d.rot), -180, 180),
    color: parseColor(r.color, d.color),
    material: parseBorderMat(r.material),
  }
}

// 🏔️ Gò nặn-tay: lọc phần tử hợp lệ (clamp ±50m tâm, bán kính 100..20000mm, cao ±2000mm), tối đa 24 gò. Sai → bỏ.
function parseMounds(raw: unknown): TerrainMound[] {
  if (!Array.isArray(raw)) return []
  const out: TerrainMound[] = []
  for (const r of raw) {
    const o = (r ?? {}) as Partial<TerrainMound>
    if (typeof o.x !== 'number' || typeof o.z !== 'number') continue
    if (!Number.isFinite(o.x) || !Number.isFinite(o.z)) continue
    const m: TerrainMound = {
      x: clamp(o.x, -50000, 50000),
      z: clamp(o.z, -50000, 50000),
      radius: clamp(num(o.radius, 2000), 100, 20000),
      height: clamp(num(o.height, 300), -2000, 2000),
      falloff: clamp(num(o.falloff, 1), 0, 1),
    }
    out.push(m)
    if (out.length >= 24) break
  }
  return out
}

// 🏔️ Terrain: default-fill mọi field (optional → backward-compat, KHÔNG bump schema). Clamp theo range GUI.
function parseTerrain(raw: unknown, d: TerrainConfig): TerrainConfig {
  const r = (raw ?? {}) as Partial<TerrainConfig>
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : d.enabled,
    amplitude: clamp(num(r.amplitude, d.amplitude), 0, 2000),
    frequency: clamp(num(r.frequency, d.frequency), 0.02, 1.0),
    octaves: clamp(Math.round(num(r.octaves, d.octaves)), 1, 8),
    lacunarity: clamp(num(r.lacunarity, d.lacunarity), 1.5, 3.0),
    gain: clamp(num(r.gain, d.gain), 0.2, 0.8),
    warp: clamp(num(r.warp, d.warp), 0, 1),
    seed: clamp(Math.round(num(r.seed, d.seed)), 0, 9999),
    resolution: clamp(Math.round(num(r.resolution, d.resolution)), 32, 128),
    padMargin: clamp(num(r.padMargin, d.padMargin), 0, 3000),
    edgeFlat: clamp(num(r.edgeFlat, d.edgeFlat), 0, 3000),
    detail: clamp(num(r.detail, d.detail), 0, 1),
    mounds: parseMounds(r.mounds),
  }
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
    mix: optMix(r.mix), // 🎨 mix mặt tường rào — thiếu = tắt
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

// 🪨 Material rào/viền: 'none' (màu phẳng) | 3 texture đá. Lạ → 'none' (forward-compat).
const BORDER_MAT_KEYS = new Set<BorderMaterialKey>([
  'none',
  'icelandic-jagged',
  'coal-stone',
  'rock-rough',
])
function parseBorderMat(v: unknown): BorderMaterialKey {
  return typeof v === 'string' && BORDER_MAT_KEYS.has(v as BorderMaterialKey)
    ? (v as BorderMaterialKey)
    : 'none'
}

function parseWater(raw: Partial<WaterConfig> | undefined, d: WaterConfig): WaterConfig {
  const r = raw ?? {}
  const kind = parseKind(r.kind, d.kind)
  return {
    kind,
    enabled: typeof r.enabled === 'boolean' ? r.enabled : d.enabled,
    surfaceOn: typeof r.surfaceOn === 'boolean' ? r.surfaceOn : d.surfaceOn, // 💧 save cũ thiếu → true (bật)
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
    rippleScale: clamp(num(r.rippleScale, d.rippleScale), 0.05, 20), // floor 0.05 — Wave size 24 (rs phân số = sóng to)
    depthY: clamp(num(r.depthY, d.depthY), 50, 3000),
    bottomColor: parseColor(r.bottomColor, d.bottomColor),
    tileColor2: parseColor(r.tileColor2, d.tileColor2),
    groutColor: parseColor(r.groutColor, d.groutColor),
    tint: clamp(num(r.tint, d.tint), 0, 1),
    edgeWidth: clamp(num(r.edgeWidth, d.edgeWidth), 0, 2000),
    floorMaterial: parseMat(r.floorMaterial),
    wallMaterial: parseMat(r.wallMaterial),
    edgeMaterial: parseMat(r.edgeMaterial),
    borderEnabled: typeof r.borderEnabled === 'boolean' ? r.borderEnabled : d.borderEnabled,
    borderHeight: clamp(num(r.borderHeight, d.borderHeight), 100, 1200),
    borderStoneVar: clamp(num(r.borderStoneVar, d.borderStoneVar), 0, 100),
    borderStoneJag: clamp(num(r.borderStoneJag, d.borderStoneJag), 0, 100),
    borderColor: parseColor(r.borderColor, d.borderColor),
    borderMaterial: parseBorderMat(r.borderMaterial),
    // 🎨 mix đáy/vách hồ — thiếu = tắt (material đơn floorMaterial/wallMaterial như cũ)
    floorMix: optMix(r.floorMix),
    wallMix: optMix(r.wallMix),
    // 🏔️ gò đáy hồ — thiếu (save cũ) = undefined (đáy phẳng); có = parse như terrain zone (backward-compat)
    floorTerrain:
      r.floorTerrain !== undefined ? parseTerrain(r.floorTerrain, defaultTerrain()) : undefined,
    // 🐟 đàn cá = con của hồ (parseWaterFish → MẢNG): có field = parse; thiếu thì pond mặc định 1 đàn bậc 4,
    // pool/puddle = undefined. Save cũ (cá top-level fishSchools) migrate sau ở migrateLegacyFish.
    fishSchools: parseWaterFish(r, kind),
  }
}

// 🐟 Đàn cá của 1 hồ → MẢNG: fishSchools[] (mới, cap 8) → fish đơn (save phiên trước, MIGRATE → [1]) → pond mặc
// định 1 đàn bậc 4 → pool/puddle undefined. Legacy cá top-level (độc lập cũ) migrate riêng ở migrateLegacyFish.
function parseWaterFish(
  r: Partial<WaterConfig> & { fish?: unknown },
  kind: WaterKind
): FishSchool[] | undefined {
  if (Array.isArray(r.fishSchools)) return r.fishSchools.slice(0, 8).map(parseFishSchool)
  if (r.fish !== undefined) return [parseFishSchool(r.fish)] // save phiên trước: 1 đàn đơn → mảng
  return kind === 'pond' ? [makeFishSchool(4)] : undefined
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
    fishSchools?: unknown // legacy: cá từng độc lập top-level → migrate vào pond (migrateLegacyFish)
  }
  const groundLayers = parseGroundLayers(o.groundLayers)
  const waters = parseWaters(o.waters, o.water)
  migrateLegacyFish(waters, o.fishSchools) // 🐟 save cũ (cá top-level độc lập) → gán vào pond gần nhất
  return {
    show: typeof o.show === 'boolean' ? o.show : d.show,
    lotWidth: num(o.lotWidth, d.lotWidth),
    lotDepth: num(o.lotDepth, d.lotDepth),
    groundThick: clamp(num(o.groundThick, d.groundThick), GROUND_THICK_MIN, GROUND_THICK_MAX),
    ground: parseGround(o.ground, d.ground),
    groundMix: o.groundMix !== undefined ? parseGroundMix(o.groundMix) : undefined, // 🎨 mix G0 — thiếu = đơn
    groundLayers,
    groundLevels: parseGroundLevels(o.groundLevels, groundLayers),
    terrain: parseTerrain(o.terrain, d.terrain ?? defaultTerrain()),
    grass3d: parseGrass3d(o.grass3d, d.grass3d),
    waters,
    bridges: parseBridges(o.bridges), // 🌉 cầu — design cũ không có → []
    fences: parseFences(o.fences, o.fence, d.fences[0]),
    lamps: parseLamps(o.lamps), // 💡 đèn — design cũ không có → []
    // key `rocks` (non bộ cũ, gỡ 2026-06-09) trong design lưu cũ: KHÔNG parse → biến mất khi save lại (an toàn)
  }
}

// 🐟 MIGRATE save cũ: cá từng là hệ độc lập (SiteState.fishSchools[] có offsetX/Z/radius/depth). Nay cá =
// CON của pond. Mỗi bầy cũ → gán tuning vào pond gần nhất (theo offset), pond đó BẬT (cá cũ đang hiện → giữ),
// mỗi pond nhận ≤1 bầy. Pool KHÔNG nhận cá (hồ bơi sạch). Thừa bầy / không có pond → bỏ (đúng kiến trúc mới).
function migrateLegacyFish(waters: WaterConfig[], rawSchools: unknown): void {
  if (!Array.isArray(rawSchools) || rawSchools.length === 0) return
  const ponds = waters.filter((w) => w.kind === 'pond')
  const used = new Set<WaterConfig>()
  for (const raw of rawSchools) {
    const pond = nearestPond(ponds, used, raw)
    if (!pond) break // hết pond rảnh → bỏ bầy thừa
    used.add(pond)
    pond.fishSchools = [parseFishSchool(raw)] // giữ tuning cũ (count/màu/hành vi) → 1 đàn
    pond.enabled = true // cá cũ đang hiện → bật pond cho koi khỏi biến mất
  }
}

// Pond gần nhất CHƯA dùng so với offset bầy cũ (Manhattan mm). null nếu hết pond rảnh.
function nearestPond(
  ponds: WaterConfig[],
  used: Set<WaterConfig>,
  raw: unknown
): WaterConfig | null {
  const r = (raw ?? {}) as Record<string, unknown>
  const rx = num(r.offsetX, 0)
  const rz = num(r.offsetZ, 0)
  let best: WaterConfig | null = null
  let bestD = Infinity
  for (const p of ponds) {
    if (used.has(p)) continue
    const dist = Math.abs(p.offsetX - rx) + Math.abs(p.offsetZ - rz)
    if (dist < bestD) {
      bestD = dist
      best = p
    }
  }
  return best
}

function parseFishSchool(raw: unknown): FishSchool {
  const r = (raw ?? {}) as Partial<FishSchool>
  const tier = clamp(Math.round(num(r.tier, 4)), 1, 6) // 🐟 bậc 1..6 (thiếu/lạ → 4 = koi)
  const d = makeFishSchool(tier) // defaults theo bậc (count/size từ FISH_TIER_PRESETS)
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : d.enabled,
    tier,
    count: clamp(Math.round(num(r.count, d.count)), 1, 64), // cap 64 (chừa bậc thấp đông)
    size: clamp(num(r.size, d.size), 20, 600), // 20mm (tép bậc 6) → 600mm (koi to)
    speed: clamp(num(r.speed, d.speed), 0.05, 0.8),
    seed: num(r.seed, d.seed),
    bodyWidth: clamp(num(r.bodyWidth, d.bodyWidth), 0.2, 2.5), // 🐟 độ mập — save cũ → 1
    colorBase: parseColor(r.colorBase, d.colorBase), // 🎨 save cũ → màu koi mặc định
    colorPatch: parseColor(r.colorPatch, d.colorPatch),
    colorSpot: parseColor(r.colorSpot, d.colorSpot),
    patchAmount: clamp(num(r.patchAmount, d.patchAmount), 0, 1),
    swayAmp: clamp(num(r.swayAmp, d.swayAmp), 0, 2), // 🐟 hành vi — save cũ → 1
    wanderAmp: clamp(num(r.wanderAmp, d.wanderAmp), 0, 2),
    bobAmp: clamp(num(r.bobAmp, d.bobAmp), 0, 3),
    bankAmp: clamp(num(r.bankAmp, d.bankAmp), 0, 2), // 🎢 nghiêng cua — save cũ → 1
    pitchAmp: clamp(num(r.pitchAmp, d.pitchAmp), 0, 2), // 🎢 chúi mũi — save cũ → 1
    burstRate: clamp(num(r.burstRate, d.burstRate), 0, 1), // 🐟 bứt tốc — save cũ → 0
    schooling: typeof r.schooling === 'boolean' ? r.schooling : d.schooling, // 🐟 bơi theo đàn — save cũ → false
    satiation: clamp(num(r.satiation, d.satiation), 0, 1), // 🐟 độ no — save cũ → 1 (đầy, sống)
  }
}

// 🌉 Cầu: parse mảng tolerant (design cũ không có key bridges → []).
function parseBridges(raw: unknown): BridgeConfig[] {
  return Array.isArray(raw) ? raw.map(parseBridge) : []
}

function parseBridge(raw: unknown): BridgeConfig {
  const d = makeBridge()
  if (!raw || typeof raw !== 'object') return d
  const r = raw as Partial<BridgeConfig>
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : d.enabled,
    material: r.material === 'stone' ? 'stone' : 'wood',
    shape: r.shape === 'flat' ? 'flat' : 'arch', // design cũ không có → arch (như trước)
    offsetX: clamp(num(r.offsetX, d.offsetX), -20000, 20000),
    offsetZ: clamp(num(r.offsetZ, d.offsetZ), -20000, 20000),
    rotDeg: clamp(num(r.rotDeg, d.rotDeg), 0, 360),
    span: clamp(num(r.span, d.span), 1000, 20000),
    deckWidth: clamp(num(r.deckWidth, d.deckWidth), 600, 4000),
    rise: clamp(num(r.rise, d.rise), 0, 2000),
    plankCount: clamp(Math.round(num(r.plankCount, d.plankCount)), 4, 40),
    deckThick: clamp(num(r.deckThick, d.deckThick), 20, 200),
    rimSize: clamp(num(r.rimSize, d.rimSize), 40, 400),
    railOn: typeof r.railOn === 'boolean' ? r.railOn : d.railOn,
    railHeight: clamp(num(r.railHeight, d.railHeight), 300, 1500),
    railBeam: clamp(num(r.railBeam, d.railBeam), 20, 150),
    postCount: clamp(Math.round(num(r.postCount, d.postCount)), 0, 20),
    postWidth: clamp(num(r.postWidth, d.postWidth), 20, 150),
    postShape: r.postShape === 'round' ? 'round' : 'square',
    pierOn: typeof r.pierOn === 'boolean' ? r.pierOn : d.pierOn,
    pierCount: clamp(Math.round(num(r.pierCount, d.pierCount)), 0, 6),
    pierWidth: clamp(num(r.pierWidth, d.pierWidth), 40, 400),
    mix: optMix(r.mix), // 🎨 mix mặt ván — thiếu = gỗ/đá đơn
    rimMix: optMix(r.rimMix), // 🎨 mix vành / tay vịn / trụ con — thiếu = gỗ/đá đơn
    railMix: optMix(r.railMix),
    postMix: optMix(r.postMix),
  }
}

// 💡 Đèn: parse mảng tolerant (design cũ không có key lamps → []). Tối đa 32 đèn (vỏ rẻ; chỉ N gần được real-light).
function parseLamps(raw: unknown): LampConfig[] {
  if (!Array.isArray(raw)) return []
  const out: LampConfig[] = []
  for (const l of raw) {
    out.push(parseLamp(l))
    if (out.length >= 32) break
  }
  return out
}

function parseLamp(raw: unknown): LampConfig {
  const d = makeLamp()
  if (!raw || typeof raw !== 'object') return d
  const r = raw as Partial<LampConfig>
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : d.enabled,
    x: clamp(num(r.x, d.x), -30000, 30000),
    z: clamp(num(r.z, d.z), -30000, 30000),
    height: clamp(num(r.height, d.height), 500, 12000),
    color: typeof r.color === 'number' ? r.color : d.color,
    intensity: clamp(num(r.intensity, d.intensity), 0, 50),
    range: clamp(num(r.range, d.range), 0, 40000),
  }
}

// Số G-level tường minh. Thiếu (design cũ) → max(level) của layers (mọi level đang có layer đều hiện). Luôn ≥
// max(level) để KHÔNG ẩn tầng đang có zone/cut. clamp 0..99.
function parseGroundLevels(raw: unknown, layers: GroundLayer[]): number {
  const maxLv = layers.reduce((m, l) => Math.max(m, l.level ?? 1), 0)
  const n = typeof raw === 'number' && Number.isFinite(raw) ? Math.floor(raw) : maxLv
  return clamp(Math.max(n, maxLv), 0, 99)
}
