/**
 * example.ts — demo standalone InstancedBrickWall (chạy độc lập, không import project).
 * Dựng 1 mặt tường gạch thật 8×3m, log số viên + triangle để đo budget.
 */

import * as THREE from 'three'

import { InstancedBrickWall } from './index'

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100)
camera.position.set(0, 1.5, 6)

const sun = new THREE.DirectionalLight(0xffffff, 2)
sun.position.set(4, 6, 5)
sun.castShadow = true
scene.add(sun, new THREE.HemisphereLight(0xbcd4ff, 0x6b5240, 0.6))

// Tường gạch thật 8×3m, chuẩn UK (mặc định), 1 cửa sổ cull gạch
const wall = new InstancedBrickWall({
  width: 8,
  height: 3,
  openings: [{ x: 2.5, y: 0.9, w: 1.5, h: 1.3 }],
})
scene.add(wall.getGroup())

console.log(
  `InstancedBrickWall: ${wall.getBrickCount()} viên, ${wall.getTriangleCount()} triangles`
)

// Dọn dẹp khi cần
export function cleanup(): void {
  wall.dispose()
}
