/**
 * VỊ TRÍ   — threejs-modules/site/render/bridge.ts  (site-kit render)
 * VAI TRÒ  — Dựng 1 CẦU (BridgeConfig) vào group: VÒM VÁN (parabola taiko-bashi) + LAN CAN (dầm theo vòm +
 *            trụ con) + TRỤ ĐỠ gầm. Box thuần, đặt trong sub-group (offset/rotate per-cầu) → caller (Lab
 *            _syncBridge) gom mọi cầu enabled vào _bridgeGroup. Đặt TỰ DO (free placement) — không bám hồ.
 * LIÊN HỆ  — Mô hình tham số theo industry (Houdini Arch Bridge SOP / CityEngine pier / RailClone deck+pier /
 *            SideFX Japanese taiko-bashi). ctx = SiteRenderCtx (group/geos/mats — caller sở hữu, dispose).
 *
 * CÁCH DÙNG: buildSiteBridge(bridge, site, ctx) — mỗi cầu enabled gọi 1 lần (như buildSiteFence).
 * DISPOSE: geo/mat đẩy vào ctx.geos/mats → caller dispose (KHÔNG dispose tại đây).
 */

import * as THREE from 'three'

import type { BridgeConfig, SiteState } from '../state'
import type { SiteRenderCtx } from './fromState'

const DECK_T = 0.06 // m — dày tấm ván mặt cầu
const RAIL_BEAM = 0.05 // m — tiết diện dầm lan can
const POST_W = 0.05 // m — tiết diện trụ con lan can
const PIER_W = 0.12 // m — tiết diện trụ đỡ gầm
const RAIL_INSET = 0.06 // m — lan can thụt vào từ mép mặt cầu

// Cao độ vòm tại x (m, gốc tâm cầu): parabola — đỉnh giữa raised rise, hai đầu = 0 (đặt trên bờ/rim).
function archY(x: number, halfSpan: number, rise: number): number {
  const u = halfSpan > 0 ? x / halfSpan : 0
  return rise * (1 - u * u)
}

// Box 1 chi tiết: tạo mesh đặt local (position + xoay quanh Z) → push geo + add vào group. KHÔNG bake matrix.
// ud = userData (vd tag pick mặt ván cầu cho 🎯 mix). Trả mesh nếu caller cần thêm tag.
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

// VÒM VÁN: plankCount tấm box bám parabola (nghiêng theo độ dốc). Top ván = đường vòm. deckMat = mix material
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
  const rise = b.rise / 1000
  const half = span / 2
  const step = span / b.plankCount
  const ud = { bridgeRef: b, bridgeDeck: true }
  for (let i = 0; i < b.plankCount; i++) {
    const x = -half + (i + 0.5) * step
    const y = archY(x, half, rise)
    const slope = half > 0 ? (-2 * rise * x) / (half * half) : 0 // dy/dx parabola
    const ang = Math.atan(slope)
    addBox(g, ctx, deckMat ?? mat, [step / Math.cos(ang) + 0.01, DECK_T, w], [x, y, 0], ang, ud)
  }
}

// LAN CAN 1 bên (zSign ±1): dầm trên bám vòm (plankCount đoạn) + postCount trụ con đứng từ mặt ván lên.
function railSide(
  g: THREE.Group,
  ctx: SiteRenderCtx,
  mat: THREE.Material,
  b: BridgeConfig,
  zSign: number
): void {
  const span = b.span / 1000
  const rise = b.rise / 1000
  const half = span / 2
  const rh = b.railHeight / 1000
  const z = zSign * (b.deckWidth / 1000 / 2 - RAIL_INSET)
  const step = span / b.plankCount
  for (let i = 0; i < b.plankCount; i++) {
    const x = -half + (i + 0.5) * step
    const slope = half > 0 ? (-2 * rise * x) / (half * half) : 0
    const ang = Math.atan(slope)
    addBox(
      g,
      ctx,
      mat,
      [step / Math.cos(ang) + 0.01, RAIL_BEAM, RAIL_BEAM],
      [x, archY(x, half, rise) + rh, z],
      ang
    )
  }
  for (let p = 0; p < b.postCount; p++) {
    const x = b.postCount > 1 ? -half + (p / (b.postCount - 1)) * span : 0
    const y = archY(x, half, rise)
    addBox(g, ctx, mat, [POST_W, rh, POST_W], [x, y + rh / 2, z])
  }
}

// TRỤ ĐỠ gầm: pierCount trụ đứng từ mặt nền (y=0) lên đáy ván, ở các x giữa nhịp (bỏ 2 đầu = vòm ≈0).
function piers(g: THREE.Group, ctx: SiteRenderCtx, mat: THREE.Material, b: BridgeConfig): void {
  const span = b.span / 1000
  const rise = b.rise / 1000
  const half = span / 2
  for (let j = 1; j <= b.pierCount; j++) {
    const x = -half + (j / (b.pierCount + 1)) * span
    const h = archY(x, half, rise) - DECK_T
    if (h < 0.05) continue
    addBox(g, ctx, mat, [PIER_W, h, PIER_W], [x, h / 2, 0])
  }
}

// Dựng 1 cầu vào ctx.group: sub-group đặt (offsetX/Z, mặt nền) + xoay rotDeg → vòm ván + lan can + trụ đỡ.
// deckMat = material MIX cho mặt ván (caller resolve từ b.mix qua MixManager) — null = gỗ/đá đơn.
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
  if (b.railOn) {
    railSide(sub, ctx, mat, b, 1)
    railSide(sub, ctx, mat, b, -1)
  }
  if (b.pierOn) piers(sub, ctx, mat, b)
  ctx.group.add(sub)
}
