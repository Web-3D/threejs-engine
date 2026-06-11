// threejs-modules/components/PondFish/example.ts
// Standalone smoke — đàn cá koi bơi trong "lòng hồ" giả (đĩa tối). Chạy độc lập, không import project.

import * as THREE from 'three'
import { WebGPURenderer } from 'three/webgpu'

import { PondFish } from './index'

const renderer = new WebGPURenderer()
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x101418)
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100)
camera.position.set(0, 2.2, 3.4)
camera.lookAt(0, -0.3, 0)

scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x1c2a20, 1.1))
const sun = new THREE.DirectionalLight(0xffffff, 1.4)
sun.position.set(3, 5, 2)
scene.add(sun)

// Đáy hồ giả — đĩa tối (thực tế = basin của WaterSurface, cá đặt dưới mặt nước)
const bottom = new THREE.Mesh(
  new THREE.CircleGeometry(2.2, 40),
  new THREE.MeshStandardMaterial({ color: 0x21302a, roughness: 1 })
)
bottom.rotation.x = -Math.PI / 2
bottom.position.y = -0.5
scene.add(bottom)

const fish = new PondFish({ count: 8, areaRadius: 1.6, depthY: -0.25 })
scene.add(fish.getMesh())
console.log('PondFish:', fish.getCount(), 'con,', fish.getTriangleCount(), 'tri, 1 draw')

const clock = new THREE.Clock()
renderer.setAnimationLoop(() => {
  fish.update(clock.getDelta())
  renderer.render(scene, camera)
})

// Cleanup demo: fish.dispose()
