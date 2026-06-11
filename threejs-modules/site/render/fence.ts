/**
 * VỊ TRÍ   — threejs-modules/site/render/fence.ts  (site-kit)
 * VAI TRÒ  — Sub-domain HÀNG RÀO của renderer lô: rào quanh biên lô (gỗ cọc+thanh / tường liền / tường
 *            ĐÁ đỉnh-gợn + quoin) + CỔNG (khoét gap + 2 cột, gateWorldSpec cho editor kéo) — merge 1 mesh.
 * LIÊN HỆ  — Tách từ fromState.ts (god-module 1966 dòng, 2026-06-11) — code di NGUYÊN VĂN.
 *            File này chỉ import TYPE từ fromState (SiteRenderCtx/SiteRenderOpts — erased, không circular
 *            runtime). Mix mặt tường (fence.mix) đọc qua opts.fenceMixMat — hợp đồng Factory giữ nguyên.
 * DISPOSE: geos/mats build vào ctx — caller sở hữu. TexturedSurface (headless path) push ctx.shaders.
 */

import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

import { TexturedSurface } from '../../shaders/surface/TexturedSurface'
import { type FenceConfig, type SiteState } from '../state'
import type { SiteRenderCtx, SiteRenderOpts } from './fromState'

// Box dời sẵn về (x,y,z) — bake transform vào geometry để mergeGeometries gộp 1 mesh.
function box(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(w, h, d)
  g.translate(x, y, z)
  return g
}

// CỔNG ra vào: khoét gap 1 cạnh + 2 cột. side 0=+Z 1=−Z 2=+X 3=−X; posAlong (m, dọc cạnh từ tâm); halfGap (m).
interface GateSpec {
  side: number
  posAlong: number
  halfGap: number
  postH: number // m — chiều cao 2 cột cổng (độc lập chiều cao tường)
}

// Khoét [gc−gh, gc+gh] khỏi span [lo,hi] → 1–2 đoạn còn lại. Gap ngoài span → giữ nguyên.
function gapSplit(lo: number, hi: number, gc: number, gh: number): [number, number][] {
  const a = gc - gh
  const b = gc + gh
  if (b <= lo || a >= hi) return [[lo, hi]]
  const segs: [number, number][] = []
  if (a > lo) segs.push([lo, a])
  if (b < hi) segs.push([b, hi])
  return segs
}

// Kẹp tham số cổng → GateSpec hợp lệ (gap luôn trong cạnh, chừa ≥15cm) hoặc null. DÙNG CHUNG buildSiteFence
// (khoét gap) + gateWorldSpec (editor pick-box/drag) → single source, né drift toạ độ. null nếu không cổng.
function gateClamp(fence: FenceConfig, halfW: number, halfD: number): GateSpec | null {
  if (fence.type !== 'wall' || !fence.gate) return null
  const side = fence.gateSide ?? 0
  const spanHalf = side <= 1 ? halfW : halfD
  const halfGap = Math.min((fence.gateWidth ?? 1400) / 2000, spanHalf - 0.15)
  if (halfGap <= 0.1) return null
  const lim = spanHalf - halfGap
  const posAlong = Math.max(-lim, Math.min(lim, (fence.gatePos ?? 0) / 1000))
  return { side, posAlong, halfGap, postH: (fence.gatePostH ?? 1600) / 1000 }
}

// Vị trí cổng trong THẾ GIỚI (m, XZ tâm gap + trục tiếp tuyến để editor kéo dọc cạnh). null nếu không cổng
// hợp lệ. cx/cz = tâm khoảng trống; axis='x'(cạnh trước/sau) | 'z'(trái/phải) = trục trượt → gatePos. Editor
// (ArchPlanLab) dùng để đặt pick-box + chiếu drag → gatePos. Khớp gatePostXZ (cùng gateClamp).
export interface GateWorldSpec {
  cx: number
  cz: number
  axis: 'x' | 'z'
  halfSpan: number // m — nửa bề rộng gap (dọc tiếp tuyến)
  postH: number // m
  top: number // m — mặt nền (đáy box)
  side: number
}
export function gateWorldSpec(fence: FenceConfig, site: SiteState): GateWorldSpec | null {
  const inset = fence.inset / 1000
  const halfW = site.lotWidth / 2000 - inset
  const halfD = site.lotDepth / 2000 - inset
  if (halfW <= 0 || halfD <= 0) return null
  const gc = gateClamp(fence, halfW, halfD)
  if (!gc) return null
  const axis: 'x' | 'z' = gc.side <= 1 ? 'x' : 'z'
  const cx = gc.side <= 1 ? gc.posAlong : gc.side === 2 ? halfW : -halfW
  const cz = gc.side === 0 ? halfD : gc.side === 1 ? -halfD : gc.posAlong
  return {
    cx,
    cz,
    axis,
    halfSpan: gc.halfGap,
    postH: gc.postH,
    top: site.groundThick / 1000,
    side: gc.side,
  }
}

// Toạ độ XZ (m) 2 cột cổng = 2 mép gap trên cạnh `side`.
function gatePostXZ(gate: GateSpec, halfW: number, halfD: number): [number, number][] {
  const a = gate.posAlong - gate.halfGap
  const b = gate.posAlong + gate.halfGap
  if (gate.side === 0)
    return [
      [a, halfD],
      [b, halfD],
    ]
  if (gate.side === 1)
    return [
      [a, -halfD],
      [b, -halfD],
    ]
  if (gate.side === 2)
    return [
      [halfW, a],
      [halfW, b],
    ]
  return [
    [-halfW, a],
    [-halfW, b],
  ]
}

// 4 cạnh tường rào dạng [side, axis, fixedCoord, lo, hi]. N/S full (±(halfW+r)) phủ góc; E/W short (±(halfD−r)).
function wallEdgeSpecs(
  halfW: number,
  halfD: number,
  r: number
): [number, 'x' | 'z', number, number, number][] {
  return [
    [0, 'x', halfD, -(halfW + r), halfW + r],
    [1, 'x', -halfD, -(halfW + r), halfW + r],
    [2, 'z', halfW, -(halfD - r), halfD - r],
    [3, 'z', -halfW, -(halfD - r), halfD - r],
  ]
}

// Tường rào: 4 cạnh low-wall liền. tk = bề dày. Đứng trên mặt nền (y bắt đầu từ top). gate → khoét cạnh + 2 cột box.
function wallFenceGeos(
  halfW: number,
  halfD: number,
  h: number,
  top: number,
  tk: number,
  gate?: GateSpec
): THREE.BufferGeometry[] {
  const cy = top + h / 2
  const r = tk / 2
  const out: THREE.BufferGeometry[] = []
  for (const [side, axis, fixed, lo, hi] of wallEdgeSpecs(halfW, halfD, r)) {
    const spans =
      gate && gate.side === side ? gapSplit(lo, hi, gate.posAlong, gate.halfGap) : [[lo, hi]]
    for (const [s0, s1] of spans) {
      const len = s1 - s0
      if (len <= 0.02) continue
      const mid = (s0 + s1) / 2
      out.push(axis === 'x' ? box(len, h, tk, mid, cy, fixed) : box(tk, h, len, fixed, cy, mid))
    }
  }
  if (gate) {
    const s = tk * 1.18
    for (const [px, pz] of gatePostXZ(gate, halfW, halfD)) {
      out.push(box(s, gate.postH, s, px, top + gate.postH / 2, pz)) // cao riêng theo gatePostH
    }
  }
  return out
}

// Tường rào ĐÁ (chỉ wallTex='stone'): mỗi cạnh = profile "chữ-nhật-đỉnh-tròn" extrude dọc, ĐỈNH gợn cao-thấp
// → cảm giác đá xếp dày + đỉnh bo tròn (đặc tả user). Dày hơn tường thường. Triplanar (TexturedSurface) lo
// texture nên KHÔNG cần uv. + CỘT GÓC ĐÁ (quoin) ở 4 góc: 2 coping tròn tách nhau ở góc → hở apex; cột góc
// chunky (×1.18 tk, cao tới đỉnh coping) LẤP góc đó. Trả 4 cạnh + 4 góc (merge ở buildFence).
function stoneWallFenceGeos(
  halfW: number,
  halfD: number,
  h: number,
  top: number,
  tk: number,
  gate?: GateSpec
): THREE.BufferGeometry[] {
  const r = tk / 2
  const geos: THREE.BufferGeometry[] = []
  const seeds = [11, 23, 37, 53] // seed gợn-đỉnh deterministic mỗi cạnh
  wallEdgeSpecs(halfW, halfD, r).forEach(([side, axis, fixed, lo, hi], ei) => {
    const spans =
      gate && gate.side === side ? gapSplit(lo, hi, gate.posAlong, gate.halfGap) : [[lo, hi]]
    spans.forEach(([s0, s1], si) => {
      const len = s1 - s0
      if (len <= 0.08) return
      const mid = (s0 + s1) / 2
      const seed = seeds[ei] + si * 7
      geos.push(
        axis === 'x'
          ? stoneWallEdge(mid, fixed, 'x', len, tk, top, h, seed)
          : stoneWallEdge(fixed, mid, 'z', len, tk, top, h, seed)
      )
    })
  })
  // 4 cột góc (quoin, cao = tường+5cm) lấp notch góc.
  for (const [px, pz] of [
    [halfW, halfD],
    [-halfW, halfD],
    [halfW, -halfD],
    [-halfW, -halfD],
  ] as const) {
    geos.push(stoneCornerPost(px, pz, top, h + 0.05, tk))
  }
  // 2 cột cổng (cùng dạng quoin nhưng cao RIÊNG = gate.postH — trụ cổng cao hơn).
  if (gate) {
    for (const [px, pz] of gatePostXZ(gate, halfW, halfD)) {
      geos.push(stoneCornerPost(px, pz, top, gate.postH, tk))
    }
  }
  return geos
}

// Cột góc/cổng đá (quoin). Vuông ×1.18 bề dày tường (faces NHÔ ra ngoài mặt tường → trùm mối nối, KHÔNG
// coplanar = né z-fight). ph = TỔNG chiều cao cột (caller truyền: góc = tường+5cm; cổng = gatePostH riêng).
// RoundedBox bo 2.5cm → 4 GÓC TRÊN cột tròn (đừng sắc, khớp đỉnh coping). Có uv → merge khớp cạnh. Triplanar lo texture.
function stoneCornerPost(
  px: number,
  pz: number,
  baseY: number,
  ph: number,
  tk: number
): THREE.BufferGeometry {
  const s = tk * 1.18
  const g = new RoundedBoxGeometry(s, ph, s, 3, 0.025)
  g.translate(px, baseY + ph / 2, pz)
  return g
}

// 1 cạnh tường đá: profile (lat×y) = chữ nhật 2 mặt + cung tròn đỉnh (bán kính r=tk/2), extrude theo trục
// edge với M trạm. ĐỈNH y gợn theo tổng-2-sin (deterministic theo seed → KHÔNG nhấp nháy mỗi rebuild;
// rebuild ra y HỆT). Tách verts/indices (Rule-50 + complexity) — code di nguyên văn, 0 đổi hành vi.
function stoneWallEdge(
  cx: number,
  cz: number,
  axis: 'x' | 'z',
  length: number,
  tk: number,
  baseY: number,
  h: number,
  seed: number
): THREE.BufferGeometry {
  const r = tk / 2
  const A = 4 // số đoạn cung đỉnh tròn (mượt vừa, rẻ)
  const M = Math.max(8, Math.round(length / 0.4)) // trạm dọc cạnh (~1/0.4m)
  const jit = 0.04 // m — biên gợn cao-thấp đỉnh
  const K = A + 3 // profile: outer-bottom + (A+1) cung + inner-bottom
  // ĐỈNH gợn: tổng 2 sin lệch pha theo seed → nhấp nhô mượt, lặp lại y hệt mỗi build.
  const topYAt = (t: number): number =>
    baseY + h + jit * (0.6 * Math.sin(2.3 * t + seed) + 0.4 * Math.sin(5.1 * t + seed * 1.7))
  const { pos, uvs } = stoneWallVerts(cx, cz, axis, length, r, baseY, topYAt, { A, M, K })
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  g.setIndex(stoneWallIndices(M, K, axis === 'z'))
  g.computeVertexNormals() // smooth (đỉnh cung tròn ăn sáng) — TRƯỚC toNonIndexed để giữ normal đã blend
  // NON-INDEXED: cột góc (RoundedBoxGeometry) là non-indexed → trộn indexed/non-indexed = mergeGeometries NULL
  // (mất hình, KI-004). Đồng bộ về non-indexed. computeVertexNormals chạy TRƯỚC nên normal mượt bake sẵn.
  return g.toNonIndexed()
}

// Lưới đỉnh (profile K × trạm M+1) 1 cạnh tường đá. uv = placeholder (triplanar BỎ QUA uv, nhưng pipeline
// WebGPU MeshStandardNodeMaterial CẦN attr này — thiếu là draw fail, KI-010).
function stoneWallVerts(
  cx: number,
  cz: number,
  axis: 'x' | 'z',
  length: number,
  r: number,
  baseY: number,
  topYAt: (t: number) => number,
  d: { A: number; M: number; K: number }
): { pos: number[]; uvs: number[] } {
  const pos: number[] = []
  const uvs: number[] = []
  for (let i = 0; i <= d.M; i++) {
    const f = i / d.M
    const along = -length / 2 + f * length
    const topY = topYAt(f * length)
    for (let k = 0; k < d.K; k++) {
      let lat: number
      let y: number
      if (k === 0) {
        lat = r // outer-bottom
        y = baseY
      } else if (k === d.K - 1) {
        lat = -r // inner-bottom
        y = baseY
      } else {
        const a = (Math.PI * (k - 1)) / d.A // cung 0..π: outer-top → đỉnh → inner-top
        lat = r * Math.cos(a)
        y = topY - r + r * Math.sin(a)
      }
      const x = axis === 'x' ? cx + along : cx + lat
      const z = axis === 'x' ? cz + lat : cz + along
      pos.push(x, y, z)
      uvs.push(f, k / (d.K - 1))
    }
  }
  return { pos, uvs }
}

// Index mặt bên + end-cap fan 2 đầu (ẩn ở góc, tránh thủng nếu lộ). Winding (a,b,d,b,c,d): mặt ngoài +lat,
// mặt trong −lat → pháp tuyến đúng (FrontSide). lat→z (trục X) thuận tay; lat→x (trục Z) ĐẢO handedness →
// phải LẬT winding, nếu không mặt ngoài 2 cạnh vuông góc quay pháp tuyến vào trong → cull "mất 1 mặt" (KI-010).
function stoneWallIndices(M: number, K: number, flip: boolean): number[] {
  const idx: number[] = []
  const vid = (i: number, k: number): number => i * K + k
  for (let i = 0; i < M; i++) {
    for (let k = 0; k < K - 1; k++) {
      const a = vid(i, k)
      const b = vid(i + 1, k)
      const c = vid(i + 1, k + 1)
      const d = vid(i, k + 1)
      if (flip) {
        idx.push(a, d, b, b, d, c)
      } else {
        idx.push(a, b, d, b, c, d)
      }
    }
  }
  for (const i of [0, M]) {
    for (let k = 1; k < K - 1; k++) {
      const a = vid(i, 0)
      const out = i === 0 // 2 đầu pháp tuyến ngược nhau; lật thêm theo `flip` cho khớp mặt bên
      if (out !== flip) idx.push(a, vid(i, k + 1), vid(i, k))
      else idx.push(a, vid(i, k), vid(i, k + 1))
    }
  }
  return idx
}

// 1 cạnh rào gỗ: cọc cách ~1.8m + 2 thanh ngang (box dài xoay theo cạnh). A→B trong XZ.
function woodEdge(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  h: number,
  top: number
): THREE.BufferGeometry[] {
  const geos: THREE.BufferGeometry[] = []
  const dx = bx - ax
  const dz = bz - az
  const len = Math.hypot(dx, dz)
  if (len < 1e-4) return geos
  const ux = dx / len
  const uz = dz / len
  const post = 0.1
  const nPosts = Math.max(2, Math.round(len / 1.8) + 1)
  for (let i = 0; i < nPosts; i++) {
    const t = (i / (nPosts - 1)) * len
    geos.push(box(post, h, post, ax + ux * t, top + h / 2, az + uz * t))
  }
  const ang = Math.atan2(-uz, ux) // Three Ry: +X → (cos, -sin) = (ux, uz)
  for (const ry of [top + h * 0.35, top + h * 0.8]) {
    const g = new THREE.BoxGeometry(len, 0.08, 0.04)
    g.rotateY(ang)
    g.translate((ax + bx) / 2, ry, (az + bz) / 2)
    geos.push(g)
  }
  return geos
}

function woodFenceGeos(
  halfW: number,
  halfD: number,
  h: number,
  top: number
): THREE.BufferGeometry[] {
  return [
    ...woodEdge(-halfW, halfD, halfW, halfD, h, top),
    ...woodEdge(halfW, halfD, halfW, -halfD, h, top),
    ...woodEdge(halfW, -halfD, -halfW, -halfD, h, top),
    ...woodEdge(-halfW, -halfD, -halfW, halfD, h, top),
  ]
}

// Hàng rào quanh biên lô (lùi inset), merge 1 mesh để giữ draw call thấp (budget rule #2).
// Tường rào (type='wall') + wallTex='cinder'/'stone' + caller bơm texture → MẶT = TexturedSurface (triplanar,
// đúng mặt DỌC). Thiếu texture (hoặc 'plain') → màu phẳng. Gỗ → màu nâu phẳng. push ctx.shaders khi TexturedSurface.
// EXPORT: caller (editor) dựng rào vào GROUP RIÊNG (dirty-check) để né rebuild rào/nước mỗi frame kéo slider rào.
// Dựng 1 LỚP rào (fence) vào ctx. site = lô (lotWidth/Depth/groundThick); fence = config lớp này (đa-lớp →
// caller loop site.fences). opts.fenceWallMat (nếu có) = material CACHED riêng cho lớp này (editor bơm per-kind).
export function buildSiteFence(
  fence: FenceConfig,
  site: SiteState,
  ctx: SiteRenderCtx,
  opts: SiteRenderOpts
): void {
  const h = fence.height / 1000
  const top = site.groundThick / 1000
  const halfW = site.lotWidth / 2000 - fence.inset / 1000
  const halfD = site.lotDepth / 2000 - fence.inset / 1000
  if (halfW <= 0 || halfD <= 0) return
  // CỔNG (chỉ type='wall'): khoét gap 1 cạnh + 2 cột. gateClamp lo kẹp halfGap/posAlong (gap luôn trong cạnh).
  const gate = gateClamp(fence, halfW, halfD) ?? undefined
  const geos = fenceGeosFor(fence, { halfW, halfD, h, top }, gate, opts)
  const merged = mergeGeometries(geos, false)
  for (const g of geos) g.dispose()
  if (!merged) return
  // 🎨 MIX mặt tường (fence.mix bật, chỉ type='wall') THẮNG wallTex; null (đang load/tắt) → fallback như cũ.
  const mixMat = fence.type === 'wall' ? (opts.fenceMixMat?.(fence) ?? null) : null
  const mesh = new THREE.Mesh(merged, mixMat ?? fenceMaterialFor(fence, ctx, opts))
  mesh.castShadow = true
  mesh.receiveShadow = true
  ctx.geos.push(merged)
  ctx.group.add(mesh)
}

// Đá (wallTex='stone') → geometry đỉnh-tròn-gợn + dày hơn (0.18), THEO LỰA CHỌN texture (không đợi load
// xong: đang load vẫn ra khối đá xám tạm). Cinder/plain → box phẳng mỏng (0.12). Gỗ → cọc + thanh ngang.
// fenceLodBox (đang kéo): stone tạm dùng box mỏng (rẻ) — material stone cached vẫn áp (triplanar lo).
function fenceGeosFor(
  fence: FenceConfig,
  f: { halfW: number; halfD: number; h: number; top: number },
  gate: GateSpec | undefined,
  opts: SiteRenderOpts
): THREE.BufferGeometry[] {
  if (fence.type !== 'wall') return woodFenceGeos(f.halfW, f.halfD, f.h, f.top)
  const isStone = (fence.wallTex ?? 'plain') === 'stone' && !opts.fenceLodBox
  return isStone
    ? stoneWallFenceGeos(f.halfW, f.halfD, f.h, f.top, 0.18, gate)
    : wallFenceGeos(f.halfW, f.halfD, f.h, f.top, 0.12, gate)
}

// Vật liệu MẶT tường: (1) fenceWallMat CACHED (editor — KHÔNG push shaders/mats, KHÔNG recompile mỗi rebuild
// → trị tụt fps kéo cổng); (2) fenceWallTextures → tạo TexturedSurface (headless, push shaders); (3) màu phẳng.
function fenceMaterialFor(
  fence: FenceConfig,
  ctx: SiteRenderCtx,
  opts: SiteRenderOpts
): THREE.Material {
  const isWall = fence.type === 'wall'
  const wantTex = isWall && (fence.wallTex ?? 'plain') !== 'plain'
  if (wantTex && opts.fenceWallMat) return opts.fenceWallMat // cached — caller sở hữu dispose
  if (wantTex && opts.fenceWallTextures) {
    const surf = new TexturedSurface({
      maps: opts.fenceWallTextures,
      tileSizeMeters: opts.fenceWallTileMeters ?? 2,
    })
    ctx.shaders.push(surf)
    return surf.getMaterial()
  }
  const flat = new THREE.MeshStandardMaterial(
    isWall ? { color: 0x9a9690, roughness: 0.95 } : { color: 0x8a6a45, roughness: 0.85 }
  )
  ctx.mats.push(flat)
  return flat
}
