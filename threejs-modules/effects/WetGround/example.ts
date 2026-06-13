// threejs-modules/effects/WetGround/example.ts
// Standalone smoke — nền + nhà hộp, nền ướt dần (wetness 0→1). Cần scene.environment để thấy phản chiếu.

import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { PMREMGenerator, WebGPURenderer } from 'three/webgpu'

import { WetGround } from './index'

const renderer = new WebGPURenderer()
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x3a4250) // trời mưa xám
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200)
camera.position.set(12, 4, 18) // góc xiên thấp → thấy phản chiếu ướt rõ (Fresnel)
camera.lookAt(0, 1, 0)

scene.add(new THREE.HemisphereLight(0x9aa6b4, 0x35343a, 1.3))
const pmrem = new PMREMGenerator(renderer)
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture // nguồn phản chiếu ướt

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(60, 60),
  new THREE.MeshStandardMaterial({ color: 0x4a4640, roughness: 1 })
)
ground.rotation.x = -Math.PI / 2
scene.add(ground)
const house = new THREE.Mesh(
  new THREE.BoxGeometry(6, 8, 6),
  new THREE.MeshStandardMaterial({ color: 0x8a6f55, roughness: 0.9 })
)
house.position.y = 4
scene.add(house)

const wet = new WetGround({ size: 60 })
scene.add(wet.getMesh())

let w = 0
const clock = new THREE.Clock()
renderer.setAnimationLoop(() => {
  w = Math.min(1, w + clock.getDelta() * 0.1) // ~10s ướt đẫm
  wet.setWetness(w)
  renderer.render(scene, camera)
})

// Cleanup demo: wet.dispose()
