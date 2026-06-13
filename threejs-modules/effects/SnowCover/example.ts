// threejs-modules/effects/SnowCover/example.ts
// Standalone smoke — nền + nhà hộp, tuyết tích dần (accum 0→1 theo thời gian). Chạy độc lập.

import * as THREE from 'three'
import { WebGPURenderer } from 'three/webgpu'

import { SnowCover } from './index'

const renderer = new WebGPURenderer()
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x6a7682) // trời xám tuyết
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200)
camera.position.set(14, 10, 18)
camera.lookAt(0, 2, 0)

scene.add(new THREE.HemisphereLight(0xc6d2de, 0x42484e, 1.6))

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(60, 60),
  new THREE.MeshStandardMaterial({ color: 0x3a4738, roughness: 1 })
)
ground.rotation.x = -Math.PI / 2
scene.add(ground)
const house = new THREE.Mesh(
  new THREE.BoxGeometry(6, 8, 6),
  new THREE.MeshStandardMaterial({ color: 0x6b5a48, roughness: 0.9 })
)
house.position.y = 4
scene.add(house)

const snow = new SnowCover({ size: 60 })
scene.add(snow.getMesh())

let accum = 0
const clock = new THREE.Clock()
renderer.setAnimationLoop(() => {
  accum = Math.min(1, accum + clock.getDelta() * 0.08) // ~12s phủ kín
  snow.setAccum(accum)
  renderer.render(scene, camera)
})

// Cleanup demo: snow.dispose()
