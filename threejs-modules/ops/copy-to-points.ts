/**
 * VỊ TRÍ   — threejs-modules/ops/copy-to-points.ts
 * VAI TRÒ  — OP #3 thư viện ops (Houdini Copy to Points) — 2 TẦNG TÁCH RỜI kiểu Houdini:
 *            TẦNG 1 (generator điểm, 2 biến thể): gridOnSurface = lưới UV ĐỀU (mặt tham số ~đều) ·
 *            rowsOnSurface = THEO HÀNG chiều dài thật (đếm viên riêng từng hàng như thợ lợp — mặt tham số
 *            co giãn vẫn giữ cỡ viên thật). Cả 2 trả SurfacePoint: FRAME (normal + tangent-u, sai phân
 *            hữu hạn) + cỡ ô local cw/ch.
 *            TẦNG 2 copyToPoints: nhân bản 1 geometry tới các điểm = InstancedMesh (1 draw call),
 *            instance xoay theo frame mặt + scale per-point. Đổi generator ↔ đổi instancer độc lập.
 * LIÊN HỆ  — roof-preview.ts setTiles (NGÓI bám mặt Coons mái đao — slopeSurfaces của roof-lab).
 *            Catalog: Factory/deferred/houdini-algorithms.md (#3). Tường gạch / sân lát = consumer sau (cùng op).
 *
 * CÁCH DÙNG: const pts = rowsOnSurface(surf, 12, 0.25, { stagger: 0.5, inset: 0.1 }) // viên 25cm, so le, chừa mép
 *            copyToPoints(geo, mat, pts, { scale: (p) => sv.set(p.cw, p.cw * 0.3, p.ch * 1.2) })
 * DISPOSE: caller dispose InstancedMesh trả về (geometry/material DÙNG CHUNG — không dispose theo instance).
 */

import * as THREE from 'three'

import { arcLength } from './resample'

// 1 điểm trên mặt: vị trí + frame (nrm ⊥ mặt, tanU dọc hàng u) + tọa độ (u,v) + cỡ ô local (m) tại điểm.
export interface SurfacePoint {
  pos: THREE.Vector3
  nrm: THREE.Vector3 // pháp tuyến mặt = ∂u × ∂v chuẩn hóa (⊥ tanU sẵn — khỏi trực giao hóa lại)
  tanU: THREE.Vector3 // tiếp tuyến hướng u (dọc hàng ngói/gạch)
  u: number
  v: number
  cw: number // bề NGANG ô local (m) = |∂S/∂u|/nu — instance scale theo đây để phủ kín ô dù mặt co giãn
  ch: number // bề DỌC ô local (m) = |∂S/∂v|/nv
}

export interface GridOptions {
  stagger?: number // so le hàng lẻ theo u (0..1 × ô — bond gạch/lợp ngói). Điểm tràn u quá biên → BỎ. Mặc định 0.
}

// Frame tại (u,v): pos + nrm/tanU (sai phân hữu hạn, mẫu CLAMP vào [0,1]) + độ giãn |∂S/∂u|, |∂S/∂v| (m/đơn-vị-tham-số).
// null nếu suy biến (∂u×∂v ≈ 0, vd slope sụp) — caller bỏ điểm, không sinh ma trận NaN. Chung grid/rowsOnSurface.
function frameAt(
  surf: (u: number, v: number) => THREE.Vector3,
  u: number,
  v: number,
  eu: number,
  ev: number
): {
  pos: THREE.Vector3
  nrm: THREE.Vector3
  tanU: THREE.Vector3
  lenU: number
  lenV: number
} | null {
  const u0 = Math.max(0, u - eu)
  const u1 = Math.min(1, u + eu)
  const v0 = Math.max(0, v - ev)
  const v1 = Math.min(1, v + ev)
  const dU = surf(u1, v).sub(surf(u0, v))
  const dV = surf(u, v1).sub(surf(u, v0))
  const nrm = new THREE.Vector3().crossVectors(dU, dV)
  if (nrm.lengthSq() < 1e-12) return null
  return {
    pos: surf(u, v),
    nrm: nrm.normalize(),
    tanU: dU.clone().normalize(),
    lenU: dU.length() / (u1 - u0),
    lenV: dV.length() / (v1 - v0),
  }
}

// TẦNG 1a — rải điểm TÂM Ô lưới UV ĐỀU nu×nv. Đúng khi tham số ~đều theo chiều dài (tường phẳng, sân);
// mặt tham số KHÔNG đều (vd hiên mái 3 đoạn) → dùng rowsOnSurface để viên giữ cỡ thật.
export function gridOnSurface(
  surf: (u: number, v: number) => THREE.Vector3,
  nu: number,
  nv: number,
  opts: GridOptions = {}
): SurfacePoint[] {
  const stag = opts.stagger ?? 0
  const eu = 0.25 / nu
  const ev = 0.25 / nv
  const pts: SurfacePoint[] = []
  for (let j = 0; j < nv; j++) {
    const v = (j + 0.5) / nv
    const off = j % 2 === 1 ? stag : 0 // hàng lẻ dịch ngang `stagger` ô
    for (let i = 0; i < nu; i++) {
      const u = (i + 0.5 + off) / nu
      if (u > 1 - eu) continue // tràn do so le → bỏ (mép hở so le như lợp/xây thật)
      const f = frameAt(surf, u, v, eu, ev)
      if (!f) continue
      pts.push({ pos: f.pos, nrm: f.nrm, tanU: f.tanU, u, v, cw: f.lenU / nu, ch: f.lenV / nv })
    }
  }
  return pts
}

export interface RowOptions {
  stagger?: number // so le hàng lẻ (0..1 × viên). Mặc định 0.
  // Chừa 2 ĐẦU HÀNG (m) — viên không thò qua biên (hip). Cho HÀM theo v → inset đổi theo hàng
  // (vd "cắt ngọn" đầu đao: hàng thấp lùi sâu khỏi mũi). Mặc định 0.
  inset?: number | ((v: number) => number)
  phase?: number // dịch ĐỀU mọi hàng theo u (0..1 × viên) — đặt viên thứ 2 vào KHE giữa 2 viên lớp 1 (âm dương)
}

// 1 HÀNG viên: số viên = chiều dài THẬT khả dụng ÷ sizeU (đếm riêng hàng này), vị trí cách đều theo MÉT dọc hàng
// (nghịch đảo arc-length → u). Tách khỏi rowsOnSurface cho gọn complexity.
function pushRow(
  pts: SurfacePoint[],
  surf: (u: number, v: number) => THREE.Vector3,
  v: number,
  nv: number,
  sizeU: number,
  opt: { inset: number; off: number }
): void {
  const al = arcLength((t) => surf(t, v)) // chiều dài THẬT của đường hàng
  const usable = al.length - 2 * opt.inset
  if (usable < sizeU * 0.5) return // hàng quá ngắn (sát đỉnh chóp/cạnh sụp) → bỏ
  const n = Math.min(256, Math.max(1, Math.round(usable / sizeU)))
  const cw = usable / n // bề ngang viên THẬT của hàng này (≈ sizeU, đều tuyệt đối trong hàng)
  for (let i = 0; i < n; i++) {
    const s = opt.inset + (i + 0.5 + opt.off) * cw // vị trí tâm viên dọc hàng (m)
    if (s > al.length - opt.inset - cw * 0.5 + 1e-9) continue // tràn do so le → bỏ
    const u = al.tAt(s / al.length)
    const f = frameAt(surf, u, v, 0.25 / n, 0.25 / nv)
    if (f) pts.push({ pos: f.pos, nrm: f.nrm, tanU: f.tanU, u, v, cw, ch: f.lenV / nv })
  }
}

// TẦNG 1b — rải THEO HÀNG chiều dài thật (cách THỢ LỢP đếm viên): mỗi hàng v đo chiều dài thật đường hàng
// (op #1 arc-length) → số viên tính RIÊNG từng hàng → viên cỡ ĐỀU tuyệt đối dù tham số u co giãn
// (cung góc mái ngắn nhận ÍT viên đúng cỡ — hết cảnh viên bé chen/đè ở góc đao).
export function rowsOnSurface(
  surf: (u: number, v: number) => THREE.Vector3,
  nv: number,
  sizeU: number,
  opts: RowOptions = {}
): SurfacePoint[] {
  if (sizeU <= 1e-6) return []
  const stag = opts.stagger ?? 0
  const phase = opts.phase ?? 0
  const inset = opts.inset ?? 0
  const pts: SurfacePoint[] = []
  for (let j = 0; j < nv; j++) {
    const v = (j + 0.5) / nv
    const ins = typeof inset === 'function' ? inset(v) : inset
    pushRow(pts, surf, v, nv, sizeU, { inset: ins, off: phase + (j % 2 === 1 ? stag : 0) })
  }
  return pts
}

// 1 HÀNG của lưới CỘT SONG SONG: cột nằm trên LƯỚI NỬA-BƯỚC đối xứng tâm — s = tâm ± (k+0.5)·sizeU.
// Lưới CỐ ĐỊNH CHUNG mọi mặt (không phụ thuộc parity số cột) → cột peak THẲNG PHA cột base, không so le
// nửa viên giữa 2 mặt. Viên rộng KHÔNG ĐỔI = sizeU; margin = max(inset hàng, 0.45 viên) → viên được tiến
// SÁT MÉP mặt (cột bìa không bị giết oan), vùng inset to (cắt ngọn đao) vẫn rụng đúng. Tách cho complexity.
function pushColRow(
  pts: SurfacePoint[],
  surf: (u: number, v: number) => THREE.Vector3,
  v: number,
  nv: number,
  opt: { offs: number[]; sizeU: number; insJ: number; lax: boolean }
): void {
  const alj = arcLength((t) => surf(t, v))
  const len = alj.length
  if (len < opt.sizeU * 0.5) return // hàng quá ngắn → bỏ
  // lax = caller có DAO CẮT (clipping plane) ở biên → viên được TRÀN mép rồi bị cắt (floor 0.05 thay 0.45)
  const margin = Math.max(opt.insJ, opt.sizeU * (opt.lax ? 0.05 : 0.45))
  for (const off of opt.offs) {
    const s = len / 2 + off * opt.sizeU // offset (× viên) từ TÂM hàng — lưới chung mọi mặt
    if (s < margin || s > len - margin) continue // cột vượt mép / phạm inset (cắt ngọn) → rụng
    const u = alj.tAt(s / len)
    const f = frameAt(surf, u, v, (0.25 * opt.sizeU) / len, 0.25 / nv)
    if (f) pts.push({ pos: f.pos, nrm: f.nrm, tanU: f.tanU, u, v, cw: opt.sizeU, ch: f.lenV / nv })
  }
}

// TẦNG 1c — rải theo CỘT SONG SONG ĐỀU (máng chữ U / ngói âm dương): cột chạy VUÔNG GÓC hiên theo offset MÉT
// từ TÂM hàng (đúng cách thợ lợp kẻ cột) → viên rộng KHÔNG ĐỔI, cột thẳng đứng đồng nhất trên CẢ mặt hình thang
// — base trông Y HỆT mặt phẳng peak (NgQuan 2026-06-10: "xóa ngói base làm lại như WXHG"; bản iso-u trước đó
// cột tỏa quạt + 2 cột bìa giãn khác cột giữa). Hàng ngắn dần về nóc → cột ngoài rìa tự RỤNG (bị hip cắt,
// như mái thật). Số cột chốt theo hàng chuẩn refV (mặc định hiên v=0 — dài nhất) với inset nhỏ nhất inset(v=1).
export function colsOnSurface(
  surf: (u: number, v: number) => THREE.Vector3,
  nv: number,
  sizeU: number,
  opts: RowOptions & { refV?: number; seam?: boolean; overhang?: boolean } = {}
): SurfacePoint[] {
  if (sizeU <= 1e-6) return []
  const inset = opts.inset ?? 0
  const insAt = (v: number): number => (typeof inset === 'function' ? inset(v) : inset)
  const ref = arcLength((t) => surf(t, opts.refV ?? 0))
  if (ref.length < sizeU * 0.5) return [] // mặt suy biến
  const half = Math.min(128, Math.ceil(ref.length / 2 / sizeU)) // số cặp cột tối đa mỗi bên tâm
  // Lưới offset (× viên) từ tâm — DÙNG CHUNG mọi hàng: nửa-bước ±(k+0.5) = thân viên (lớp âm/máng) ·
  // seam = NGUYÊN-bước 0,±k = ĐÈ KHE giữa 2 cột nửa-bước (lớp DƯƠNG ống úp đè mép 2 viên âm kề).
  const offs: number[] = []
  if (opts.seam === true) {
    offs.push(0)
    for (let k = 1; k <= half; k++) offs.push(k, -k)
  } else {
    for (let k = 0; k < half; k++) offs.push(k + 0.5, -(k + 0.5))
  }
  const pts: SurfacePoint[] = []
  for (let j = 0; j < nv; j++) {
    const v = (j + 0.5) / nv
    pushColRow(pts, surf, v, nv, { offs, sizeU, insJ: insAt(v), lax: opts.overhang === true })
  }
  return pts
}

export interface CopyOptions {
  // Scale local per-point (x = dọc tanU · y = dọc normal · z = binormal). Trả về vector DÙNG NGAY trong vòng lặp
  // → callback được phép tái dùng 1 scratch vector (không giữ tham chiếu). Mặc định (1,1,1).
  // y ÂM = lật gương qua mặt (viên úp — ngói dương); DoubleSide material để shading 2 mặt vẫn đúng.
  scale?: (p: SurfacePoint, i: number) => THREE.Vector3
  lift?: (p: SurfacePoint, i: number) => number // đẩy instance DỌC NORMAL (m) — viên úp gối lên mép viên ngửa kề
}

const UNIT = new THREE.Vector3(1, 1, 1)

// TẦNG 2 — nhân bản geometry tới điểm: basis x=tanU · y=nrm · z=x×y (bám mặt, thuận tay phải) + scale per-point.
export function copyToPoints(
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  pts: SurfacePoint[],
  opts: CopyOptions = {}
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geo, mat, pts.length)
  const m = new THREE.Matrix4()
  const x = new THREE.Vector3()
  const y = new THREE.Vector3()
  const z = new THREE.Vector3()
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    const s = opts.scale ? opts.scale(p, i) : UNIT
    const lf = opts.lift ? opts.lift(p, i) : 0
    z.crossVectors(p.tanU, p.nrm).multiplyScalar(s.z) // binormal — tanU ⊥ nrm sẵn nên triad trực chuẩn
    x.copy(p.tanU).multiplyScalar(s.x)
    y.copy(p.nrm).multiplyScalar(s.y)
    m.makeBasis(x, y, z).setPosition(
      p.pos.x + p.nrm.x * lf,
      p.pos.y + p.nrm.y * lf,
      p.pos.z + p.nrm.z * lf
    )
    mesh.setMatrixAt(i, m)
  }
  mesh.instanceMatrix.needsUpdate = true
  return mesh
}
