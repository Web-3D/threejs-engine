/**
 * VỊ TRÍ   — threejs-modules/effects/Precipitation/index.ts
 * VAI TRÒ  — Mưa / tuyết PROCEDURAL field-paradigm: N hạt rải trong TRỤ bám camera, rơi + wrap modulo
 *            chạy HOÀN TOÀN vertex shader (0 CPU/frame ngoài 1 uniform time). 1 draw cho cả màn.
 *            Mode 'rain' = LineSegments (VỆT streak dọc quỹ đạo, nghiêng theo gió) · 'snow' = Points
 *            (chấm bông, cỡ theo distance camera, drift sin lắc). Khác paradigm render theo mode.
 * LIÊN HỆ  — effects/ tự chứa (không import ../). KHÔNG reuse GPUParticleSystem: đó là EMITTER-paradigm
 *            (hạt phát từ 1 điểm theo aDir + bell-envelope), mưa/tuyết là FIELD (hạt rải đều thể tích, rơi
 *            cùng hướng, spawn theo VỊ TRÍ chứ không hướng). Trụ bám camera qua `cameraPosition` (uniform
 *            three tự cập nhật) → hạt luôn quanh người xem, tịnh tiến cứng theo cam (không trượt trong khung).
 *            Phase B ráp archplan: 1 instance/scene, preset 🌧️❄️⛈️ liên động overcast (SkyGradient).
 *
 * CÁCH DÙNG: const w = new Precipitation({ mode: 'rain', count: 6000 })
 *            scene.add(w.getObject())                 // mỗi frame: w.update(dt)
 * DISPOSE: dispose() giải phóng geometry + material + gỡ points khỏi parent.
 */

import * as THREE from 'three'
import type Node from 'three/src/nodes/core/Node.js'
import type { ShaderNodeObject } from 'three/tsl'
import {
  attribute,
  cameraPosition,
  distance,
  float,
  fract,
  mix,
  sin,
  smoothstep,
  uniform,
  vec3,
} from 'three/tsl'
import { LineBasicNodeMaterial, PointsNodeMaterial } from 'three/webgpu'

type TSLNode = ShaderNodeObject<Node>

export type PrecipMode = 'rain' | 'snow'

export interface PrecipitationOptions {
  /** Kiểu: 'rain' (nhanh/nhỏ/nghiêng) hoặc 'snow' (chậm/to/drift). Đổi mode = tạo instance mới. Default: 'rain' */
  mode?: PrecipMode
  /** Số hạt (cap 30000 — budget overdraw). Đổi count = rebuild geometry. Default: rain 6000 / snow 2500 */
  count?: number
  /** Bán kính trụ phủ quanh camera (m). LIVE. Default: 18 */
  radius?: number
  /** Chiều cao cột (m) — hạt rơi từ groundY+height xuống groundY. LIVE. Default: 22 */
  height?: number
  /** Cao độ đáy world (m) — hạt biến mất ở đây. LIVE. Default: 0 */
  groundY?: number
  /** Tốc độ rơi (m/s). LIVE. Default: rain 17 / snow 2.4 */
  speed?: number
  /** Cỡ hạt GẦN camera (px, max — xa thu nhỏ về size×SIZE_MIN_RATIO theo khoảng cách). LIVE. Default: rain 3.2 / snow 8 */
  size?: number
  /** Màu hạt. LIVE. Default: rain 0xaeb8c4 / snow 0xfafcff */
  color?: THREE.ColorRepresentation
  /** Độ mờ [0..1]. LIVE. Default: rain 0.35 / snow 0.8 */
  opacity?: number
  /** Gió ngang (m, lệch XZ theo quãng rơi) — vệt nghiêng. LIVE. Default: rain (2.4,0) / snow (0.6,0) */
  wind?: [number, number]
  /** Biên độ drift sin ngang (m) — bông tuyết lắc lư. LIVE. Default: rain 0 / snow 0.5 */
  drift?: number
  /** Độ dài vệt mưa (m, CHỈ mode rain = LineSegments). LIVE. Default: 0.9 */
  streak?: number
}

const MAX_PARTICLES = 30000
const SIZE_NEAR = 3 // m — hạt gần hơn mức này = cỡ MAX (uSize)
const SIZE_MIN_RATIO = 0.28 // hạt ở rìa trụ (xa = uRadius) thu về size × tỉ lệ này

// Mặc định theo mode — caller override từng prop. size = cỡ GẦN camera (gấp đôi bản cũ 1.6/4 → 3.2/8).
const PRESETS: Record<PrecipMode, Required<Omit<PrecipitationOptions, 'mode'>>> = {
  rain: {
    count: 6000,
    radius: 18,
    height: 22,
    groundY: 0,
    speed: 17,
    size: 3.2,
    color: 0xaeb8c4,
    opacity: 0.35,
    wind: [2.4, 0],
    drift: 0,
    streak: 0.9,
  },
  snow: {
    count: 2500,
    radius: 18,
    height: 22,
    groundY: 0,
    speed: 2.4,
    size: 8,
    color: 0xfafcff,
    opacity: 0.8,
    wind: [0.6, 0],
    drift: 0.5,
    streak: 0.9,
  },
}

export class Precipitation {
  // rain = LineSegments (vệt streak dọc quỹ đạo) · snow = Points (chấm bông). Khác paradigm render theo mode.
  private obj: THREE.Points | THREE.LineSegments | null = null
  private geometry: THREE.BufferGeometry | null = null
  private material: PointsNodeMaterial | LineBasicNodeMaterial | null = null
  private isDisposed = false

  private readonly mode: PrecipMode
  private count: number
  private time = 0

  // Uniform nodes — update qua .value (live, 0 recompile).
  private readonly uTime = uniform(0)
  private readonly uRadius = uniform(18)
  private readonly uHeight = uniform(22)
  private readonly uGroundY = uniform(0)
  private readonly uSpeed = uniform(17)
  private readonly uSize = uniform(3.2) // cỡ MAX (gần camera) — xa thu nhỏ theo distance
  private readonly uColor = uniform(new THREE.Color(1, 1, 1)) // .value = Color (có .set/.copy)
  private readonly uOpacity = uniform(0.35)
  private readonly uWind = uniform(new THREE.Vector2(0, 0)) // .value = Vector2 (có .set)
  private readonly uDrift = uniform(0)
  private readonly uStreak = uniform(0.9) // m — độ dài vệt mưa (rain). snow không dùng.

  constructor(opts: PrecipitationOptions = {}) {
    this.mode = opts.mode ?? 'rain'
    const d = PRESETS[this.mode]
    this.count = clampInt(opts.count ?? d.count, 1, MAX_PARTICLES)
    this._initUniforms(opts, d)

    if (this.mode === 'rain') {
      this.geometry = this._buildLineGeometry(this.count) // 2 vertex/hạt = 1 vệt
      const mat = this._buildLineMaterial()
      this.material = mat
      this.obj = new THREE.LineSegments(this.geometry, mat)
    } else {
      this.geometry = this._buildPointGeometry(this.count) // 1 vertex/hạt = 1 chấm
      const mat = this._buildPointMaterial()
      this.material = mat
      this.obj = new THREE.Points(this.geometry, mat)
    }
    this.obj.frustumCulled = false // trụ bám camera → bbox vô nghĩa, đừng để cull nhầm
  }

  // Đổ opts (override defaults theo mode) vào uniform — tách khỏi constructor (complexity).
  private _initUniforms(
    opts: PrecipitationOptions,
    d: Required<Omit<PrecipitationOptions, 'mode'>>
  ): void {
    this._initScalars(opts, d)
    const w = opts.wind ?? d.wind
    this.uWind.value.set(w[0], w[1])
    this.uColor.value.set(opts.color ?? d.color)
  }

  private _initScalars(
    opts: PrecipitationOptions,
    d: Required<Omit<PrecipitationOptions, 'mode'>>
  ): void {
    this.uRadius.value = opts.radius ?? d.radius
    this.uHeight.value = opts.height ?? d.height
    this.uGroundY.value = opts.groundY ?? d.groundY
    this.uSpeed.value = opts.speed ?? d.speed
    this.uSize.value = opts.size ?? d.size
    this.uOpacity.value = opts.opacity ?? d.opacity
    this.uDrift.value = opts.drift ?? d.drift
    this.uStreak.value = opts.streak ?? d.streak
  }

  // ── Shared shader helpers (dùng chung rain-lines lẫn snow-points) ──

  // tFall ∈ [0,1] lặp vô hạn (fract): 0 = vừa sinh ở đỉnh, 1 = chạm đáy. Phase so le các hạt.
  private _tFall(phase: TSLNode): TSLNode {
    return fract(this.uTime.mul(this.uSpeed).div(this.uHeight).add(phase)) as TSLNode
  }

  // Fade 2 đầu để hạt KHÔNG pop khi wrap (mờ lúc mới sinh + lúc sắp chạm đáy).
  private _fade(tFall: TSLNode): TSLNode {
    return smoothstep(float(0), float(0.06), tFall).mul(
      smoothstep(float(1), float(0.92), tFall)
    ) as TSLNode
  }

  // worldPos từ biến t (0 đỉnh .. 1 đáy) + seed. Trụ bám camera + lệch gió theo t + drift sin (theo uTime).
  // Vệt mưa = gọi với t khác nhau cho 2 đầu (cùng công thức → đoạn nối liền dọc quỹ đạo).
  private _posNode(t: TSLNode, sx: TSLNode, sz: TSLNode, phase: TSLNode): TSLNode {
    const y = this.uGroundY.add(this.uHeight.mul(float(1).sub(t)))
    const windOff = this.uWind.mul(t)
    const driftX = sin(this.uTime.mul(float(1.3)).add(phase.mul(float(6.283)))).mul(this.uDrift)
    const driftZ = sin(this.uTime.mul(float(1.1)).add(phase.mul(float(9.42)))).mul(this.uDrift)
    const px = cameraPosition.x.add(sx.mul(this.uRadius)).add(windOff.x).add(driftX)
    const pz = cameraPosition.z.add(sz.mul(this.uRadius)).add(windOff.y).add(driftZ)
    return vec3(px, y, pz) as TSLNode
  }

  // ── snow: Points (chấm bông, cỡ theo distance) ──

  // 1 hạt = 1 vertex. aSeed vec3 = (sx, sz ∈ [-1,1] vị trí chuẩn-hoá trong trụ, phase ∈ [0,1] so le rơi).
  private _buildPointGeometry(count: number): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry() // perf-ok: Points không sample texture (uv vô nghĩa) — positionNode thay hẳn position
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
    const seed = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      seed[i * 3] = Math.random() * 2 - 1 // sx
      seed[i * 3 + 1] = Math.random() * 2 - 1 // sz
      seed[i * 3 + 2] = Math.random() // phase
    }
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3))
    return geo
  }

  private _buildPointMaterial(): PointsNodeMaterial {
    const aSeed = attribute('aSeed', 'vec3') as TSLNode
    const tFall = this._tFall(aSeed.z)
    const worldPos = this._posNode(tFall, aSeed.x, aSeed.y, aSeed.z)

    // Cỡ theo KHOẢNG CÁCH tới camera: gần (≤SIZE_NEAR) = uSize (max), xa (≥uRadius) = uSize×MIN_RATIO.
    // sizeAttenuation=false để TỰ kiểm soát hoàn toàn (px screen-space), clamp min/max rõ ràng theo ý.
    const dist = distance(worldPos, cameraPosition) as TSLNode
    const farT = smoothstep(float(SIZE_NEAR), this.uRadius, dist)
    const sizePx = this.uSize.mul(mix(float(1), float(SIZE_MIN_RATIO), farT))

    const mat = new PointsNodeMaterial()
    mat.positionNode = worldPos
    mat.colorNode = this.uColor
    mat.sizeNode = sizePx
    mat.opacityNode = this.uOpacity.mul(this._fade(tFall))
    mat.transparent = true
    mat.depthWrite = false // hạt trong suốt — đừng ghi depth (né tự che lẫn nhau)
    mat.sizeAttenuation = false // tự control cỡ theo distance (clamp max gần / min xa)
    return mat
  }

  // ── rain: LineSegments (vệt streak dọc quỹ đạo) ──

  // 2 vertex/hạt = 1 vệt. aSeed lặp 2 lần (cùng hạt); aEnd = 0 (đầu dưới, tại tFall) / 1 (đuôi TRÊN, tFall−δ).
  private _buildLineGeometry(count: number): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry() // perf-ok: Line không cần uv — positionNode thay position
    const n = count * 2
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3))
    const seed = new Float32Array(n * 3)
    const end = new Float32Array(n)
    for (let i = 0; i < count; i++) {
      const sx = Math.random() * 2 - 1
      const sz = Math.random() * 2 - 1
      const ph = Math.random()
      for (let v = 0; v < 2; v++) {
        const k = i * 2 + v
        seed[k * 3] = sx
        seed[k * 3 + 1] = sz
        seed[k * 3 + 2] = ph
        end[k] = v // 0 đầu, 1 đuôi
      }
    }
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3))
    geo.setAttribute('aEnd', new THREE.BufferAttribute(end, 1))
    return geo
  }

  private _buildLineMaterial(): LineBasicNodeMaterial {
    const aSeed = attribute('aSeed', 'vec3') as TSLNode
    const aEnd = attribute('aEnd', 'float') as TSLNode
    const tFall = this._tFall(aSeed.z)
    // δ = streak(m)/height trong t-space: đuôi (aEnd=1) tại tFall−δ = vị trí CAO hơn streak(m) dọc quỹ đạo.
    const delta = this.uStreak.div(this.uHeight)
    const tUsed = tFall.sub(aEnd.mul(delta)) as TSLNode
    const worldPos = this._posNode(tUsed, aSeed.x, aSeed.y, aSeed.z)

    const mat = new LineBasicNodeMaterial()
    mat.positionNode = worldPos
    mat.colorNode = this.uColor
    mat.opacityNode = this.uOpacity.mul(this._fade(tFall)) // fade theo tFall của hạt (2 vertex cùng)
    mat.transparent = true
    mat.depthWrite = false
    return mat
  }

  /** Tiến thời gian (giây). Gọi mỗi frame với deltaTime. */
  update(dt: number): void {
    if (this.isDisposed) return
    this.time += dt
    this.uTime.value = this.time
  }

  /** Object để add vào scene (Points cho snow, LineSegments cho rain). */
  getObject(): THREE.Points | THREE.LineSegments {
    if (!this.obj) throw new Error('Precipitation: đã dispose')
    return this.obj
  }

  /** Tốc độ rơi (m/s). Min 0.1. LIVE. */
  setSpeed(v: number): void {
    if (!this.isDisposed) this.uSpeed.value = Math.max(0.1, v)
  }

  /** Bán kính trụ phủ quanh camera (m). Min 1. LIVE. */
  setRadius(v: number): void {
    if (!this.isDisposed) this.uRadius.value = Math.max(1, v)
  }

  /** Chiều cao cột (m). Min 1. LIVE. */
  setHeight(v: number): void {
    if (!this.isDisposed) this.uHeight.value = Math.max(1, v)
  }

  /** Cao độ đáy world (m). LIVE. */
  setGroundY(v: number): void {
    if (!this.isDisposed) this.uGroundY.value = v
  }

  /** Cỡ hạt GẦN camera (px, max — xa thu nhỏ theo distance). Min 0.1. LIVE. */
  setSize(v: number): void {
    if (!this.isDisposed) this.uSize.value = Math.max(0.1, v)
  }

  /** Độ mờ [0..1]. LIVE. */
  setOpacity(v: number): void {
    if (!this.isDisposed) this.uOpacity.value = Math.max(0, Math.min(1, v))
  }

  /** Màu hạt. LIVE. */
  setColor(c: THREE.ColorRepresentation): void {
    if (!this.isDisposed) this.uColor.value.set(c)
  }

  /** Gió ngang (m). LIVE. */
  setWind(x: number, z: number): void {
    if (!this.isDisposed) this.uWind.value.set(x, z)
  }

  /** Biên độ drift ngang (m). Min 0. LIVE. */
  setDrift(v: number): void {
    if (!this.isDisposed) this.uDrift.value = Math.max(0, v)
  }

  /** Độ dài vệt mưa (m, chỉ mode rain). Min 0.05. LIVE. */
  setStreak(v: number): void {
    if (!this.isDisposed) this.uStreak.value = Math.max(0.05, v)
  }

  /** Số hạt hiện tại. */
  getCount(): number {
    return this.count
  }

  dispose(): void {
    if (this.isDisposed) return
    this.geometry?.dispose()
    this.material?.dispose()
    this.obj?.parent?.remove(this.obj)
    this.geometry = null
    this.material = null
    this.obj = null
    this.isDisposed = true
  }
}

function clampInt(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(v)))
}
