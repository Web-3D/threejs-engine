/**
 * VỊ TRÍ   — building-kit/parts/Leaf.ts
 * VAI TRÒ  — CÁNH CỬA (joinery C2+C4): builder geometry cánh trong hệ LEAF-LOCAL — C2 cánh gỗ panel
 *            xoay bản lề (leafGeoLocal) + C4 cánh TRƯỢT kính/shoji (slideLeafGeos).
 * LIÊN HỆ  — Tách từ parts/Joinery.ts (2026-06-11, chống phình — Joinery giữ KHUNG bao + song sắt,
 *            barrel re-export nên consumer giữ import './parts/Joinery'). Caller = wallAssembly
 *            assembleLeaves: đặt lên pivot (xoay = bản lề C2 / translate = ray trượt C4).
 *            C4 shoji = lưới kumiko GEOMETRY thật (KHÔNG reuse shader ShojiScreen — triplanar
 *            world-space đứng yên khi cánh trượt đi = hoạ tiết "bơi" sai thấy ngay).
 * DISPOSE: trả BufferGeometry — CALLER sở hữu (wallAssembly push ctx.geos → editor/headless dispose).
 */

import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

const EPS = 1e-4
export const LEAF_T = 0.04 // m — dày cánh gỗ
const LEAF_GAP = 0.006 // m — khe quanh cánh (cánh không kẹt lỗ)

// Gom box vào mảng qua closure — pattern chung mọi builder cánh (toàn BoxGeometry indexed + uv
// → mergeGeometries đồng bộ attribute, không dính KI-004).
type BoxAdder = (bw: number, bh: number, cx: number, cy: number, bt?: number, cz?: number) => void
function boxCollector(boxes: THREE.BufferGeometry[], defaultT: number): BoxAdder {
  return (bw, bh, cx, cy, bt = defaultT, cz = 0): void => {
    if (bw < EPS || bh < EPS) return
    const g = new THREE.BoxGeometry(bw, bh, bt)
    g.translate(cx, cy, cz)
    boxes.push(g)
  }
}

function mergeAndDispose(boxes: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  if (boxes.length === 0) return null
  const merged = mergeGeometries(boxes, false)
  for (const b of boxes) b.dispose()
  if (!merged) return null // guard KI-004 (merge null âm thầm) — toàn Box đồng attribute nên không xảy ra
  return merged
}

// CÁNH GỖ PANEL (C2): 2 stile dọc + 3 rail ngang (dưới/giữa/trên) + 2 Ô PANEL LÕM (tấm mỏng tâm
// cánh — recessed nhìn từ cả 2 phía). Geometry hệ LEAF-LOCAL: gốc tại TRỤC BẢN LỀ x=0, cánh trải
// [0..lw] (mirror=true → [-lw..0], cho cánh phải French), y [0..lh], dày z ±LEAF_T/2.
// Trả 1 geometry merged (Box indexed + uv sẵn — đồng bộ attribute); null nếu suy biến.
export function leafGeoLocal(lw: number, lh: number, mirror: boolean): THREE.BufferGeometry | null {
  if (lw < 0.08 || lh < 0.3) return null
  const boxes: THREE.BufferGeometry[] = []
  const box = (bw: number, bh: number, cx: number, cy: number, bt = LEAF_T): void => {
    if (bw < EPS || bh < EPS) return
    const g = new THREE.BoxGeometry(bw, bh, bt)
    g.translate(mirror ? -cx : cx, cy, 0)
    boxes.push(g)
  }
  const x0 = LEAF_GAP
  const x1 = lw - LEAF_GAP
  const sw = Math.min(0.1, (x1 - x0) * 0.18) // bản stile
  box(sw, lh, x0 + sw / 2, lh / 2) // stile bản lề
  box(sw, lh, x1 - sw / 2, lh / 2) // stile khoá
  const iw = x1 - x0 - 2 * sw // lòng giữa 2 stile
  const icx = x0 + sw + iw / 2
  const rb = Math.min(0.16, lh * 0.12) // rail dưới (cao hơn — chống đá chân, mộc cổ điển)
  const rt = Math.min(0.1, lh * 0.08) // rail trên
  const rm = Math.min(0.1, lh * 0.08) // rail giữa
  const my = lh * 0.4 // tâm rail giữa — tỉ lệ cửa panel 2 ô cổ điển
  box(iw, rb, icx, rb / 2)
  box(iw, rm, icx, my)
  box(iw, rt, icx, lh - rt / 2)
  const p1h = my - rm / 2 - rb // ô panel dưới
  const p2h = lh - rt - (my + rm / 2) // ô panel trên
  if (p1h > 0.02) box(iw, p1h, icx, rb + p1h / 2, 0.014)
  if (p2h > 0.02) box(iw, p2h, icx, my + rm / 2 + p2h / 2, 0.014)
  return mergeAndDispose(boxes)
}

// ── C4 CÁNH TRƯỢT ────────────────────────────────────────────────────────────
// Hệ LEAF-LOCAL panel trượt: trải x [0..lw], y [0..lh], z ±t/2 quanh 0 (caller đặt z ray ở mesh).
// `solid` = phần khung/gỗ (material toon per-color) · `pane` = tấm kính/giấy (material riêng) —
// 2 geometry vì 2 material, cùng nằm trên 1 pivot translate.

export interface SlideLeafGeos {
  solid: THREE.BufferGeometry | null
  pane: THREE.BufferGeometry | null
}

export function slideLeafGeos(
  lw: number,
  lh: number,
  kind: 'glass-slide' | 'shoji-slide'
): SlideLeafGeos {
  if (lw < 0.15 || lh < 0.4) return { solid: null, pane: null }
  return kind === 'glass-slide' ? glassSlideGeos(lw, lh) : shojiSlideGeos(lw, lh)
}

// Cửa kính trượt (patio): khung nhôm/gỗ 4 thanh bản hẹp + 1 tấm kính 8mm lọt lòng.
function glassSlideGeos(lw: number, lh: number): SlideLeafGeos {
  const boxes: THREE.BufferGeometry[] = []
  const box = boxCollector(boxes, LEAF_T)
  const sw = 0.055 // bản stile dọc
  const rb = 0.09 // rail đáy cao (kiểu patio — che bánh xe trượt)
  const rt = 0.06
  box(sw, lh, sw / 2, lh / 2)
  box(sw, lh, lw - sw / 2, lh / 2)
  const iw = lw - 2 * sw
  box(iw, rb, lw / 2, rb / 2)
  box(iw, rt, lw / 2, lh - rt / 2)
  const pane = new THREE.BoxGeometry(iw + 0.02, lh - rb - rt + 0.02, 0.008) // ngàm 10mm vào khung
  pane.translate(lw / 2, rb + (lh - rb - rt) / 2, 0)
  return { solid: mergeAndDispose(boxes), pane }
}

// Cửa shoji trượt: khung 4 thanh + KOSHITA (腰板 ván gỗ đặc đáy) + lưới kumiko (nan dọc/ngang) +
// tấm giấy washi 4mm sau lưới. Lưới = geometry thật để hoạ tiết TRƯỢT THEO cánh (xem header).
function shojiSlideGeos(lw: number, lh: number): SlideLeafGeos {
  const t = 0.03 // cánh shoji mỏng hơn cánh gỗ
  const boxes: THREE.BufferGeometry[] = []
  const box = boxCollector(boxes, t)
  const sw = 0.045
  const rr = 0.05 // rail trên/dưới
  box(sw, lh, sw / 2, lh / 2)
  box(sw, lh, lw - sw / 2, lh / 2)
  const iw = lw - 2 * sw
  box(iw, rr, lw / 2, rr / 2)
  box(iw, rr, lw / 2, lh - rr / 2)
  const ko = Math.min(0.35, lh * 0.18) // koshita — ván đặc chân cánh
  box(iw, ko, lw / 2, rr + ko / 2, 0.024)
  kumikoBars(box, sw, rr + ko, lw - sw, lh - rr) // lưới nan trong lòng còn lại
  const pw = iw + 0.01
  const ph = lh - rr - ko - rr + 0.01
  const pane = new THREE.BoxGeometry(pw, ph, 0.004)
  pane.translate(lw / 2, rr + ko + (lh - rr - ko - rr) / 2, 0)
  return { solid: mergeAndDispose(boxes), pane }
}

// Nan kumiko trong lòng [x0..x1]×[y0..y1]: nan 12mm × dày 15mm, chia ô ĐỀU ~17cm dọc / ~21cm ngang
// (làm tròn số nan theo lòng thật — ô vuông gần đều như shoji thật).
function kumikoBars(box: BoxAdder, x0: number, y0: number, x1: number, y1: number): void {
  const w = x1 - x0
  const h = y1 - y0
  if (w < 0.1 || h < 0.1) return
  const nv = Math.max(0, Math.round(w / 0.17) - 1)
  const nh = Math.max(0, Math.round(h / 0.21) - 1)
  for (let i = 1; i <= nv; i++) box(0.012, h, x0 + (w * i) / (nv + 1), y0 + h / 2, 0.015)
  for (let j = 1; j <= nh; j++) box(w, 0.012, x0 + w / 2, y0 + (h * j) / (nh + 1), 0.015)
}
