// threejs-modules/components/StoneScatter/example.ts
// Standalone smoke — rải đá tròn/ellipse Poisson trong khuôn vô hình. Chạy độc lập, KHÔNG import project.
// Verify: thấy các phiến đá dẹt tròn/ellipse rải ĐỀU trong ô vuông, có KHE cỏ giữa các phiến, KHÔNG chạm nhau.
// Xoay camera ngắm: phiến to-nhỏ xen kẽ, mép khuôn ~vuông; đổi seed (dòng new StoneScatter) → layout khác.

import * as THREE from 'three'
import { WebGPURenderer } from 'three/webgpu'

import { StoneScatter } from './index'

const renderer = new WebGPURenderer()
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x9fb4c0)
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100)
camera.position.set(3.6, 4.2, 5.2)
camera.lookAt(0, 0, 0)

scene.add(new THREE.HemisphereLight(0xdfe9ff, 0x4a4035, 1.1))
const sun = new THREE.DirectionalLight(0xfff2d8, 1.5)
sun.position.set(4, 6, 3)
sun.castShadow = true
scene.add(sun)

// Nền cỏ tham chiếu (G0) — thực tế dùng GrassGround/terrain ở Phase B
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(8, 8),
  new THREE.MeshStandardMaterial({ color: 0x4a7c3a, roughness: 1 })
)
ground.rotation.x = -Math.PI / 2
ground.receiveShadow = true
scene.add(ground)

const field = new StoneScatter({ frameW: 4, frameD: 4, seed: 1 })
scene.add(field.getMesh())
console.log('StoneScatter stones:', field.getStoneCount(), 'tris:', field.getTriangleCount())

renderer.setAnimationLoop((time?: number) => {
  scene.rotation.y = (time ?? 0) * 0.0002
  renderer.render(scene, camera)
})

// Cleanup demo: field.dispose()
