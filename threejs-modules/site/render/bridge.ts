/**
 * VỊ TRÍ   — threejs-modules/site/render/bridge.ts  (site-kit render)
 * VAI TRÒ  — Dựng 1 CẦU (BridgeConfig) vào group: VÁN RỜI bám mặt cầu (vòm parabola taiko-bashi | THẲNG
 *            boardwalk) + VÀNH biên liền 2 cạnh (dầm dọc tạo độ dày mép — chỗ trụ con/trụ đỡ bám) + LAN CAN
 *            (tay vịn + trụ con vuông/tròn) + TRỤ ĐỠ 2-trụ/hàng dưới vành — đứng trên lòng hồ TỰ ĐÂM chân
 *            tới đáy basin (waterDropAt — cùng cơ chế GroundDrop của cột foundation building-kit).
 * LIÊN HỆ  — Mô hình tham số theo industry (Houdini Arch Bridge SOP / CityEngine pier / RailClone deck+pier /
 *            SideFX Japanese taiko-bashi). ctx = SiteRenderCtx (group/geos/mats — caller sở hữu, dispose).
 *
 * CÁCH DÙNG: buildSiteBridge(bridge, site, ctx) — mỗi cầu enabled gọi 1 lần (như buildSiteFence).
 * DISPOSE: geo/mat đẩy vào ctx.geos/mats → caller dispose (KHÔNG dispose tại đây).
 */

import * as THREE from 'three'

import type { BridgeConfig, SiteState } from '../state'
import type { SiteRenderCtx } from './fromState'
import { waterDropAt } from './water'

const RAIL_INSET = 0.06 // m — vành + lan can thụt vào từ mép mặt cầu
const PLANK_FILL = 0.86 // ván chiếm 86% bước chia → khe hở giữa các tấm (ván RỜI, thấy từng tấm gỗ thật)
const ROUND_SEG = 12 // số cạnh trụ con tròn (cylinder)

// Cao độ mặt cầu tại x (m, gốc tâm): arch = parabola (đỉnh giữa rise, 2 đầu 0 — đặt trên bờ/rim);
// flat = sàn PHẲNG nâng đều rise (boardwalk đường đi trên mặt hồ — cùng bộ thông số với cầu vòm).
function deckY(b: BridgeConfig, x: number, halfSpan: number): number {
  const rise = b.rise / 1000
  if (b.shape === 'flat') return rise
  const u = halfSpan > 0 ? x / halfSpan : 0
  return rise * (1 - u * u)
}

// Độ dốc dy/dx mặt cầu tại x — flat luôn 0; arch = đạo hàm parabola.
function deckSlope(b: BridgeConfig, x: number, halfSpan: number): number {
  if (b.shape === 'flat' || halfSpan <= 0) return 0
  return (-2 * (b.rise / 1000) * x) / (halfSpan * halfSpan)
}

// Box 1 chi tiết: tạo mesh đặt local (position + xoay quanh Z) → push geo + add vào group. KHÔNG bake matrix.
// ud = userData (vd tag pick mặt ván cầu cho 🎯 mix).
function addBox(
  g: THREE.Group,
  ctx: SiteRenderCtx,
  mat: THREE.Material,
  size: [number, number, number],
  pos: [number, number, number],
  rotZ = 0,
  ud?: Record<string, unknown>
): void {
  const geo = new THREE.BoxGeometry(size[0], size[1], size[2])
  ctx.geos.push(geo)
  const m = new THREE.Mesh(geo, mat)
  m.position.set(pos[0], pos[1], pos[2])
  m.rotation.z = rotZ
  m.castShadow = true
  m.receiveShadow = true
  if (ud) m.userData = ud
  g.add(m)
}

// Trụ con lan can theo dáng: 'square' = box | 'round' = cylinder (ROUND_SEG cạnh). Tiết diện postWidth.
function addPost(
  g: THREE.Group,
  ctx: SiteRenderCtx,
  mat: THREE.Material,
  b: BridgeConfig,
  h: number,
  pos: [number, number, number]
): void {
  const pw = b.postWidth / 1000
  if (b.postShape === 'square') {
    addBox(g, ctx, mat, [pw, h, pw], pos)
    return
  }
  const geo = new THREE.CylinderGeometry(pw / 2, pw / 2, h, ROUND_SEG)
  ctx.geos.push(geo)
  const m = new THREE.Mesh(geo, mat)
  m.position.set(pos[0], pos[1], pos[2])
  m.castShadow = true
  m.receiveShadow = true
  g.add(m)
}

// VÁN RỜI: plankCount tấm bám mặt cầu (nghiêng theo dốc), mỗi tấm chiếm PLANK_FILL bước chia → khe hở
// giữa các tấm (cảm giác ván gỗ thật, KHÔNG phải 1 dải liền). Dày deckThick. deckMat = mix material
// (nếu b.mix) — null = mat gỗ/đá chung. Tag userData.bridgeRef → 🎯 mix resolve được mặt ván.
function deckPlanks(
  g: THREE.Group,
  ctx: SiteRenderCtx,
  mat: THREE.Material,
  b: BridgeConfig,
  deckMat: THREE.Material | null
): void {
  const span = b.span / 1000
  const w = b.deckWidth / 1000
  const half = span / 2
  const step = span / b.plankCount
  const t = b.deckThick / 1000
  const ud = { bridgeRef: b, bridgeDeck: true }
  for (let i = 0; i < b.plankCount; i++) {
    const x = -half + (i + 0.5) * step
    const ang = Math.atan(deckSlope(b, x, half))
    const len = (step * PLANK_FILL) / Math.cos(ang)
    addBox(g, ctx, deckMat ?? mat, [len, t, w], [x, deckY(b, x, half), 0], ang, ud)
  }
}

// VÀNH biên (dầm dọc 2 cạnh cầu): dải LIỀN bám mặt cầu tại z=±railZ, tiết diện rimSize² — DÀY hơn ván →
// nhìn nghiêng mép cầu có độ dày; trụ con lan can + trụ đỡ gầm đều bám vào vành (chỗ tiếp xúc kết cấu).
function rims(g: THREE.Group, ctx: SiteRenderCtx, mat: THREE.Material, b: BridgeConfig): void {
  const span = b.span / 1000
  const half = span / 2
  const step = span / b.plankCount
  const rim = b.rimSize / 1000
  const z = b.deckWidth / 1000 / 2 - RAIL_INSET
  for (let i = 0; i < b.plankCount; i++) {
    const x = -half + (i + 0.5) * step
    const ang = Math.atan(deckSlope(b, x, half))
    const len = step / Math.cos(ang) + 0.01 // LIỀN (overlap 1cm) — vành là dầm, không chia khe như ván
    const y = deckY(b, x, half)
    addBox(g, ctx, mat, [len, rim, rim], [x, y, z], ang)
    addBox(g, ctx, mat, [len, rim, rim], [x, y, -z], ang)
  }
}

// LAN CAN 1 bên (zSign ±1): tay vịn (tiết diện railBeam, bám mặt cầu) + postCount trụ con (vuông/tròn)
// đứng từ TOP VÀNH lên tay vịn — chân trụ con tiếp xúc vành, không lơ lửng trên ván.
function railSide(
  g: THREE.Group,
  ctx: SiteRenderCtx,
  mat: THREE.Material,
  b: BridgeConfig,
  zSign: number
): void {
  const span = b.span / 1000
  const half = span / 2
  const rh = b.railHeight / 1000
  const rim = b.rimSize / 1000
  const beam = b.railBeam / 1000
  const z = zSign * (b.deckWidth / 1000 / 2 - RAIL_INSET)
  const step = span / b.plankCount
  for (let i = 0; i < b.plankCount; i++) {
    const x = -half + (i + 0.5) * step
    const ang = Math.atan(deckSlope(b, x, half))
    const len = step / Math.cos(ang) + 0.01
    addBox(g, ctx, mat, [len, beam, beam], [x, deckY(b, x, half) + rh, z], ang)
  }
  const ph = rh - rim / 2 // chân trụ con đặt trên vành (top vành = deckY + rim/2) → đỉnh chạm tay vịn
  if (ph < 0.05) return
  for (let p = 0; p < b.postCount; p++) {
    const x = b.postCount > 1 ? -half + (p / (b.postCount - 1)) * span : 0
    addPost(g, ctx, mat, b, ph, [x, deckY(b, x, half) + rim / 2 + ph / 2, z])
  }
}

// Vị trí x các HÀNG trụ đỡ: arch chia TRONG nhịp (2 đầu vòm ≈ 0, không cần trụ); flat (boardwalk) trải
// ĐỀU tới 2 đầu (inset nửa tiết diện — sàn phẳng nâng đều nên đầu cầu cũng cần chống).
function pierXs(b: BridgeConfig, half: number): number[] {
  const n = b.pierCount
  if (b.shape === 'flat' && n > 1) {
    const x1 = half - b.pierWidth / 2000
    return Array.from({ length: n }, (_, i) => -x1 + (i / (n - 1)) * 2 * x1)
  }
  return Array.from({ length: n }, (_, j) => -half + ((j + 1) / (n + 1)) * 2 * half)
}

// TRỤ ĐỠ gầm: pierCount HÀNG × 2 TRỤ 2 BÊN (z=±railZ — thẳng dưới vành, không còn 1 trụ giữa). Chân trụ:
// mặt nền (y=0); đứng trên lòng hồ → TỰ ĐÂM xuống đáy basin (waterDropAt theo world-XZ từng trụ — cùng
// cơ chế cột foundation building-kit). Đỉnh cắm 1cm vào đáy vành.
function piers(
  g: THREE.Group,
  ctx: SiteRenderCtx,
  mat: THREE.Material,
  b: BridgeConfig,
  site: SiteState
): void {
  const half = b.span / 2000
  const rim = b.rimSize / 1000
  const pw = b.pierWidth / 1000
  const z = b.deckWidth / 1000 / 2 - RAIL_INSET
  const th = (b.rotDeg * Math.PI) / 180
  const c = Math.cos(th)
  const s = Math.sin(th)
  const ox = b.offsetX / 1000
  const oz = b.offsetZ / 1000
  for (const x of pierXs(b, half)) {
    const yTop = deckY(b, x, half) - rim / 2 + 0.01 // cắm 1cm vào đáy vành
    for (const zs of [z, -z]) {
      // local (x,zs) → world qua R_y(θ): wx = x·cos+z·sin, wz = −x·sin+z·cos (như postDropAt foundation)
      const drop = waterDropAt(site, ox + x * c + zs * s, oz - x * s + zs * c)
      const h = yTop + drop
      if (h < 0.05) continue
      addBox(g, ctx, mat, [pw, h, pw], [x, yTop - h / 2, zs])
    }
  }
}

// Dựng 1 cầu vào ctx.group: sub-group đặt (offsetX/Z, mặt nền) + xoay rotDeg → ván rời + vành + lan can
// + trụ đỡ. deckMat = material MIX cho mặt ván (caller resolve từ b.mix qua MixManager) — null = gỗ/đá đơn.
export function buildSiteBridge(
  b: BridgeConfig,
  site: SiteState,
  ctx: SiteRenderCtx,
  deckMat: THREE.Material | null = null
): void {
  const mat = new THREE.MeshStandardMaterial({
    color: b.material === 'stone' ? 0x8f8c86 : 0x8a5a2b,
    roughness: b.material === 'stone' ? 0.95 : 0.85,
    metalness: 0,
  })
  ctx.mats.push(mat)
  const sub = new THREE.Group()
  sub.position.set(b.offsetX / 1000, site.groundThick / 1000, b.offsetZ / 1000)
  sub.rotation.y = (b.rotDeg * Math.PI) / 180
  deckPlanks(sub, ctx, mat, b, deckMat)
  rims(sub, ctx, mat, b)
  if (b.railOn) {
    railSide(sub, ctx, mat, b, 1)
    railSide(sub, ctx, mat, b, -1)
  }
  if (b.pierOn) piers(sub, ctx, mat, b, site)
  ctx.group.add(sub)
}
