// Part builder: cửa ra vào nhà ở — trung tâm mặt trước, sát nền
import * as THREE from 'three'

import { rand } from '../rand'
import type { PartResult, Token } from '../tokens'
import { DOOR_COLORS, DOOR_DIM } from '../tokens'

export function makeDoor(t: Token, seed: number): PartResult {
  const doorColor = DOOR_COLORS[Math.floor(rand(seed + 17) * DOOR_COLORS.length)]
  const geo = new THREE.BoxGeometry(DOOR_DIM.w, DOOR_DIM.h, DOOR_DIM.d)
  const mat = new THREE.MeshToonMaterial({ color: doorColor })
  const mesh = new THREE.Mesh(geo, mat)
  // x=0: centered | y=h/2: bottom at ground level | z: mặt trước body
  mesh.position.set(0, DOOR_DIM.h / 2, t.bodyD / 2 + DOOR_DIM.d / 2)
  return { geos: [geo], mats: [mat], meshes: [mesh] }
}
