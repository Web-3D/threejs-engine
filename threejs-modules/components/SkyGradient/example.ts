/**
 * threejs-modules/components/SkyGradient/example.ts
 * Standalone demo: dome sky + 1 directional "sun" quay vòng → ngày↔đêm + quầng hoàng hôn.
 * Kéo (không có UI) — sun tự chạy cung để thấy gradient đổi. Chạy được không cần project setup.
 */

import * as THREE from 'three'

import { BaseWorld } from '../../utils/core/BaseWorld'
import { SkyGradient } from './index'

class SkyGradientDemo extends BaseWorld {
  private sky: SkyGradient | null = null
  private readonly sun = new THREE.DirectionalLight(0xfff0cf, 2.2)

  protected async onInit(): Promise<void> {
    this.camera.position.set(0, 3, 12)
    this.scene.add(this.sun, this.sun.target)
    const sky = new SkyGradient()
    this.scene.backgroundNode = sky.getBackgroundNode()
    this.sky = sky
    const hemi = new THREE.HemisphereLight(0xbcd4ff, 0x6b5240, 0.3)
    this.scene.add(hemi)
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(1.5, 32, 16),
      new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.6 })
    )
    this.scene.add(ball)
  }

  protected onUpdate(time: number): void {
    const ang = time * 0.4
    this.sun.position.set(Math.cos(ang) * 20, Math.sin(ang) * 18, 6)
    this.sky?.setSun(this.sun.position.x, this.sun.position.y, this.sun.position.z)
  }

  protected onDispose(): void {
    this.sky?.dispose()
  }
}

export async function createDemo(canvas: HTMLCanvasElement): Promise<{ dispose: () => void }> {
  const demo = new SkyGradientDemo(canvas)
  await demo.init()
  return { dispose: () => demo.dispose() }
}
