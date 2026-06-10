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
 *
 * CÁCH DÙNG: const wf = new Waterfall({ width: 2, height: 1.8 })
 *            scene.add(wf.getGroup()) // position group tại MÉP ĐỔ (đỉnh tường/vách đá)
 *            mỗi frame: wf.setTime(elapsedSeconds)
 * DISPOSE: dispose() — geometry + material (sheet/mist/splash) + CanvasTexture + gỡ group khỏi parent.
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
  streakScale: 1.6,
  waterColor: 0x9fc6d8 as THREE.ColorRepresentation,
  foamColor: 0xf2fbff as THREE.ColorRepresentation,
  opacity: 0.95,
  tint: 0.35, // ám màu nước lên ảnh khúc xạ (0 = kính trong, 1 = đặc màu)
  refract: 0.6, // cường độ méo ảnh khúc xạ theo vệt
  posterize: 0, // 0 = mượt; 1 = banding 4 nấc full (look RiME stylized)
  wobble: 0.035, // m — biên độ lắc mép dưới
  mistCount: 220,
  mistIntensity: 0.7,
}
const SHEET_W_SEGS = 16 // wobble + fresnel cần lưới ngang đủ
const SHEET_H_SEGS = 40
const MAX_MIST = 600 // cap budget mỗi hệ hạt (quad billboard/hạt, instanced 1 draw)
const POSTER_STEPS = 4 // số nấc banding khi posterize

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
  /** Số hạt MIST (cap 600; 0 = tắt cả mist lẫn splash). Default: 220 */
  mistCount?: number
  /** Cường độ mist/splash [0–1]. Default: 0.7 */
  mistIntensity?: number
}

export class Waterfall {
  private group: THREE.Group | null = null
  private sheetGeo: THREE.PlaneGeometry | null = null
  private sheetMat: MeshBasicNodeMaterial | null = null
  private streakTex: THREE.CanvasTexture | null = null
  private sprayGeos: THREE.BufferGeometry[] = []
  private sprayMats: SpriteNodeMaterial[] = []
  // FramebufferTexture RIÊNG của node khúc xạ (viewportTexture per-instance) — ta giữ ref để dispose
  // (material.dispose KHÔNG đụng tới — texture node sống ngoài material, kẻo leak VRAM cỡ canvas/lần rebuild)
  private viewportTex: THREE.Texture | null = null
  private isDisposed = false

  private readonly uTime = uniform(0)
  private readonly uFlow: ReturnType<typeof uniform>
  private readonly uStreak: ReturnType<typeof uniform>
  private readonly uOpacity: ReturnType<typeof uniform>
  private readonly uWaterColor: ReturnType<typeof uniform>
  private readonly uFoamColor: ReturnType<typeof uniform>
  private readonly uTint: ReturnType<typeof uniform>
  private readonly uRefract: ReturnType<typeof uniform>
  private readonly uPoster: ReturnType<typeof uniform>
  private readonly uWobble: ReturnType<typeof uniform>
  private readonly uMistOpacity: ReturnType<typeof uniform>

  constructor(opts: WaterfallOptions = {}) {
    const o = { ...DEFAULTS, ...opts }
    this.uFlow = uniform(o.flow)
    this.uStreak = uniform(o.streakScale)
    this.uOpacity = uniform(o.opacity)
    this.uWaterColor = uniform(new THREE.Color(o.waterColor))
    this.uFoamColor = uniform(new THREE.Color(o.foamColor))
    this.uTint = uniform(o.tint)
    this.uRefract = uniform(o.refract)
    this.uPoster = uniform(o.posterize)
    this.uWobble = uniform(o.wobble)
    this.uMistOpacity = uniform(Math.max(0, Math.min(1, o.mistIntensity)) * 0.5)

    this.streakTex = makeStreakTexture()
    const group = new THREE.Group()
    group.add(this._buildSheet(o.width, o.height, o.arc))
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

  /** Cường độ mist/splash [0–1] (0 = ẩn hạt). */
  setMistIntensity(v: number): void {
    if (this.isDisposed) return
    this.uMistOpacity.value = Math.max(0, Math.min(1, v)) * 0.5
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
    safeDispose('streakTex', () => this.streakTex?.dispose())
    // texture khúc xạ per-instance — material.dispose không lo (né leak VRAM)
    safeDispose('viewportTex', () => this.viewportTex?.dispose())
    for (const g of this.sprayGeos) safeDispose('sprayGeo', () => g.dispose())
    for (const m of this.sprayMats) safeDispose('sprayMat', () => m.dispose())
    this.sprayGeos = []
    this.sprayMats = []
    this.sheetGeo = null
    this.sheetMat = null
    this.streakTex = null
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

  // 3 lớp texture vệt cuộn xuống (cộng t vào toạ-độ-y → feature trôi về v=0): A chính ×1 · B chậm ×0.72
  // đảo U (phá lặp) · C nhanh ×1.5 tile nhỏ — C sample TRƯỚC làm UV-distort cho A/B ("xối" không lặp).
  // Trả { streak [0..~1.2], off (vec2 lệch khúc xạ theo vệt) }.
  private _layerStreak(): { streak: TSLNode; off: TSLNode } {
    const tex = this.streakTex as THREE.CanvasTexture
    const t = this.uTime.mul(this.uFlow)
    const tu = uv()
    const c = texture(tex, vec2(tu.x.mul(this.uStreak).mul(1.9), tu.y.mul(2.6).add(t.mul(1.5)))).r
    const d = c.sub(float(0.5)).mul(float(0.05))
    const a = texture(tex, vec2(tu.x.mul(this.uStreak).add(d), tu.y.mul(float(1)).add(t))).r
    const bx = float(1).sub(tu.x).mul(this.uStreak).mul(float(1.37)).add(d)
    const b = texture(tex, vec2(bx, tu.y.mul(float(1.55)).add(t.mul(float(0.72))))).r
    const streak = a
      .mul(float(0.55))
      .add(b.mul(float(0.4)))
      .add(c.mul(float(0.25)))
    const off = vec2(d, c.sub(float(0.5)).mul(float(-0.035)))
    return { streak: streak as TSLNode, off: off as TSLNode }
  }

  // Fresnel màn cong: nhìn XIÊN màn (mép cong/lệch góc) → trắng đặc hơn (màn "mỏng" cho sáng xuyên ít).
  private _fresnel(): TSLNode {
    const eye = normalize(cameraPosition.sub(positionWorld))
    const facing = dot(eye, normalWorld).abs() // DoubleSide → abs (sau màn vẫn đúng)
    return pow(float(1).sub(facing), float(2.2)) as TSLNode
  }

  // white mask = vệt + aeration (càng rơi càng sủi) + fresnel + band mép (lip) + band chân (foot);
  // vùng dưới lip trong veo (glass); posterize optional (banding 4 nấc — look RiME).
  private _foamMask(streak: TSLNode): TSLNode {
    const v = uv().y // 1 lip → 0 chân
    const aer = float(1).sub(v)
    const base = smoothstep(float(0.32), float(0.85), streak).mul(float(0.7))
    const glass = float(1).sub(smoothstep(float(0.78), float(0.95), v).mul(float(0.5)))
    const lip = smoothstep(float(0.965), float(1), v).mul(float(0.5))
    // foot: 1 ở chân (v=0) tắt dần tới v=0.14 — KHÔNG smoothstep(cao,thấp) (đảo ngưỡng = undefined WGSL)
    const foot = float(1)
      .sub(smoothstep(float(0), float(0.14), v))
      .mul(float(0.6))
    const w = base
      .add(aer.mul(aer).mul(float(0.3)))
      .add(this._fresnel().mul(float(0.45)))
      .mul(glass)
      .add(lip)
      .add(foot)
    const wc = clamp(w, float(0), float(1))
    const banded = wc.mul(float(POSTER_STEPS)).floor().div(float(POSTER_STEPS))
    return mix(wc, banded, this.uPoster) as TSLNode
  }

  // Màu = mix( mix(khúc-xạ-méo-theo-vệt, waterColor, tint), foamColor, white ). Màn gần đặc (alpha cao,
  // depthWrite=true như WaterSurface) — "độ trong" đến từ ảnh backbuffer sau màn (vẽ pass transparent).
  private _buildSheetMaterial(): MeshBasicNodeMaterial {
    const { streak, off } = this._layerStreak()
    // viewportTexture (per-NODE) chứ KHÔNG viewportSharedTexture: bản shared = 1 FramebufferTexture
    // MODULE-GLOBAL cho MỌI renderer trong page → 2 renderer (editor + Lab) giành resize/copy → flood
    // "copy range touches outside" + command buffer invalid + dispose nổ (KI-014, cùng họ KI-012).
    const refrNode = viewportTexture(viewportSafeUV(screenUV.add(off.mul(this.uRefract))))
    this.viewportTex = (refrNode as unknown as { value: THREE.Texture }).value
    const refr = refrNode.rgb
    const white = this._foamMask(streak)
    const edge = float(1).sub(smoothstep(float(0.38), float(0.5), uv().x.sub(float(0.5)).abs()))
    const alpha = this.uOpacity
      .mul(edge)
      .mul(smoothstep(float(0), float(0.03), uv().y))
      .mul(float(0.55).add(white.mul(float(0.45)))) // chỗ vệt dày đặc hơn, khe loãng hơn
    const mat = new MeshBasicNodeMaterial() // perf-ok: build 1 LẦN trong constructor, không per-rebuild
    mat.colorNode = mix(mix(refr, this.uWaterColor, this.uTint), this.uFoamColor, white)
    mat.opacityNode = alpha
    mat.positionNode = this._wobble()
    mat.transparent = true
    mat.depthWrite = true // màn = mặt nước đặc (như WaterSurface) — composite phủ kín, depth đúng
    mat.side = THREE.DoubleSide
    return mat
  }

  // Lắc mép: sin theo (v, x, time) — biên độ lớn dần về CHÂN (1−v), lip đứng yên. Đẩy theo Z (phương dạt).
  private _wobble(): TSLNode {
    const v = uv().y
    const amp = this.uWobble.mul(float(1).sub(v))
    const sway = sin(
      v
        .mul(float(9))
        .sub(this.uTime.mul(this.uFlow).mul(float(6)))
        .add(uv().x.mul(float(5)))
    )
    return positionLocal.add(
      vec3(sway.mul(amp).mul(float(0.5)), float(0), sway.mul(amp))
    ) as TSLNode
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
    mat.opacityNode = bell.mul(soft).mul(this.uMistOpacity).mul(float(cfg.alpha))
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

// Texture VỆT NƯỚC tileable sinh 1 lần bằng Canvas 2D (build-time, 0 asset): ~150 vệt dọc trắng
// dài-ngắn/đậm-nhạt random, đầu-đuôi fade (gradient), vẽ LẶP ±h và ±w → seamless cả 2 trục.
// Texture có CẤU TRÚC VỆT DÀI rõ — thứ procedural noise (triNoise blob) không cho được.
function makeStreakTexture(): THREE.CanvasTexture {
  const w = 256
  const h = 512
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  const g = cv.getContext('2d') as CanvasRenderingContext2D
  g.fillStyle = '#000'
  g.fillRect(0, 0, w, h)
  for (let i = 0; i < 150; i++) {
    const x = Math.random() * w
    const len = h * (0.25 + Math.random() * 0.75)
    const y = Math.random() * h
    const wd = 1 + Math.random() * 5
    const a = 0.16 + Math.random() * 0.5
    const grad = g.createLinearGradient(0, y, 0, y + len)
    grad.addColorStop(0, 'rgba(255,255,255,0)')
    grad.addColorStop(0.25, `rgba(255,255,255,${a.toFixed(3)})`)
    grad.addColorStop(0.75, `rgba(255,255,255,${(a * 0.85).toFixed(3)})`)
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grad
    // Vẽ lặp 6 vị trí (dx 0/±w × dy 0/−h) qua translate → gradient DỊCH THEO (gradient là user-space,
    // fillRect ở toạ-độ gốc + transform) ⇒ tile seamless cả 2 trục, không mảng trong suốt.
    for (const dy of [0, -h]) {
      for (const dx of [0, -w, w]) {
        g.save()
        g.translate(dx, dy)
        g.fillRect(x, y, wd, len)
        g.restore()
      }
    }
  }
  const tex = new THREE.CanvasTexture(cv)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  return tex
}
