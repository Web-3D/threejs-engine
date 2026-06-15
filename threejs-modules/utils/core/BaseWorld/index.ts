/**
 * VỊ TRÍ   — threejs-modules/utils/BaseWorld/index.ts
 * VAI TRÒ  — Abstract base class cho mọi demo scene trong threejs-modules/[category]/example.ts
 * LIÊN HỆ  — example.ts trong mỗi module extend class này thay vì lặp 40+ dòng boilerplate
 *
 * CÁCH DÙNG:
 *   class MyDemo extends BaseWorld {
 *     protected async onInit(): Promise<void> {
 *       this.scene.background = new THREE.Color(0x111111)
 *       this.camera.position.set(0, 2, 6)
 *       const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial())
 *       this.scene.add(mesh)
 *     }
 *     protected onUpdate(time: number, deltaTime: number): void {
 *       mesh.rotation.y += deltaTime
 *     }
 *     protected onDispose(): void {
 *       mesh.geometry.dispose()
 *     }
 *   }
 *
 *   export async function createDemo(canvas: HTMLCanvasElement) {
 *     const demo = new MyDemo(canvas)
 *     await demo.init()
 *     return { dispose: () => demo.dispose() }
 *   }
 *
 * DISPOSE: renderer.dispose() + dừng animation loop + disconnect ResizeObserver
 *          Geometry/Material tạo trong onInit → dispose trong onDispose()
 */

import * as THREE from 'three'
import { WebGPURenderer } from 'three/webgpu'

export abstract class BaseWorld {
  protected readonly renderer: WebGPURenderer
  protected readonly scene: THREE.Scene
  protected readonly camera: THREE.PerspectiveCamera
  private readonly clock = new THREE.Clock()
  private resizeObserver: ResizeObserver | null = null
  private lastTime = 0
  private isDisposed = false

  // opts.antialias: MSAA phần cứng. Default true (giữ nguyên mọi consumer cũ). Đặt FALSE khi cảnh có
  // reflector()/RTT — MSAA framebuffer xung khắc reflector RTT depth (GPU từ chối pass = mất gương, KI-007);
  // bù khử răng cưa bằng FXAA post (PostProcessingManager) thay vì MSAA.
  // opts.requiredLimits: nâng giới hạn device WebGPU (vd maxSampledTexturesPerShaderStage cho nhiều
  // shadow/texture — mặc định 16). Caller PHẢI clamp theo adapter.limits trước khi truyền (requestDevice
  // FAIL nếu vượt). undefined = giữ mặc định (mọi module example cũ không truyền → no-op).
  constructor(
    protected readonly canvas: HTMLCanvasElement,
    opts: { antialias?: boolean; requiredLimits?: Record<string, number> } = {}
  ) {
    const w = canvas.clientWidth || 300
    const h = canvas.clientHeight || 200
    this.renderer = new WebGPURenderer({
      canvas,
      antialias: opts.antialias ?? true,
      requiredLimits: opts.requiredLimits,
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(w, h)
    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 1000)
  }

  /**
   * Khởi động renderer + gọi onInit + bắt đầu animation loop + ResizeObserver.
   * Gọi 1 lần ngay sau constructor — await trước khi dùng.
   */
  async init(): Promise<void> {
    await this.renderer.init()
    await this.onInit()

    this.resizeObserver = new ResizeObserver(() => this.handleResize())
    this.resizeObserver.observe(this.canvas)

    this.renderer.setAnimationLoop(() => {
      const time = this.clock.getElapsedTime()
      // Tính deltaTime thủ công: getElapsedTime() nội bộ đã gọi getDelta() một lần,
      // gọi thêm getDelta() trong cùng frame sẽ trả về ~0. Dùng diff thủ công thay thế.
      const deltaTime = time - this.lastTime
      this.lastTime = time
      this.onUpdate(time, deltaTime)
      this.renderer.render(this.scene, this.camera)
    })
  }

  /**
   * Subclass override: thêm objects vào scene, set camera position, load assets.
   * Chạy 1 lần sau renderer.init() — có thể async (load model, texture...).
   */
  protected abstract onInit(): Promise<void>

  /**
   * Subclass override: update objects mỗi frame.
   * time = tổng giây từ khi bắt đầu (getElapsedTime).
   * deltaTime = giây kể từ frame trước — dùng cho physics, animation speed.
   */
  protected abstract onUpdate(time: number, deltaTime: number): void

  /**
   * Subclass override (optional): dispose geometry, material, texture tạo trong onInit.
   * Gọi trước renderer.dispose(). Default: no-op.
   */
  protected onDispose(): void {}

  private handleResize(): void {
    const w = this.canvas.clientWidth
    const h = this.canvas.clientHeight
    if (w === 0 || h === 0) return
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
  }

  /**
   * Dừng animation loop + disconnect ResizeObserver + gọi onDispose + dispose renderer.
   * Gọi trong createDemo's returned dispose() function.
   */
  dispose(): void {
    if (this.isDisposed) return
    this.renderer.setAnimationLoop(null)
    this.resizeObserver?.disconnect()
    this.resizeObserver = null
    this.onDispose()
    this.renderer.dispose()
    this.isDisposed = true
  }
}
