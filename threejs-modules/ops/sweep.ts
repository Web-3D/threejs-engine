/**
 * VỊ TRÍ   — threejs-modules/ops/sweep.ts
 * VAI TRÒ  — OP #2 thư viện ops (Houdini Sweep SOP): quét TIẾT DIỆN 2D dọc theo spine (chuỗi điểm) → thân ống/xà
 *            LIỀN MẠCH. Frame xoay theo PARALLEL TRANSPORT (rotation-minimizing) — không xoắn/lật như Frenet.
 *            Ramp scale (thon dần) + twist (xoắn) theo fraction chiều dài. Caps bịt 2 đầu.
 * LIÊN HỆ  — roof-preview.ts setCornerBeams (xà góc mái đao: chuỗi hộp rời `_edgeBox` → thân liền). Spine nên
 *            resample trước bằng ops/resample (đốt đều). Catalog: Factory/deferred/houdini-algorithms.md (#2).
 *
 * CÁCH DÙNG: const spine = resampleCurve(fn, n)
 *            sweepInto(pos, idx, spine, rectProfile(0.04, 0.04, true), { scale: (f) => 1 - 0.8 * f })
 *            → đẩy đỉnh/tam giác vào mảng chung (composable như buildSlope), dựng BufferGeometry sau.
 * DISPOSE: không giữ tài nguyên GPU — pure math (caller tự dispose geometry dựng ra).
 */

import * as THREE from 'three'

export interface SweepOptions {
  scale?: (f: number) => number // ramp scale tiết diện theo fraction chiều dài (taper). Mặc định 1.
  twist?: (f: number) => number // ramp xoay tiết diện quanh trục (radian). Mặc định 0.
  caps?: boolean // bịt 2 đầu (fan — tiết diện lồi). Mặc định true.
  up?: THREE.Vector3 // gợi ý hướng "lên" cho frame đầu tiên. Mặc định +Y.
}

// Tiết diện CHỮ NHẬT w×h quanh gốc. anchorTop=true → y∈[-h,0] (MÉP TRÊN ôm spine — xà nằm DƯỚI đường cong,
// thay cho dropY của _edgeBox cũ; scale taper co xuống dưới, mặt trên vẫn sát spine).
export function rectProfile(w: number, h: number, anchorTop = false): THREE.Vector2[] {
  const y0 = anchorTop ? -h : -h / 2
  const x = w / 2
  return [
    new THREE.Vector2(-x, y0),
    new THREE.Vector2(x, y0),
    new THREE.Vector2(x, y0 + h),
    new THREE.Vector2(-x, y0 + h),
  ]
}

// Frame dọc spine: tangent (sai phân giữa) + normal PARALLEL TRANSPORT (quay normal trước theo quaternion
// đưa tangent trước → tangent sau) — chuẩn rotation-minimizing, không lật ở đoạn cong gắt.
function ptFrames(
  spine: THREE.Vector3[],
  up: THREE.Vector3
): { tan: THREE.Vector3[]; nrm: THREE.Vector3[] } {
  const m = spine.length
  const tan: THREE.Vector3[] = []
  for (let i = 0; i < m; i++) {
    const a = spine[Math.max(0, i - 1)]
    const b = spine[Math.min(m - 1, i + 1)]
    tan.push(new THREE.Vector3().subVectors(b, a).normalize())
  }
  // normal đầu = thành phần của `up` ⊥ tangent; suy biến (up ∥ tangent) → dùng trục X
  const n0 = up.clone().addScaledVector(tan[0], -up.dot(tan[0]))
  if (n0.lengthSq() < 1e-8) n0.set(1, 0, 0).addScaledVector(tan[0], -tan[0].x)
  n0.normalize()
  const nrm: THREE.Vector3[] = [n0]
  const q = new THREE.Quaternion()
  for (let i = 1; i < m; i++) {
    q.setFromUnitVectors(tan[i - 1], tan[i]) // phép quay tối thiểu giữa 2 tangent
    nrm.push(nrm[i - 1].clone().applyQuaternion(q).normalize())
  }
  return { tan, nrm }
}

// Ghi 1 VÒNG tiết diện tại spine[i] vào pos: local (x=binormal, y=normal), scale + twist theo ramp.
function pushRing(
  pos: number[],
  center: THREE.Vector3,
  bin: THREE.Vector3,
  nrm: THREE.Vector3,
  profile: THREE.Vector2[],
  s: number,
  tw: number
): void {
  const cos = Math.cos(tw)
  const sin = Math.sin(tw)
  for (const p of profile) {
    const x = (p.x * cos - p.y * sin) * s
    const y = (p.x * sin + p.y * cos) * s
    pos.push(
      center.x + bin.x * x + nrm.x * y,
      center.y + bin.y * x + nrm.y * y,
      center.z + bin.z * x + nrm.z * y
    )
  }
}

// Index THÀNH ỐNG (quad giữa từng cặp vòng) + CAPS fan 2 đầu (profile lồi). Tách khỏi sweepInto cho gọn complexity.
function pushTube(idx: number[], base: number, m: number, k: number, caps: boolean): void {
  for (let i = 0; i < m - 1; i++)
    for (let j = 0; j < k; j++) {
      const a = base + i * k + j
      const b = base + i * k + ((j + 1) % k)
      idx.push(a, a + k, b + k, a, b + k, b)
    }
  if (!caps) return
  const e = base + (m - 1) * k
  for (let j = 1; j < k - 1; j++) idx.push(base, base + j + 1, base + j)
  for (let j = 1; j < k - 1; j++) idx.push(e, e + j, e + j + 1)
}

// SWEEP: quét profile dọc spine → đẩy đỉnh + tam giác (thành ống + caps) vào pos/idx chung từ chỉ số hiện tại.
export function sweepInto(
  pos: number[],
  idx: number[],
  spine: THREE.Vector3[],
  profile: THREE.Vector2[],
  opts: SweepOptions = {}
): void {
  const m = spine.length
  const k = profile.length
  if (m < 2 || k < 3) return
  const base = pos.length / 3
  const { tan, nrm } = ptFrames(spine, opts.up ?? new THREE.Vector3(0, 1, 0))
  const bin = new THREE.Vector3()
  for (let i = 0; i < m; i++) {
    const f = i / (m - 1) // fraction dọc spine (spine đã resample → = fraction chiều dài)
    bin.crossVectors(tan[i], nrm[i]).normalize()
    const s = opts.scale ? opts.scale(f) : 1
    const tw = opts.twist ? opts.twist(f) : 0
    pushRing(pos, spine[i], bin, nrm[i], profile, s, tw)
  }
  pushTube(idx, base, m, k, opts.caps !== false)
}
