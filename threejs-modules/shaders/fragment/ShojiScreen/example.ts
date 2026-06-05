// threejs-modules/shaders/fragment/ShojiScreen/example.ts
// Standalone demo — tường shoji Nhật trên 1 plane. Chạy không cần project setup.

import * as THREE from 'three'
import { WebGPURenderer } from 'three/webgpu'

import { ShojiScreen } from './index'

const renderer = new WebGPURenderer({ antialias: false })
renderer.setSize(512, 512)

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100)
camera.position.set(0, 1.4, 3)
camera.lookAt(0, 1.4, 0)

scene.add(new THREE.DirectionalLight(0xffffff, 2.2).translateZ(3))
scene.add(new THREE.AmbientLight(0xffffff, 0.7))

const shoji = new ShojiScreen({ scale: 1 })
const wall = new THREE.Mesh(new THREE.PlaneGeometry(3, 2.8), shoji.getMaterial())
wall.position.y = 1.4
scene.add(wall)

renderer.setAnimationLoop(() => renderer.render(scene, camera))

// cleanup: shoji.dispose(); renderer.dispose()
