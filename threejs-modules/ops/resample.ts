/**
 * VỊ TRÍ   — threejs-modules/ops/resample.ts
 * VAI TRÒ  — OP #1 thư viện ops (Houdini Resample SOP): chia lại curve ĐỀU theo CHIỀU DÀI THẬT (arc-length).
 *            Lý do: chia theo tham số t (t-đều) KHÔNG cho đốt đều — Bézier dồn điểm về phía control point
 *            → đốt ở mũi cong gắt ngắn hơn đốt giữa. Resample sửa tận gốc bằng bảng chiều dài tích lũy.
 * LIÊN HỆ  — roof-lab.ts (eaveBoundary/hipBoundary — lưới mặt mái) + roof-preview.ts (xà góc, đường hiên,
 *            marker I/J/X1/Y1). Catalog op: Factory/deferred/houdini-algorithms.md (thứ tự ưu tiên #1).
 *
 * CÁCH DÙNG: const al = arcLength((t) => qbez(P0, P1, P2, t))
 *            al.pointAt(0.5)        → TRUNG ĐIỂM THẬT theo chiều dài (không phải t=0.5)
 *            resampleCurve(fn, n)   → n+1 điểm cách đều theo chiều dài (2 đầu giữ nguyên)
 * DISPOSE: không giữ tài nguyên GPU — pure math.
 */

import type * as THREE from 'three'

// Số mẫu dựng bảng chiều dài tích lũy. 64 đủ mịn cho curve bậc 2 cỡ mái (sai số << 1 đốt);
// tăng nếu sau này có curve dài/xoắn nhiều bậc.
const TABLE_SAMPLES = 64

export interface ArcLengthCurve {
  length: number // tổng chiều dài curve (xấp xỉ chord)
  tAt: (f: number) => number // fraction CHIỀU DÀI (0..1) → tham số t gốc của curve
  pointAt: (f: number) => THREE.Vector3 // fraction chiều dài → điểm trên curve
}

// Bảng arc-length: lấy mẫu cumulative chord-length rồi NGHỊCH ĐẢO (binary search + nội suy tuyến tính)
// — đúng kỹ thuật chuẩn CAD/Houdini resample. Curve suy biến (dài ≈ 0) → fallback t-đều, không chia 0.
export function arcLength(
  curve: (t: number) => THREE.Vector3,
  samples = TABLE_SAMPLES
): ArcLengthCurve {
  const cum = new Float32Array(samples + 1) // cum[i] = chiều dài từ t=0 tới t=i/samples
  let prev = curve(0)
  for (let i = 1; i <= samples; i++) {
    const p = curve(i / samples)
    cum[i] = cum[i - 1] + p.distanceTo(prev)
    prev = p
  }
  const total = cum[samples]
  const tAt = (f: number): number => {
    if (total <= 1e-9) return f // suy biến → coi như t-đều
    const target = Math.min(1, Math.max(0, f)) * total
    let lo = 0
    let hi = samples
    while (lo < hi) {
      // tìm mẫu đầu tiên có cum ≥ target
      const mid = (lo + hi) >> 1
      if (cum[mid] < target) lo = mid + 1
      else hi = mid
    }
    if (lo === 0) return 0
    const seg = cum[lo] - cum[lo - 1]
    const within = seg > 1e-9 ? (target - cum[lo - 1]) / seg : 0 // nội suy trong đoạn mẫu
    return (lo - 1 + within) / samples
  }
  return { length: total, tAt, pointAt: (f) => curve(tAt(f)) }
}

// Resample curve thành n+1 điểm CÁCH ĐỀU theo chiều dài (điểm đầu/cuối = 2 đầu curve gốc).
export function resampleCurve(
  curve: (t: number) => THREE.Vector3,
  n: number,
  samples = TABLE_SAMPLES
): THREE.Vector3[] {
  const al = arcLength(curve, samples)
  const pts: THREE.Vector3[] = []
  for (let i = 0; i <= n; i++) pts.push(al.pointAt(i / n))
  return pts
}
