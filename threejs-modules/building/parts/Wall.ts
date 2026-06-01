// Part builder: body geometry + wall material
import * as THREE from 'three'

import type { BuildingToken, PartResult } from '../tokens'
import { WALL_COLORS } from '../tokens'

export function makeWall(t: BuildingToken, colorIdx: number): PartResult {
  const geo = new THREE.BoxGeometry(t.bodyW, t.bodyH, t.bodyD)
  const mat = new THREE.MeshToonMaterial({
    color: WALL_COLORS[colorIdx % WALL_COLORS.length],
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.position.y = t.bodyH / 2
  mesh.castShadow = true
  mesh.receiveShadow = true
  return { geos: [geo], mats: [mat], meshes: [mesh] }
}
