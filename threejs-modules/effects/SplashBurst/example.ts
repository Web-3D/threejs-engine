// threejs-modules/effects/SplashBurst/example.ts
// Standalone demo — burst giọt nước tung tóe định kỳ trên 1 mặt phẳng. Không import từ project.

import * as THREE from 'three'
import { WebGPURenderer } from 'three/webgpu'
import { SplashBurst } from './index'

const renderer = new WebGPURenderer({ antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)
document.body.appendChild(renderer.domElement)

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x10202a)
const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 100)
camera.position.set(2.4, 1.6, 2.4)
camera.lookAt(0, 0.2, 0)

scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x223344, 1.2))

// "mặt nước" tối để thấy giọt sáng bật ra
const water = new THREE.Mesh(
  new THREE.PlaneGeometry(6, 6),
  new THREE.MeshStandardMaterial({ color: 0x1d3a47, roughness: 0.25, metalness: 0.1 })
)
water.rotation.x = -Math.PI / 2
scene.add(water)

const splash = new SplashBurst({ life: 0.7, speed: 2.0, size: 9 })
scene.add(splash.getPoints())

const clock = new THREE.Clock()
let nextBurst = 0
renderer.setAnimationLoop(() => {
  const t = clock.getElapsedTime()
  if (t >= nextBurst) {
    // bắn tại điểm ngẫu nhiên trên mặt nước, strength ngẫu nhiên
    const x = (Math.random() - 0.5) * 4
    const z = (Math.random() - 0.5) * 4
    splash.burst(x, 0, z, 0.4 + Math.random() * 0.6)
    nextBurst = t + 0.45 + Math.random() * 0.4
  }
  splash.update(t)
  camera.position.x = Math.cos(t * 0.3) * 3.4
  camera.position.z = Math.sin(t * 0.3) * 3.4
  camera.lookAt(0, 0.15, 0)
  renderer.render(scene, camera)
})

window.addEventListener('beforeunload', () => splash.dispose())
