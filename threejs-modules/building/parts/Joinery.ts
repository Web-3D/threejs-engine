/**
 * VỊ TRÍ   — building-kit/parts/Joinery.ts
 * VAI TRÒ  — C1 hệ khung+cánh cửa: KHUNG BAO (frame/architrave) quanh lỗ opening — geometry thuần
 *            trong hệ LOCAL tường (x dọc thân tính từ TÂM, y 0..h, z ±depth/2, mặt ngoài +Z).
 * LIÊN HỆ  — Consumer kệ ops: lỗ TRÒN/bán nguyệt = sweep (op #2) profile dọc spine ellipse đã
 *            resample đốt đều (op #1). Lỗ CHỮ NHẬT = box butt-joint (đầu ngang GỐI lên 2 má dọc —
 *            mộc cổ điển; sweep qua spine vuông pinch góc 45° nên KHÔNG ép op vào chỗ thẳng).
 *            Caller = wallAssembly.assembleFrames: transform theo WallPlace + bake bucket màu phẳng.
 * DISPOSE: trả BufferGeometry[] — CALLER sở hữu (bucket mergeWalls merge xong tự dispose).
 */

import * as THREE from 'three'

import { resampleCurve } from '../../ops/resample'
import { rectProfile, sweepInto } from '../../ops/sweep'

export interface FrameSpec {
  w: number // m — bản khung (face width)
  out: number // m — nhô khỏi mặt tường mỗi bên (độ dày khung = wallDepth + 2·out)
  color: number // hex — Joinery KHÔNG đụng material; caller dùng làm key bucket
}

export interface FrameOpening {
  x: number // m — mép trái lỗ tính từ ĐẦU TRÁI tường (convention PositionedOpening)
  w: number // m
  h: number // m
  yOffset: number // m — đáy lỗ từ sàn (ÂM = lỗ bị sàn clip → bán nguyệt)
  round?: boolean
}

/** Khung 1 lỗ — geometry hệ local tường. wallW/wallDepth mét. Rỗng nếu lỗ suy biến. */
export function frameGeosLocal(
  op: FrameOpening,
  wallW: number,
  wallDepth: number,
  fs: FrameSpec
): THREE.BufferGeometry[] {
  const fd = wallDepth + fs.out * 2
  return op.round ? ellipseFrame(op, wallW, fd, fs) : rectFrame(op, wallW, fd, fs)
}

// Khung chữ nhật: 2 má dọc + đầu ngang GỐI lên má (butt-joint mộc); bậu dưới CHỈ khi lỗ treo cao
// (cửa sổ) — lỗ chạm/dưới sàn (cửa đi, bán nguyệt clip) không bậu. Band khung nằm NGOÀI mép lỗ.
function rectFrame(
  op: FrameOpening,
  wallW: number,
  fd: number,
  fs: FrameSpec
): THREE.BufferGeometry[] {
  const fw = fs.w
  const x0 = op.x - wallW / 2
  const x1 = x0 + op.w
  const y0 = Math.max(0, op.yOffset)
  const y1 = op.yOffset + op.h
  if (y1 - y0 < 0.01 || op.w < 0.01) return []
  const out: THREE.BufferGeometry[] = []
  const box = (bw: number, bh: number, cx: number, cy: number): void => {
    const g = new THREE.BoxGeometry(bw, bh, fd)
    g.translate(cx, cy, 0)
    out.push(g)
  }
  box(fw, y1 - y0, x0 - fw / 2, (y0 + y1) / 2) // má trái
  box(fw, y1 - y0, x1 + fw / 2, (y0 + y1) / 2) // má phải
  box(op.w + 2 * fw, fw, (x0 + x1) / 2, y1 + fw / 2) // đầu ngang (span cả 2 má)
  if (y0 > 0.02) box(op.w + 2 * fw, fw, (x0 + x1) / 2, y0 - fw / 2) // bậu dưới (window)
  return out
}

// Lỗ ELLIP (fit bbox w×h, tâm cy = y0+h/2 — KHỚP carve _buildWallHolesGeo): spine = ellipse NỞ fw/2
// (mép trong khung = mép lỗ) resample đốt đều (op #1 — ellipse t-đều ≠ dài-đều) → sweep (op #2)
// profile fw×fd; up=+Z (pháp tuyến tường) → parallel-transport phẳng giữ profile thẳng trục tường.
// Chạm sàn (cy < b) → CUNG VÒM hở, 2 chân chạm y=0, caps bịt. Đủ cao → VÒNG KÍN (điểm cuối = đầu,
// caps tắt; lệch tangent tại seam = 1 chord ~sub-mm với 48 đốt — vô hình).
function ellipseFrame(
  op: FrameOpening,
  wallW: number,
  fd: number,
  fs: FrameSpec
): THREE.BufferGeometry[] {
  const a = op.w / 2 + fs.w / 2
  const b = op.h / 2 + fs.w / 2
  const cx = op.x + op.w / 2 - wallW / 2
  const cy = op.yOffset + op.h / 2
  if (a < 0.01 || b < 0.01) return []
  const clipped = cy < b
  const phi = clipped ? Math.asin(Math.max(-1, Math.min(1, cy / b))) : 0
  const th0 = -phi
  const span = clipped ? Math.PI + 2 * phi : Math.PI * 2
  const fn = (t: number): THREE.Vector3 => {
    const th = th0 + t * span
    return new THREE.Vector3(cx + a * Math.cos(th), cy + b * Math.sin(th), 0)
  }
  const spine = resampleCurve(fn, 48)
  const pos: number[] = []
  const idx: number[] = []
  sweepInto(pos, idx, spine, rectProfile(fs.w, fd), {
    caps: clipped,
    up: new THREE.Vector3(0, 0, 1),
  })
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  // UV zeros đệm cho ĐỒNG BỘ attribute với BoxGeometry trong cùng bucket — mergeGeometries đòi mọi geo
  // cùng tập attribute (thiếu uv → merge null, mất hình lặng lẽ KI-004); material phẳng không đọc uv.
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return [g]
}
