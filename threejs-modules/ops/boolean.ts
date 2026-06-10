/**
 * VỊ TRÍ   — threejs-modules/ops/boolean.ts
 * VAI TRÒ  — OP #6 thư viện ops (Houdini Boolean SOP): union/subtract/intersect 2 BufferGeometry —
 *            wrap `three-bvh-csg` (A-wrap theo catalog: wrap lib sẵn, KHÔNG tự viết CSG). Dùng khoét
 *            cửa/lỗ vào khối kiến trúc (tường hồi mái, ban công, tường, cửa sổ…).
 * LIÊN HỆ  — Consumer đầu: roof-preview.ts tường hồi EWG/FXH khoét cửa tròn. Catalog op:
 *            Factory/deferred/houdini-algorithms.md (mục 1 Boolean — A-wrap).
 *            PIN three-bvh-csg@0.0.17: bản 0.0.18 đòi three ≥0.179 (mình 0.174). Nâng three rồi mới nâng.
 *
 * CÁCH DÙNG: const geo = booleanGeometry(wallGeo, holeGeo, 'subtract')
 *            // 2 geometry phải CÙNG KHÔNG GIAN (caller bake transform bằng applyMatrix4 trước)
 * DISPOSE: geometry TRẢ VỀ là mới — caller sở hữu + dispose; 2 geometry input KHÔNG bị đụng.
 */

import type * as THREE from 'three'
import { ADDITION, Brush, Evaluator, INTERSECTION, SUBTRACTION } from 'three-bvh-csg'

export type BooleanOp = 'union' | 'subtract' | 'intersect'

const OP_MAP = {
  union: ADDITION,
  subtract: SUBTRACTION,
  intersect: INTERSECTION,
} as const

// Evaluator dùng lại 1 instance (giữ pool tam giác nội bộ — rẻ hơn new mỗi lần gọi).
const evaluator = new Evaluator()

// Boolean 2 geometry trong CÙNG không gian → geometry MỚI (input giữ nguyên).
// - attributes: chỉ xử lý attr CẢ HAI bên cùng có (position/normal/uv) — lệch bộ attr (sweep không uv
//   vs cylinder có uv) mà để default là three-bvh-csg throw.
// - useGroups=false: trả 1 geometry liền KHÔNG group/multi-material — op thuần hình học, material caller lo.
export function booleanGeometry(
  a: THREE.BufferGeometry,
  b: THREE.BufferGeometry,
  op: BooleanOp
): THREE.BufferGeometry {
  const brushA = new Brush(a)
  const brushB = new Brush(b)
  brushA.updateMatrixWorld() // csg đọc matrixWorld — identity nhưng PHẢI cập nhật trước evaluate
  brushB.updateMatrixWorld()
  evaluator.useGroups = false
  evaluator.attributes = ['position', 'normal', 'uv'].filter(
    (name) => a.getAttribute(name) !== undefined && b.getAttribute(name) !== undefined
  )
  const result = evaluator.evaluate(brushA, brushB, OP_MAP[op])
  const geo = result.geometry
  // Brush extends Mesh — không giữ tham chiếu: cache BVH/half-edge nội bộ xả để khỏi níu geometry input
  brushA.disposeCacheData()
  brushB.disposeCacheData()
  return geo
}
