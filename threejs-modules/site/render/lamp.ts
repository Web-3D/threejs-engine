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
const BULB_DROP = 0.04 // m — bóng glow nằm dưới đỉnh trụ (= vị trí real-light)
const lampHeightM = (lamp: LampConfig): number => Math.max(0.5, lamp.height / 1000)

// Tip (vị trí + thuộc tính real-light) THUẦN từ config — editor recompute LIVE khi kéo slider mà KHÔNG cần
// build lại mesh (chỉ gán pool). buildSiteLamp trả về chính hàm này (DRY).
export function lampTip(lamp: LampConfig): LampTip {
  return {
    x: lamp.x / 1000,
    y: lampHeightM(lamp) - BULB_DROP,
    z: lamp.z / 1000,
    color: lamp.color,
    intensity: lamp.intensity,
    range: lamp.range / 1000,
  }
}

// LIVE-tune 1 đèn (kéo slider): transform group + 3 part theo config MỚI — KHÔNG rebuild geometry (lõi giữ
// layout). post = scale.y theo H/baseH (giữ bán kính); cap/bulb dời Y. Editor gọi mỗi rAF + recompute tip pool.
export function tuneLampLive(group: THREE.Object3D, lamp: LampConfig): void {
  const H = lampHeightM(lamp)
  const baseH = (group.userData.lampH as number) || H // H lúc build (post geo gốc) — scale tuyệt đối, không dồn
  group.position.set(lamp.x / 1000, 0, lamp.z / 1000)
  for (const c of group.children) {
    const part = c.userData.lampPart as string | undefined
    if (part === 'post') {
      c.scale.y = H / baseH
      c.position.y = H / 2
    } else if (part === 'cap') c.position.y = H + CAP_H / 2
    else if (part === 'bulb') c.position.y = H - BULB_DROP
  }
}

// Dựng 1 đèn vào ctx.group. Trả tip (bóng) cho editor gán real-light. mats.post = trụ+chụp (chung, caller
// đẩy ctx.mats 1 lần); mats.glow = bóng emissive (caller-owned, editor chỉnh theo đêm — KHÔNG vào ctx.mats).
export function buildSiteLamp(
  lamp: LampConfig,
  ctx: SiteRenderCtx,
  mats: { post: THREE.Material; glow: THREE.Material }
): LampTip {
  const H = lampHeightM(lamp)
  const bulbY = H - BULB_DROP // bóng nằm ngay dưới nón chụp = vị trí real-light
  // 1 GROUP/đèn tại (x,0,z): vỏ ở local → editor 👆 Focus + 🤚 Move kéo group.position (0 rebuild, mirror cầu).
  // lampRef ở GROUP → walk-up từ mesh trúng ra group. lampH = H lúc build (tuneLampLive scale post). Tag part →
  // tuneLampLive transform đúng part. Tip vẫn world (x, bulbY, z).
  const group = new THREE.Group()
  group.position.set(lamp.x / 1000, 0, lamp.z / 1000)
  group.userData.lampRef = lamp
  group.userData.lampH = H
  const postGeo = new THREE.CylinderGeometry(POST_R, POST_R * 1.3, H, 10) // trụ (chân hơi loe)
  ctx.geos.push(postGeo)
  const post = new THREE.Mesh(postGeo, mats.post)
  post.position.set(0, H / 2, 0)
  post.castShadow = true
  post.receiveShadow = true
  post.userData.lampPart = 'post'
  group.add(post)
  const capGeo = new THREE.ConeGeometry(CAP_R, CAP_H, 10) // nón chụp trên bóng
  ctx.geos.push(capGeo)
  const cap = new THREE.Mesh(capGeo, mats.post)
  cap.position.set(0, H + CAP_H / 2, 0)
  cap.castShadow = true
  cap.userData.lampPart = 'cap'
  group.add(cap)
  const bulbGeo = new THREE.SphereGeometry(BULB_R, 10, 8) // bóng glow (emissive) = vị trí real-light
  ctx.geos.push(bulbGeo)
  const bulb = new THREE.Mesh(bulbGeo, mats.glow)
  bulb.position.set(0, bulbY, 0)
  bulb.userData.lampPart = 'bulb'
  group.add(bulb)
  ctx.group.add(group)
  return lampTip(lamp)
}
