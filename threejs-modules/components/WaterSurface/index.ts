/**
 * VỊ TRÍ   — threejs-modules/components/WaterSurface/index.ts
 * VAI TRÒ  — Hồ/ao nước phản chiếu thật (flat mirror) cho site-kit — tier cao (reflector pass).
 * LIÊN HỆ  — Anh em GrassGround (cùng là bề mặt sân vườn) nhưng SỞ HỮU mesh (reflector.target = con của mesh).
 *
 * Thuật toán (mặt nước ngang trong XZ):
 *   1. reflector() → render scene qua virtual-camera vào RTT (resolution<1 để rẻ, bounces=false né đệ quy)
 *   2. Gợn sóng: FBM 2 octave (4 lớp triNoise3D) cuộn theo uTime*uFlow → surfaceNormal lắc quanh trục Y (KHÔNG cần texture)
 *   3. Distortion: surfaceNormal.xz dời uv của reflector → mặt gương "rung"
 *   4. Khúc xạ (B): viewportSharedTexture(screenUV+lệch sóng) → cái-sau-nước (đáy/nền) gợn theo sóng
 *   5. Fresnel (Schlick): nhìn xiên (grazing) → gương; nhìn thẳng xuống → XUYÊN thấy đáy (ám màu nước = absorption giả)
 *   6. Đốm nắng: reflect(-sunDir, normal)·eye^shininess → glint theo MẶT TRỜI (setSun, giống GrassBlades)
 * Nước transparent=true (vẽ SAU opaque → framebuffer có đáy để khúc xạ). Reflect↔refract = 1 chỗ blend (đổi C dễ).
 *
 * CÁCH DÙNG: const w = new WaterSurface({ width, depth, baseY }); w.setCamera(cam); scene.add(w.getMesh())
 *   Sóng: gọi w.setTime(elapsedSeconds) mỗi frame. Nắng: w.setSun(sunPos.x, y, z) khi mặt trời đổi.
 * DISPOSE: dispose() giải phóng geometry + material + RTT reflector. ⚠ RTT nội bộ nằm WeakMap theo
 *   virtual-camera — three KHÔNG expose dispose → ta tự truy chuỗi viewCam→virtualCameras→renderTargets→RT
 *   (cần setCamera trước; scan-versions bắt drift nếu three đổi tên field). KHÔNG setCamera → RTT rớt cho GC.
 */

import * as THREE from 'three'
import type Node from 'three/src/nodes/core/Node.js'
import type { ShaderNodeObject } from 'three/tsl'
import {
  cameraPosition,
  cos,
  dot,
  float,
  length,
  max,
  mix,
  normalize,
  oneMinus,
  positionWorld,
  pow,
  reflect,
  reflector,
  screenUV,
  smoothstep,
  step,
  triNoise3D,
  uniform,
  vec2,
  vec3,
  viewportSafeUV,
  viewportSharedTexture,
} from 'three/tsl'
import { MeshBasicNodeMaterial } from 'three/webgpu'

type TSLNode = ShaderNodeObject<Node>

const DEFAULTS = {
  width: 12,
  depth: 9.6,
  baseY: 0.02,
  waterColor: 0x254a59 as THREE.ColorRepresentation,
  sunColor: 0xffffff as THREE.ColorRepresentation,
  reflectivity: 0.35,
  rippleScale: 4,
  flow: 0.4,
  distortion: 0.4,
  detail: 0.4, // biên độ octave-2 FBM (độ nhiễu/turbulence chi tiết)
  refract: 1, // hệ số méo ảnh khúc-xạ (×distortion); 1 = như reflection, cao = đáy gợn mạnh hơn
  shininess: 100,
  alpha: 1,
  // ⚠ KI-011 (2026-06-10): PHẢI = 1 trên three r174 WebGPU — resolution<1 làm RT reflector (RGBA16Float,
  // size×res) nhỏ hơn getDrawingBufferSize; viewportSharedTexture (khúc xạ, dòng ~345) copyFramebufferToTexture
  // trong pass reflector với copySize FULL drawingBuffer → copy out-of-bounds → CommandBuffer invalid MỖI FRAME
  // + texture leak + lag toàn app (DPR 2: copy 2844×1406 từ RT 1422×703 — NgQuan chốt án bằng tách hồ).
  // Hạ lại <1 CHỈ KHI nâng three có fix clamp copy theo RT hiện hành. Chi tiết: Factory/deferred/ground-mix-port-plan.md.
  resolution: 1,
  tint: 0.4,
}

// 🌊 GỢN VA CHẠM (impact ripple) — pool N vòng analytic cộng vào normal (KHÔNG displace đỉnh: mặt nước phẳng,
// sóng nằm hết trong normal). Mỗi vòng = uniform vec4 (tâm world X, Z, t0 giây, strength 0..1). emitRipple ghi
// 1 slot (ring buffer) → 0 CPU/frame trừ lúc bắn. Vòng tự lan (front = d − age·SPEED) + tắt dần theo tuổi.
const RIPPLE_SLOTS = 50 // số vòng đồng thời (budget shader: mỗi slot ~1 cos + 2 smoothstep/fragment; 50 cho mưa rất dày)
const RIPPLE_WIDTH = 0.34 // m — bề rộng dải sóng quanh front (mỏng = nét, rộng = dễ thấy) — hằng (chưa expose slider)
// DEFAULT cho 4 tham số LIVE (slider khay Mưa chỉnh qua setRipple*). Đổi tại đây = đổi giá trị khởi tạo.
const RIPPLE_SPEED = 0.65 // m/s — tốc độ vòng loang ra (đã giảm NỬA từ 1.3: vòng nhỏ hơn → trải đều hồ hơn)
const RIPPLE_LIFE = 2.6 // s — thời gian vòng tồn tại (decay tuyến tính)
const RIPPLE_WAVES = 15 // sóng/m (k = 2π/λ → λ ≈ 0.42m) — gợn lăn tăn trong dải
const RIPPLE_AMP = 2.2 // gain biên độ (= uRippleAmp): cao = gợn rõ trên fresnel/glint/gương; 0 = tắt (băng)

export interface WaterSurfaceOptions {
  /** Bề ngang hồ (m, X). Default: 12 */
  width?: number
  /** Chiều sâu hồ (m, Z). Default: 9.6 */
  depth?: number
  /** Cao độ mặt nước (m). Default: 0.02 */
  baseY?: number
  /** Màu nước (tô khi nhìn thẳng xuống). Default: 0x254a59 */
  waterColor?: THREE.ColorRepresentation
  /** Màu đốm nắng glint. Default: 0xffffff */
  sunColor?: THREE.ColorRepresentation
  /** Phản chiếu gốc rf0 [0–1] (nhìn thẳng). Cao = gương hơn. Default: 0.35 */
  reflectivity?: number
  /** Tần số gợn sóng (1/m). Cao = sóng nhỏ/dày. Default: 4 */
  rippleScale?: number
  /** Tốc độ cuộn sóng (cần setTime). Default: 0.4 */
  flow?: number
  /** Cường độ rung mặt gương + độ nghiêng normal. Default: 0.4 */
  distortion?: number
  /** Biên độ octave-2 FBM (độ nhiễu/turbulence chi tiết của sóng) [0–~1.5]. Default: 0.4 */
  detail?: number
  /** Hệ số méo ảnh KHÚC XẠ (×distortion). 1 = như reflection; cao = ảnh đáy gợn mạnh hơn. Default: 1 */
  refract?: number
  /** Độ gắt đốm nắng (số mũ specular). Cao = chấm sáng nhỏ. Default: 100 */
  shininess?: number
  /** Độ mờ mặt nước [0–1]. <1 = trong suốt. Default: 1 */
  alpha?: number
  /** Tỉ lệ RTT phản chiếu [0–1]. Thấp = rẻ/mờ. Default: 0.5 */
  resolution?: number
  /** Độ ám màu nước lên ảnh khúc xạ [0–1] (giả absorption: cao = đục, thấy đáy mờ). Default: 0.4 */
  tint?: number
  /** Polygon mặt nước tự do (m, LOCAL so tâm). ≥3 đỉnh → ShapeGeometry thay chữ nhật. Mặc định: undefined (chữ nhật). */
  points?: { x: number; z: number }[]
}

// Shape NỘI BỘ của ReflectorBaseNode (three 0.174) ta cần để giữ forceUpdate + dispose RTT. KHÔNG public
// trong .d.ts → cast. scan-versions.js bắt drift nếu three đổi tên field (virtualCameras/renderTargets).
type ReflectorBaseLike = {
  forceUpdate: boolean
  virtualCameras?: WeakMap<object, object>
  renderTargets?: WeakMap<object, { dispose(): void }>
}

export class WaterSurface {
  private geometry: THREE.BufferGeometry | null = null
  private material: MeshBasicNodeMaterial | null = null
  private mesh: THREE.Mesh | null = null
  // Reflector base node — đặt forceUpdate=true mỗi frame để né guard isFacingAway (reflector BỎ render
  // RTT khi camera ở mặt SAU mặt phẳng nước → gương "đứng hình" lúc orbit thấp/ngang. Xem ReflectorNode.js).
  // virtualCameras/renderTargets = 2 WeakMap NỘI BỘ của ReflectorBaseNode (three 0.174) → dùng để dispose RTT.
  private _reflector: ReflectorBaseLike | null = null
  private _camera: THREE.Camera | null = null // view-camera → tra virtualCamera → RTT để dispose (né leak)
  private _excludeReflectLayer: number | null = null // layer LOẠI khỏi RTT phản chiếu (đa-hồ né đơ gương, KI-012)
  private isDisposed = false
  private readonly _w: number // nhớ kích thước chữ nhật để fallback khi <3 đỉnh
  private readonly _d: number

  private readonly uSize: ReturnType<typeof uniform>
  private readonly uFlow: ReturnType<typeof uniform>
  private readonly uTime: ReturnType<typeof uniform>
  private readonly uDistortion: ReturnType<typeof uniform>
  private readonly uDetail: ReturnType<typeof uniform> // biên độ octave-2 FBM (turbulence)
  private readonly uRefract: ReturnType<typeof uniform> // hệ số méo khúc-xạ (×distortion)
  private readonly uRf0: ReturnType<typeof uniform>
  private readonly uShininess: ReturnType<typeof uniform>
  private readonly uAlpha: ReturnType<typeof uniform>
  private readonly uWaterColor: ReturnType<typeof uniform>
  private readonly uSunColor: ReturnType<typeof uniform>
  private readonly uSunDir: ReturnType<typeof uniform>
  private readonly uTint: ReturnType<typeof uniform>
  // 🌊 Pool vòng gợn va chạm: mỗi slot = uniform vec4 (tâm.x, tâm.z, t0, strength). emitRipple ghi xoay vòng.
  // 4 uniform LIVE (slider khay Mưa): amp=size/gain (0=tắt→băng) · speed=tốc độ lan · life=thời gian · waves=k(2π/λ).
  private readonly _rippleU: ReturnType<typeof uniform>[] = []
  private readonly uRippleAmp = uniform(RIPPLE_AMP)
  private readonly uRippleSpeed = uniform(RIPPLE_SPEED)
  private readonly uRippleLife = uniform(RIPPLE_LIFE)
  private readonly uRippleWaves = uniform(RIPPLE_WAVES)
  private _rippleHead = 0
  // |uViewDirY| → 1 khi CAMERA nhìn gần thẳng đứng (top-down): virtualCamera reflector suy biến → ảnh ĐƠ.
  // Fade gương theo HƯỚNG-NHÌN-CAMERA (uniform, mọi fragment chung) — KHÔNG theo eye-tới-fragment (pool lệch
  // tâm → eye.y không đạt ngưỡng → fade trượt). Cập nhật mỗi frame trong setTime từ _camera.
  private readonly uViewDirY = uniform(0)
  private readonly _tmpDir = new THREE.Vector3()

  constructor(opts: WaterSurfaceOptions = {}) {
    const o = { ...DEFAULTS, ...opts }
    this.uSize = uniform(o.rippleScale)
    this.uFlow = uniform(o.flow)
    this.uTime = uniform(0)
    this.uDistortion = uniform(o.distortion)
    this.uDetail = uniform(o.detail)
    this.uRefract = uniform(o.refract)
    this.uRf0 = uniform(o.reflectivity)
    this.uShininess = uniform(o.shininess)
    this.uAlpha = uniform(o.alpha)
    this.uWaterColor = uniform(new THREE.Color(o.waterColor))
    this.uSunColor = uniform(new THREE.Color(o.sunColor))
    this.uSunDir = uniform(new THREE.Vector3(0.5, 1, 0.6).normalize())
    this.uTint = uniform(o.tint)
    for (let i = 0; i < RIPPLE_SLOTS; i++)
      this._rippleU.push(uniform(new THREE.Vector4(0, 0, 0, 0)))

    this._w = o.width
    this._d = o.depth
    this.geometry = waterGeo(o.width, o.depth, o.points)
    const mat = new MeshBasicNodeMaterial()
    const sm = reflector({ resolution: o.resolution, bounces: false })
    // base node giữ forceUpdate + 2 WeakMap (không có trong .d.ts công khai → cast). setTime bật mỗi frame.
    this._reflector = (sm as unknown as { reflector: ReflectorBaseLike }).reflector
    mat.colorNode = this._buildColor(sm)
    mat.opacityNode = this.uAlpha
    // transparent=true LUÔN: nước vẽ ở pass trong suốt (SAU opaque) → viewportSharedTexture có nền/đáy
    // phía sau để khúc xạ. depthWrite=true: nước là mặt đặc (composite phủ kín), giữ depth đúng.
    mat.transparent = true
    mat.depthWrite = true
    this.material = mat

    const mesh = new THREE.Mesh(this.geometry, mat)
    mesh.rotation.x = -Math.PI / 2 // plane XY → nằm ngang XZ, normal local +Z = world +Y
    mesh.position.y = o.baseY
    mesh.frustumCulled = false // mặt phẳng dẹt → bounding sphere hay bị cull khi pan → reflector ngừng update
    mesh.add(sm.target) // reflector cần target làm CON → mặt phẳng phản chiếu = mặt nước
    this.mesh = mesh
  }

  /** Thời gian animation (giây). Gọi mỗi frame để sóng cuộn. */
  setTime(seconds: number): void {
    if (this.isDisposed) return
    this.uTime.value = seconds
    // Hướng-nhìn camera (Y): cập nhật mỗi frame → shader fade gương khi camera nhìn gần thẳng đứng (top-down).
    if (this._camera) this.uViewDirY.value = this._camera.getWorldDirection(this._tmpDir).y
    // PHẢI ép forceUpdate mỗi frame — KHÔNG vì "chống đứng gương" mà vì BUG three: ReflectorNode.updateBefore
    // set `_inReflector=true` (dòng 374) rồi reset `=false` (484) SAU render; nhưng nhánh facing-away
    // `if (isFacingAway && !forceUpdate) return` (401) thoát SỚM, BỎ qua reset → `_inReflector` kẹt true →
    // guard `if (bounces===false && _inReflector) return` (372) khiến MỌI frame sau chết → gương đứng VĨNH VIỄN
    // sau lần đầu camera chui dưới nước. forceUpdate=true né nhánh 401 → luôn reset → không kẹt. Ảnh "từ dưới
    // lên" SAI lúc facing-away được TẮT ở shader (_buildColor: fres·smoothstep(dot(eye,n))) nên không lộ.
    if (this._reflector) this._reflector.forceUpdate = true
    // 💧 ĐA-HỒ né đơ gương (KI-012): virtualCamera reflector = camera.clone() → copy `layers` của camera chính.
    // Caller để mặt nước trên layer riêng + bật layer đó ở camera (để VẪN thấy/click) → virtualCamera vô tình
    // cũng render mặt nước khác → chen `_inReflector` → đơ. Disable layer đó trên virtualCamera mỗi frame (sau khi
    // nó được tạo ở lần render đầu) → reflector KHÔNG render mặt nước → hết chen. _excludeReflectLayer=null → bỏ qua.
    if (this._excludeReflectLayer !== null && this._camera && this._reflector?.virtualCameras) {
      const vc = this._reflector.virtualCameras.get(this._camera) as THREE.Camera | undefined
      vc?.layers.disable(this._excludeReflectLayer)
    }
  }

  /** Loại 1 layer khỏi RTT phản chiếu (mặt nước các hồ khác) → 2+ hồ hết đơ gương. Gọi 1 lần sau khi dựng. KI-012. */
  excludeReflectionLayer(layer: number): void {
    if (this.isDisposed) return
    this._excludeReflectLayer = layer
  }

  /** Hướng mặt trời (vector tới sun, target ở gốc) — đốm nắng glint theo. */
  setSun(x: number, y: number, z: number): void {
    if (this.isDisposed) return
    ;(this.uSunDir.value as THREE.Vector3).set(x, y, z).normalize()
  }

  /** Tốc độ cuộn sóng. Min 0. */
  setFlow(v: number): void {
    if (this.isDisposed) return
    this.uFlow.value = Math.max(0, v)
  }

  /** Cường độ rung mặt gương [0–2]. */
  setDistortion(v: number): void {
    if (this.isDisposed) return
    this.uDistortion.value = Math.max(0, Math.min(2, v))
  }

  /** Biên độ octave-2 FBM (độ nhiễu/turbulence chi tiết) [0–1.5]. */
  setDetail(v: number): void {
    if (this.isDisposed) return
    this.uDetail.value = Math.max(0, Math.min(1.5, v))
  }

  /** Hệ số méo ảnh khúc-xạ (×distortion) [0–2]. */
  setRefract(v: number): void {
    if (this.isDisposed) return
    this.uRefract.value = Math.max(0, Math.min(2, v))
  }

  /** Tần số gợn sóng (1/m) [0.05–20]. Thấp = sóng TO/thưa (phân số = chu kỳ tới ~13m — "Wave size" 24);
   *  cao = nhỏ/dày. (Floor 0.5→0.05 — NgQuan 2026-06-10 "wave size tăng lên 24".) */
  setRippleScale(v: number): void {
    if (this.isDisposed) return
    this.uSize.value = Math.max(0.05, Math.min(20, v))
  }

  /** Phản chiếu gốc rf0 [0–1]. */
  setReflectivity(v: number): void {
    if (this.isDisposed) return
    this.uRf0.value = Math.max(0, Math.min(1, v))
  }

  /** Độ ám màu nước lên ảnh khúc xạ [0–1] (giả absorption). */
  setTint(v: number): void {
    if (this.isDisposed) return
    this.uTint.value = Math.max(0, Math.min(1, v))
  }

  /** Đổi màu nước (live). */
  setWaterColor(c: THREE.ColorRepresentation): void {
    if (this.isDisposed) return
    ;(this.uWaterColor.value as THREE.Color).set(c)
  }

  /** 🌊 Bắn 1 vòng gợn va chạm tại điểm (x,z) WORLD. `strength` 0..1 = biên độ (caller tự quy từ kích thước/
   *  khối lượng/vận tốc: mưa ~0.15, cá trồi ~theo size, vật to/nhanh → cao). Ghi xoay vòng N slot — bắn liên
   *  tục thì vòng cũ nhất bị đè. 0 CPU/frame trừ lúc bắn (chỉ ghi 1 uniform). */
  emitRipple(x: number, z: number, strength: number): void {
    if (this.isDisposed) return
    const s = Math.max(0, Math.min(1, strength))
    if (s <= 0) return
    const u = this._rippleU[this._rippleHead]
    ;(u.value as THREE.Vector4).set(x, z, this.uTime.value as number, s)
    this._rippleHead = (this._rippleHead + 1) % RIPPLE_SLOTS
  }

  /** 🌊 SIZE/gain biên độ gợn va chạm [0–6] (= "size sóng"). 0 = TẮT (mặt băng phẳng lì). Default 2.2. */
  setRippleAmp(v: number): void {
    if (this.isDisposed) return
    this.uRippleAmp.value = Math.max(0, Math.min(6, v))
  }

  /** 🌊 Tốc độ vòng loang ra (m/s) [0–3]. Bán kính max ≈ speed×life. Default 0.65. */
  setRippleSpeed(v: number): void {
    if (this.isDisposed) return
    this.uRippleSpeed.value = Math.max(0, Math.min(3, v))
  }

  /** 🌊 Thời gian vòng tồn tại (s) [0.3–8]. Default 2.6. */
  setRippleLife(v: number): void {
    if (this.isDisposed) return
    this.uRippleLife.value = Math.max(0.3, Math.min(8, v))
  }

  /** 🌊 Bước sóng λ (m) [0.1–1.5] — khoảng cách giữa 2 gợn lăn tăn. Quy về k=2π/λ. Default ≈0.42. */
  setRippleWavelength(lambda: number): void {
    if (this.isDisposed) return
    const lam = Math.max(0.1, Math.min(1.5, lambda))
    this.uRippleWaves.value = (Math.PI * 2) / lam
  }

  /** Đổi mặt nước sang polygon tự do (m, LOCAL). <3 đỉnh → về chữ nhật. LIVE: chỉ dựng lại geometry
   *  (giữ nguyên material + reflector → KHÔNG tốn RTT mới). Mesh giữ rotation/position cũ. */
  setShape(points: { x: number; z: number }[]): void {
    if (this.isDisposed || !this.mesh) return
    this.geometry?.dispose()
    this.geometry = waterGeo(this._w, this._d, points)
    this.mesh.geometry = this.geometry
  }

  getMesh(): THREE.Mesh {
    if (!this.mesh) throw new Error('WaterSurface: already disposed')
    return this.mesh
  }

  /** View-camera đang render scene → cho dispose() giải phóng đúng RTT reflector (né leak GPU).
   *  Caller (editor) gọi 1 lần sau khi tạo. KHÔNG set → dispose() chỉ bỏ material (RTT rớt lại cho GC). */
  setCamera(camera: THREE.Camera): void {
    this._camera = camera
  }

  dispose(): void {
    if (this.isDisposed) return
    this._disposeReflectorRT() // TRƯỚC khi null _reflector — giải phóng RTT GPU (three không tự lo)
    this.mesh?.parent?.remove(this.mesh)
    this.geometry?.dispose()
    this.material?.dispose()
    this.geometry = null
    this.material = null
    this.mesh = null
    this._reflector = null
    this._camera = null
    this.isDisposed = true
  }

  // Giải phóng RTT reflector: three giữ RTT trong WeakMap<virtualCamera, RenderTarget>, mà virtualCamera lại
  // trong WeakMap<viewCamera, virtualCamera>. material.dispose() KHÔNG đụng tới → leak GPU. Chuỗi: viewCam →
  // virtualCameras → virtualCam → renderTargets → RT.dispose(). Truy field NỘI BỘ three (cast); scan-versions.js
  // bắt drift nếu three đổi tên. KHÔNG có camera → bỏ qua (RTT rớt cho GC, không free GPU — caller nên setCamera).
  private _disposeReflectorRT(): void {
    const r = this._reflector
    const cam = this._camera
    if (!r || !cam) return
    const virtualCam = r.virtualCameras?.get(cam)
    if (virtualCam) r.renderTargets?.get(virtualCam)?.dispose()
  }

  // ── Private ────────────────────────────────────────────────────────────────

  // Normal mặt nước: FBM 2 octave (4 lớp triNoise3D) → lắc quanh trục Y (không cần texture).
  // Octave LỚN (tần 0.6× → features TO, biên độ chính) + octave NHỎ (tần 2.2× = KHÔNG bội-số-nguyên +
  // cuộn NGƯỢC nhanh hơn, biên độ 0.4 → phá tính "đều/lặp" của 1 lớp). Bớt nhuyễn + xáo trộn tự nhiên hơn.
  private _surfaceNormal(): TSLNode {
    const t = this.uTime.mul(this.uFlow)
    // Octave 1 — sóng lớn (low freq)
    const ax = positionWorld.x.mul(this.uSize.mul(float(0.6)))
    const az = positionWorld.z.mul(this.uSize.mul(float(0.6)))
    const nx1 = triNoise3D(vec3(ax.add(t), az, float(0)), float(0), float(0)).sub(float(0.5))
    const nz1 = triNoise3D(vec3(ax, az.add(t), float(5)), float(0), float(0)).sub(float(0.5))
    // Octave 2 — gợn chi tiết (high freq, cuộn ngược, tỉ lệ lệch 2.2× để không trùng pha → hết đều)
    const bx = positionWorld.x.mul(this.uSize.mul(float(2.2)))
    const bz = positionWorld.z.mul(this.uSize.mul(float(2.2)))
    const td = t.mul(float(1.4))
    const nx2 = triNoise3D(vec3(bx.sub(td), bz, float(2)), float(0), float(0)).sub(float(0.5))
    const nz2 = triNoise3D(vec3(bx, bz.sub(td), float(7)), float(0), float(0)).sub(float(0.5))
    const amp = this.uDistortion.mul(float(2))
    const nx = nx1.add(nx2.mul(this.uDetail))
    const nz = nz1.add(nz2.mul(this.uDetail))
    const rip = this._rippleNormal() // 🌊 gợn va chạm — nghiêng normal theo bán kính vòng (cộng SAU amp sóng nền)
    return normalize(vec3(nx.mul(amp).add(rip.x), float(1), nz.mul(amp).add(rip.z))) as TSLNode
  }

  // 🌊 Tổng nghiêng normal từ N vòng gợn va chạm (build-time unroll, slot rỗng strength=0 → cộng 0). Mỗi vòng:
  // front = d − age·SPEED (loang ra); dải sóng quanh front (smoothstep WIDTH) × tắt theo tuổi (smoothstep LIFE) ×
  // cos(front·WAVES) → lăn tăn; nghiêng theo HƯỚNG ra tâm. uRippleAmp = núm tổng (0 = băng → tắt gợn).
  private _rippleNormal(): { x: TSLNode; z: TSLNode } {
    const p = positionWorld.xz
    let sx: TSLNode = float(0)
    let sz: TSLNode = float(0)
    for (const u of this._rippleU) {
      const delta = p.sub(vec2(u.x, u.y))
      const d = length(delta)
      const age = this.uTime.sub(u.z)
      const front = d.sub(age.mul(this.uRippleSpeed))
      const env = oneMinus(smoothstep(float(0), float(RIPPLE_WIDTH), front.abs()))
      const decay = oneMinus(smoothstep(float(0), this.uRippleLife, age))
      const slope = u.w
        .mul(env)
        .mul(decay)
        .mul(step(float(0), age))
        .mul(cos(front.mul(this.uRippleWaves)))
      const dir = delta.div(max(d, float(1e-3)))
      sx = sx.add(dir.x.mul(slope))
      sz = sz.add(dir.y.mul(slope))
    }
    return { x: sx.mul(this.uRippleAmp), z: sz.mul(this.uRippleAmp) }
  }

  private _buildColor(sm: ReturnType<typeof reflector>): TSLNode {
    const n = this._surfaceNormal()
    const eye = normalize(cameraPosition.sub(positionWorld))
    const offset = n.xz.mul(this.uDistortion) // lệch GƯƠNG theo sóng
    // Phản chiếu (gương phẳng): dời uv reflector theo sóng
    const baseUv = sm.uvNode as TSLNode // reflector luôn set default screenUV → non-null
    sm.uvNode = baseUv.add(offset)
    // Khúc xạ (screen-space): cái-SAU-nước trong framebuffer, lệch theo sóng → thấy đáy gợn. Offset RIÊNG
    // ×uRefract → chỉnh ĐỘ MÉO ảnh đáy độc lập với gương (rõ nhất khi đáy có hoa văn caro). viewportSafeUV
    // chặn lấy mẫu ngoài màn hình ở mép.
    const refrOffset = offset.mul(this.uRefract)
    const refraction = viewportSharedTexture(viewportSafeUV(screenUV.add(refrOffset))).rgb
    const refr = mix(refraction, this.uWaterColor, this.uTint) // ám màu nước (giả absorption/độ sâu)
    // Fresnel Schlick (dùng normal SÓNG → lấp lánh): grazing → gương, nhìn thẳng → xuyên thấy đáy.
    const theta = max(dot(eye, n), float(0))
    const fres = this.uRf0
      .add(
        float(1)
          .sub(this.uRf0)
          .mul(pow(float(1).sub(theta), float(5)))
      )
      // TẮT phản chiếu khi camera DƯỚI mặt nước (reflector ép forceUpdate render gương "từ dưới lên" SAI —
      // né bug _inReflector). Phép thử dùng `eye.y` = dot(eye, +Y) — normal PHẲNG của mặt phẳng nước, KHÔNG
      // dùng normal SÓNG (nghiêng ±21° theo XZ → `dot(eye,n_sóng)` phụ-thuộc-azimuth → mất gương ở vài góc
      // quay ngang dù camera vẫn trên nước). eye.y>0 = trên nước; <0 = dưới. Azimuth-independent.
      .mul(smoothstep(float(0), float(0.04), eye.y))
      // TẮT phản chiếu khi CAMERA nhìn gần thẳng đứng (top-down): virtualCamera reflector suy biến (lookAt ∥ up)
      // → ảnh gương ĐƠ khi xoay. Fade theo |uViewDirY| (hướng-nhìn-camera, mọi fragment chung) — KHÔNG theo
      // eye.y per-fragment (pool lệch tâm → eye.y tới pool < ngưỡng → fade trượt, gương vẫn đơ). |dir.y|→1 =
      // camera đứng; fade 0.92→0.99 (pitch ~67°→82°) → hiện khúc xạ (đáy) thay ảnh đơ. Giữ gương góc xiên thường.
      .mul(float(1).sub(smoothstep(float(0.985), float(0.9995), this.uViewDirY.abs())))
    // Đốm nắng theo mặt trời
    const refl = reflect(this.uSunDir.negate(), n)
    const spec = pow(max(dot(eye, refl), float(0)), this.uShininess).mul(this.uSunColor)
    return mix(refr, sm.rgb, fres).add(spec) as TSLNode
  }
}

// Geometry mặt nước: ≥3 đỉnh → ShapeGeometry (polygon tự do, earcut); else PlaneGeometry chữ nhật.
// Mesh xoay -90°X (XY→XZ): đỉnh local (px,pz) ↦ world (px,pz) khi Shape point = (px, -pz). KHÔNG mirror.
function waterGeo(
  width: number,
  depth: number,
  points?: { x: number; z: number }[]
): THREE.BufferGeometry {
  if (!points || points.length < 3) return new THREE.PlaneGeometry(width, depth)
  const s = new THREE.Shape()
  points.forEach((p, i) => (i === 0 ? s.moveTo(p.x, -p.z) : s.lineTo(p.x, -p.z)))
  s.closePath()
  return new THREE.ShapeGeometry(s)
}
