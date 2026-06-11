/**
 * VỊ TRÍ   — threejs-modules/components/PondFish/index.ts
 * VAI TRÒ  — Đàn cá koi PROCEDURAL bơi trong vùng tròn (lòng hồ): thân low-poly dựng tay (~131 tri/con,
 *            đơn vị thân dài 1 — scale per-con), đuôi vẫy = TSL vertex-bend sine chạy GPU (0 CPU/0 rig),
 *            màu koi trắng + mảng cam + đốm đen per-con (triNoise3D + hash(instanceIndex) — không texture),
 *            di chuyển = wander CPU rẻ (writes instanceMatrix, N ≤ 40, cả đàn 1 draw).
 * LIÊN HỆ  — components/ tự chứa (không import ../). Phase B ráp archplan: đặt mesh vào basin hồ
 *            (caller set position = tâm hồ, depthY chìm dưới mặt nước) + GUI. Industry: đàn cá realtime
 *            dùng vertex sine-bend, KHÔNG skeletal per-con (skinned chỉ đáng cho cá hero cận cảnh).
 *            Vertex-bend theo bài KI-003: positionLocal.add(...) — GIỮ instanceMatrix, không replace.
 *
 * CÁCH DÙNG: const f = new PondFish({ count: 8, areaRadius: 1.6 })
 *            scene.add(f.getMesh()); mesh.position.set(tâm hồ)   // mỗi frame: f.update(dt)
 * DISPOSE: dispose() giải phóng geometry + material + gỡ mesh khỏi parent.
 */

import * as THREE from 'three'
import type Node from 'three/src/nodes/core/Node.js'
import type { ShaderNodeObject } from 'three/tsl'
import {
  float,
  hash,
  instanceIndex,
  mix,
  positionLocal,
  smoothstep,
  step,
  triNoise3D,
  uniform,
  vec3,
} from 'three/tsl'
import { MeshStandardNodeMaterial } from 'three/webgpu'

type TSLNode = ShaderNodeObject<Node>

export interface PondFishOptions {
  /** Số cá trong đàn (cap 40 — budget). Đổi count = tạo instance mới. Default: 8 */
  count?: number
  /** Bán kính vùng bơi (m, quanh gốc mesh). Default: 1.6 */
  areaRadius?: number
  /** Cao độ bơi so với gốc mesh (m, ÂM = chìm dưới). Default: -0.25 */
  depthY?: number
  /** Chiều dài cá (m) — per-con biến hoá ±20%. Default: 0.28 */
  fishLength?: number
  /** Tốc độ bơi gốc (m/s) — per-con biến hoá. Default: 0.25 */
  speed?: number
  /** Đổi seed → xáo bộ mảng màu cam/đốm đen cả đàn. Default: 0 */
  colorSeed?: number
}

// Trạng thái wander 1 con (CPU) — toạ độ LOCAL quanh gốc mesh.
interface FishState {
  x: number
  z: number
  heading: number // rad — hướng bơi; forward local = +X, dir world = (cos h, 0, -sin h)
  wander: number // rad/s — tốc quay hiện tại (random walk có kẹp)
  speed: number // hệ số per-con × speed gốc
  size: number // hệ số per-con × fishLength
  bob: number // pha nhấp nhô dọc Y
}

const MAX_FISH = 40
const SEG = 8 // cạnh quanh thân
// Profile thân: [x dọc trục (đầu +X), bán kính] — đơn vị thân dài 1 (đầu 0.5 → cuống đuôi -0.38).
const PROFILE: [number, number][] = [
  [0.5, 0.012],
  [0.42, 0.05],
  [0.3, 0.082],
  [0.16, 0.092],
  [0.0, 0.085],
  [-0.16, 0.062],
  [-0.3, 0.04],
  [-0.38, 0.02],
]

// LCG mulberry32 — wander/layout tái lập theo seed (không Math.random).
function makeRng(seed: number): () => number {
  let a = (seed | 0) + 0x6d2b79f5
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Thân cá: vòng ellipse (dẹp ngang rz=0.6r — cá nén bên) dọc trục X + chóp mũi/cuống đuôi.
function pushBody(pos: number[], idx: number[], uv: number[]): void {
  pos.push(0.54, 0, 0) // 0 = chóp mũi
  uv.push(0, 0.5)
  for (let i = 0; i < PROFILE.length; i++) {
    const [x, r] = PROFILE[i]
    for (let j = 0; j < SEG; j++) {
      const a = (j / SEG) * Math.PI * 2
      pos.push(x, Math.cos(a) * r, Math.sin(a) * r * 0.6)
      uv.push((0.54 - x) / 1.1, j / SEG)
    }
  }
  const tailC = pos.length / 3
  pos.push(-0.4, 0, 0) // tâm cuống đuôi
  uv.push(0.85, 0.5)
  const ring = (i: number, j: number): number => 1 + i * SEG + (j % SEG)
  for (let j = 0; j < SEG; j++) idx.push(0, ring(0, j), ring(0, j + 1)) // quạt mũi
  for (let i = 0; i < PROFILE.length - 1; i++) {
    for (let j = 0; j < SEG; j++) {
      const a = ring(i, j)
      const b = ring(i, j + 1)
      const c = ring(i + 1, j + 1)
      const d = ring(i + 1, j)
      idx.push(a, c, b, a, d, c) // winding hướng pháp tuyến RA ngoài (computeVertexNormals)
    }
  }
  for (let j = 0; j < SEG; j++)
    idx.push(tailC, ring(PROFILE.length - 1, j + 1), ring(PROFILE.length - 1, j))
}

// Vây phẳng z=0 (DoubleSide): đuôi chẻ 2 thuỳ + vây lưng — nằm trong vùng bend mạnh → vẫy theo thân.
function pushFins(pos: number[], idx: number[], uv: number[]): void {
  const v = (x: number, y: number): number => {
    pos.push(x, y, 0)
    uv.push((0.54 - x) / 1.1, 0.5)
    return pos.length / 3 - 1
  }
  const b = v(-0.38, 0) // gốc cuống đuôi
  const t1 = v(-0.56, 0.16)
  const m = v(-0.47, 0.01)
  const t2 = v(-0.56, -0.15)
  idx.push(b, t1, m, b, m, t2) // đuôi chẻ
  const d1 = v(0.18, 0.08)
  const d2 = v(0.02, 0.17)
  const d3 = v(-0.06, 0.07)
  idx.push(d1, d2, d3) // vây lưng
}

function buildFishGeometry(): THREE.BufferGeometry {
  const pos: number[] = []
  const idx: number[] = []
  const uv: number[] = []
  pushBody(pos, idx, uv)
  pushFins(pos, idx, uv)
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

// Scratch — không alloc trong update loop.
const _mtx = new THREE.Matrix4()
const _quat = new THREE.Quaternion()
const _pos = new THREE.Vector3()
const _scl = new THREE.Vector3()
const _UP = new THREE.Vector3(0, 1, 0)

// Wrap góc về [-π, π].
function angleDelta(a: number, b: number): number {
  let d = (a - b) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}

export class PondFish {
  private mesh: THREE.InstancedMesh | null = null
  private geometry: THREE.BufferGeometry | null = null
  private material: MeshStandardNodeMaterial | null = null
  private isDisposed = false

  private readonly fish: FishState[] = []
  private areaRadius: number
  private depthY: number
  private fishLength: number
  private speed: number
  private readonly rng: () => number

  // Uniform nodes — update qua .value (shader-tsl), KHÔNG material.uniforms.
  private readonly uTime = uniform(0)
  private readonly uSeed = uniform(0)
  private readonly uFlap = uniform(6) // tần vẫy (rad/s) — theo speed qua setSpeed
  private readonly uAmp = uniform(0.09) // biên độ vẫy chót đuôi (đơn vị thân)

  constructor(opts: PondFishOptions = {}) {
    const count = Math.max(1, Math.min(MAX_FISH, Math.round(opts.count ?? 8)))
    this.areaRadius = Math.max(0.3, opts.areaRadius ?? 1.6)
    this.depthY = opts.depthY ?? -0.25
    this.fishLength = Math.max(0.05, opts.fishLength ?? 0.28)
    this.speed = Math.max(0, opts.speed ?? 0.25)
    this.uSeed.value = opts.colorSeed ?? 0
    this.setSpeed(this.speed)
    this.rng = makeRng(1)

    this.geometry = buildFishGeometry()
    this.material = this._buildMaterial()
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, count)
    this.mesh.castShadow = false // cá chìm dưới nước — bóng xuyên mặt nước nhìn sai, lại rẻ
    this.mesh.receiveShadow = false
    this._spawn(count)
    this.update(0) // đặt matrix lần đầu (kẻo frame 0 dồn về gốc)
  }

  // ── Material: vẫy đuôi (vertex) + màu koi (fragment) — tất cả per-instance từ hash(instanceIndex) ──
  private _buildMaterial(): MeshStandardNodeMaterial {
    // perf-ok: gọi 1 LẦN trong constructor (không per-rebuild) — compile 1 shader cho cả vòng đời module
    const mat = new MeshStandardNodeMaterial({ roughness: 0.55, side: THREE.DoubleSide })
    const fi = instanceIndex.toFloat()
    const p = positionLocal
    // Vẫy: sóng sine dọc thân cuộn về đuôi, biên độ tăng bậc 2 từ đầu (≈0) tới chót đuôi.
    const sTail = float(0.5).sub(p.x).div(1.06).clamp(0, 1) as TSLNode // 0 đầu → 1 chót đuôi
    const amp = sTail.mul(sTail).mul(0.94).add(0.06).mul(this.uAmp)
    const phase = hash(fi.add(float(31.7))).mul(6.2832)
    const wave = p.x.mul(6).sub(this.uTime.mul(this.uFlap)).add(phase).sin()
    mat.positionNode = positionLocal.add(vec3(0, 0, wave.mul(amp))) // KI-003: ADD giữ instanceMatrix
    mat.colorNode = this._koiColor(fi, p)
    return mat
  }

  // Màu koi per-con: nền trắng kem + MẢNG CAM (ngưỡng noise hạ theo bias per-con → có con cam nhiều
  // con trắng nhiều) + ĐỐM ĐEN thưa (~nửa đàn) + bụng sáng. uSeed xáo lại cả đàn (live).
  private _koiColor(fi: TSLNode, p: TSLNode): TSLNode {
    const h1 = hash(fi.add(this.uSeed)) // offset noise per-con — mỗi con 1 bộ mảng
    const h2 = hash(fi.add(this.uSeed).add(float(57.31))) // bias cam + có/không đốm đen
    const n1 = triNoise3D(
      p.mul(vec3(1.6, 3.2, 3.2)).add(vec3(h1.mul(43.7), h1.mul(17.3), float(0))),
      float(0),
      float(0)
    )
    const orange = step(float(0.32).add(h2.mul(0.22)), n1)
    let col = mix(vec3(0.93, 0.91, 0.86), vec3(0.89, 0.38, 0.07), orange) as TSLNode
    const n2 = triNoise3D(
      p.mul(vec3(2.3, 4.1, 4.1)).add(vec3(h1.mul(91.7), float(0), h1.mul(31.1))),
      float(0),
      float(0)
    )
    const black = step(float(0.48), n2).mul(step(h2, float(0.5)))
    col = mix(col, vec3(0.08, 0.07, 0.07), black) as TSLNode
    // Bụng sáng: 1−smoothstep (KHÔNG đảo ngưỡng smoothstep — undefined WGSL).
    const belly = float(1)
      .sub(smoothstep(float(-0.06), float(0), p.y))
      .mul(0.55)
    return mix(col, vec3(0.95, 0.94, 0.9), belly) as TSLNode
  }

  // Rải đàn trong đĩa (r = R·√u — phân bố đều theo diện tích), mỗi con 1 hướng/tốc/cỡ/pha riêng.
  private _spawn(count: number): void {
    for (let i = 0; i < count; i++) {
      const a = this.rng() * Math.PI * 2
      const r = Math.sqrt(this.rng()) * this.areaRadius * 0.7
      this.fish.push({
        x: Math.cos(a) * r,
        z: Math.sin(a) * r,
        heading: this.rng() * Math.PI * 2,
        wander: 0,
        speed: 0.75 + this.rng() * 0.5,
        size: 0.8 + this.rng() * 0.4,
        bob: this.rng() * Math.PI * 2,
      })
    }
  }

  // Lái 1 con: gần biên vùng bơi → quay đầu về tâm (lerp góc); trong vùng → wander random-walk có kẹp.
  private _steer(f: FishState, dt: number): void {
    const r = Math.hypot(f.x, f.z)
    if (r > this.areaRadius * 0.8) {
      const desired = Math.atan2(f.z, -f.x) // hướng về tâm (dir = (cos h, -sin h))
      f.heading += angleDelta(desired, f.heading) * Math.min(1, 2.2 * dt)
      return
    }
    f.wander += (this.rng() - 0.5) * 3 * dt
    f.wander = Math.max(-0.9, Math.min(0.9, f.wander))
    f.heading += f.wander * dt
  }

  /** Gọi mỗi frame với dt giây — tiến thời gian vẫy + dời đàn (CPU rẻ, ≤40 matrix compose). */
  update(dt: number): void {
    if (this.isDisposed || !this.mesh) return
    const d = Math.min(Math.max(0, dt), 0.1) // kẹp dt — né nhảy vọt khi tab quay lại
    this.uTime.value = (this.uTime.value as number) + d
    const t = this.uTime.value as number
    for (let i = 0; i < this.fish.length; i++) {
      const f = this.fish[i]
      this._steer(f, d)
      f.x += Math.cos(f.heading) * f.speed * this.speed * d
      f.z -= Math.sin(f.heading) * f.speed * this.speed * d
      _pos.set(f.x, this.depthY + Math.sin(t * 0.7 + f.bob) * 0.03, f.z)
      _quat.setFromAxisAngle(_UP, f.heading)
      _scl.setScalar(this.fishLength * f.size)
      this.mesh.setMatrixAt(i, _mtx.compose(_pos, _quat, _scl))
    }
    this.mesh.instanceMatrix.needsUpdate = true
  }

  /** Tốc độ bơi gốc (m/s). Range [0, 2]. Tần vẫy đuôi theo tốc. */
  setSpeed(v: number): void {
    if (this.isDisposed || Number.isNaN(v)) return
    this.speed = Math.max(0, Math.min(2, v))
    this.uFlap.value = 4 + this.speed * 10
  }

  /** Bán kính vùng bơi (m). Min 0.3 — cá ngoài vùng tự lượn về. */
  setAreaRadius(v: number): void {
    if (this.isDisposed || Number.isNaN(v)) return
    this.areaRadius = Math.max(0.3, v)
  }

  /** Cao độ bơi so với gốc mesh (m, âm = chìm). */
  setDepthY(v: number): void {
    if (this.isDisposed || Number.isNaN(v)) return
    this.depthY = v
  }

  /** Chiều dài cá (m). Min 0.05. Áp frame kế (matrix compose mỗi update). */
  setFishLength(v: number): void {
    if (this.isDisposed || Number.isNaN(v)) return
    this.fishLength = Math.max(0.05, v)
  }

  /** Xáo bộ màu cam/đốm cả đàn (uniform live — 0 rebuild). */
  setColorSeed(v: number): void {
    if (this.isDisposed || Number.isNaN(v)) return
    this.uSeed.value = v
  }

  getMesh(): THREE.InstancedMesh {
    if (!this.mesh) throw new Error('PondFish: đã dispose')
    return this.mesh
  }

  getCount(): number {
    return this.fish.length
  }

  getTriangleCount(): number {
    if (!this.geometry || !this.mesh) return 0
    const index = this.geometry.getIndex()
    return index ? (index.count / 3) * this.mesh.count : 0
  }

  dispose(): void {
    if (this.isDisposed) return
    if (this.mesh) this.mesh.parent?.remove(this.mesh)
    this.geometry?.dispose()
    this.material?.dispose()
    this.mesh?.dispose() // InstancedMesh giữ buffer instanceMatrix riêng
    this.mesh = null
    this.geometry = null
    this.material = null
    this.fish.length = 0
    this.isDisposed = true
  }
}
