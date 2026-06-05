// threejs-modules/shaders/surface/TexturedSurface/example.ts
// Standalone demo — DataTexture placeholder (texture thật do app load theo manifest). 1 box xoay để thấy
// triplanar đúng mọi mặt (đỉnh ngang + cạnh dọc dùng chung 1 texture, không seam).

import * as THREE from 'three'
import { WebGPURenderer } from 'three/webgpu'

import { TexturedSurface } from './index'

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
camera.position.set(4, 4, 5)
camera.lookAt(0, 0, 0)
scene.add(new THREE.HemisphereLight(0xffffff, 0x445533, 1.2))

const baseColor = makeTex(120, 110, 90, true)
const normal = makeTex(128, 128, 255, false)
const roughness = makeTex(180, 180, 180, false)
const ao = makeTex(220, 220, 220, false)

const surf = new TexturedSurface({
  maps: { baseColor, normal, roughness, ao },
  tileSizeMeters: 1,
})

const box = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 3), surf.getMaterial())
scene.add(box)

void renderer.setAnimationLoop(() => {
  box.rotation.y += 0.005
  renderer.render(scene, camera)
})

export function dispose(): void {
  surf.dispose()
  box.geometry.dispose()
  for (const t of [baseColor, normal, roughness, ao]) t.dispose()
  renderer.dispose()
}
