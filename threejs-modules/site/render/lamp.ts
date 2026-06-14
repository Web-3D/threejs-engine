/**
 * VỊ TRÍ   — threejs-modules/site/render/lamp.ts  (site-kit render)
 * VAI TRÒ  — Dựng 1 ĐÈN sân vườn (LampConfig): TRỤ (cylinder) + CHỤP (nón) + BÓNG glow (sphere emissive).
 *            VỎ là mesh; REAL light KHÔNG ở đây — editor pool gán 1 PointLight theo TIP trả về (perf: vỏ
 *            nhiều bao nhiêu cũng được, chỉ N gần nhất có real-light; tránh add/remove light → né recompile).
 * LIÊN HỆ  — ctx = SiteRenderCtx (group/geos/mats, caller dispose). mats.glow = caller-owned (editor chỉnh
 *            color theo nightFactor; KHÔNG đẩy ctx.mats). Mirror buildSiteBridge/buildSiteFence.
 *
 * CÁCH DÙNG: const tip = buildSiteLamp(lamp, ctx, { post, glow }); editor zip tip → pool light.
 * DISPOSE: geo đẩy ctx.geos; post mat caller render đẩy ctx.mats 1 lần; glow = caller-owned (editor lo).
 */

import * as THREE from 'three'

import type { LampConfig } from '../state'
import type { SiteRenderCtx } from './fromState'

// Vị trí + màu + cường độ BÓNG đèn (world m) → editor gán 1 PointLight từ pool vào đây (perf: light KHÔNG
// ở mesh). intensity = base (editor ×nightFactor); range m (PointLight.distance, 0 = vô hạn).
export interface LampTip {
  x: number
  y: number
  z: number
  color: number
  intensity: number
  range: number
}

const POST_R = 0.045 // m — bán kính trụ
const CAP_R = 0.18 // m — bán kính nón chụp
const CAP_H = 0.16 // m — cao nón chụp
const BULB_R = 0.09 // m — bán kính bóng glow

// Dựng 1 đèn vào ctx.group. Trả tip (bóng) cho editor gán real-light. mats.post = trụ+chụp (chung, caller
// đẩy ctx.mats 1 lần); mats.glow = bóng emissive (caller-owned, editor chỉnh theo đêm — KHÔNG vào ctx.mats).
export function buildSiteLamp(
  lamp: LampConfig,
  ctx: SiteRenderCtx,
  mats: { post: THREE.Material; glow: THREE.Material }
): LampTip {
  const x = lamp.x / 1000
  const z = lamp.z / 1000
  const H = Math.max(0.5, lamp.height / 1000)
  const bulbY = H - 0.04 // bóng nằm ngay dưới nón chụp = vị trí real-light
  const postGeo = new THREE.CylinderGeometry(POST_R, POST_R * 1.3, H, 10) // trụ (chân hơi loe)
  ctx.geos.push(postGeo)
  const post = new THREE.Mesh(postGeo, mats.post)
  post.position.set(x, H / 2, z)
  post.castShadow = true
  post.receiveShadow = true
  ctx.group.add(post)
  const capGeo = new THREE.ConeGeometry(CAP_R, CAP_H, 10) // nón chụp trên bóng
  ctx.geos.push(capGeo)
  const cap = new THREE.Mesh(capGeo, mats.post)
  cap.position.set(x, H + CAP_H / 2, z)
  cap.castShadow = true
  ctx.group.add(cap)
  const bulbGeo = new THREE.SphereGeometry(BULB_R, 10, 8) // bóng glow (emissive) = vị trí real-light
  ctx.geos.push(bulbGeo)
  const bulb = new THREE.Mesh(bulbGeo, mats.glow)
  bulb.position.set(x, bulbY, z)
  ctx.group.add(bulb)
  return { x, y: bulbY, z, color: lamp.color, intensity: lamp.intensity, range: lamp.range / 1000 }
}
