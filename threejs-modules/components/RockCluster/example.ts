// threejs-modules/components/RockCluster/example.ts
// Standalone smoke — đá mỏm procedural (non bộ Phase A). Chạy độc lập, KHÔNG import project.
// Verify: thấy khối đá xếp craggy facet, đế rộng → đỉnh hẹp, có khe; xoay camera ngắm silhouette.

import * as THREE from 'three'
import { WebGPURenderer } from 'three/webgpu'

import { RockCluster } from './index'

const renderer = new WebGPURenderer()
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x9fb4c0)
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100)
camera.position.set(3.4, 2.6, 4.4)
camera.lookAt(0, 0.8, 0)

scene.add(new THREE.HemisphereLight(0xdfe9ff, 0x4a4035, 1.1))
const sun = new THREE.DirectionalLight(0xfff2d8, 1.4)
sun.position.set(4, 6, 3)
scene.add(sun)

// Nền tham chiếu (thực tế dùng terrain mound làm đế ở Phase B)
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(6, 48),
  new THREE.MeshStandardMaterial({ color: 0x6b7355, roughness: 1 })
)
ground.rotation.x = -Math.PI / 2
scene.add(ground)

const rock = new RockCluster({ footprintRadius: 1.3, height: 1.7, rockCount: 22, seed: 3 })
scene.add(rock.getMesh())
console.log('RockCluster tris:', rock.getTriangleCount())

renderer.setAnimationLoop((time?: number) => {
  rock.getMesh().rotation.y = (time ?? 0) * 0.0003
  renderer.render(scene, camera)
})

// Cleanup demo: rock.dispose()
