/**
 * VỊ TRÍ   — threejs-modules/effects/Precipitation/index.ts
 * VAI TRÒ  — Mưa / tuyết PROCEDURAL field-paradigm: N hạt Points rải trong TRỤ bám camera, rơi + wrap
 *            modulo chạy HOÀN TOÀN vertex shader (0 CPU/frame ngoài 1 uniform time). 1 draw cho cả màn.
 *            Mode 'rain' (nhanh, nhỏ, xanh-xám, nghiêng theo gió) vs 'snow' (chậm, to, trắng, drift sin).
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
import { PointsNodeMaterial } from 'three/webgpu'

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
  },
}

export class Precipitation {
  private points: THREE.Points | null = null
  private geometry: THREE.BufferGeometry | null = null
  private material: PointsNodeMaterial | null = null
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

  constructor(opts: PrecipitationOptions = {}) {
    this.mode = opts.mode ?? 'rain'
    const d = PRESETS[this.mode]
    this.count = clampInt(opts.count ?? d.count, 1, MAX_PARTICLES)
    this._initUniforms(opts, d)

    this.geometry = this._buildGeometry(this.count)
    this.material = this._buildMaterial()
    this.points = new THREE.Points(this.geometry, this.material)
    this.points.frustumCulled = false // trụ bám camera → bbox vô nghĩa, đừng để cull nhầm
  }

  // Đổ opts (override defaults theo mode) vào uniform — tách khỏi constructor (complexity).
  private _initUniforms(
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
    const w = opts.wind ?? d.wind
    this.uWind.value.set(w[0], w[1])
    this.uColor.value.set(opts.color ?? d.color)
  }

  // 1 hạt = 1 vertex. aSeed vec3 = (sx, sz ∈ [-1,1] vị trí chuẩn-hoá trong trụ, phase ∈ [0,1] so le rơi).
  private _buildGeometry(count: number): THREE.BufferGeometry {
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

  private _buildMaterial(): PointsNodeMaterial {
    const aSeed = attribute('aSeed', 'vec3') as TSLNode
    const sx = aSeed.x
    const sz = aSeed.y
    const phase = aSeed.z

    // tFall ∈ [0,1] lặp vô hạn (fract): 0 = vừa sinh ở đỉnh, 1 = chạm đáy. Phase so le các hạt.
    const tFall = fract(this.uTime.mul(this.uSpeed).div(this.uHeight).add(phase)) as TSLNode
    const y = this.uGroundY.add(this.uHeight.mul(float(1).sub(tFall))) as TSLNode

    // XZ: trụ bám camera + lệch gió theo quãng rơi + drift sin (tuyết lắc). cameraPosition = uniform three auto.
    const windOff = this.uWind.mul(tFall) // vệt nghiêng dần khi rơi
    const driftX = sin(this.uTime.mul(float(1.3)).add(phase.mul(float(6.283)))).mul(this.uDrift)
    const driftZ = sin(this.uTime.mul(float(1.1)).add(phase.mul(float(9.42)))).mul(this.uDrift)
    const px = cameraPosition.x.add(sx.mul(this.uRadius)).add(windOff.x).add(driftX)
    const pz = cameraPosition.z.add(sz.mul(this.uRadius)).add(windOff.y).add(driftZ)
    const worldPos = vec3(px, y, pz)

    // Fade 2 đầu để hạt KHÔNG pop khi wrap (mờ lúc mới sinh + lúc sắp chạm đáy).
    const fade = smoothstep(float(0), float(0.06), tFall).mul(
      smoothstep(float(1), float(0.92), tFall)
    )

    // Cỡ theo KHOẢNG CÁCH tới camera: gần (≤SIZE_NEAR) = uSize (max), xa (≥uRadius) = uSize×MIN_RATIO.
    // sizeAttenuation=false để TỰ kiểm soát hoàn toàn (px screen-space), clamp min/max rõ ràng theo ý.
    const dist = distance(worldPos, cameraPosition) as TSLNode
    const farT = smoothstep(float(SIZE_NEAR), this.uRadius, dist) // 0 gần .. 1 rìa trụ
    const sizePx = this.uSize.mul(mix(float(1), float(SIZE_MIN_RATIO), farT))

    const mat = new PointsNodeMaterial()
    mat.positionNode = worldPos
    mat.colorNode = this.uColor
    mat.sizeNode = sizePx
    mat.opacityNode = this.uOpacity.mul(fade)
    mat.transparent = true
    mat.depthWrite = false // hạt trong suốt — đừng ghi depth (né tự che lẫn nhau)
    mat.sizeAttenuation = false // tự control cỡ theo distance (clamp max gần / min xa) — KHÔNG để perspective chia thêm
    return mat
  }

  /** Tiến thời gian (giây). Gọi mỗi frame với deltaTime. */
  update(dt: number): void {
    if (this.isDisposed) return
    this.time += dt
    this.uTime.value = this.time
  }

  /** Object để add vào scene. */
  getObject(): THREE.Points {
    if (!this.points) throw new Error('Precipitation: đã dispose')
    return this.points
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

  /** Số hạt hiện tại. */
  getCount(): number {
    return this.count
  }

  dispose(): void {
    if (this.isDisposed) return
    this.geometry?.dispose()
    this.material?.dispose()
    this.points?.parent?.remove(this.points)
    this.geometry = null
    this.material = null
    this.points = null
    this.isDisposed = true
  }
}

function clampInt(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(v)))
}
