// threejs-modules/shaders/ground/PhotoGround/example.ts
// Standalone demo — chạy được không cần project. Texture thật do app load theo manifest; ở đây dùng
// DataTexture placeholder để minh hoạ wiring (load thật: KTX2Loader/TextureLoader theo đuôi file).

import * as THREE from 'three'
import { WebGPURenderer } from 'three/webgpu'

import { PhotoGround } from './index'

// Texture placeholder nhỏ (2×2) — caller THẬT set wrap=Repeat + colorSpace + anisotropy.
function makeTex(r: number, g: number, b: number, srgb: boolean): THREE.DataTexture {
  const data = new Uint8Array([r, g, b, 255, r, g, b, 255, r, g, b, 255, r, g, b, 255])
  const t = new THREE.DataTexture(data, 2, 2)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  t.needsUpdate = true
  return t
}

const renderer = new WebGPURenderer()
const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100)
camera.position.set(0, 6, 8)
camera.lookAt(0, 0, 0)
scene.add(new THREE.HemisphereLight(0xffffff, 0x445533, 1.2))

const baseColor = makeTex(84, 96, 41, true) // olive
const normal = makeTex(128, 128, 255, false) // flat normal
const roughness = makeTex(205, 205, 205, false)
const ao = makeTex(220, 220, 220, false)

const ground = new PhotoGround({
  maps: { baseColor, normal, roughness, ao },
  tileSizeMeters: 2,
})

const plane = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), ground.getMaterial())
plane.rotation.x = -Math.PI / 2
scene.add(plane)

void renderer.setAnimationLoop(() => renderer.render(scene, camera))

// Cleanup: caller dispose texture (PhotoGround KHÔNG đụng).
export function dispose(): void {
  ground.dispose()
  plane.geometry.dispose()
  for (const t of [baseColor, normal, roughness, ao]) t.dispose()
  renderer.dispose()
}
