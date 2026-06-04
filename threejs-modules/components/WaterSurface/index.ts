/**
 * VỊ TRÍ   — threejs-modules/components/WaterSurface/index.ts
 * VAI TRÒ  — Hồ/ao nước phản chiếu thật (flat mirror) cho site-kit — tier cao (reflector pass).
 * LIÊN HỆ  — Anh em GrassGround (cùng là bề mặt sân vườn) nhưng SỞ HỮU mesh (reflector.target = con của mesh).
 *
 * Thuật toán (mặt nước ngang trong XZ):
 *   1. reflector() → render scene qua virtual-camera vào RTT (resolution<1 để rẻ, bounces=false né đệ quy)
 *   2. Gợn sóng: 2 lớp triNoise3D cuộn theo uTime*uFlow → surfaceNormal lắc quanh trục Y (KHÔNG cần texture)
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
  dot,
  float,
  max,
  mix,
  normalize,
  positionWorld,
  pow,
  reflect,
  reflector,
  screenUV,
  triNoise3D,
  uniform,
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
  shininess: 100,
  alpha: 1,
  resolution: 0.5,
  tint: 0.4,
}

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
  private isDisposed = false
  private readonly _w: number // nhớ kích thước chữ nhật để fallback khi <3 đỉnh
  private readonly _d: number

  private readonly uSize: ReturnType<typeof uniform>
  private readonly uFlow: ReturnType<typeof uniform>
  private readonly uTime: ReturnType<typeof uniform>
  private readonly uDistortion: ReturnType<typeof uniform>
  private readonly uRf0: ReturnType<typeof uniform>
  private readonly uShininess: ReturnType<typeof uniform>
  private readonly uAlpha: ReturnType<typeof uniform>
  private readonly uWaterColor: ReturnType<typeof uniform>
  private readonly uSunColor: ReturnType<typeof uniform>
  private readonly uSunDir: ReturnType<typeof uniform>
  private readonly uTint: ReturnType<typeof uniform>

  constructor(opts: WaterSurfaceOptions = {}) {
    const o = { ...DEFAULTS, ...opts }
    this.uSize = uniform(o.rippleScale)
    this.uFlow = uniform(o.flow)
    this.uTime = uniform(0)
    this.uDistortion = uniform(o.distortion)
    this.uRf0 = uniform(o.reflectivity)
    this.uShininess = uniform(o.shininess)
    this.uAlpha = uniform(o.alpha)
    this.uWaterColor = uniform(new THREE.Color(o.waterColor))
    this.uSunColor = uniform(new THREE.Color(o.sunColor))
    this.uSunDir = uniform(new THREE.Vector3(0.5, 1, 0.6).normalize())
    this.uTint = uniform(o.tint)

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
    // ép reflector render RTT kể cả khi camera "facing away" (orbit thấp/ngang) → hết đứng gương.
    if (this._reflector) this._reflector.forceUpdate = true
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

  // Normal mặt nước: 2 lớp noise cuộn ngược → lắc quanh trục Y (không cần texture).
  private _surfaceNormal(): TSLNode {
    const t = this.uTime.mul(this.uFlow)
    const px = positionWorld.x.mul(this.uSize)
    const pz = positionWorld.z.mul(this.uSize)
    const nx = triNoise3D(vec3(px.add(t), pz, float(0)), float(0), float(0)).sub(float(0.5))
    const nz = triNoise3D(vec3(px, pz.add(t), float(5)), float(0), float(0)).sub(float(0.5))
    const amp = this.uDistortion.mul(float(2))
    return normalize(vec3(nx.mul(amp), float(1), nz.mul(amp))) as TSLNode
  }

  private _buildColor(sm: ReturnType<typeof reflector>): TSLNode {
    const n = this._surfaceNormal()
    const eye = normalize(cameraPosition.sub(positionWorld))
    const offset = n.xz.mul(this.uDistortion) // lệch chung cho gương + khúc xạ theo sóng
    // Phản chiếu (gương phẳng): dời uv reflector theo sóng
    const baseUv = sm.uvNode as TSLNode // reflector luôn set default screenUV → non-null
    sm.uvNode = baseUv.add(offset)
    // Khúc xạ (screen-space): cái-SAU-nước trong framebuffer, lệch theo sóng → thấy đáy gợn.
    // viewportSafeUV chặn lấy mẫu ngoài màn hình ở mép.
    const refraction = viewportSharedTexture(viewportSafeUV(screenUV.add(offset))).rgb
    const refr = mix(refraction, this.uWaterColor, this.uTint) // ám màu nước (giả absorption/độ sâu)
    // Fresnel Schlick: grazing → gương, nhìn thẳng → xuyên thấy đáy
    const theta = max(dot(eye, n), float(0))
    const fres = this.uRf0.add(
      float(1)
        .sub(this.uRf0)
        .mul(pow(float(1).sub(theta), float(5)))
    )
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
