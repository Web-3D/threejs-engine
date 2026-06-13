/**
 * VỊ TRÍ   — threejs-modules/components/WaterSurface/example.ts
 * VAI TRÒ  — Demo standalone: 1 hồ nước phản chiếu + vài khối nổi phía trên để thấy gương soi.
 * CÁCH DÙNG: import('./example').then(m => m.createDemo(canvas))
 */

import * as THREE from 'three'
import { WebGPURenderer } from 'three/webgpu'

import { WaterSurface } from './index'

export function createDemo(canvas: HTMLCanvasElement): () => void {
  const renderer = new WebGPURenderer({ canvas, antialias: true })
  renderer.setSize(canvas.clientWidth, canvas.clientHeight)

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x9fc6e8)

  const camera = new THREE.PerspectiveCamera(50, canvas.clientWidth / canvas.clientHeight, 0.1, 100)
  camera.position.set(6, 4, 9)
  camera.lookAt(0, 0.5, 0)

  const sun = new THREE.DirectionalLight(0xffffff, 2)
  sun.position.set(5, 8, 6)
  scene.add(sun, new THREE.AmbientLight(0xffffff, 0.4))

  // Vài khối nổi phía trên để mặt nước có gì mà soi
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 1.2, 1.2),
    new THREE.MeshStandardMaterial({ color: 0xe06d4a })
  )
  box.position.set(-1.5, 1.2, -1)
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(0.8, 24, 16),
    new THREE.MeshStandardMaterial({ color: 0xf2c14e })
  )
  ball.position.set(1.8, 1.0, 0.5)
  scene.add(box, ball)

  const water = new WaterSurface({ width: 12, depth: 9.6, baseY: 0 })
  water.setSun(sun.position.x, sun.position.y, sun.position.z)
  scene.add(water.getMesh())

  const clock = new THREE.Clock()
  let raf = 0
  let nextDrop = 0 // 🌊 demo: rải vòng gợn ngẫu nhiên trong lòng hồ để xem hiệu ứng va chạm
  const loop = (): void => {
    const t = clock.getElapsedTime()
    water.setTime(t)
    if (t > nextDrop) {
      water.emitRipple((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 8, 0.4 + Math.random() * 0.4)
      nextDrop = t + 0.45 + Math.random() * 0.5
    }
    box.rotation.y += 0.01
    renderer.render(scene, camera)
    raf = requestAnimationFrame(loop)
  }
  loop()

  return (): void => {
    cancelAnimationFrame(raf)
    water.dispose()
    box.geometry.dispose()
    ;(box.material as THREE.Material).dispose()
    ball.geometry.dispose()
    ;(ball.material as THREE.Material).dispose()
    renderer.dispose()
  }
}
