/**
 * VỊ TRÍ   — threejs-modules/components/GrassBlades/index.ts
 * VAI TRÒ  — Cỏ 3D thật (tier B, material-roadmap): InstancedMesh lá geometry + TSL vertex-wind.
 *            Lá "nhú lên" + đong đưa theo gió. Gốc đứng yên, ngọn cong (bend ∝ height²).
 * LIÊN HỆ  — Rải bởi site-kit (render/fromState) lên nền lô. Lớp NỀN + LOD-xa = GrassGround (tier A).
 *            Cùng cặp với GrassGround (luật tier-B #2: luôn có bản tier-A đi kèm).
 *
 * Kỹ thuật (Ghost of Tsushima style, rút gọn cho web):
 *   1. 1 lá = strip thẳng (geometry mét, dựng 1 lần); hình dáng áp ở vertex shader → chỉnh LIVE
 *   2. InstancedMesh rải N lá (jitter-grid trong rectangle), scale/xoay/tint random per-lá
 *   3. Shape (uniform): taper (nhọn) → twist (xoắn ribbon quanh Y) → cong tĩnh; tất cả ∝ height
 *   4. Vertex-wind: sin(time) + flutter, biên độ ∝ height² → gốc cứng, ngọn mượt; phase per-lá từ
 *      world-XZ (gust trôi không gian) — bake qua instancedBufferAttribute
 *
 * BUDGET (luật tier-B): accent-only (count cap), instanced, cặp tier-A. LOD-theo-camera = bước sau
 *   (v1 cap count cho 1 lô; bật nhiều lô/city PHẢI thêm distance-cull).
 *
 * CÁCH DÙNG: const g = new GrassBlades({ width, depth, baseY }); scene.add(g.getMesh())
 * DISPOSE: dispose() giải phóng geometry + NodeMaterial + gỡ mesh khỏi parent.
 */

import * as THREE from 'three'
import type Node from 'three/src/nodes/core/Node.js'
import type { ShaderNodeObject } from 'three/tsl'
import {
  clamp,
  cos,
  float,
  instancedBufferAttribute,
  mix,
  positionLocal,
  sin,
  time,
  uniform,
  vec3,
} from 'three/tsl'
import { MeshStandardNodeMaterial } from 'three/webgpu'

type TSLNode = ShaderNodeObject<Node>

const DEFAULTS = {
  width: 12, // m — bề ngang vùng rải (X)
  depth: 9.6, // m — chiều sâu vùng rải (Z)
  baseY: 0.01, // m — cao độ gốc lá (= mặt trên nền)
  density: 100, // lá/m²
  maxBlades: 24000, // trần count (budget) — accent-only
  bladeHeight: 0.28, // m
  bladeWidth: 0.024, // m (đáy)
  segments: 4, // số segment dọc (cong mượt)
  baseColor: 0x39611f as THREE.ColorRepresentation, // gốc tối
  tipColor: 0x9bbb55 as THREE.ColorRepresentation, // ngọn sáng
  wind: 0.5, // [0–1]
  windSpeed: 1.6, // tốc độ đong đưa
  curve: 0.3, // độ cong tĩnh (ngả ngọn cả khi lặng gió) [0–1.5]
  twist: 0.6, // độ xoắn ribbon ở ngọn (rad) [0–1.5]
  taper: 0.88, // độ nhọn: 1=nhọn hẳn, 0=đầu bằng (như lá) [0–1]
}

export interface GrassBladesOptions {
  /** Bề ngang vùng rải (m, trục X). Default 12 */
  width?: number
  /** Chiều sâu vùng rải (m, trục Z). Default 9.6 */
  depth?: number
  /** Cao độ gốc lá (m) = mặt trên nền. Default 0.01 */
  baseY?: number
  /** Mật độ lá/m². Default 100 */
  density?: number
  /** Trần số lá (budget). Default 24000 */
  maxBlades?: number
  /** Cao lá (m). Default 0.28 */
  bladeHeight?: number
  /** Rộng lá đáy (m). Default 0.024 */
  bladeWidth?: number
  /** Segment dọc lá. Default 4 */
  segments?: number
  /** Màu gốc (tối). Default 0x39611f */
  baseColor?: THREE.ColorRepresentation
  /** Màu ngọn (sáng). Default 0x9bbb55 */
  tipColor?: THREE.ColorRepresentation
  /** Cường độ gió [0–1]. Default 0.5 */
  wind?: number
  /** Tốc độ gió. Default 1.6 */
  windSpeed?: number
  /** Độ cong tĩnh — ngả ngọn cả khi lặng gió [0–1.5]. Default 0.3 */
  curve?: number
  /** Độ xoắn ribbon ở ngọn (rad) [0–1.5]. Default 0.6 */
  twist?: number
  /** Độ nhọn ngọn: 1=nhọn, 0=đầu bằng [0–1]. Default 0.88 */
  taper?: number
}

export class GrassBlades {
  private mesh: THREE.InstancedMesh | null = null
  private geo: THREE.BufferGeometry | null = null
  private material: MeshStandardNodeMaterial | null = null
  private isDisposed = false

  private readonly bladeHeight: number
  private readonly count: number
  private readonly uWind: ReturnType<typeof uniform>
  private readonly uWindSpeed: ReturnType<typeof uniform>
  private readonly uBase: ReturnType<typeof uniform>
  private readonly uTip: ReturnType<typeof uniform>
  private readonly uCurve: ReturnType<typeof uniform>
  private readonly uTwist: ReturnType<typeof uniform>
  private readonly uTaper: ReturnType<typeof uniform>
  private dataNode: TSLNode | null = null

  constructor(opts: GrassBladesOptions = {}) {
    const o = { ...DEFAULTS, ...opts }
    this.bladeHeight = o.bladeHeight
    this.count = Math.max(1, Math.min(o.maxBlades, Math.round(o.density * o.width * o.depth)))
    this.uWind = uniform(o.wind)
    this.uWindSpeed = uniform(o.windSpeed)
    this.uBase = uniform(new THREE.Color(o.baseColor))
    this.uTip = uniform(new THREE.Color(o.tipColor))
    this.uCurve = uniform(o.curve)
    this.uTwist = uniform(o.twist)
    this.uTaper = uniform(o.taper)

    this.geo = this._buildBladeGeo(o)
    const data = this._scatter(o)
    this.dataNode = instancedBufferAttribute(data, 'vec4') as TSLNode

    this.material = new MeshStandardNodeMaterial()
    this.material.positionNode = this._windNode()
    this.material.colorNode = this._colorNode()
    this.material.roughness = 0.86
    this.material.metalness = 0
    this.material.side = THREE.DoubleSide

    this.mesh = new THREE.InstancedMesh(this.geo, this.material, this.count)
    this.mesh.castShadow = false
    this.mesh.receiveShadow = false
    this.mesh.frustumCulled = false // 1 draw, vertex-wind làm bound lệch → tắt cho an toàn
    this._applyMatrices(this.mesh, o, data)
  }

  /** Cường độ gió [0–1]. */
  setWind(v: number): void {
    if (this.isDisposed) return
    this.uWind.value = Math.max(0, Math.min(1, v))
  }

  /** Tốc độ đong đưa. Min 0. */
  setWindSpeed(v: number): void {
    if (this.isDisposed) return
    this.uWindSpeed.value = Math.max(0, v)
  }

  /** Màu gốc + ngọn (live, không dựng lại material). */
  setColors(base: THREE.ColorRepresentation, tip: THREE.ColorRepresentation): void {
    if (this.isDisposed) return
    ;(this.uBase.value as THREE.Color).set(base)
    ;(this.uTip.value as THREE.Color).set(tip)
  }

  /** Độ cong tĩnh (ngả ngọn) [0–1.5]. Live. */
  setCurve(v: number): void {
    if (this.isDisposed) return
    this.uCurve.value = Math.max(0, Math.min(1.5, v))
  }

  /** Độ xoắn ribbon ngọn (rad) [0–1.5]. Live. */
  setTwist(v: number): void {
    if (this.isDisposed) return
    this.uTwist.value = Math.max(0, Math.min(1.5, v))
  }

  /** Độ nhọn ngọn [0–1]. Live. */
  setTaper(v: number): void {
    if (this.isDisposed) return
    this.uTaper.value = Math.max(0, Math.min(1, v))
  }

  getMesh(): THREE.InstancedMesh {
    if (!this.mesh) throw new Error('GrassBlades: already disposed')
    return this.mesh
  }

  /** Số lá thực tế (sau cap). */
  getCount(): number {
    return this.count
  }

  dispose(): void {
    if (this.isDisposed) return
    this.mesh?.parent?.remove(this.mesh)
    this.geo?.dispose()
    this.material?.dispose()
    this.mesh = null
    this.geo = null
    this.material = null
    this.dataNode = null
    this.isDisposed = true
  }

  // ── Private ────────────────────────────────────────────────────────────────

  // 1 lá = strip thẳng theo MÉT (y: 0→H, x: ±W/2 hằng). Taper/nhọn áp ở vertex shader (uTaper, live). Normal +Z.
  private _buildBladeGeo(o: typeof DEFAULTS): THREE.BufferGeometry {
    const { segments: S, bladeHeight: H, bladeWidth: W } = o
    const pos: number[] = []
    const nor: number[] = []
    const idx: number[] = []
    for (let i = 0; i <= S; i++) {
      const y = (i / S) * H
      const hw = W / 2 // strip thẳng — taper ở shader
      pos.push(-hw, y, 0, hw, y, 0)
      nor.push(0, 0, 1, 0, 0, 1)
    }
    for (let i = 0; i < S; i++) {
      const a = i * 2
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
    g.setIndex(idx)
    return g
  }

  // Bake per-lá: vec4 (worldX, worldZ, phaseJitter, tint) cho shader đọc qua instancedBufferAttribute.
  private _scatter(o: typeof DEFAULTS): Float32Array {
    const data = new Float32Array(this.count * 4)
    const cols = Math.max(1, Math.ceil(Math.sqrt(this.count * (o.width / o.depth))))
    const rows = Math.ceil(this.count / cols)
    const cw = o.width / cols
    const cd = o.depth / rows
    for (let n = 0; n < this.count; n++) {
      const c = n % cols
      const r = Math.floor(n / cols)
      const x = -o.width / 2 + (c + Math.random()) * cw
      const z = -o.depth / 2 + (r + Math.random()) * cd
      data[n * 4] = x
      data[n * 4 + 1] = z
      data[n * 4 + 2] = Math.random() * 6.283
      data[n * 4 + 3] = Math.random()
    }
    return data
  }

  // Đặt transform per-lá: dời (x,baseY,z), xoay Y random (đầy đặn mọi hướng), scale đều random.
  // data = mảng đã bake ở _scatter (worldX, worldZ tại n*4, n*4+1) → khớp phase/tint trong shader.
  private _applyMatrices(mesh: THREE.InstancedMesh, o: typeof DEFAULTS, data: Float32Array): void {
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    const p = new THREE.Vector3()
    const s = new THREE.Vector3()
    for (let n = 0; n < this.count; n++) {
      p.set(data[n * 4], o.baseY, data[n * 4 + 1])
      q.setFromAxisAngle(up, Math.random() * 6.283)
      const sc = 0.7 + Math.random() * 0.5 // scale đều 0.7–1.2
      s.set(sc, sc, sc)
      mesh.setMatrixAt(n, m.compose(p, q, s))
    }
    mesh.instanceMatrix.needsUpdate = true
  }

  // Vertex shape+wind: taper (nhọn) → twist (xoắn ribbon quanh Y) → lean = cong tĩnh + gió (weight bend).
  // bend ∝ (y/H)² (gốc cứng, ngọn mềm). Phase từ world-XZ → gust trôi không gian. twistRand per-lá từ d.z.
  private _windNode(): TSLNode {
    const d = this.dataNode as TSLNode
    const hf = clamp(positionLocal.y.div(float(this.bladeHeight)), float(0), float(1))
    const bend = hf.mul(hf)
    // 1. Taper: thu hẹp bề ngang về ngọn (uTaper=1 → nhọn hẳn)
    const xw = positionLocal.x.mul(float(1).sub(hf.mul(this.uTaper)))
    // 2. Twist: xoay ribbon quanh trục Y, góc ∝ hf, hướng/độ random per-lá (d.z → [-1,1])
    const ang = this.uTwist.mul(hf).mul(d.z.mul(float(0.318)).sub(float(1)))
    const tx = xw.mul(cos(ang))
    const tz = xw.mul(sin(ang))
    // 3. Lean = cong tĩnh + gió (gust+flutter), đều nhân bend → gốc đứng yên
    const phase = d.x
      .mul(float(0.6))
      .add(d.y.mul(float(0.45)))
      .add(d.z)
    const t = time.mul(this.uWindSpeed)
    const osc = sin(t.add(phase)).add(
      sin(t.mul(float(2.4)).add(phase.mul(float(3)))).mul(float(0.35))
    )
    const amp = float(this.bladeHeight * 0.5)
    const lean = this.uCurve.add(osc.mul(this.uWind)).mul(bend).mul(amp)
    const drop = lean.abs().mul(hf).mul(float(0.18)) // ngọn chùng xuống theo cung
    return vec3(tx.add(lean), positionLocal.y.sub(drop), tz) as TSLNode
  }

  // Màu: gradient gốc(tối)→ngọn(sáng) + AO gốc + tint per-lá.
  private _colorNode(): TSLNode {
    const d = this.dataNode as TSLNode
    const hf = clamp(positionLocal.y.div(float(this.bladeHeight)), float(0), float(1))
    let col = mix(this.uBase, this.uTip, hf) as TSLNode
    col = col.mul(float(0.65).add(hf.mul(float(0.35)))) as TSLNode // AO: gốc tối hơn
    const tint = float(0.82).add(d.w.mul(float(0.36))) // biến thiên sáng per-lá
    return col.mul(tint) as TSLNode
  }
}
