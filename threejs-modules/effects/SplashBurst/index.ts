/**
 * VỊ TRÍ   — threejs-modules/effects/SplashBurst/index.ts
 * VAI TRÒ  — Vương miện + giọt nước tung tóe (GPU sprite burst) tại điểm va-chạm RỜI trên mặt nước.
 * LIÊN HỆ  — Đi kèm WaterSurface.emitImpact: caller gọi water.emitImpact(...) (gợn) + splash.burst(...) (giọt bắn).
 *            KHÁC GPUParticleSystem/SparkSystem (field lặp vô hạn) — đây là pool ghi birth-pos/vel/time PER-PARTICLE
 *            lúc emit (giống ripple-pool WaterSurface), shader bay đạn-đạo theo tuổi → 0 CPU/frame trừ lúc bắn.
 *
 * Thuật toán:
 *   1. Pool `count` điểm (Points). Mỗi điểm: position=birth(world), aVel=vận tốc ném, aBirth=t0, aSize(px).
 *   2. burst(x,y,z,s): claim K=drops(s) điểm (ring buffer), sample hướng ném LÊN+RA (cone vương miện),
 *      speed/size ∝ strength + jitter, ghi attribute → needsUpdate (upload 1 lần/emit, KHÔNG mỗi frame).
 *   3. Shader (positionNode): pos = birth + vel·age − ½·g·age²·ŷ (đạn-đạo); age = uTime − aBirth.
 *      opacity ẩn khi age<0 / age>life + tắt cuối đời → điểm "chết" tàng hình tới khi tái dùng.
 *   4. NormalBlending (giọt nước, KHÔNG additive như tia lửa); depthWrite=false (vẽ sau nước).
 *
 * CÁCH DÙNG: const sp = new SplashBurst(); scene.add(sp.getPoints()); sp.update(t) mỗi frame;
 *   khi va chạm: sp.burst(worldX, waterY, worldZ, strength 0..1).
 * DISPOSE: dispose() giải phóng geometry + material + gỡ points khỏi parent.
 */

import * as THREE from 'three'
import { PointsNodeMaterial } from 'three/webgpu'
import { attribute, float, oneMinus, positionLocal, smoothstep, step, uniform, vec3 } from 'three/tsl'

const DEFAULTS = {
  count: 256, // tổng điểm trong pool (ring buffer) — drops/burst ≈ 6..22 → ~12+ va chạm đồng thời
  life: 0.6, // s — đời 1 giọt (belowFade cắt sớm hơn khi giọt rơi về mặt nước)
  gravity: 9.8, // m/s² — kéo giọt rơi lại
  speed: 2.4, // m/s — tốc độ ném gốc (×strength + jitter) — cao = bắn cao/dễ thấy
  size: 12, // px — cỡ giọt gốc (×strength + jitter); sizeAttenuation=false nên = pixel
  color: 0xdff0ff as THREE.ColorRepresentation, // trắng hơi xanh — giọt nước bắt sáng
  opacity: 0.95,
}
const MIN_DROPS = 6 // số giọt tối thiểu mỗi burst
const EXTRA_DROPS = 16 // số giọt thêm tối đa (× strength)
const CROWN_MIN = 0.26 // rad (~15°) — góc lệch trục đứng nhỏ nhất (tia gần thẳng giữa)
const CROWN_MAX = 1.22 // rad (~70°) — góc lệch lớn nhất (vành vương miện ném ra)
const JITTER = 0.03 // m — xê dịch tâm điểm phát (giọt không chụm 1 chỗ)

export interface SplashBurstOptions {
  /** Tổng điểm trong pool. Default: 256 */
  count?: number
  /** Đời 1 giọt (s). Default: 0.6 */
  life?: number
  /** Gia tốc rơi (m/s²). Default: 9.8 */
  gravity?: number
  /** Tốc độ ném gốc (m/s, ×strength + jitter). Default: 1.8 */
  speed?: number
  /** Cỡ giọt gốc (px). Default: 7 */
  size?: number
  /** Màu giọt. Default: 0xbcd6e6 */
  color?: THREE.ColorRepresentation
  /** Độ mờ đỉnh [0–1]. Default: 0.85 */
  opacity?: number
}

export class SplashBurst {
  private geometry: THREE.BufferGeometry | null = null
  private material: PointsNodeMaterial | null = null
  private points: THREE.Points | null = null
  private isDisposed = false

  private readonly _count: number
  private _speed: number
  private _sizePx: number
  private _head = 0
  // Tham chiếu thẳng Float32Array của attribute để ghi lúc emit (né cấp phát).
  private readonly _pos: Float32Array
  private readonly _vel: Float32Array
  private readonly _birth: Float32Array
  private readonly _size: Float32Array

  private readonly uTime = uniform(0)
  private readonly uLife: ReturnType<typeof uniform>
  private readonly uGravity: ReturnType<typeof uniform>
  private readonly uOpacity: ReturnType<typeof uniform>
  private readonly uColor: ReturnType<typeof uniform>
  private readonly _tmpDir = new THREE.Vector3()

  constructor(opts: SplashBurstOptions = {}) {
    const o = { ...DEFAULTS, ...opts }
    this._count = o.count
    this._speed = o.speed
    this._sizePx = o.size
    this.uLife = uniform(o.life)
    this.uGravity = uniform(o.gravity)
    this.uOpacity = uniform(o.opacity)
    this.uColor = uniform(new THREE.Color(o.color))

    this._pos = new Float32Array(o.count * 3)
    this._vel = new Float32Array(o.count * 3)
    this._birth = new Float32Array(o.count).fill(-1000) // age khổng lồ > life → chết/tàng hình tới khi tái dùng
    this._size = new Float32Array(o.count)

    const geo = new THREE.BufferGeometry() // perf-ok — Points sprite: dùng sizeNode/PointCoord, KHÔNG sample texture theo uv
    geo.setAttribute('position', new THREE.BufferAttribute(this._pos, 3))
    geo.setAttribute('aVel', new THREE.BufferAttribute(this._vel, 3))
    geo.setAttribute('aBirth', new THREE.BufferAttribute(this._birth, 1))
    geo.setAttribute('aSize', new THREE.BufferAttribute(this._size, 1))
    this.geometry = geo
    this.material = this._buildMaterial()

    const pts = new THREE.Points(geo, this.material)
    pts.frustumCulled = false // birth ghi world-coord vào 'position' → boundingSphere sai → tắt cull
    pts.renderOrder = 2 // vẽ SAU mặt nước (WaterSurface renderOrder 0, transparent + depthWrite) → giọt không bị nước đè
    this.points = pts
  }

  private _buildMaterial(): PointsNodeMaterial {
    const aVel = attribute('aVel', 'vec3')
    const aBirth = attribute('aBirth', 'float')
    const aSize = attribute('aSize', 'float')
    const age = this.uTime.sub(aBirth)
    const t = age.div(this.uLife) // 0..1 trong đời (có thể <0 hoặc >1 → bị che bởi alive)
    // Đạn-đạo: pos = birth + vel·age − ½·g·age²·ŷ
    const fall = this.uGravity.mul(age).mul(age).mul(float(-0.5))
    const motionY = aVel.y.mul(age).add(fall)
    const motion = vec3(aVel.x.mul(age), motionY, aVel.z.mul(age))

    const mat = new PointsNodeMaterial()
    mat.positionNode = positionLocal.add(motion)
    mat.colorNode = this.uColor
    mat.sizeNode = aSize.mul(oneMinus(t.mul(float(0.25)))) // teo nhẹ khi rơi
    const aliveLo = step(float(0), age) // age ≥ 0
    const aliveHi = oneMinus(step(this.uLife, age)) // age < life
    const fade = oneMinus(smoothstep(float(0.55), float(1), t)) // giữ rồi tắt cuối đời
    const above = smoothstep(float(-0.05), float(0.02), motionY) // ẩn khi giọt rơi xuống dưới cao độ phát (né lòi qua nước)
    mat.opacityNode = aliveLo.mul(aliveHi).mul(fade).mul(above).mul(this.uOpacity)
    mat.transparent = true
    mat.depthWrite = false
    mat.blending = THREE.NormalBlending // giọt nước (KHÔNG additive như tia lửa)
    mat.sizeAttenuation = false
    return mat
  }

  /** 💦 Bắn 1 cụm giọt tại (x,y,z) WORLD. `strength` 0..1 = mạnh va chạm → nhiều/cao/to giọt hơn.
   *  Ghi xoay vòng K giọt vào pool (0 CPU/frame trừ lúc này). y nên = cao độ mặt nước. */
  burst(x: number, y: number, z: number, strength: number): void {
    if (this.isDisposed) return
    const s = Math.max(0, Math.min(1, strength))
    if (s <= 0) return
    const drops = Math.round(MIN_DROPS + s * EXTRA_DROPS)
    const now = this.uTime.value as number
    for (let k = 0; k < drops; k++) {
      const i = this._head
      this._head = (this._head + 1) % this._count
      const dir = this._crownDir()
      const sp = this._speed * (0.6 + 0.7 * Math.random()) * (0.5 + s)
      this._pos[i * 3] = x + (Math.random() - 0.5) * JITTER
      this._pos[i * 3 + 1] = y
      this._pos[i * 3 + 2] = z + (Math.random() - 0.5) * JITTER
      this._vel[i * 3] = dir.x * sp
      this._vel[i * 3 + 1] = dir.y * sp
      this._vel[i * 3 + 2] = dir.z * sp
      this._birth[i] = now
      this._size[i] = this._sizePx * (0.5 + Math.random()) * (0.5 + s)
    }
    this._markDirty()
  }

  // Hướng ném LÊN + RA: azimuth ngẫu nhiên, góc lệch trục đứng φ∈[CROWN_MIN,CROWN_MAX] → vành vương miện.
  private _crownDir(): THREE.Vector3 {
    const az = Math.random() * Math.PI * 2
    const phi = CROWN_MIN + Math.random() * (CROWN_MAX - CROWN_MIN)
    const sinp = Math.sin(phi)
    return this._tmpDir.set(sinp * Math.cos(az), Math.cos(phi), sinp * Math.sin(az))
  }

  private _markDirty(): void {
    if (!this.geometry) return
    for (const name of ['position', 'aVel', 'aBirth', 'aSize'])
      (this.geometry.getAttribute(name) as THREE.BufferAttribute).needsUpdate = true
  }

  /** Thời gian animation (giây). Gọi mỗi frame để giọt bay/rơi. */
  update(time: number): void {
    if (this.isDisposed) return
    this.uTime.value = time
  }

  /** Đời 1 giọt (s) [0.1–3]. */
  setLife(v: number): void {
    if (this.isDisposed) return
    this.uLife.value = Math.max(0.1, Math.min(3, v))
  }

  /** Tốc độ ném gốc (m/s) [0–8] — cao = giọt bắn cao/xa hơn. */
  setSpeed(v: number): void {
    if (this.isDisposed) return
    this._speed = Math.max(0, Math.min(8, v))
  }

  /** Cỡ giọt gốc (px) [1–40]. */
  setSize(v: number): void {
    if (this.isDisposed) return
    this._sizePx = Math.max(1, Math.min(40, v))
  }

  /** Độ mờ đỉnh [0–1]. */
  setOpacity(v: number): void {
    if (this.isDisposed) return
    this.uOpacity.value = Math.max(0, Math.min(1, v))
  }

  /** Đổi màu giọt (live). */
  setColor(c: THREE.ColorRepresentation): void {
    if (this.isDisposed) return
    ;(this.uColor.value as THREE.Color).set(c)
  }

  getPoints(): THREE.Points {
    if (!this.points) throw new Error('SplashBurst: already disposed')
    return this.points
  }

  dispose(): void {
    if (this.isDisposed) return
    this.points?.parent?.remove(this.points)
    this.geometry?.dispose()
    this.material?.dispose()
    this.geometry = null
    this.material = null
    this.points = null
    this.isDisposed = true
  }
}
