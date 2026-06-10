// threejs-modules/components/CurvedBrickWall/example.ts
// Standalone smoke — tường gạch cong + decay. Chạy độc lập, KHÔNG import project.
// Verify: tường TRÁI (cung 120°, mới) viên bond so le đều dọc cung, nhô CẢ 2 mặt, thân vữa lộ ở mạch;
// tường PHẢI (vòng 300°, decay 0.45) lác đác viên rụng TRÙNG CHỖ 2 mặt (vết tróc) + viên thụt/sạm.
// Đổi seed (dòng new CurvedBrickWall) → viên rụng chỗ khác.

import * as THREE from 'three'
import { WebGPURenderer } from 'three/webgpu'

import { CurvedBrickWall } from './index'

const renderer = new WebGPURenderer()
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x9fb4c0)
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100)
camera.position.set(5, 4.5, 7)
camera.lookAt(0, 0.6, 0)

scene.add(new THREE.HemisphereLight(0xdfe9ff, 0x4a4035, 1.1))
const sun = new THREE.DirectionalLight(0xfff2d8, 1.5)
sun.position.set(4, 6, 3)
sun.castShadow = true
scene.add(sun)

// Nền cỏ tham chiếu
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(14, 10),
  new THREE.MeshStandardMaterial({ color: 0x4a7c3a, roughness: 1 })
)
ground.rotation.x = -Math.PI / 2
ground.receiveShadow = true
scene.add(ground)

// Trái: cung 120° MỚI — Phải: vòng 300° CŨ (decay 0.45)
const fresh = new CurvedBrickWall({ radius: 2, sweepDeg: 120, height: 1.1, seed: 7 })
fresh.getMesh().position.set(-3.2, 0, 0)
scene.add(fresh.getMesh())

const aged = new CurvedBrickWall({ radius: 1.6, sweepDeg: 300, height: 0.9, seed: 7, decay: 0.45 })
aged.getMesh().position.set(3.2, 0, 0)
scene.add(aged.getMesh())

renderer.setAnimationLoop(() => renderer.render(scene, camera))

document.body.appendChild(renderer.domElement)
renderer.setSize(800, 600)
