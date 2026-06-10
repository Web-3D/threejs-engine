/**
 * VỊ TRÍ   — threejs-modules/components/Waterfall/index.ts
 * VAI TRÒ  — Thác nước stylized (tier B) theo công thức industry (RiME/Season): MÀN nước = mesh cong +
 *            TEXTURE VỆT NƯỚC cuộn xuống 3 LỚP khác tốc độ + fresnel + khúc xạ màn + foam band; chân thác =
 *            MIST (bụi bốc lên) + SPLASH (bắn ngang) sprite mềm. 0 RTT, 0 asset — texture vệt SINH 1 LẦN
 *            bằng Canvas 2D (build-time). 3 draw call.
 * LIÊN HỆ  — Anh em WaterSurface (mặt hồ ngang, reflector RTT) — thác KHÔNG reflector; khúc xạ sample
 *            backbuffer qua viewportTexture PER-INSTANCE (KHÔNG viewportSharedTexture: shared = 1 texture
 *            module-global mọi renderer → 2 renderer giành nhau = KI-014). Lab tab 🌊 Thác (archplan) tune.
 *            Phase B: ráp archplan đổ vào pond; vách đá đỡ = Houdini bake (deferred/houdini-bake-accents).
 *
 * Hình:  ribbon PlaneGeometry uốn z = arc·√t (nước rời mép NGANG rồi rơi — parabol thật), normals tính lại
 *        sau uốn (fresnel cần). GỐC group = TÂM MÉP TRÊN (lip). Vertex wobble: mép dưới lắc theo sin·uTime.
 * Shader màn: 3 lớp texture vệt (tốc ×1 / ×0.72 / ×1.5, lớp B đảo U, lớp C làm UV-distort) → streak;
 *        white = streak + aeration(1−v) + fresnel + lip/foot band (posterize optional → look RiME);
 *        color = mix( mix(khúc-xạ, waterColor, tint), foamColor, white ) — màn gần đặc, "độ trong" đến từ
 *        ảnh khúc xạ méo theo vệt (như WaterSurface: transparent=true để vẽ SAU opaque, depthWrite=true).
 * Hạt:   mist/splash = InstancedMesh quad + SpriteNodeMaterial billboard (KHÔNG THREE.Points — WebGPU
 *        point luôn 1px + positionGeometry-offset bug; đốm tròn mềm = radial fade uv quad).
 * Điều dòng (A3): strip DataTexture 64×1 (R=tốc cột/2 · G=mật độ/cắt dòng · B=xiết) sample theo uv.x —
 *        setFlowProfile() ghi lại strip = LIVE 0-rebuild 0-recompile. Xiết = méo UV + foam CỤC BỘ
 *        (fragment-only — KHÔNG sample texture ở vertex stage: cần textureSampleLevel, chưa verify TSL).
 * Theo đoạn rơi (A3.1): strip DỌC 64×2 sample theo (1−uv.y) — hàng 1: R=trong-suốt G=gương(sheen fresnel)
 *        B=bụi-tán(sương phủ) A=vỡ-hạt(alpha erosion theo vệt — mép răng cưa) · hàng 2: R=nhiễu(méo UV).
 *        setFallProfile() — đỉnh→chân, nội suy linear giữa mẫu, cùng cơ chế LIVE như strip ngang.
 *
 * CÁCH DÙNG: const wf = new Waterfall({ width: 2, height: 1.8 })
 *            scene.add(wf.getGroup()) // position group tại MÉP ĐỔ (đỉnh tường/vách đá)
 *            mỗi frame: wf.setTime(elapsedSeconds)
 * Chân thác (A5): vòng BỌT LOANG (plane ngang + texture đốm tròn blur 2 lớp lệch tốc, gate flow strip)
 *        + LẤP LÁNH (glint overbright lõi sợi theo fresnel×surge — gộp shader màn/crest, 0 draw thêm).
 * DISPOSE: dispose() — geometry + material (sheet/crest/foot/mist/splash) + 2 CanvasTexture + 2 DataTexture
 *        + viewportTex + gỡ group khỏi parent.
 */

import * as THREE from 'three'
import type Node from 'three/src/nodes/core/Node.js'
import type { ShaderNodeObject } from 'three/tsl'
import {
  cameraPosition,
  clamp,
  cos,
  dot,
  float,
  fract,
  hash,
  instanceIndex,
  mix,
  normalize,
  normalWorld,
  positionLocal,
  positionWorld,
  pow,
  screenUV,
  sin,
  smoothstep,
  texture,
  uniform,
  uv,
  vec2,
  vec3,
  viewportSafeUV,
  viewportTexture,
} from 'three/tsl'
import { MeshBasicNodeMaterial, SpriteNodeMaterial } from 'three/webgpu'

type TSLNode = ShaderNodeObject<Node>

const DEFAULTS = {
  width: 2,
  height: 1.8,
  arc: 0.28,
  flow: 1.1,
  surge: 0.5, // cường độ nguồn — 0.5 = trung tính (đúng look A2), 0 êm trong veo, 1 ồ ạt trắng xóa
  crestLength: 1, // m — đoạn mặt nước NẰM NGANG trên đỉnh trước khi đổ (0 = tắt)
  crestDepth: 0.08, // m — độ sâu dòng: mặt upstream cao hơn mép, võng drawdown về y=0 tại mép
  crestSpeed: 0.6, // hệ số tốc chảy mặt ngang (× flow chung — mặt ngang chậm hơn màn rơi)
  crestRipple: 0.5, // gợn mặt ngang: 0 lặng như gương, 1 vệt rõ
  crestAlpha: 0.55, // độ đặc mặt ngang (thấp = trong veo nhìn xuyên xuống đáy)
  streakScale: 1.6,
  waterColor: 0x9fc6d8 as THREE.ColorRepresentation,
  foamColor: 0xf2fbff as THREE.ColorRepresentation,
  opacity: 0.95,
  tint: 0.35, // ám màu nước lên ảnh khúc xạ (0 = kính trong, 1 = đặc màu)
  refract: 0.6, // cường độ méo ảnh khúc xạ theo vệt
  posterize: 0, // 0 = mượt; 1 = banding 4 nấc full (look RiME stylized)
  wobble: 0.035, // m — biên độ lắc mép dưới
  bulge: 0.045, // m — biên độ PHỒNG 3D (WPO: noise sin 2 octave cuộn xuống — màn gồ ghề thật)
  mistCount: 220,
  mistIntensity: 0.7,
  footFoam: 0.65, // đậm vòng bọt loang ở chân thác (0 = tắt nhìn thấy — mesh vẫn dựng, alpha 0)
  glint: 0.5, // lấp lánh — đốm overbright ở lõi sợi sáng nhất (specular giả theo fresnel)
}
const SHEET_W_SEGS = 24 // A4: WPO bulge cần lưới dày hơn (24×60 = 2880 tri — vẫn ~0.6% budget)
const SHEET_H_SEGS = 60
const CREST_SEGS = 12 // hàng lưới theo chiều chảy của mặt ngang (đủ cho đường võng drawdown)
const MAX_MIST = 600 // cap budget mỗi hệ hạt (quad billboard/hạt, instanced 1 draw)
const POSTER_STEPS = 4 // số nấc banding khi posterize
const FLOW_RES = 64 // texel strip điều dòng theo bề ngang (64 cột đủ mịn cho màn ≤6m)

// 1 mẫu điều dòng tại 1 vị trí ngang (mảng mẫu trải đều theo u∈[0..1]) — thiếu field = trung tính.
export interface FlowSample {
  /** Hệ số tốc CỘT [0–2] (1 = chuẩn) — chỗ xiết chảy nhanh hơn phần còn lại. */
  speed?: number
  /** Mật độ nước [0–1] — 0 = CẮT dòng (tách dòng); mép khe tự mềm nhờ filter linear + smoothstep. */
  density?: number
  /** Cuộn xiết [0–1] — khuếch đại méo UV + sủi foam cục bộ (fragment-only, không đổi hình học). */
  churn?: number
}

// 1 mẫu theo CHIỀU RƠI (mảng mẫu trải đều: mẫu[0] = đỉnh/lip → mẫu cuối = chân) — thiếu field = trung tính.
export interface FallSample {
  /** Độ trong suốt đoạn [0–1] — nhân alpha màn (1 = như cũ, 0 = tàng hình). */
  opacity?: number
  /** Phản chiếu gương [0–1] — sheen trắng sáng theo góc nhìn (fresnel boost, look láng gương). */
  gloss?: number
  /** Bụi nước phân tán [0–1] — sương trắng mờ phủ đều đoạn (khuếch tán, không theo vệt). */
  haze?: number
  /** Độ nhiễu [0–1] — khuếch đại méo UV đoạn đó (loạn dòng, cộng dồn với churn ngang). */
  noise?: number
  /** Vỡ hạt [0–1] — đục thủng alpha theo vệt: màn tách thành tia/hạt răng cưa, hết mượt. */
  breakup?: number
}

// 2 hệ hạt chân thác (count bơm theo mistCount lúc dựng): mist = bụi bốc LÊN chậm, đời dài, nở to;
// splash = bắn NGANG nhanh, đời ngắn, đậm hơn (alpha ×1.3). size = MÉT (scale billboard quad).
const MIST_CFG = {
  life: 1.5,
  speed: 0.5,
  upMin: 0.6,
  upMax: 1.4,
  outMin: 0.2,
  outMax: 0.9,
  sizeA: 0.12,
  sizeB: 0.5,
  alpha: 1,
}
const SPLASH_CFG = {
  life: 0.55,
  speed: 1.6,
  upMin: 0.25,
  upMax: 0.8,
  outMin: 0.7,
  outMax: 1.6,
  sizeA: 0.07,
  sizeB: 0.2,
  alpha: 1.3,
}

// Cấu hình 1 hệ hạt chân thác (mist bốc lên / splash bắn ngang) — dùng chung 1 builder.
interface SprayCfg {
  count: number
  life: number // giây mỗi vòng đời
  speed: number // hệ số vận tốc theo hướng bay (dir sinh từ hash per-hạt)
  upMin: number // thành phần bốc lên của dir ∈ [upMin, upMax]
  upMax: number
  outMin: number // thành phần toả ngang ∈ [outMin, outMax]
  outMax: number
  sizeA: number // m — cỡ billboard đầu đời
  sizeB: number // m — cỡ billboard cuối đời
  alpha: number // hệ số alpha riêng hệ (× uMistOpacity)
}

export interface WaterfallOptions {
  /** Bề ngang màn nước (m, X). Default: 2 */
  width?: number
  /** Chiều cao rơi từ mép tới chân (m). Default: 1.8 */
  height?: number
  /** Độ dạt ra phía trước ở chân (m) — profile z = arc·√t. 0 = màn phẳng dán tường. Default: 0.28 */
  arc?: number
  /** Tốc độ chảy (cuộn vệt xuống). Default: 1.1 */
  flow?: number
  /**
   * Cường độ NGUỒN [0–1] — master vật lý: 0 = êm (đầu thác trong veo không gợn, ít bọt/mist/lắc) ·
   * 0.5 = trung tính (đúng look mặc định) · 1 = ồ ạt (phá cấu trúc nước — bọt trắng xóa từ gần mép,
   * méo loạn, tự vỡ hạt, mist dày). Default: 0.5
   */
  surge?: number
  /** Dài đoạn mặt nước NẰM NGANG trên đỉnh (m) — 0 = tắt. Structural. Default: 1 */
  crestLength?: number
  /** Độ sâu dòng mặt ngang (m) — upstream cao hơn mép, võng drawdown về 0 tại mép. Structural. Default: 0.08 */
  crestDepth?: number
  /** Tốc chảy mặt ngang [0–2] (hệ số × flow). Default: 0.6 — live setCrestSpeed */
  crestSpeed?: number
  /** Gợn mặt ngang [0–1] (0 = lặng gương). Default: 0.5 — live setCrestRipple */
  crestRipple?: number
  /** Độ đặc mặt ngang [0–1] (thấp = trong veo). Default: 0.55 — live setCrestAlpha */
  crestAlpha?: number
  /** Tile texture vệt theo bề ngang (cao = vệt mảnh dày). Default: 1.6 */
  streakScale?: number
  /** Màu nước (ám lên ảnh khúc xạ). Default: 0x9fc6d8 */
  waterColor?: THREE.ColorRepresentation
  /** Màu foam trắng (vệt + band + mist). Default: 0xf2fbff */
  foamColor?: THREE.ColorRepresentation
  /** Alpha tổng màn [0–1] (màn gần đặc — "trong" đến từ khúc xạ). Default: 0.95 */
  opacity?: number
  /** Ám màu nước lên khúc xạ [0–1]. Default: 0.35 */
  tint?: number
  /** Cường độ méo khúc xạ [0–2]. Default: 0.6 */
  refract?: number
  /** Banding stylized [0–1] (0 = mượt, 1 = 4 nấc kiểu RiME). Default: 0 */
  posterize?: number
  /** Biên độ lắc mép dưới (m). Default: 0.035 */
  wobble?: number
  /** Biên độ phồng 3D màn (m) — WPO noise cuộn xuống, silhouette gồ ghề. Default: 0.045 — live setBulge */
  bulge?: number
  /** Số hạt MIST (cap 600; 0 = tắt cả mist lẫn splash). Default: 220 */
  mistCount?: number
  /** Cường độ mist/splash [0–1]. Default: 0.7 */
  mistIntensity?: number
  /** Đậm vòng bọt loang ở chân thác [0–1]. Default: 0.65 — live setFootFoam */
  footFoam?: number
  /** Lấp lánh [0–1] — đốm overbright lõi sợi (specular giả). Default: 0.5 — live setGlint */
  glint?: number
}

export class Waterfall {
  private group: THREE.Group | null = null
  private sheetGeo: THREE.PlaneGeometry | null = null
  private sheetMat: MeshBasicNodeMaterial | null = null
  private crestGeo: THREE.PlaneGeometry | null = null
  private crestMat: MeshBasicNodeMaterial | null = null
  private footGeo: THREE.PlaneGeometry | null = null
  private footMat: MeshBasicNodeMaterial | null = null
  private foamTex: THREE.CanvasTexture | null = null
  private streakTex: THREE.CanvasTexture | null = null
  // Strip điều dòng (sample trong sheet material) — buffer giữ lại để setFlowProfile ghi đè rồi needsUpdate
  private flowTex: THREE.DataTexture | null = null
  private readonly flowData = new Uint8Array(FLOW_RES * 4)
  // Strip theo đoạn rơi (64×2 — 2 hàng texel, sample tâm hàng y=0.25/0.75) — setFallProfile ghi đè
  private fallTex: THREE.DataTexture | null = null
  private readonly fallData = new Uint8Array(FLOW_RES * 2 * 4)
  private sprayGeos: THREE.BufferGeometry[] = []
  private sprayMats: SpriteNodeMaterial[] = []
  // FramebufferTexture RIÊNG của node khúc xạ (viewportTexture per-instance) — ta giữ ref để dispose
  // (material.dispose KHÔNG đụng tới — texture node sống ngoài material, kẻo leak VRAM cỡ canvas/lần rebuild)
  private viewportTex: THREE.Texture | null = null
  private isDisposed = false

  private readonly uTime = uniform(0)
  private readonly uFlow: ReturnType<typeof uniform>
  private readonly uSurge: ReturnType<typeof uniform>
  private readonly uCrestSpeed: ReturnType<typeof uniform>
  private readonly uCrestRipple: ReturnType<typeof uniform>
  private readonly uCrestAlpha: ReturnType<typeof uniform>
  private readonly uStreak: ReturnType<typeof uniform>
  private readonly uOpacity: ReturnType<typeof uniform>
  private readonly uWaterColor: ReturnType<typeof uniform>
  private readonly uFoamColor: ReturnType<typeof uniform>
  private readonly uTint: ReturnType<typeof uniform>
  private readonly uRefract: ReturnType<typeof uniform>
  private readonly uPoster: ReturnType<typeof uniform>
  private readonly uWobble: ReturnType<typeof uniform>
  private readonly uBulge: ReturnType<typeof uniform>
  private readonly uMistOpacity: ReturnType<typeof uniform>
  private readonly uFootFoam: ReturnType<typeof uniform>
  private readonly uGlint: ReturnType<typeof uniform>

  constructor(opts: WaterfallOptions = {}) {
    const o = { ...DEFAULTS, ...opts }
    this.uFlow = uniform(o.flow)
    this.uSurge = uniform(Math.max(0, Math.min(1, o.surge)))
    this.uCrestSpeed = uniform(o.crestSpeed)
    this.uCrestRipple = uniform(o.crestRipple)
    this.uCrestAlpha = uniform(o.crestAlpha)
    this.uStreak = uniform(o.streakScale)
    this.uOpacity = uniform(o.opacity)
    this.uWaterColor = uniform(new THREE.Color(o.waterColor))
    this.uFoamColor = uniform(new THREE.Color(o.foamColor))
    this.uTint = uniform(o.tint)
    this.uRefract = uniform(o.refract)
    this.uPoster = uniform(o.posterize)
    this.uWobble = uniform(o.wobble)
    this.uBulge = uniform(o.bulge)
    this.uMistOpacity = uniform(Math.max(0, Math.min(1, o.mistIntensity)) * 0.5)
    this.uFootFoam = uniform(Math.max(0, Math.min(1, o.footFoam)))
    this.uGlint = uniform(Math.max(0, Math.min(1, o.glint)))

    this.streakTex = makeStreakTexture()
    this.foamTex = makeFoamTexture()
    this.flowTex = makeFlowTexture(this.flowData) // TRƯỚC _buildSheet — material sample strip này
    this.fallTex = makeFallTexture(this.fallData)
    const group = new THREE.Group()
    group.add(this._buildSheet(o.width, o.height, o.arc))
    if (o.crestLength > 0.01) group.add(this._buildCrest(o.width, o.crestLength, o.crestDepth))
    group.add(this._buildFoot(o.width, o.height, o.arc))
    const n = Math.max(0, Math.min(MAX_MIST, Math.round(o.mistCount)))
    if (n > 0) {
      const mist = this._buildSpray({ ...MIST_CFG, count: n }, o.width, o.arc)
      const splash = this._buildSpray(
        { ...SPLASH_CFG, count: Math.round(n * 0.45) },
        o.width,
        o.arc
      )
      mist.position.y = -o.height
      splash.position.y = -o.height
      group.add(mist, splash)
    }
    this.group = group
  }

  /** Thời gian animation (giây). Gọi mỗi frame — vệt cuộn + mép lắc + hạt bay. */
  setTime(seconds: number): void {
    if (this.isDisposed) return
    this.uTime.value = seconds
  }

  /** Tốc độ chảy [0–5]. */
  setFlow(v: number): void {
    if (this.isDisposed) return
    this.uFlow.value = Math.max(0, Math.min(5, v))
  }

  /**
   * Điều dòng theo bề ngang: mảng mẫu trải đều u∈[0..1], nội suy linear giữa mẫu (FlowSample —
   * speed/density/churn). LIVE 0-rebuild: chỉ ghi lại strip 64×1 rồi needsUpdate. [] = dòng đều.
   */
  setFlowProfile(samples: FlowSample[]): void {
    if (this.isDisposed || !this.flowTex) return
    const d = this.flowData
    for (let i = 0; i < FLOW_RES; i++) {
      const s = flowAt(samples, i / (FLOW_RES - 1))
      d[i * 4] = Math.round(Math.max(0, Math.min(2, s.speed)) * 127.5) // encode tốc/2
      d[i * 4 + 1] = Math.round(Math.max(0, Math.min(1, s.density)) * 255)
      d[i * 4 + 2] = Math.round(Math.max(0, Math.min(1, s.churn)) * 255)
    }
    this.flowTex.needsUpdate = true
  }

  /**
   * Profile theo CHIỀU RƠI (mẫu[0] = đỉnh/lip → mẫu cuối = chân, nội suy linear): opacity/gloss/haze/
   * noise/breakup per đoạn (FallSample). LIVE 0-rebuild — ghi strip dọc 64×2. [] = trung tính.
   */
  setFallProfile(samples: FallSample[]): void {
    if (this.isDisposed || !this.fallTex) return
    const d = this.fallData
    const c01 = (v: number): number => Math.round(Math.max(0, Math.min(1, v)) * 255)
    for (let i = 0; i < FLOW_RES; i++) {
      const s = fallAt(samples, i / (FLOW_RES - 1))
      d[i * 4] = c01(s.opacity)
      d[i * 4 + 1] = c01(s.gloss)
      d[i * 4 + 2] = c01(s.haze)
      d[i * 4 + 3] = c01(s.breakup)
      d[(FLOW_RES + i) * 4] = c01(s.noise) // hàng 2: R = nhiễu (G/B/A dự trữ)
    }
    this.fallTex.needsUpdate = true
  }

  /** Cường độ nguồn [0–1]: 0 êm trong veo · 0.5 trung tính · 1 ồ ạt trắng xóa (xem option surge). */
  setSurge(v: number): void {
    if (this.isDisposed) return
    this.uSurge.value = Math.max(0, Math.min(1, v))
  }

  /** Tốc chảy mặt ngang [0–2] (hệ số × tốc chảy chung). */
  setCrestSpeed(v: number): void {
    if (this.isDisposed) return
    this.uCrestSpeed.value = Math.max(0, Math.min(2, v))
  }

  /** Gợn mặt ngang [0–1] — 0 lặng như gương, 1 vệt gợn rõ. */
  setCrestRipple(v: number): void {
    if (this.isDisposed) return
    this.uCrestRipple.value = Math.max(0, Math.min(1, v))
  }

  /** Độ đặc mặt ngang [0–1] — thấp = trong veo nhìn xuyên xuống đáy. */
  setCrestAlpha(v: number): void {
    if (this.isDisposed) return
    this.uCrestAlpha.value = Math.max(0, Math.min(1, v))
  }

  /** Tile vệt theo bề ngang [0.3–6]. */
  setStreakScale(v: number): void {
    if (this.isDisposed) return
    this.uStreak.value = Math.max(0.3, Math.min(6, v))
  }

  /** Alpha tổng màn [0–1]. */
  setOpacity(v: number): void {
    if (this.isDisposed) return
    this.uOpacity.value = Math.max(0, Math.min(1, v))
  }

  /** Ám màu nước lên khúc xạ [0–1]. */
  setTint(v: number): void {
    if (this.isDisposed) return
    this.uTint.value = Math.max(0, Math.min(1, v))
  }

  /** Cường độ méo khúc xạ [0–2]. */
  setRefract(v: number): void {
    if (this.isDisposed) return
    this.uRefract.value = Math.max(0, Math.min(2, v))
  }

  /** Banding stylized [0–1]. */
  setPosterize(v: number): void {
    if (this.isDisposed) return
    this.uPoster.value = Math.max(0, Math.min(1, v))
  }

  /** Biên độ lắc mép dưới (m) [0–0.15]. */
  setWobble(v: number): void {
    if (this.isDisposed) return
    this.uWobble.value = Math.max(0, Math.min(0.15, v))
  }

  /** Biên độ phồng 3D màn (m) [0–0.15] — 0 = màn phẳng như cũ. */
  setBulge(v: number): void {
    if (this.isDisposed) return
    this.uBulge.value = Math.max(0, Math.min(0.15, v))
  }

  /** Cường độ mist/splash [0–1] (0 = ẩn hạt). */
  setMistIntensity(v: number): void {
    if (this.isDisposed) return
    this.uMistOpacity.value = Math.max(0, Math.min(1, v)) * 0.5
  }

  /** Đậm vòng bọt loang ở chân thác [0–1] (0 = ẩn). */
  setFootFoam(v: number): void {
    if (this.isDisposed) return
    this.uFootFoam.value = Math.max(0, Math.min(1, v))
  }

  /** Lấp lánh [0–1] — đốm overbright lõi sợi sáng (0 = tắt). */
  setGlint(v: number): void {
    if (this.isDisposed) return
    this.uGlint.value = Math.max(0, Math.min(1, v))
  }

  /** Đổi màu nước (live, uniform-cheap). */
  setWaterColor(c: THREE.ColorRepresentation): void {
    if (this.isDisposed) return
    ;(this.uWaterColor.value as THREE.Color).set(c)
  }

  /** Đổi màu foam/mist (live). */
  setFoamColor(c: THREE.ColorRepresentation): void {
    if (this.isDisposed) return
    ;(this.uFoamColor.value as THREE.Color).set(c)
  }

  /** Group gốc tại TÂM MÉP TRÊN (lip): sheet rơi −Y, mist/splash ở y=−height. Caller đặt vào mép đổ. */
  getGroup(): THREE.Group {
    if (!this.group) throw new Error('Waterfall: đã dispose')
    return this.group
  }

  /** Tổng tam giác sheet (hạt = point, không tính tri). Verify budget. */
  getTriangleCount(): number {
    return SHEET_W_SEGS * SHEET_H_SEGS * 2
  }

  dispose(): void {
    if (this.isDisposed) return
    this.group?.parent?.remove(this.group)
    // Mỗi bước bọc riêng: backend WebGPU của three có đường dispose KHÔNG guard (vd destroyAttribute
    // `data.buffer.destroy()`) — nổ 1 bước KHÔNG được phép bỏ các bước sau (leak VRAM mỗi rebuild).
    // console.warn kèm TÊN BƯỚC → lỗi backend tự khai thủ phạm thay vì stack bị collapse.
    safeDispose('sheetGeo', () => this.sheetGeo?.dispose())
    safeDispose('sheetMat', () => this.sheetMat?.dispose())
    safeDispose('crestGeo', () => this.crestGeo?.dispose())
    safeDispose('crestMat', () => this.crestMat?.dispose())
    safeDispose('footGeo', () => this.footGeo?.dispose())
    safeDispose('footMat', () => this.footMat?.dispose())
    safeDispose('foamTex', () => this.foamTex?.dispose())
    safeDispose('streakTex', () => this.streakTex?.dispose())
    safeDispose('flowTex', () => this.flowTex?.dispose())
    safeDispose('fallTex', () => this.fallTex?.dispose())
    // texture khúc xạ per-instance — material.dispose không lo (né leak VRAM)
    safeDispose('viewportTex', () => this.viewportTex?.dispose())
    for (const g of this.sprayGeos) safeDispose('sprayGeo', () => g.dispose())
    for (const m of this.sprayMats) safeDispose('sprayMat', () => m.dispose())
    this.sprayGeos = []
    this.sprayMats = []
    this.sheetGeo = null
    this.sheetMat = null
    this.crestGeo = null
    this.crestMat = null
    this.footGeo = null
    this.footMat = null
    this.foamTex = null
    this.streakTex = null
    this.flowTex = null
    this.fallTex = null
    this.viewportTex = null
    this.group = null
    this.isDisposed = true
  }

  // ── Sheet (màn nước) ───────────────────────────────────────────────────────

  // Ribbon đứng XY (normal +Z), mép trên tại y=0. Uốn z = arc·√t (x=v·τ, d=g·τ²/2 ⇒ dạt-ngang ∝ √quãng-rơi).
  // computeVertexNormals SAU khi uốn — fresnel đọc normal màn cong (mặt giữa nhìn thẳng, mép trên/cong → xiên).
  private _buildSheet(width: number, height: number, arc: number): THREE.Mesh {
    const geo = new THREE.PlaneGeometry(width, height, SHEET_W_SEGS, SHEET_H_SEGS)
    geo.translate(0, -height / 2, 0)
    const pos = geo.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const t = -pos.getY(i) / height // 0 lip → 1 chân
      pos.setZ(i, arc * Math.sqrt(t))
    }
    geo.computeVertexNormals()
    this.sheetGeo = geo
    this.sheetMat = this._buildSheetMaterial()
    return new THREE.Mesh(geo, this.sheetMat)
  }

  // ── Crest (mặt nước NẰM NGANG trên đỉnh — đoạn chảy tới trước khi đổ) ──────
  // Plane XZ normal +Y, mép đổ tại z=0 (khớp lip màn rơi), kéo ngược về z=−length. DRAWDOWN vật lý:
  // mặt upstream cao bằng ĐỘ SÂU DÒNG (depth) rồi võng mượt về y=0 ĐÚNG TẠI MÉP — nước tăng tốc mỏng dần,
  // nối liền lip màn rơi không hở.
  private _buildCrest(width: number, length: number, depth: number): THREE.Mesh {
    const geo = new THREE.PlaneGeometry(width, length, SHEET_W_SEGS, CREST_SEGS)
    geo.rotateX(-Math.PI / 2) // sau rotate: v=0 → z=+length/2 (hạ lưu), v=1 → z=−length/2
    geo.translate(0, 0, -length / 2) // mép đổ về z=0, upstream z=−length
    const pos = geo.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const t = 1 + pos.getZ(i) / length // 0 upstream → 1 mép đổ
      pos.setY(i, depth * (1 - smoothstepJs(0.5, 1, t)))
    }
    geo.computeVertexNormals()
    this.crestGeo = geo
    this.crestMat = this._buildCrestMaterial()
    return new THREE.Mesh(geo, this.crestMat)
  }

  // Mặt ngang KHÔNG khúc xạ ("trong" = alpha thật xuyên xuống đáy — rẻ hơn +1 copy framebuffer/frame,
  // né rủi ro KI-014). Dùng CHUNG flow strip với màn → tách dòng/tốc cột NỐI TIẾP từ mặt ngang xuống màn;
  // ăn theo master uSurge (êm = lặng gương trong veo, ồ ạt = gợn trắng + band sủi ở mép đổ).
  private _buildCrestMaterial(): MeshBasicNodeMaterial {
    const ctrl = texture(this.flowTex as THREE.DataTexture, vec2(uv().x, float(0.5)))
    const s = this.uSurge
    const fSpeed = ctrl.r.mul(float(2)).mul(this.uCrestSpeed) as TSLNode
    const { streak } = this._layerStreak(fSpeed, ctrl.b as TSLNode)
    const v = uv().y // 0 mép đổ → 1 upstream
    const lipBand = float(1)
      .sub(smoothstep(float(0), float(0.1), v))
      .mul(mix(float(0.15), float(0.6), s)) // sủi nhẹ ngay mép gãy — đậm dần theo nguồn
    const white = clamp(
      smoothstep(float(0.45), float(0.9), streak)
        .mul(this.uCrestRipple)
        .mul(mix(float(0.3), float(1.6), s))
        .add(this._fresnel().mul(float(0.35)))
        .add(lipBand)
        .add(this._glint(streak).mul(float(0.6))), // mặt láng ngang = chỗ glint đẹp nhất
      float(0),
      float(1)
    )
    const edge = float(1).sub(smoothstep(float(0.38), float(0.5), uv().x.sub(float(0.5)).abs()))
    const tail = float(1).sub(smoothstep(float(0.88), float(1), v)) // upstream mờ dần, không cắt phựt
    const alpha = this.uCrestAlpha
      .mul(edge)
      .mul(tail)
      .mul(float(0.6).add(white.mul(float(0.4))))
      .mul(smoothstep(float(0.12), float(0.6), ctrl.g)) // lane cắt dòng chạy xuyên lên mặt ngang
      .mul(mix(float(0.75), float(1.2), s))
    const mat = new MeshBasicNodeMaterial() // perf-ok: build 1 LẦN trong constructor, không per-rebuild
    mat.colorNode = mix(this.uWaterColor, this.uFoamColor, white)
    mat.opacityNode = alpha
    mat.transparent = true
    mat.depthWrite = true
    mat.side = THREE.DoubleSide
    return mat
  }

  // 3 lớp texture vệt cuộn xuống (cộng t vào toạ-độ-y → feature trôi về v=0): A chính ×1 · B chậm ×0.72
  // đảo U (phá lặp) · C nhanh ×1.5 tile nhỏ — C sample TRƯỚC làm UV-distort cho A/B ("xối" không lặp).
  // Điều dòng: fSpeed nhân tốc cuộn PER-CỘT (ranh nhanh/chậm tự "xé" vệt như thác thật); fChurn
  // khuếch đại méo UV cục bộ (cuộn xoáy). Trả { streak [0..~1.2], off (vec2 lệch khúc xạ theo vệt) }.
  private _layerStreak(fSpeed: TSLNode, fChurn: TSLNode): { streak: TSLNode; off: TSLNode } {
    const tex = this.streakTex as THREE.CanvasTexture
    const t = this.uTime.mul(this.uFlow).mul(fSpeed)
    const tu = uv()
    // nguồn ồ ạt → méo loạn toàn màn (×1.5), êm → phẳng lì (×0.5); 0.5 = ×1 đúng look cũ
    const churnK = float(1)
      .add(fChurn.mul(float(2.5)))
      .mul(mix(float(0.5), float(1.5), this.uSurge))
    const c = texture(tex, vec2(tu.x.mul(this.uStreak).mul(1.9), tu.y.mul(2.6).add(t.mul(1.5)))).r
    const d = c.sub(float(0.5)).mul(float(0.05)).mul(churnK)
    const a = texture(tex, vec2(tu.x.mul(this.uStreak).add(d), tu.y.mul(float(1)).add(t))).r
    const bx = float(1).sub(tu.x).mul(this.uStreak).mul(float(1.37)).add(d)
    const b = texture(tex, vec2(bx, tu.y.mul(float(1.55)).add(t.mul(float(0.72))))).r
    const streak = a
      .mul(float(0.55))
      .add(b.mul(float(0.4)))
      .add(c.mul(float(0.25)))
    const off = vec2(d, c.sub(float(0.5)).mul(float(-0.035)).mul(churnK))
    return { streak: streak as TSLNode, off: off as TSLNode }
  }

  // Fresnel màn cong: nhìn XIÊN màn (mép cong/lệch góc) → trắng đặc hơn (màn "mỏng" cho sáng xuyên ít).
  private _fresnel(): TSLNode {
    const eye = normalize(cameraPosition.sub(positionWorld))
    const facing = dot(eye, normalWorld).abs() // DoubleSide → abs (sau màn vẫn đúng)
    return pow(float(1).sub(facing), float(2.2)) as TSLNode
  }

  // A5 lấp lánh: lõi sợi SÁNG NHẤT → đốm OVERBRIGHT (cộng thẳng vào màu, vượt trắng — specular giả);
  // theo góc nhìn (fresnel) + nguồn: êm/láng → glint rõ, ồ ạt/đục foam → chìm. uGlint=0 = tắt sạch.
  private _glint(streak: TSLNode): TSLNode {
    return smoothstep(float(0.82), float(0.97), streak)
      .mul(this.uGlint)
      .mul(float(0.4).add(this._fresnel().mul(float(0.6))))
      .mul(mix(float(1.3), float(0.7), this.uSurge)) as TSLNode
  }

  // white mask = vệt + aeration (càng rơi càng sủi) + fresnel + band mép (lip) + band chân (foot);
  // vùng dưới lip trong veo (glass); posterize optional (banding 4 nấc — look RiME).
  private _foamMask(streak: TSLNode, fChurn: TSLNode, fGloss: TSLNode, fHaze: TSLNode): TSLNode {
    const v = uv().y // 1 lip → 0 chân
    const aer = float(1).sub(v)
    const fr = this._fresnel() // tính 1 lần — dùng cho cả nền foam lẫn sheen gương
    const s = this.uSurge // master nguồn — mọi hệ số mix() qua điểm trung tính ×1 tại s=0.5
    const base = smoothstep(float(0.32), float(0.85), streak)
      .mul(float(0.7))
      .mul(mix(float(0.4), float(1.6), s)) // ồ ạt → vệt trắng đậm gấp đôi, êm → mờ phân nửa
    // glass (vùng trong veo từ lip xuống): êm → kéo SÂU (từ v=0.45) + xóa gần hết trắng (×0.9);
    // ồ ạt → co sát mép (0.9) + gần như tắt (×0.1). KHÔNG cho edge0 chạm 0.95 (chia 0 trong smoothstep)
    const glass = float(1).sub(
      smoothstep(mix(float(0.45), float(0.9), s), float(0.95), v).mul(
        mix(float(0.9), float(0.1), s)
      )
    )
    const lip = smoothstep(float(0.965), float(1), v).mul(float(0.5))
    // foot: 1 ở chân (v=0) tắt dần tới v=0.14 — KHÔNG smoothstep(cao,thấp) (đảo ngưỡng = undefined WGSL)
    const foot = float(1)
      .sub(smoothstep(float(0), float(0.14), v))
      .mul(float(0.6))
    // aeration: ồ ạt → bọt bốc CAO dần lên (mũ thấp = lan rộng) + đậm; êm → chỉ sát chân + nhạt
    const w = base
      .add(pow(aer, mix(float(3.5), float(1.2), s)).mul(mix(float(0.12), float(0.75), s)))
      .add(fr.mul(float(0.45)))
      .mul(glass)
      .add(lip)
      .add(foot)
      .add(fChurn.mul(streak.add(float(0.2))).mul(float(0.55))) // xiết → sủi trắng cục bộ theo vệt
      .add(fr.mul(fGloss).mul(float(0.85))) // gương: sheen sáng theo góc nhìn — per đoạn rơi
      .add(fHaze.mul(float(0.5))) // bụi tán: sương trắng phủ ĐỀU đoạn (không theo vệt)
    const wc = clamp(w, float(0), float(1))
    const banded = wc.mul(float(POSTER_STEPS)).floor().div(float(POSTER_STEPS))
    return mix(wc, banded, this.uPoster) as TSLNode
  }

  // Màu = mix( mix(khúc-xạ-méo-theo-vệt, waterColor, tint), foamColor, white ). Màn gần đặc (alpha cao,
  // depthWrite=true như WaterSurface) — "độ trong" đến từ ảnh backbuffer sau màn (vẽ pass transparent).
  private _buildSheetMaterial(): MeshBasicNodeMaterial {
    // Strip điều dòng — sample 1 lần theo uv.x (node ctrl dùng chung): R=tốc/2 · G=mật độ · B=xiết
    const ctrl = texture(this.flowTex as THREE.DataTexture, vec2(uv().x, float(0.5)))
    const fSpeed = ctrl.r.mul(float(2)) as TSLNode
    const fChurn = ctrl.b as TSLNode
    // Strip theo đoạn rơi — d: 0 đỉnh → 1 chân; 2 hàng sample tại TÂM texel (y=0.25/0.75, không lẫn hàng)
    const dCoord = float(1).sub(uv().y)
    const fall = texture(this.fallTex as THREE.DataTexture, vec2(dCoord, float(0.25)))
    const fNoise = texture(this.fallTex as THREE.DataTexture, vec2(dCoord, float(0.75))).r
    // nhiễu dọc cộng dồn xiết ngang — cùng đường khuếch đại méo UV trong _layerStreak
    const { streak, off } = this._layerStreak(fSpeed, fChurn.add(fNoise) as TSLNode)
    // viewportTexture (per-NODE) chứ KHÔNG viewportSharedTexture: bản shared = 1 FramebufferTexture
    // MODULE-GLOBAL cho MỌI renderer trong page → 2 renderer (editor + Lab) giành resize/copy → flood
    // "copy range touches outside" + command buffer invalid + dispose nổ (KI-014, cùng họ KI-012).
    const refrNode = viewportTexture(viewportSafeUV(screenUV.add(off.mul(this.uRefract))))
    this.viewportTex = (refrNode as unknown as { value: THREE.Texture }).value
    const refr = refrNode.rgb
    const white = this._foamMask(streak, fChurn, fall.g as TSLNode, fall.b as TSLNode)
    const edge = float(1).sub(smoothstep(float(0.38), float(0.5), uv().x.sub(float(0.5)).abs()))
    const alpha = this.uOpacity
      .mul(edge)
      .mul(smoothstep(float(0), float(0.03), uv().y))
      .mul(float(0.55).add(white.mul(float(0.45)))) // chỗ vệt dày đặc hơn, khe loãng hơn
      .mul(smoothstep(float(0.12), float(0.6), ctrl.g)) // mật độ → CẮT dòng (mép khe mềm)
      .mul(fall.r) // trong suốt per đoạn rơi
      .mul(this._erode(streak, fall.a as TSLNode))
      .mul(mix(float(0.7), float(1.3), this.uSurge)) // êm → màn trong hơn, ồ ạt → đặc hơn
    const mat = new MeshBasicNodeMaterial() // perf-ok: build 1 LẦN trong constructor, không per-rebuild
    mat.colorNode = mix(mix(refr, this.uWaterColor, this.uTint), this.uFoamColor, white).add(
      this.uFoamColor.mul(this._glint(streak)).mul(float(0.7))
    )
    mat.opacityNode = alpha
    mat.positionNode = this._wobble()
    mat.transparent = true
    mat.depthWrite = true // màn = mặt nước đặc (như WaterSurface) — composite phủ kín, depth đúng
    mat.side = THREE.DoubleSide
    return mat
  }

  // Vỡ hạt: đục thủng alpha vùng KHÔNG vệt (streak < ngưỡng) — màn tách tia/hạt răng cưa. Cường độ =
  // kênh breakup (per đoạn rơi) + NỀN khi nguồn ồ ạt (surge > 0.65 tự "phá cấu trúc"); cả hai = 0 → nhân 1.
  private _erode(streak: TSLNode, channel: TSLNode): TSLNode {
    const brk = clamp(
      channel.add(smoothstep(float(0.65), float(1), this.uSurge).mul(float(0.4))),
      float(0),
      float(1)
    )
    return float(1).sub(
      brk.mul(float(1).sub(smoothstep(float(0.3), float(0.55), streak)))
    ) as TSLNode
  }

  // Lắc mép (sway) + PHỒNG 3D (bulge — A4 WPO): sin THUẦN MATH trong vertex stage (KHÔNG sample texture
  // ở vertex — cần textureSampleLevel, bẫy đã ghi). Bulge = 2 octave sin cuộn XUỐNG (pha v·k + t·m →
  // feature trôi về v=0) đẩy theo Z → bề mặt gồ ghề + silhouette nhấp nhô như Season WPO. Biên độ:
  // lip neo đứng (smoothstep từ mép xuống), nguồn êm → phẳng lì, ồ ạt → cuồn cuộn; 0.5 = ×1.
  private _wobble(): TSLNode {
    const u = uv().x
    const v = uv().y
    const t = this.uTime.mul(this.uFlow)
    const surgeK = mix(float(0.2), float(1.8), this.uSurge)
    const amp = this.uWobble.mul(float(1).sub(v)).mul(surgeK)
    const sway = sin(
      v
        .mul(float(9))
        .sub(t.mul(float(6)))
        .add(u.mul(float(5)))
    )
    const o1 = sin(
      u
        .mul(float(9.2))
        .add(v.mul(float(14)))
        .add(t.mul(float(4.1)))
    )
    const o2 = sin(
      u
        .mul(float(23.7))
        .sub(v.mul(float(31)))
        .add(t.mul(float(6.3)))
    )
    const bulge = o1
      .mul(float(0.65))
      .add(o2.mul(float(0.35)))
      .mul(this.uBulge)
      .mul(smoothstep(float(0), float(0.3), float(1).sub(v))) // neo lip: 0 tại mép, đủ biên sau 30% rơi
      .mul(mix(float(0.3), float(1.7), this.uSurge))
    return positionLocal.add(
      vec3(sway.mul(amp).mul(float(0.5)), float(0), sway.mul(amp).add(bulge))
    ) as TSLNode
  }

  // ── Foot foam (vòng bọt loang ở chân — A5, kiểu Season "bottom foam") ──────

  // Plane nằm ngang tại chân thác, trải từ đường chạm (z≈arc) loang RA TRƯỚC. depthWrite=false +
  // renderOrder 2 + nâng 0.012m — màng mỏng nằm trên mặt hồ/đất, né z-fight.
  private _buildFoot(width: number, height: number, arc: number): THREE.Mesh {
    const depth = 0.55 + arc * 0.6
    const geo = new THREE.PlaneGeometry(width + 0.6, depth)
    geo.rotateX(-Math.PI / 2) // nằm ngang normal +Y; sau rotate uv.y=1 là phía TƯỜNG (shader đảo lại)
    geo.translate(0, 0, depth / 2) // mép trong (phía tường) về z=0
    this.footGeo = geo
    this.footMat = this._buildFootMaterial()
    const mesh = new THREE.Mesh(geo, this.footMat)
    mesh.position.set(0, -height + 0.012, arc - 0.08) // bắt đầu hơi lùi sau đường chạm
    mesh.renderOrder = 2
    return mesh
  }

  // Texture đốm tròn blur cuộn RA NGOÀI từ đường chạm, 2 lớp lệch tốc nhân nhau (blob tan/hợp như bọt
  // thật); gate theo flow strip (khe cắt dòng → bớt bọt chỗ đó); đậm theo uFootFoam × surge.
  private _buildFootMaterial(): MeshBasicNodeMaterial {
    const tex = this.foamTex as THREE.CanvasTexture
    const u = uv().x
    const v = float(1).sub(uv().y) // 0 sát đường chạm (phía tường) → 1 mép ngoài
    const t = this.uTime.mul(this.uFlow)
    const ctrl = texture(this.flowTex as THREE.DataTexture, vec2(u, float(0.5)))
    const a = texture(tex, vec2(u.mul(float(3)), v.mul(float(1.4)).sub(t.mul(float(0.55))))).r
    const b = texture(
      tex,
      vec2(u.mul(float(2.1)).add(float(0.37)), v.mul(float(1.1)).sub(t.mul(float(0.34))))
    ).r
    const blob = smoothstep(float(0.32), float(0.78), a.mul(float(0.7)).add(b.mul(float(0.5))))
    const reach = float(1).sub(smoothstep(float(0.1), float(0.95), v)) // đậm sát chạm, tan dần ra
    const edge = float(1).sub(smoothstep(float(0.36), float(0.5), u.sub(float(0.5)).abs()))
    const alpha = blob
      .mul(reach)
      .mul(edge)
      .mul(this.uFootFoam)
      .mul(mix(float(0.35), float(1.6), this.uSurge))
      .mul(smoothstep(float(0.12), float(0.6), ctrl.g))
    const mat = new MeshBasicNodeMaterial() // perf-ok: build 1 LẦN trong constructor
    mat.colorNode = this.uFoamColor
    mat.opacityNode = alpha
    mat.transparent = true
    mat.depthWrite = false
    return mat
  }

  // ── Spray (mist bốc lên / splash bắn ngang — chung 1 builder) ─────────────

  // InstancedMesh quad 1×1 + SpriteNodeMaterial (billboard) — KHÔNG dùng THREE.Points: WebGPU point
  // primitive LUÔN 1px (PointUVNode "WebGL only"; PointsNodeMaterial còn lấy positionGeometry.xy × size
  // làm offset clip-space → spawn-pos ≠ 0 văng hạt khắp màn hình — bug "màn xanh phủ viewport" đã dính).
  private _buildSpray(cfg: SprayCfg, width: number, arc: number): THREE.InstancedMesh {
    const geo = new THREE.PlaneGeometry(1, 1) // corner ±0.5 = positionGeometry.xy của Sprite setup
    const mat = this._sprayMaterial(cfg, width, arc)
    this.sprayGeos.push(geo)
    this.sprayMats.push(mat)
    const mesh = new THREE.InstancedMesh(geo, mat, cfg.count)
    mesh.frustumCulled = false // vị trí hạt tính trong shader (positionNode) — bbox geometry vô nghĩa
    return mesh
  }

  // Per-hạt KHÔNG dùng custom attribute — spawn/hướng/phase SINH TRONG SHADER từ instanceIndex + hash
  // (deterministic per-hạt; zero attribute lạ → né trọn đường dispose-attribute của three từng nổ
  // 'undefined.destroy' mỗi rebuild với attr instanced node-backed). Loop = fract(t + phase) như
  // GPUParticleSystem. positionNode = TÂM sprite per-instance (doc SpriteNodeMaterial); scaleNode = MÉT;
  // uv quad → đốm TRÒN MỀM. NormalBlending — mist trắng đục đọc đúng trên nền sáng/tối.
  private _sprayMaterial(cfg: SprayCfg, width: number, arc: number): SpriteNodeMaterial {
    const fi = instanceIndex.toFloat()
    const h = (k: number): TSLNode => hash(fi.add(float(k * 37.13))) as TSLNode // [0,1] per (hạt, kênh)
    const t = fract(this.uTime.div(float(cfg.life)).add(h(1)))
    const bell = clamp(t.mul(float(4)).mul(float(1).sub(t)), float(0), float(1))
    // spawn dọc ĐƯỜNG CHẠM: x ∈ ±width/2 · z ≈ arc ± lệch nhỏ (nơi màn đáp)
    const spawn = vec3(
      h(2).sub(float(0.5)).mul(float(width)),
      float(0),
      h(3).sub(float(0.3)).mul(float(0.18)).add(float(arc))
    )
    // hướng bay: toả ngang [outMin..outMax] theo góc ngẫu nhiên + bốc lên [upMin..upMax], thiên ra trước
    const ang = h(4).mul(float(Math.PI * 2))
    const out = mix(float(cfg.outMin), float(cfg.outMax), h(5))
    const dir = vec3(
      cos(ang).mul(out),
      mix(float(cfg.upMin), float(cfg.upMax), h(6)),
      sin(ang).mul(out).mul(float(0.6)).add(float(0.25))
    )
    const soft = float(1).sub(smoothstep(float(0.12), float(0.5), uv().sub(vec2(0.5)).length()))
    const mat = new SpriteNodeMaterial()
    mat.positionNode = spawn.add(dir.mul(t.mul(float(cfg.life)).mul(float(cfg.speed))))
    mat.colorNode = this.uFoamColor
    mat.scaleNode = mix(float(cfg.sizeA), float(cfg.sizeB), t)
    mat.opacityNode = bell
      .mul(soft)
      .mul(this.uMistOpacity)
      .mul(float(cfg.alpha))
      .mul(mix(float(0.2), float(1.8), this.uSurge)) // nguồn êm → gần như không bụi, ồ ạt → mù mịt
    mat.transparent = true
    mat.depthWrite = false
    mat.blending = THREE.NormalBlending
    return mat
  }
}

// ── Helpers (module-level) ───────────────────────────────────────────────────

// Dispose 1 bước an toàn: backend three (WebGPU) có đường dispose không guard → nổ là NUỐT các bước sau
// = leak. Bắt + warn TÊN BƯỚC (chẩn đoán) rồi đi tiếp — GPU resource của bước lỗi rớt cho GC/device-loss.
function safeDispose(step: string, fn: () => void): void {
  try {
    fn()
  } catch (e) {
    console.warn(`Waterfall.dispose: backend nổ ở bước "${step}" (bỏ qua, dọn tiếp)`, e)
  }
}

// ── Texture vệt nước A4: VORONOI SỢI + FBM distort (thay sọc kẻ thẳng) ───────
// Industry (Season / RealtimeVFX waterfall thread): chất "nước vón cục tơi" đến từ CELL NOISE, không phải
// vạch kẻ. Lattice 12×4 trên 256×512 → cell cao ~128px = sợi nước DÀI; distort bằng value-noise 2 octave
// → sợi cong vẹo tự nhiên. Hash THEO CHU KỲ lattice → tileable 2 trục tự nhiên (không cần vẽ lặp ±w/±h).
// Chi phí: ~131k px × ~30 phép/px ≈ 30–100ms, BUILD-TIME 1 lần mỗi structural commit (trade-off đã duyệt).
const STREAK_W = 256
const STREAK_H = 512
const VORO_NX = 12 // cột lattice — nhiều = sợi mảnh
const VORO_NY = 4 // hàng lattice — ít = sợi DÀI (cell giãn dọc ~128px)

// hash 2 số nguyên → [0,1) deterministic (integer mix — không Math.random: texture tái lập được)
function hash2i(x: number, y: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0
  h = (h ^ (h >>> 13)) | 0
  h = Math.imul(h, 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

// value-noise CÓ CHU KỲ (px×py) — làm distort cho voronoi; chu kỳ khớp lattice nên KHÔNG phá tiling
function vnoisePer(u: number, v: number, px: number, py: number, seed: number): number {
  const xi = Math.floor(u)
  const yi = Math.floor(v)
  const xf = u - xi
  const yf = v - yi
  const sx = xf * xf * (3 - 2 * xf)
  const sy = yf * yf * (3 - 2 * yf)
  const at = (ix: number, iy: number): number =>
    hash2i((((ix % px) + px) % px) + seed * 1013, ((iy % py) + py) % py)
  const a = at(xi, yi)
  const b = at(xi + 1, yi)
  const c = at(xi, yi + 1)
  const d = at(xi + 1, yi + 1)
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy
}

// voronoi F1 CÓ CHU KỲ trên lattice px×py — trả khoảng cách gần nhất + id cell (độ sáng per-sợi)
function voroPer(u: number, v: number, px: number, py: number): { f1: number; id: number } {
  const xi = Math.floor(u)
  const yi = Math.floor(v)
  let f1 = 9
  let id = 0
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const cx = xi + dx
      const cy = yi + dy
      const wx = ((cx % px) + px) % px
      const wy = ((cy % py) + py) % py
      const ddx = u - (cx + hash2i(wx, wy + 7777))
      const ddy = (v - (cy + hash2i(wx + 3331, wy))) * 0.85 // nén dọc nhẹ — sợi dài thêm
      const d = ddx * ddx + ddy * ddy
      if (d < f1) {
        f1 = d
        id = hash2i(wx + 555, wy + 99)
      }
    }
  }
  return { f1: Math.sqrt(f1), id }
}

function makeStreakTexture(): THREE.CanvasTexture {
  const cv = document.createElement('canvas')
  cv.width = STREAK_W
  cv.height = STREAK_H
  const g = cv.getContext('2d') as CanvasRenderingContext2D
  const img = g.createImageData(STREAK_W, STREAK_H)
  const d = img.data
  for (let y = 0; y < STREAK_H; y++) {
    for (let x = 0; x < STREAK_W; x++) {
      const u = (x / STREAK_W) * VORO_NX
      const v = (y / STREAK_H) * VORO_NY
      // distort 2 octave (hệ số nguyên — giữ chu kỳ): sợi cong vẹo, phá thẳng hàng
      const n1 = vnoisePer(u, v * 2, VORO_NX, VORO_NY * 2, 11)
      const n2 = vnoisePer(u * 3, v * 6, VORO_NX * 3, VORO_NY * 6, 23)
      const dist = (n1 - 0.5) * 1.1 + (n2 - 0.5) * 0.35
      const r = voroPer(u + dist, v + dist * 0.4, VORO_NX, VORO_NY)
      const strand = Math.max(0, 1 - r.f1 / 0.8) // lõi sợi sáng, rìa fade
      const bright = 0.45 + 0.55 * r.id // mỗi sợi 1 độ đậm — như vệt dài-ngắn bản cũ
      const val = Math.min(1, Math.pow(strand, 1.4) * bright + (n2 - 0.5) * 0.3 * strand + 0.05)
      const p = (y * STREAK_W + x) * 4
      d[p] = d[p + 1] = d[p + 2] = Math.round(Math.max(0, val) * 255)
      d[p + 3] = 255
    }
  }
  g.putImageData(img, 0, 0)
  const tex = new THREE.CanvasTexture(cv)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  return tex
}

// Texture ĐỐM TRÒN blur cho vòng bọt chân (A5 — Season: "hand-painted tiled texture hình tròn + blur"):
// 70 đốm radial-gradient mềm, vẽ lặp 9 vị trí (±sz) → tileable 2 trục; hash deterministic — tái lập được.
// Canvas gradient = GPU-accelerated, ~vài ms (khác Voronoi per-pixel JS của streak).
function makeFoamTexture(): THREE.CanvasTexture {
  const sz = 256
  const cv = document.createElement('canvas')
  cv.width = sz
  cv.height = sz
  const g = cv.getContext('2d') as CanvasRenderingContext2D
  g.fillStyle = '#000'
  g.fillRect(0, 0, sz, sz)
  for (let i = 0; i < 70; i++) {
    const x = hash2i(i, 1) * sz
    const y = hash2i(i, 2) * sz
    const r = 8 + hash2i(i, 3) * 26
    const al = 0.25 + hash2i(i, 4) * 0.5
    for (const dy of [-sz, 0, sz]) {
      for (const dx of [-sz, 0, sz]) {
        const grad = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r)
        grad.addColorStop(0, `rgba(255,255,255,${al.toFixed(3)})`)
        grad.addColorStop(0.7, `rgba(255,255,255,${(al * 0.5).toFixed(3)})`)
        grad.addColorStop(1, 'rgba(255,255,255,0)')
        g.fillStyle = grad
        g.fillRect(x + dx - r, y + dy - r, r * 2, r * 2)
      }
    }
  }
  const tex = new THREE.CanvasTexture(cv)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  return tex
}

// Strip điều dòng 64×1 RGBA, khởi tạo TRUNG TÍNH (tốc 1 · mật độ 1 · xiết 0). UnsignedByte chứ KHÔNG
// FloatType: filter linear trên float32 là optional feature 'float32-filterable' — không phải GPU nào
// cũng có; unorm8 + linear thì mọi GPU đều chạy (64 nấc/kênh quá đủ cho điều dòng).
function makeFlowTexture(data: Uint8Array): THREE.DataTexture {
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 128 // speed 1 (encode tốc/2)
    data[i + 1] = 255 // density 1
    data[i + 2] = 0 // churn 0
    data[i + 3] = 255
  }
  const tex = new THREE.DataTexture(data, FLOW_RES, 1, THREE.RGBAFormat, THREE.UnsignedByteType)
  tex.magFilter = THREE.LinearFilter // mép khe/ranh tốc mềm tự nhiên giữa texel
  tex.minFilter = THREE.LinearFilter
  tex.needsUpdate = true
  return tex
}

// Strip DỌC 64×2 khởi tạo TRUNG TÍNH (hàng 1: opacity=1, gloss/haze/breakup=0 · hàng 2: noise=0 —
// Uint8Array zero-init sẵn, chỉ cần set opacity). UnsignedByte — cùng lý do flow strip.
function makeFallTexture(data: Uint8Array): THREE.DataTexture {
  for (let i = 0; i < FLOW_RES; i++) data[i * 4] = 255 // opacity 1
  const tex = new THREE.DataTexture(data, FLOW_RES, 2, THREE.RGBAFormat, THREE.UnsignedByteType)
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearFilter
  tex.needsUpdate = true
  return tex
}

// smoothstep phía CPU (dựng đường võng drawdown của crest lúc build geometry).
function smoothstepJs(e0: number, e1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

// Nội suy linear giữa các mẫu FallSample (trải đều theo d: 0 đỉnh → 1 chân) — field thiếu = trung tính.
function fallAt(samples: FallSample[], dd: number): Required<FallSample> {
  const neutral: Required<FallSample> = { opacity: 1, gloss: 0, haze: 0, noise: 0, breakup: 0 }
  if (samples.length === 0) return neutral
  const x = dd * (samples.length - 1)
  const i = Math.floor(x)
  const f = x - i
  const a = samples[i] ?? {}
  const b = samples[Math.min(samples.length - 1, i + 1)] ?? {}
  const pick = (k: keyof FallSample): number => {
    const av = a[k] ?? neutral[k]
    const bv = b[k] ?? neutral[k]
    return av + (bv - av) * f
  }
  return {
    opacity: pick('opacity'),
    gloss: pick('gloss'),
    haze: pick('haze'),
    noise: pick('noise'),
    breakup: pick('breakup'),
  }
}

// Nội suy linear giữa các mẫu FlowSample (trải đều theo u) — field thiếu = trung tính.
function flowAt(samples: FlowSample[], u: number): Required<FlowSample> {
  const neutral: Required<FlowSample> = { speed: 1, density: 1, churn: 0 }
  if (samples.length === 0) return neutral
  const x = u * (samples.length - 1)
  const i = Math.floor(x)
  const f = x - i
  const a = samples[i] ?? {}
  const b = samples[Math.min(samples.length - 1, i + 1)] ?? {}
  const pick = (k: keyof FlowSample): number => {
    const av = a[k] ?? neutral[k]
    const bv = b[k] ?? neutral[k]
    return av + (bv - av) * f
  }
  return { speed: pick('speed'), density: pick('density'), churn: pick('churn') }
}
