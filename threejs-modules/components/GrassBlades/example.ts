// threejs-modules/components/GrassBlades/example.ts
// Standalone smoke — cỏ 3D instanced + vertex-wind. Chạy độc lập, không import project.

import * as THREE from 'three'
import { WebGPURenderer } from 'three/webgpu'

import { GrassBlades } from './index'

const renderer = new WebGPURenderer()
const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100)
camera.position.set(0, 1.4, 6)

scene.add(new THREE.HemisphereLight(0xbfd8ff, 0x35502a, 1.2))

// Nền mặt phẳng tham chiếu (thực tế dùng GrassGround tier A làm nền)
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(12, 9.6),
  new THREE.MeshStandardMaterial({ color: 0x3a5a25 })
)
ground.rotation.x = -Math.PI / 2
scene.add(ground)

const grass = new GrassBlades({ width: 12, depth: 9.6, baseY: 0.0, density: 120 })
scene.add(grass.getMesh())
console.log('GrassBlades count:', grass.getCount())

renderer.setAnimationLoop(() => renderer.render(scene, camera)) // wind chạy theo built-in time

// Cleanup demo: grass.dispose()
