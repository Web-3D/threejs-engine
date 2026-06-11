/**
 * VỊ TRÍ   — building-kit/parts/Joinery.ts
 * VAI TRÒ  — Hệ joinery quanh lỗ opening, geometry thuần hệ LOCAL tường (x dọc thân tính từ TÂM,
 *            y 0..h, z ±depth/2, mặt ngoài +Z): C1 KHUNG BAO (frame/architrave). Cánh cửa (C2+C4)
 *            ở parts/Leaf.ts (barrel re-export dưới).
 * LIÊN HỆ  — Consumer kệ ops: lỗ TRÒN/bán nguyệt = sweep (op #2) profile dọc spine ellipse đã
 *            resample đốt đều (op #1). Lỗ CHỮ NHẬT = box butt-joint (đầu ngang GỐI lên 2 má dọc —
 *            mộc cổ điển; sweep qua spine vuông pinch góc 45° nên KHÔNG ép op vào chỗ thẳng).
 *            Khung CLIP theo biên tường [x0,x1]×[0,h] — KHỚP lỗ carve (_holeChord clamp), không thò
 *            ra ngoài tường khi opening đặt sát mép/đỉnh (bài 2026-06-11 từ ảnh thực tế).
 *            Caller = wallAssembly.assembleFrames: transform theo WallPlace + bake bucket màu phẳng.
 * DISPOSE: trả BufferGeometry[] — CALLER sở hữu (bucket mergeWalls merge xong tự dispose).
 */

import * as THREE from 'three'

import { rectProfile, sweepInto } from '../../ops/sweep'

// Cánh cửa (C2 xoay + C4 trượt) tách sang parts/Leaf.ts (2026-06-11, chống phình) — barrel giữ
// consumer (wallAssembly) import từ Joinery như cũ.
export { LEAF_T, leafGeoLocal, type SlideLeafGeos, slideLeafGeos } from './Leaf'

const EPS = 1e-4

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

/** Khung 1 lỗ — geometry hệ local tường. wallW/wallH/wallDepth mét. Rỗng nếu lỗ suy biến. */
export function frameGeosLocal(
  op: FrameOpening,
  wallW: number,
  wallH: number,
  wallDepth: number,
  fs: FrameSpec
): THREE.BufferGeometry[] {
  const fd = wallDepth + fs.out * 2
  return op.round ? ellipseFrame(op, wallW, wallH, fd, fs) : rectFrame(op, wallW, wallH, fd, fs)
}

// Khung chữ nhật: 2 má dọc + đầu ngang GỐI lên má (butt-joint mộc); bậu dưới CHỈ khi lỗ treo cao
// (cửa sổ). Mọi thanh CLIP vào biên tường [x0,x1]×[0,h] — phần ngoài tường bỏ (khớp lỗ carve).
function rectFrame(
  op: FrameOpening,
  wallW: number,
  wallH: number,
  fd: number,
  fs: FrameSpec
): THREE.BufferGeometry[] {
  const fw = fs.w
  const x0 = op.x - wallW / 2
  const x1 = x0 + op.w
  const y0 = Math.max(0, op.yOffset)
  const y1 = Math.min(wallH, op.yOffset + op.h)
  if (y1 - y0 < 0.01 || op.w < 0.01) return []
  const out: THREE.BufferGeometry[] = []
  const box = (bw: number, bh: number, cx: number, cy: number): void => {
    if (bw < EPS || bh < EPS) return
    const g = new THREE.BoxGeometry(bw, bh, fd)
    g.translate(cx, cy, 0)
    out.push(g)
  }
  box(fw, y1 - y0, x0 - fw / 2, (y0 + y1) / 2) // má trái
  box(fw, y1 - y0, x1 + fw / 2, (y0 + y1) / 2) // má phải
  if (op.yOffset + op.h <= wallH + EPS) box(op.w + 2 * fw, fw, (x0 + x1) / 2, y1 + fw / 2) // đầu ngang
  if (op.yOffset > 0.02) box(op.w + 2 * fw, fw, (x0 + x1) / 2, y0 - fw / 2) // bậu dưới (window)
  return out
}

// N điểm trên ELLIPSE (tâm cx,cy bán trục a,b) trong mặt phẳng tường z=0 — KHÔNG lặp điểm cuối.
function ellipsePoints(cx: number, cy: number, a: number, b: number, n: number): THREE.Vector3[] {
  const pts: THREE.Vector3[] = []
  for (let i = 0; i < n; i++) {
    const th = (i / n) * Math.PI * 2
    pts.push(new THREE.Vector3(cx + a * Math.cos(th), cy + b * Math.sin(th), 0))
  }
  return pts
}

// Tách điểm ellipse thành các CUNG nằm TRONG biên tường [x0,x1]×[0,h]. Toàn-trong → 1 vòng kín
// (closed=true → sweep caps off). Có điểm ngoài → các cung hở (caps on), xoay mảng để bắt đầu tại
// 1 điểm NGOÀI nên quét vòng tuyến tính không cần wrap.
function clipToWall(
  pts: THREE.Vector3[],
  x0: number,
  x1: number,
  h: number
): { runs: THREE.Vector3[][]; closed: boolean } {
  const ins = (p: THREE.Vector3): boolean =>
    p.x >= x0 - EPS && p.x <= x1 + EPS && p.y >= -EPS && p.y <= h + EPS
  const flag = pts.map(ins)
  if (flag.every((f) => f)) {
    return { runs: [[...pts, pts[0]]], closed: true } // khép vòng: nối lại điểm đầu
  }
  const n = pts.length
  const start = flag.indexOf(false)
  const runs: THREE.Vector3[][] = []
  let cur: THREE.Vector3[] = []
  for (let k = 0; k < n; k++) {
    const i = (start + k) % n
    if (flag[i]) cur.push(pts[i])
    else if (cur.length) {
      if (cur.length >= 2) runs.push(cur)
      cur = []
    }
  }
  if (cur.length >= 2) runs.push(cur)
  return { runs, closed: false }
}

// Lỗ tròn carve bằng BAND ngang ~25mm (playbook window §2) → ở 2 CỰC lỗ thật NHỎ hơn ellipse lý
// tưởng 1 sliver tường — thò vào lòng vòng khung = khe sáng "thủng khung" (ảnh 2026-06-11). Khung
// đè LIP vào trong mép lỗ để che răng cưa carve — đúng vai trò architrave thật.
const FRAME_LIP = 0.025 // m — ≥ bước band carve

// Lỗ ELLIP (fit bbox w×h, tâm cy = yOffset+h/2 — KHỚP carve _holeChord): spine = ellipse NỞ fs.w/2
// rồi THỤT FRAME_LIP (mép trong khung đè lên mép lỗ — che sliver band) CLIP vào biên tường → sweep
// (op #2) profile fs.w×fd mỗi cung. up=+Z (pháp tuyến tường) → parallel-transport giữ profile phẳng
// trong mặt phẳng tường, đối xứng quanh z=0.
function ellipseFrame(
  op: FrameOpening,
  wallW: number,
  wallH: number,
  fd: number,
  fs: FrameSpec
): THREE.BufferGeometry[] {
  const a = Math.max(0.01, op.w / 2 + fs.w / 2 - FRAME_LIP)
  const b = Math.max(0.01, op.h / 2 + fs.w / 2 - FRAME_LIP)
  const cx = op.x + op.w / 2 - wallW / 2
  const cy = op.yOffset + op.h / 2
  if (a < 0.01 || b < 0.01) return []
  const pts = ellipsePoints(cx, cy, a, b, 96)
  const { runs, closed } = clipToWall(pts, -wallW / 2, wallW / 2, wallH)
  const pos: number[] = []
  const idx: number[] = []
  const up = new THREE.Vector3(0, 0, 1)
  const profile = rectProfile(fs.w, fd)
  for (const run of runs) {
    if (run.length < 2) continue
    sweepInto(pos, idx, run, profile, { caps: !closed, up })
  }
  if (pos.length === 0) return []
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  // UV zeros đệm cho ĐỒNG BỘ attribute với BoxGeometry trong cùng bucket — mergeGeometries đòi mọi geo
  // cùng tập attribute (thiếu uv → merge null, mất hình lặng lẽ KI-004); material phẳng không đọc uv.
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return [g]
}
