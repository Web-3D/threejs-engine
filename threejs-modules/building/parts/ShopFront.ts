// Part builder: shop facade — kính lớn + biển hiệu màu anime thập niên 70
import * as THREE from 'three'

import { rand } from '../rand'
import type { PartResult, Token } from '../tokens'
import { SHOP_WIN_DIM, SIGN_COLORS, SIGN_DIM, WIN_COLOR } from '../tokens'

export function makeShopFront(t: Token, seed: number): PartResult {
  const fz = t.bodyD / 2

  const winGeo = new THREE.BoxGeometry(SHOP_WIN_DIM.w, SHOP_WIN_DIM.h, SHOP_WIN_DIM.d)
  const winMat = new THREE.MeshToonMaterial({ color: WIN_COLOR })
  const winMesh = new THREE.Mesh(winGeo, winMat)
  winMesh.position.set(0, 1.1, fz + SHOP_WIN_DIM.d / 2)

  const signColor = SIGN_COLORS[Math.floor(rand(seed + 11) * SIGN_COLORS.length)]
  const signGeo = new THREE.BoxGeometry(SIGN_DIM.w, SIGN_DIM.h, SIGN_DIM.d)
  const signMat = new THREE.MeshToonMaterial({ color: signColor })
  const signMesh = new THREE.Mesh(signGeo, signMat)
  signMesh.position.set(0, t.bodyH - 0.55, fz + SIGN_DIM.d / 2)

  return {
    geos: [winGeo, signGeo],
    mats: [winMat, signMat],
    meshes: [winMesh, signMesh],
  }
}
