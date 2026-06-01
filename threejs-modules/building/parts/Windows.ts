// Part builder: 4 residential windows (2 per floor, front face)
import * as THREE from 'three'

import type { PartResult, Token } from '../tokens'
import { WIN_COLOR, WIN_DIM } from '../tokens'

// Tầng 1: y=1.5, x=±2.2 | Tầng 2: y=4.0, x=±2.2
// Dùng chung 1 geo + 1 mat cho cả 4 mesh → tiết kiệm GPU object
export function makeResidentialWindows(t: Token): PartResult {
  const geo = new THREE.BoxGeometry(WIN_DIM.w, WIN_DIM.h, WIN_DIM.d)
  const mat = new THREE.MeshToonMaterial({ color: WIN_COLOR })
  const fz = t.bodyD / 2 + WIN_DIM.d / 2

  const positions: [number, number][] = [
    [-2.2, 1.5],
    [2.2, 1.5], // tầng 1
    [-2.2, 4.0],
    [2.2, 4.0], // tầng 2
  ]

  const meshes = positions.map(([x, y]) => {
    const m = new THREE.Mesh(geo, mat)
    m.position.set(x, y, fz)
    return m
  })

  return { geos: [geo], mats: [mat], meshes }
}
