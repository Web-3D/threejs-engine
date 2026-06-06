/**
 * VỊ TRÍ   — threejs-modules/site/shapes.ts  (site-kit)
 * VAI TRÒ  — Tessellate shape hồ/layer (rect | circle | ellipse | free-bezier) → polygon LOCAL (mét, tâm gốc)
 *            + offsetPolygon (inflate vành coping/carve bám đường cong). 1 NGUỒN shape→polygon.
 * LIÊN HỆ  — Dùng bởi pondWorldXZ (world poly cho basin/lỗ-nền/carve/foundation), buildWater (points WaterSurface),
 *            waterDrag (setShape live), layerGeometry (Phase 2). Đổi 1 chỗ này = mọi consumer theo đường cong.
 *
 * CÁCH DÙNG: shapeToLocalPolygon(spec) → {x,z}[] mét (chưa cộng offset); offsetPolygon(poly, dist) inflate ra ngoài.
 * DISPOSE: thuần hàm — không giữ GPU resource.
 */

import * as THREE from 'three'

export type ShapeKind = 'rect' | 'circle' | 'ellipse' | 'free'

// Đỉnh polygon free (mm, LOCAL so tâm) + tay-cầm bezier offset (mm so anchol). Thiếu cả 2 tay-cầm 1 đoạn → THẲNG.
export interface ShapePoint {
  x: number
  z: number
  inX?: number // tay-cầm VÀO (offset mm so anchor) — điều khiển tiếp tuyến cạnh tới đỉnh
  inZ?: number
  outX?: number // tay-cầm RA — tiếp tuyến cạnh rời đỉnh
  outZ?: number
}

// Tối thiểu field để tessellate — WaterConfig + GroundLayer đều thoả (structural). width/depth: mm (rect/ellipse 2
// trục, circle = min). points: chỉ 'free' dùng.
export interface ShapeSpec {
  shape: ShapeKind
  width: number
  depth: number
  points: ShapePoint[]
}

const CIRCLE_SEG = 48 // số đoạn tròn/ellipse (đủ mượt, geometry rẻ)
const BEZIER_SEG = 16 // số đoạn mỗi cạnh bezier

// Shape → polygon LOCAL (mét, tâm tại gốc, CHƯA cộng offset). Consumer tự khép kín (không lặp đỉnh đầu ở cuối).
export function shapeToLocalPolygon(s: ShapeSpec): { x: number; z: number }[] {
  if (s.shape === 'circle' || s.shape === 'ellipse') return ellipsePolygon(s)
  if (s.shape === 'free' && s.points.length >= 3) return freePolygon(s.points)
  return rectPolygon(s) // rect HOẶC free<3 đỉnh (fallback rect như cũ)
}

function rectPolygon(s: ShapeSpec): { x: number; z: number }[] {
  const hw = s.width / 2000 // mm→m, nửa
  const hd = s.depth / 2000
  return [
    { x: -hw, z: -hd },
    { x: hw, z: -hd },
    { x: hw, z: hd },
    { x: -hw, z: hd },
  ]
}

// Tròn/ellipse qua EllipseCurve (CCW). getPoints(N) trả N+1 điểm (đỉnh đầu lặp cuối) → bỏ điểm cuối.
function ellipsePolygon(s: ShapeSpec): { x: number; z: number }[] {
  const circle = s.shape === 'circle'
  const rx = (circle ? Math.min(s.width, s.depth) : s.width) / 2000
  const rz = (circle ? Math.min(s.width, s.depth) : s.depth) / 2000
  const curve = new THREE.EllipseCurve(0, 0, rx, rz, 0, Math.PI * 2, false, 0)
  return curve
    .getPoints(CIRCLE_SEG)
    .slice(0, CIRCLE_SEG)
    .map((p) => ({ x: p.x, z: p.y }))
}

// free: vòng kín, mỗi đoạn anchor_i→anchor_{i+1}. Có tay-cầm (out_i hoặc in_{i+1}) → CubicBezier; else THẲNG.
function freePolygon(pts: ShapePoint[]): { x: number; z: number }[] {
  if (pts.length < 3) return pts.map((p) => ({ x: p.x / 1000, z: p.z / 1000 }))
  const out: { x: number; z: number }[] = []
  for (let i = 0; i < pts.length; i++) pushSegment(out, pts[i], pts[(i + 1) % pts.length])
  return out
}

// 1 đoạn a→b: đẩy điểm từ a (gồm) ĐẾN trước b (b là đầu đoạn kế). Thẳng → chỉ anchor a; cong → mẫu bezier.
function pushSegment(out: { x: number; z: number }[], a: ShapePoint, b: ShapePoint): void {
  const ax = a.x / 1000
  const az = a.z / 1000
  const hasOut = a.outX !== undefined || a.outZ !== undefined
  const hasIn = b.inX !== undefined || b.inZ !== undefined
  if (!hasOut && !hasIn) {
    out.push({ x: ax, z: az })
    return
  }
  const curve = new THREE.CubicBezierCurve(
    new THREE.Vector2(ax, az),
    new THREE.Vector2(ax + (a.outX ?? 0) / 1000, az + (a.outZ ?? 0) / 1000),
    new THREE.Vector2(b.x / 1000 + (b.inX ?? 0) / 1000, b.z / 1000 + (b.inZ ?? 0) / 1000),
    new THREE.Vector2(b.x / 1000, b.z / 1000)
  )
  const seg = curve.getPoints(BEZIER_SEG) // N+1 điểm gồm a..b
  for (let k = 0; k < seg.length - 1; k++) out.push({ x: seg[k].x, z: seg[k].y }) // bỏ b
}

// Inflate polygon ra NGOÀI `dist` mét theo pháp-tuyến đỉnh (miter = TB normal 2 cạnh kề ÷ cos nửa-góc). Tự dò
// winding (signed area) → luôn nở ra ngoài. Đủ cho convex + concave nhẹ (blob hồ/vườn); góc nhọn clamp miter.
export function offsetPolygon(
  poly: { x: number; z: number }[],
  dist: number
): { x: number; z: number }[] {
  const n = poly.length
  if (n < 3 || dist === 0) return poly.map((p) => ({ ...p }))
  const sign = signedArea(poly) > 0 ? 1 : -1 // CCW → normal RA NGOÀI = (dz,-dx); CW → đảo
  const en = poly.map((a, i) => {
    const b = poly[(i + 1) % n]
    const dx = b.x - a.x
    const dz = b.z - a.z
    const len = Math.hypot(dx, dz) || 1
    return { x: (sign * dz) / len, z: (-sign * dx) / len }
  })
  return poly.map((p, i) => {
    const e0 = en[(i + n - 1) % n] // cạnh TỚI đỉnh
    const e1 = en[i] // cạnh TỪ đỉnh
    let nx = e0.x + e1.x
    let nz = e0.z + e1.z
    const len = Math.hypot(nx, nz) || 1
    nx /= len
    nz /= len
    const scale = dist / Math.max(0.25, nx * e1.x + nz * e1.z) // miter ÷ cos(nửa-góc), clamp tránh spike
    return { x: p.x + nx * scale, z: p.z + nz * scale }
  })
}

function signedArea(poly: { x: number; z: number }[]): number {
  let a = 0
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]
    const q = poly[(i + 1) % poly.length]
    a += p.x * q.z - q.x * p.z
  }
  return a / 2
}
