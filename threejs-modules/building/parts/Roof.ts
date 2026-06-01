// Part builder: kirizuma-zukuri gabled roof (triangular prism)
import * as THREE from 'three'

import type { BuildingToken, PartResult } from '../tokens'
import { ROOF_COLOR } from '../tokens'

// Ridge dọc Z, mái dốc ±X. Base tại y=0 — caller đặt position.y = bodyH.
function makeRoofGeo(w: number, h: number, d: number): THREE.BufferGeometry {
  const hw = w / 2,
    hd = d / 2

  // prettier-ignore
  const pos = new Float32Array([
    -hw, 0, -hd,  // 0: back bottom left
     hw, 0, -hd,  // 1: back bottom right
      0, h, -hd,  // 2: back peak
    -hw, 0,  hd,  // 3: front bottom left
     hw, 0,  hd,  // 4: front bottom right
      0, h,  hd,  // 5: front peak
  ])

  // prettier-ignore
  const idx = [
    0, 2, 1,             // back gable
    3, 4, 5,             // front gable
    0, 3, 2,  2, 3, 5,  // left slope
    1, 2, 4,  2, 5, 4,  // right slope
  ]

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  return geo
}

export function makeGabledRoof(t: BuildingToken): PartResult {
  const geo = makeRoofGeo(t.roofW, t.roofH, t.roofD)
  // polygonOffset: roof base flush với yPos của eave → roof nhường depth cho eave
  const mat = new THREE.MeshToonMaterial({
    color: ROOF_COLOR,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.position.y = t.bodyH
  mesh.castShadow = true
  return { geos: [geo], mats: [mat], meshes: [mesh] }
}
