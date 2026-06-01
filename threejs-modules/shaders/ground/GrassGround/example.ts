// threejs-modules/shaders/ground/GrassGround/example.ts
// Standalone demo — bãi cỏ procedural, sun + hemisphere.

import * as THREE from 'three'
import { WebGPURenderer } from 'three/webgpu'

import { GrassGround } from './index'

const renderer = new WebGPURenderer({ antialias: true })
renderer.setSize(800, 600)
document.body.appendChild(renderer.domElement)

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(60, 800 / 600, 0.1, 200)
camera.position.set(8, 6, 8)
camera.lookAt(0, 0, 0)

scene.add(new THREE.HemisphereLight(0xbcd4ff, 0x6b5240, 0.8))
const sun = new THREE.DirectionalLight(0xfff4e0, 2.0)
sun.position.set(6, 10, 4)
scene.add(sun)

const grass = new GrassGround({ scale: 1.0 })
const lawn = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), grass.getMaterial())
lawn.rotation.x = -Math.PI / 2
scene.add(lawn)

renderer.setAnimationLoop(() => {
  void renderer.renderAsync(scene, camera)
})

// Cleanup: grass.dispose(); lawn.geometry.dispose(); renderer.dispose()
