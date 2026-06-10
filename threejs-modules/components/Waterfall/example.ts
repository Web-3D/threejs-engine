// threejs-modules/components/Waterfall/example.ts
// Standalone smoke — TƯỜNG đá + thác nước chảy xuống bể (đúng kịch bản test Phase A: "dựng tường trước").
// Verify xoay-ngắm: sọc foam trắng CUỘN XUỐNG liên tục, màn vọt nhẹ ở mép rồi thẳng dần (parabol √t),
// càng xuống chân càng TRẮNG (sủi), mist bốc lên ở chân, mép trái/phải mờ mềm. Nhìn từ SAU vẫn thấy màn.

import * as THREE from 'three'
import { WebGPURenderer } from 'three/webgpu'

import { Waterfall } from './index'

const renderer = new WebGPURenderer()
const scene = new THREE.Scene()
scene.background = new THREE.Color(0xa8c4d4)
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100)
camera.position.set(2.6, 2.2, 4.6)
camera.lookAt(0, 0.9, 0)

scene.add(new THREE.HemisphereLight(0xdfe9ff, 0x4a4035, 1.1))
const sun = new THREE.DirectionalLight(0xfff2d8, 1.5)
sun.position.set(4, 6, 3)
scene.add(sun)

// Nền + TƯỜNG đỡ thác (Phase B thật: tường = vách đá Houdini-bake / G-level wall)
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(10, 10),
  new THREE.MeshStandardMaterial({ color: 0x5d7a4e, roughness: 1 })
)
ground.rotation.x = -Math.PI / 2
scene.add(ground)

const wall = new THREE.Mesh(
  new THREE.BoxGeometry(3.2, 1.8, 0.35),
  new THREE.MeshStandardMaterial({ color: 0x8a8278, roughness: 0.95 })
)
wall.position.set(0, 0.9, -0.18) // mặt trước tường tại z≈0
scene.add(wall)

// Bể nhận nước dưới chân (tham chiếu thị giác — Phase B = pond WaterSurface thật)
const pool = new THREE.Mesh(
  new THREE.CircleGeometry(1.4, 32),
  new THREE.MeshStandardMaterial({ color: 0x254a59, roughness: 0.35 })
)
pool.rotation.x = -Math.PI / 2
pool.position.set(0, 0.005, 0.7)
scene.add(pool)

const wf = new Waterfall({ width: 2, height: 1.8, arc: 0.28 })
wf.getGroup().position.set(0, 1.8, 0.01) // gốc = TÂM MÉP TRÊN, đặt tại mép đỉnh tường
scene.add(wf.getGroup())
console.log('Waterfall tris:', wf.getTriangleCount())

renderer.setAnimationLoop((time?: number) => {
  wf.setTime((time ?? 0) / 1000)
  renderer.render(scene, camera)
})

// Cleanup demo: wf.dispose()
