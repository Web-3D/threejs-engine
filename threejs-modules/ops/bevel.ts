/**
 * VỊ TRÍ   — threejs-modules/ops/bevel.ts
 * VAI TRÒ  — OP #4 thư viện ops (Houdini PolyBevel — đường RẺ "bevel-at-generation"), 2 BIẾN THỂ cùng
 *            công thức bo góc (lùi r dọc 2 cạnh kề + Bézier bậc 2 control = đỉnh):
 *            • bevelProfile — vát góc TIẾT DIỆN 2D (polygon KÍN) trước khi sweep (#2) → thân gỗ hết cạnh sắc giả.
 *            • filletSpine  — bo góc ĐƯỜNG ĐI 3D (polyline HỞ) trước khi sweep → 2 thanh gặp nhau thành
 *              1 THÂN LIỀN gối cong, hết mối ghép đâm xuyên (sinh đôi 3D của bevelProfile).
 *            Bevel mesh TỔNG QUÁT (cạnh 3D bất kỳ) khó hơn nhiều — hộp/xà của mình TỰ SINH nên vát lúc sinh là đủ.
 * LIÊN HỆ  — ops/sweep.ts (rectProfile → bevelProfile → sweepInto; filletSpine → spine → sweepInto).
 *            Consumer: roof-preview setCornerBeams (4 xà góc) + _buildRails (thanh sống hip/WX) +
 *            roof-lab peakFrameRails (khung hồi E→W→G / F→X→H gối bo). Catalog: houdini-algorithms.md (#4).
 *
 * CÁCH DÙNG: const prof = bevelProfile(rectProfile(0.04, 0.06, true), 0.008, 2) // vát 8mm, bo 2 đoạn
 *            const spine = filletSpine([E, W, G], 0.2, 6) // gối bo R20cm tại W
 *            sweepInto(pos, idx, spine, prof, {...})
 * DISPOSE: pure math — không giữ tài nguyên.
 */

import * as THREE from 'three'

// 1 GÓC đã vát: đẩy điểm vào pA (lùi về cạnh trước) → cung → pB (lùi về cạnh sau). segs=1 = CHAMFER phẳng;
// segs>1 = BO TRÒN xấp xỉ bằng Bézier bậc 2 control = chính đỉnh góc (tiếp tuyến 2 đầu trùng 2 cạnh — nối mượt).
function pushCorner(
  out: THREE.Vector2[],
  c: THREE.Vector2,
  pA: THREE.Vector2,
  pB: THREE.Vector2,
  segs: number
): void {
  out.push(pA)
  for (let s = 1; s < segs; s++) {
    const t = s / segs
    const a = (1 - t) * (1 - t)
    const b = 2 * (1 - t) * t
    const d = t * t
    out.push(new THREE.Vector2(a * pA.x + b * c.x + d * pB.x, a * pA.y + b * c.y + d * pB.y))
  }
  out.push(pB)
}

// VÁT GÓC profile kín (polygon 2D, đỉnh theo thứ tự): mỗi góc lùi `r` (m) dọc 2 cạnh kề rồi nối chamfer/cung.
// r tự KẸP 0.49 × cạnh ngắn kề góc → 2 vát kề không chồm qua nhau (slider kéo quá đà vẫn an toàn).
// Profile lồi vào → ra vẫn lồi (caps fan của sweep #2 dùng được nguyên). r ≤ 0 → trả nguyên (op no-op).
export function bevelProfile(profile: THREE.Vector2[], r: number, segs = 1): THREE.Vector2[] {
  const n = profile.length
  if (r <= 1e-6 || n < 3) return profile
  const ns = Math.max(1, Math.round(segs))
  const out: THREE.Vector2[] = []
  for (let i = 0; i < n; i++) {
    const c = profile[i]
    const dp = profile[(i + n - 1) % n].clone().sub(c) // về đỉnh TRƯỚC
    const dn = profile[(i + 1) % n].clone().sub(c) // về đỉnh SAU
    const lp = dp.length()
    const ln = dn.length()
    if (lp < 1e-9 || ln < 1e-9) {
      out.push(c.clone()) // cạnh suy biến → giữ đỉnh gốc
      continue
    }
    const ri = Math.min(r, 0.49 * lp, 0.49 * ln)
    const pA = c.clone().addScaledVector(dp.divideScalar(lp), ri)
    const pB = c.clone().addScaledVector(dn.divideScalar(ln), ri)
    pushCorner(out, c, pA, pB, ns)
  }
  return out
}

// BO GÓC polyline 3D HỞ (spine cho sweep #2): mỗi góc TRONG lùi `r` dọc 2 cạnh kề rồi nối cung Bézier bậc 2
// (control = chính đỉnh góc → tiếp tuyến 2 đầu cung TRÙNG 2 đoạn thẳng — parallel transport của sweep đi qua
// gối không gãy frame). 2 ĐẦU MÚT giữ nguyên (polyline hở — spine xà/khung). r kẹp 0.49×cạnh ngắn kề.
// LƯU Ý: cung BO CẮT GÓC — spine không còn chạm đỉnh gốc (hụt ~r·(1−cos(θ/2))); ngã ba tại đỉnh cần
// KHỐI ĐẤU che điểm thanh khác cắm vào. r ≤ 0 hoặc <3 điểm → trả nguyên.
export function filletSpine(points: THREE.Vector3[], r: number, segs = 4): THREE.Vector3[] {
  const n = points.length
  if (r <= 1e-6 || n < 3) return points
  const ns = Math.max(2, Math.round(segs))
  const out: THREE.Vector3[] = [points[0].clone()]
  for (let i = 1; i < n - 1; i++) {
    const c = points[i]
    const dp = points[i - 1].clone().sub(c)
    const dn = points[i + 1].clone().sub(c)
    const lp = dp.length()
    const ln = dn.length()
    if (lp < 1e-9 || ln < 1e-9) {
      out.push(c.clone()) // đoạn suy biến → giữ đỉnh gốc
      continue
    }
    const ri = Math.min(r, 0.49 * lp, 0.49 * ln)
    const pA = c.clone().addScaledVector(dp.divideScalar(lp), ri)
    const pB = c.clone().addScaledVector(dn.divideScalar(ln), ri)
    for (let s = 0; s <= ns; s++) {
      const t = s / ns
      const a = (1 - t) * (1 - t)
      const b = 2 * (1 - t) * t
      const d = t * t
      out.push(
        new THREE.Vector3(
          a * pA.x + b * c.x + d * pB.x,
          a * pA.y + b * c.y + d * pB.y,
          a * pA.z + b * c.z + d * pB.z
        )
      )
    }
  }
  out.push(points[n - 1].clone())
  return out
}
