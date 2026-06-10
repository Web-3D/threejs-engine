// threejs-modules/components/BrickPaving/example.ts
// Standalone smoke — sân gạch running bond + decay. Chạy độc lập, KHÔNG import project.
// Verify: thấy sân block 200×100 so le nửa viên, khe vữa sáng đều; sân PHẢI (decay 0.45) lác đác
// viên RỤNG lộ nền + viên xoay lệch/lún/sạm. Đổi seed (dòng new BrickPaving) → viên rụng chỗ khác.

import * as THREE from 'three'
import { WebGPURenderer } from 'three/webgpu'

import { BrickPaving } from './index'

const renderer = new WebGPURenderer()
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x9fb4c0)
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100)
camera.position.set(4.2, 4.6, 6)
camera.lookAt(0, 0, 0)

scene.add(new THREE.HemisphereLight(0xdfe9ff, 0x4a4035, 1.1))
const sun = new THREE.DirectionalLight(0xfff2d8, 1.5)
sun.position.set(4, 6, 3)
sun.castShadow = true
scene.add(sun)

// Nền cỏ tham chiếu
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(12, 8),
  new THREE.MeshStandardMaterial({ color: 0x4a7c3a, roughness: 1 })
)
ground.rotation.x = -Math.PI / 2
ground.receiveShadow = true
scene.add(ground)

// Trái: sân MỚI (decay 0) — Phải: sân CŨ (decay 0.45, mất viên + lệch + sạm)
const fresh = new BrickPaving({ frameW: 4, frameD: 3, seed: 7 })
fresh.getMesh().position.set(-2.6, 0, 0)
scene.add(fresh.getMesh())

const aged = new BrickPaving({ frameW: 4, frameD: 3, seed: 7, decay: 0.45 })
aged.getMesh().position.set(2.6, 0, 0)
scene.add(aged.getMesh())

renderer.setAnimationLoop(() => renderer.render(scene, camera))

document.body.appendChild(renderer.domElement)
renderer.setSize(800, 600)
