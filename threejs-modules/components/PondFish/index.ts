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
  positionGeometry,
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
  /** 🐟 Bề DÀY bơi ĐỨNG (m) — cá rải trong khối trụ radius×swimDepth (không còn đĩa phẳng). Default: 0 (1 mặt) */
  swimDepth?: number
  /** 🐟 Độ MẬP thân (×profile bán kính) — 1 = gốc; <1 thon, >1 mập. Default: 1 */
  bodyWidth?: number
  /** 🎨 Màu NỀN thân (hex). Default: kem 0xeee8db */
  baseColor?: number
  /** 🎨 Màu MẢNG (hex — koi cam). Default: 0xe36112 */
  patchColor?: number
  /** 🎨 Màu ĐỐM (hex — đốm đậm). Default: 0x141312 */
  spotColor?: number
  /** 🎨 Tỉ lệ MẢNG màu 0..1 (cao = nhiều mảng cam, thấp = nhiều nền). Default: 0.5 */
  patchAmount?: number
  /** 🐟 Biên độ LƯỢN chữ S (×) — 0 = bơi thẳng, cao = uốn mạnh. Default: 1 */
  swayAmp?: number
  /** 🐟 Độ LĂNG XĂNG (× random dart) — thấp = điềm tĩnh, cao = đổi hướng bất chợt. Default: 1 */
  wanderAmp?: number
  /** 🐟 NHẤP NHÔ dọc (× biên ±3cm) — 0 = phẳng, cao = trồi sụt. Default: 1 */
  bobAmp?: number
}

// Trạng thái wander 1 con (CPU) — toạ độ LOCAL quanh gốc mesh.
interface FishState {
  x: number
  z: number
  heading: number // rad — hướng bơi; forward local = +X, dir world = (cos h, 0, -sin h)
  wander: number // rad/s — tốc quay hiện tại (random walk có kẹp)
  swayF: number // rad/s — tần lượn chữ S per-con (cá không bao giờ bơi thẳng)
  speed: number // hệ số per-con × speed gốc
  size: number // hệ số per-con × fishLength
  bob: number // pha nhấp nhô dọc Y + pha lượn/tốc
  yFrac: number // 0..1 — mức ĐỨNG trong khối bơi (0 = sát depthY, 1 = sâu nhất swimDepth) per-con
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
  private swimDepth: number // m — bề dày bơi đứng (0 = đĩa phẳng như cũ)
  private swayAmp = 1 // 🐟 biên độ lượn chữ S (×) — hành vi, dùng trong _steer
  private wanderAmp = 1 // 🐟 độ lăng xăng (× random dart)
  private bobAmp = 1 // 🐟 nhấp nhô dọc (× ±3cm)
  private readonly rng: () => number

  // Uniform nodes — update qua .value (shader-tsl), KHÔNG material.uniforms.
  private readonly uTime = uniform(0)
  private readonly uSeed = uniform(0)
  private readonly uFlap = uniform(6) // tần vẫy (rad/s) — theo speed qua setSpeed
  private readonly uAmp = uniform(0.09) // biên độ vẫy chót đuôi (đơn vị thân)
  private readonly uWidth = uniform(1) // 🐟 độ mập thân (×bán kính tiết diện) — live
  private readonly uColBase = uniform(new THREE.Color(0xeee8db)) // 🎨 màu nền thân
  private readonly uColPatch = uniform(new THREE.Color(0xe36112)) // 🎨 màu mảng (cam)
  private readonly uColSpot = uniform(new THREE.Color(0x141312)) // 🎨 màu đốm (đậm)
  private readonly uPatchAmt = uniform(0.5) // 🎨 tỉ lệ mảng 0..1

  constructor(opts: PondFishOptions = {}) {
    const count = Math.max(1, Math.min(MAX_FISH, Math.round(opts.count ?? 8)))
    this.areaRadius = Math.max(0.3, opts.areaRadius ?? 1.6)
    this.depthY = opts.depthY ?? -0.25
    this.fishLength = Math.max(0.05, opts.fishLength ?? 0.28)
    this.speed = Math.max(0, opts.speed ?? 0.25)
    this.swimDepth = Math.max(0, opts.swimDepth ?? 0)
    this.uSeed.value = opts.colorSeed ?? 0
    this.uWidth.value = Math.max(0.2, opts.bodyWidth ?? 1)
    this._initTuning(opts) // 🎨 3 màu + tỉ lệ + 🐟 hành vi (sway/wander/bob) — tách giữ constructor ≤10
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

  // 🎨 Init 3 màu + tỉ lệ mảng + 🐟 hành vi (sway/wander/bob) từ opts. Tách giữ constructor complexity ≤10.
  private _initTuning(opts: PondFishOptions): void {
    if (opts.baseColor !== undefined) this.uColBase.value.setHex(opts.baseColor)
    if (opts.patchColor !== undefined) this.uColPatch.value.setHex(opts.patchColor)
    if (opts.spotColor !== undefined) this.uColSpot.value.setHex(opts.spotColor)
    this.uPatchAmt.value = Math.max(0, Math.min(1, opts.patchAmount ?? 0.5))
    this.swayAmp = Math.max(0, opts.swayAmp ?? 1)
    this.wanderAmp = Math.max(0, opts.wanderAmp ?? 1)
    this.bobAmp = Math.max(0, opts.bobAmp ?? 1)
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
    // 🐟 Độ MẬP: nhân tiết diện (y,z) ×uWidth GIỮ trục x (dài) → live; rồi ADD vẫy lên z (KI-003 giữ instanceMatrix).
    const shaped = vec3(p.x, p.y.mul(this.uWidth), p.z.mul(this.uWidth))
    mat.positionNode = shaped.add(vec3(0, 0, wave.mul(amp)))
    // Pattern màu sample theo positionGeometry (ATTRIBUTE GỐC pre-displacement) — positionLocal là
    // VARYING bị positionNode GHI ĐÈ (Position.js: toVarying + NodeMaterial assign) → dùng nó trong
    // colorNode = sample theo toạ độ ĐANG VẪY = hoạ tiết "trượt khỏi thân" khi bơi (NgQuan thấy 2026-06-11).
    mat.colorNode = this._koiColor(fi, positionGeometry as unknown as TSLNode)
    return mat
  }

  // Màu koi per-con: NỀN (uColBase) + MẢNG (uColPatch — ngưỡng hạ theo uPatchAmt → nhiều/ít mảng) + ĐỐM
  // (uColSpot, thưa ~nửa đàn) + bụng sáng. uSeed xáo cả đàn; 3 màu + tỉ lệ = uniform LIVE (0 rebuild).
  private _koiColor(fi: TSLNode, p: TSLNode): TSLNode {
    const h1 = hash(fi.add(this.uSeed)) // offset noise per-con — mỗi con 1 bộ mảng
    const h2 = hash(fi.add(this.uSeed).add(float(57.31))) // bias mảng + có/không đốm
    const n1 = triNoise3D(
      p.mul(vec3(1.6, 3.2, 3.2)).add(vec3(h1.mul(43.7), h1.mul(17.3), float(0))),
      float(0),
      float(0)
    )
    // ngưỡng mảng = 0.6 − patchAmt·0.42 (+ lệch per-con) → patchAmt cao = ngưỡng thấp = nhiều mảng.
    const thr = float(0.6).sub(this.uPatchAmt.mul(0.42)).add(h2.mul(0.18))
    const patch = step(thr, n1)
    let col = mix(this.uColBase, this.uColPatch, patch) as TSLNode
    const n2 = triNoise3D(
      p.mul(vec3(2.3, 4.1, 4.1)).add(vec3(h1.mul(91.7), float(0), h1.mul(31.1))),
      float(0),
      float(0)
    )
    const spot = step(float(0.48), n2).mul(step(h2, float(0.5)))
    col = mix(col, this.uColSpot, spot) as TSLNode
    // Bụng sáng: 1−smoothstep (KHÔNG đảo ngưỡng smoothstep — undefined WGSL). Sáng = nền ×1.12.
    const belly = float(1)
      .sub(smoothstep(float(-0.06), float(0), p.y))
      .mul(0.5)
    return mix(col, this.uColBase.mul(1.12), belly) as TSLNode
  }

  // Rải đàn TRẢI RỘNG cả vùng (r = R·√u — phân bố đều theo diện tích), mỗi con 1 hướng/tốc/cỡ/pha/tần lượn riêng.
  private _spawn(count: number): void {
    for (let i = 0; i < count; i++) {
      const a = this.rng() * Math.PI * 2
      const r = Math.sqrt(this.rng()) * this.areaRadius * 0.9
      this.fish.push({
        x: Math.cos(a) * r,
        z: Math.sin(a) * r,
        heading: this.rng() * Math.PI * 2,
        wander: 0,
        swayF: 0.5 + this.rng() * 0.7,
        speed: 0.75 + this.rng() * 0.5,
        size: 0.8 + this.rng() * 0.4,
        bob: this.rng() * Math.PI * 2,
        yFrac: this.rng(), // mức đứng trong khối bơi (swimDepth) — rải đều theo độ sâu
      })
    }
  }

  // Lái 1 con: sát biên vùng bơi (85%) → quay đầu về tâm (lerp góc); trong vùng = LƯỢN CHỮ S liên tục
  // (sine per-con — cá thật không bao giờ bơi thẳng) + wander random-walk mạnh (đổi hướng bất chợt).
  private _steer(f: FishState, dt: number, t: number): void {
    const r = Math.hypot(f.x, f.z)
    if (r > this.areaRadius * 0.85) {
      const desired = Math.atan2(f.z, -f.x) // hướng về tâm (dir = (cos h, -sin h))
      f.heading += angleDelta(desired, f.heading) * Math.min(1, 2.5 * dt)
      return
    }
    f.wander += (this.rng() - 0.5) * 7 * this.wanderAmp * dt // 🐟 lăng xăng (random dart)
    f.wander = Math.max(-1.5, Math.min(1.5, f.wander))
    f.heading += (f.wander + Math.sin(t * f.swayF + f.bob) * 0.9 * this.swayAmp) * dt // 🐟 lượn chữ S
  }

  /** Gọi mỗi frame với dt giây — tiến thời gian vẫy + dời đàn (CPU rẻ, ≤40 matrix compose). */
  update(dt: number): void {
    if (this.isDisposed || !this.mesh) return
    const d = Math.min(Math.max(0, dt), 0.1) // kẹp dt — né nhảy vọt khi tab quay lại
    this.uTime.value = (this.uTime.value as number) + d
    const t = this.uTime.value as number
    for (let i = 0; i < this.fish.length; i++) {
      const f = this.fish[i]
      this._steer(f, d, t)
      // tốc NHẤP NHÔ theo thời gian (lướt ↔ rướn) — phá đều tăm tắp khi cả đàn cùng speed gốc
      const sp = f.speed * (0.8 + 0.25 * Math.sin(t * 0.6 + f.bob * 2)) * this.speed
      f.x += Math.cos(f.heading) * sp * d
      f.z -= Math.sin(f.heading) * sp * d
      // Y = đỉnh khối (depthY) − mức đứng per-con trong bề dày swimDepth + nhấp nhô ±3cm × bobAmp.
      const yLevel =
        this.depthY - f.yFrac * this.swimDepth + Math.sin(t * 0.7 + f.bob) * 0.03 * this.bobAmp
      _pos.set(f.x, yLevel, f.z)
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

  /** 🐟 Bề dày bơi đứng (m, ≥0) — cá rải trong khối trụ radius×swimDepth. Áp frame kế. */
  setSwimDepth(v: number): void {
    if (this.isDisposed || Number.isNaN(v)) return
    this.swimDepth = Math.max(0, v)
  }

  /** 🐟 Độ mập thân (×tiết diện, ≥0.2) — uniform live. */
  setBodyWidth(v: number): void {
    if (this.isDisposed || Number.isNaN(v)) return
    this.uWidth.value = Math.max(0.2, v)
  }

  /** 🎨 3 màu koi (hex) — uniform live, 0 rebuild. */
  setColors(base: number, patch: number, spot: number): void {
    if (this.isDisposed) return
    this.uColBase.value.setHex(base)
    this.uColPatch.value.setHex(patch)
    this.uColSpot.value.setHex(spot)
  }

  /** 🎨 Tỉ lệ mảng màu 0..1 (cao = nhiều mảng) — uniform live. */
  setPatchAmount(v: number): void {
    if (this.isDisposed || Number.isNaN(v)) return
    this.uPatchAmt.value = Math.max(0, Math.min(1, v))
  }

  /** 🐟 Hành vi (×, ≥0): biên độ lượn chữ S / lăng xăng / nhấp nhô dọc — field CPU, áp frame kế. */
  setSwayAmp(v: number): void {
    if (this.isDisposed || Number.isNaN(v)) return
    this.swayAmp = Math.max(0, v)
  }

  setWanderAmp(v: number): void {
    if (this.isDisposed || Number.isNaN(v)) return
    this.wanderAmp = Math.max(0, v)
  }

  setBobAmp(v: number): void {
    if (this.isDisposed || Number.isNaN(v)) return
    this.bobAmp = Math.max(0, v)
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
