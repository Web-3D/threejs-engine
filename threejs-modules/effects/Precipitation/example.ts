// threejs-modules/effects/Precipitation/example.ts
// Standalone smoke — mưa rơi trên 1 nền tối + nhà hộp. Chạy độc lập, không import project.
// Đổi mode: new Precipitation({ mode: 'snow' }) để xem tuyết.

import * as THREE from 'three'
import { WebGPURenderer } from 'three/webgpu'

import { Precipitation } from './index'

const renderer = new WebGPURenderer()
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x2a3038) // trời xám u ám (như overcast)
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 200)
camera.position.set(0, 6, 16)
camera.lookAt(0, 4, 0)

scene.add(new THREE.HemisphereLight(0x8a96a4, 0x202a22, 1.4))
const sun = new THREE.DirectionalLight(0xc8d0da, 0.8)
sun.position.set(4, 9, 3)
scene.add(sun)

// Nền + 1 nhà hộp làm tham chiếu chiều sâu cho mưa.
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(60, 60),
  new THREE.MeshStandardMaterial({ color: 0x2e3a30, roughness: 1 })
)
ground.rotation.x = -Math.PI / 2
scene.add(ground)
const house = new THREE.Mesh(
  new THREE.BoxGeometry(6, 8, 6),
  new THREE.MeshStandardMaterial({ color: 0x6b5a48, roughness: 0.9 })
)
house.position.y = 4
scene.add(house)

const rain = new Precipitation({ mode: 'rain', count: 6000 })
scene.add(rain.getObject())
console.log('Precipitation:', rain.getCount(), 'hạt, 1 draw')

const clock = new THREE.Clock()
renderer.setAnimationLoop(() => {
  rain.update(clock.getDelta())
  renderer.render(scene, camera)
})

// Cleanup demo: rain.dispose()
