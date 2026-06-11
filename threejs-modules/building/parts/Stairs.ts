/**
 * VỊ TRÍ   — building-kit/parts/Stairs.ts
 * VAI TRÒ  — ArchPlanLab positioned stairs: N bậc box dần lên, 1 tầng, xoay tự do quanh Y. 5 style:
 *            solid (bê tông đặc) · wood-plank (ván đà-bên) · wood-float (ván nổi) · wood-center
 *            (ván đà-GIỮA) · glass-metal (kính + đà kim-loại GIỮA).
 * LIÊN HỆ  — Tách từ parts/Structure.ts (part-builder độc lập — tự chứa, chỉ THREE + PartResult).
 *            Consumer: building/render/fromState (makePositionedStairs, re-export barrel qua Structure).
 *            Outer group: world + rotation.y=rotY (theo shape). Inner group: tại tâm footprint local +
 *            rotation.y=rotDeg → bậc dựng dọc +X inner. Footprint (runL×width) chiếu thẳng lên Y = lỗ slab
 *            tầng trên.
 * DISPOSE: trả geos/mats qua PartResult — caller (_clearParts) quản lý.
 */

import * as THREE from 'three'

import type { PartResult } from '../tokens'

const COL_STAIRS = 0xb0a89c // bê tông bậc thang xám ấm

export interface PositionedStairsOpts {
  localX: number // m — footprint center, local to shape center (trước rotation shape)
  localZ: number
  runL: number // m — chiều dài chạy bậc (dọc +X cục bộ trước khi xoay rotDeg)
  width: number // m — bề rộng cầu thang
  totalH: number // m — chiều cao leo (1 tầng)
  steps: number
  rotDeg: number // độ — xoay cầu thang quanh Y, quanh tâm footprint
  worldX: number // m — tâm shape (world)
  worldZ: number
  rotY: number // deg — rotation của shape
  yBase: number // m — cao độ sàn (đáy bậc)
  style?: 'solid' | 'wood-plank' | 'wood-float' | 'wood-center' | 'glass-metal' // #8: đặc | ván gỗ đà-bên | gỗ nổi | gỗ đà-GIỮA | kính + đà kim-loại GIỮA
}

// #8 Bậc ĐẶC (bê tông): mỗi bậc box từ SÀN lên mặt bậc → khối liền. (kiểu mặc định cũ)
function solidStepGeos(
  inner: THREE.Group,
  mat: THREE.Material,
  opts: PositionedStairsOpts,
  n: number,
  riser: number,
  tread: number
): THREE.BufferGeometry[] {
  const geos: THREE.BufferGeometry[] = []
  for (let i = 0; i < n; i++) {
    const stepH = (i + 1) * riser
    const ax = -opts.runL / 2 + (i + 0.5) * tread
    const geo = new THREE.BoxGeometry(tread, stepH, opts.width)
    geos.push(geo)
    const m = new THREE.Mesh(geo, mat)
    m.position.set(ax, stepH / 2, 0)
    m.castShadow = true
    m.receiveShadow = true
    inner.add(m)
  }
  return geos
}

// #8 Bậc VÁN MỎNG xếp dần (gỗ/kính): mỗi bậc 1 tấm ~40mm ở cao độ bậc (hở dưới = open riser).
// stringerPos: 'none' (ván nổi) | 'side' (2 đà 2 BÊN) | 'center' (2 đà sát TÂM cách 1 khe nhỏ ~100mm — nghệ thuật).
// treadMat (gỗ/kính) + stringerMat (gỗ/kim loại) RIÊNG → kiểu kính+kim-loại.
function plankStairGeos(
  inner: THREE.Group,
  treadMat: THREE.Material,
  stringerMat: THREE.Material,
  opts: PositionedStairsOpts,
  rt: { n: number; riser: number; tread: number },
  stringerPos: 'none' | 'side' | 'center'
): THREE.BufferGeometry[] {
  const geos: THREE.BufferGeometry[] = []
  const plankT = 0.04 // ván dày 40mm
  for (let i = 0; i < rt.n; i++) {
    const ax = -opts.runL / 2 + (i + 0.5) * rt.tread
    const geo = new THREE.BoxGeometry(rt.tread, plankT, opts.width)
    geos.push(geo)
    const m = new THREE.Mesh(geo, treadMat)
    m.position.set(ax, (i + 1) * rt.riser - plankT / 2, 0) // mặt ván tại cao độ bậc
    m.castShadow = true
    m.receiveShadow = true
    inner.add(m)
  }
  if (stringerPos === 'none') return geos
  const len = Math.hypot(opts.runL, opts.totalH) // đà chạy chéo sàn→đỉnh
  const ang = Math.atan2(opts.totalH, opts.runL)
  const strT = 0.04
  const zpos = stringerPos === 'side' ? opts.width / 2 - strT / 2 : 0.07 // center: 2 đà cách tâm 70mm (khe ~100mm)
  for (const sz of [-1, 1]) {
    const geo = new THREE.BoxGeometry(len, 0.14, strT)
    geo.rotateZ(ang)
    geos.push(geo)
    const m = new THREE.Mesh(geo, stringerMat)
    m.position.set(0, opts.totalH / 2, sz * zpos)
    m.castShadow = true
    m.receiveShadow = true
    inner.add(m)
  }
  return geos
}

// Vật liệu bậc: gỗ (toon nâu) · kính (trong mờ xanh) · kim loại (metalness cao).
function stairWoodMat(): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({
    color: 0x9b6b43,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  })
}
function stairGlassMat(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0xbfe0ee,
    transparent: true,
    opacity: 0.34,
    roughness: 0.08,
    metalness: 0,
  })
}
function stairMetalMat(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: 0x8a8f94, metalness: 0.9, roughness: 0.35 })
}

// Map style → vị trí đà: nổi (none) | 2 bên (side) | 2 giữa (center, gồm wood-center + glass-metal).
function stringerPosOf(style: string): 'none' | 'side' | 'center' {
  if (style === 'wood-float') return 'none'
  if (style === 'wood-plank') return 'side'
  return 'center' // wood-center, glass-metal
}

export function makePositionedStairs(opts: PositionedStairsOpts): PartResult {
  const outer = new THREE.Group()
  outer.position.set(opts.worldX, opts.yBase, opts.worldZ)
  outer.rotation.y = (opts.rotY * Math.PI) / 180
  const inner = new THREE.Group()
  inner.position.set(opts.localX, 0, opts.localZ)
  inner.rotation.y = (opts.rotDeg * Math.PI) / 180
  outer.add(inner)

  const style = opts.style ?? 'solid'
  const n = Math.max(2, Math.round(opts.steps))
  const rt = { n, riser: opts.totalH / n, tread: opts.runL / n }

  if (style === 'solid') {
    const mat = new THREE.MeshToonMaterial({
      color: COL_STAIRS,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    })
    return {
      geos: solidStepGeos(inner, mat, opts, n, rt.riser, rt.tread),
      mats: [mat],
      meshes: [outer],
    }
  }
  // ván: mặt = gỗ/kính, đà = gỗ/kim loại theo style. Gỗ dùng CHUNG 1 material cho mặt + đà.
  const treadMat = style === 'glass-metal' ? stairGlassMat() : stairWoodMat()
  const stringerMat = style === 'glass-metal' ? stairMetalMat() : treadMat
  const geos = plankStairGeos(inner, treadMat, stringerMat, opts, rt, stringerPosOf(style))
  const mats = stringerMat === treadMat ? [treadMat] : [treadMat, stringerMat]
  return { geos, mats, meshes: [outer] }
}
