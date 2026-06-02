/**
 * VỊ TRÍ   — threejs-modules/site/render/fromState.ts  (site-kit)
 * VAI TRÒ  — RENDERER lô: SiteState (mm) → nền slab (dày) + hàng rào (gỗ/tường, merged) vào ctx
 *            (group + arrays caller SỞ HỮU). Headless, KHÔNG DOM, KHÔNG dispose ctx (giống building).
 * LIÊN HỆ  — Mirror pattern building-kit/render/fromState. ĐỘC LẬP building/ (không import).
 *            Nền: slab BoxGeometry đáy y=0, top y=groundThick → cao hơn grid editor (hết z-fight).
 *
 * CÁCH DÙNG:
 *   renderSiteState(site, { group: siteGroup, geos, mats })   // caller tự dispose geos/mats
 * DISPOSE: ctx.geos/mats do caller dispose. Renderer không giữ gì.
 */

import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

import { GrassBlades } from '../../components/GrassBlades'
import { GrassGround } from '../../shaders/ground/GrassGround'
import { GROUND_PRESETS, type SiteState } from '../state'

// Resource caller sở hữu — renderer build vào đây, KHÔNG dispose (giống building BuildRenderCtx).
// shaders: vật liệu procedural (vd GrassGround) có dispose() riêng (ngoài mats phẳng).
export interface SiteRenderCtx {
  group: THREE.Group
  geos: THREE.BufferGeometry[]
  mats: THREE.Material[]
  shaders: { dispose(): void }[]
}

// Dựng lô vào ctx. show=false → không dựng gì (caller để building về y=0).
export function renderSiteState(site: SiteState, ctx: SiteRenderCtx): void {
  if (!site.show) return
  buildGround(site, ctx)
  buildVegetation(site, ctx)
  if (site.fence.enabled) buildFence(site, ctx)
}

// Cỏ 3D nhú lên (tier B — GrassBlades) phủ lên nền cỏ. Chỉ khi ground='grass' & bật. Gốc ở mặt trên nền.
// dispose qua ctx.shaders (GrassBlades.dispose gỡ mesh + geo + mat). Gió chạy bằng built-in time.
function buildVegetation(site: SiteState, ctx: SiteRenderCtx): void {
  if (site.ground !== 'grass' || !site.grass3d.enabled) return
  const g = site.grass3d
  const blades = new GrassBlades({
    width: site.lotWidth / 1000,
    depth: site.lotDepth / 1000,
    baseY: site.groundThick / 1000,
    density: g.density,
    bladeHeight: g.height,
    bladeWidth: g.bladeWidth,
    wind: g.wind,
    windSpeed: g.windSpeed,
    baseColor: g.baseColor,
    tipColor: g.tipColor,
    curve: g.curve,
    twist: g.twist,
    taper: g.taper,
  })
  ctx.group.add(blades.getMesh())
  ctx.shaders.push(blades)
}

// Nền = slab dày: đáy y=0, top y=t. PBR nhận IBL + đổ bóng. Lô tâm world (0,0).
function buildGround(site: SiteState, ctx: SiteRenderCtx): void {
  const lw = site.lotWidth / 1000
  const ld = site.lotDepth / 1000
  const t = site.groundThick / 1000
  const geo = new THREE.BoxGeometry(lw, t, ld)
  const mesh = new THREE.Mesh(geo, groundMaterial(site, ctx))
  mesh.position.set(0, t / 2, 0)
  mesh.receiveShadow = true
  ctx.geos.push(geo)
  ctx.group.add(mesh)
}

// grass = procedural shader (GrassGround, tier A — trông thật); soil/gravel = màu phẳng (nâng cấp sau).
// Track đúng nơi: shader có dispose() riêng → ctx.shaders; material phẳng → ctx.mats.
function groundMaterial(site: SiteState, ctx: SiteRenderCtx): THREE.Material {
  if (site.ground === 'grass') {
    const grass = new GrassGround({ scale: 1.0 })
    ctx.shaders.push(grass)
    return grass.getMaterial()
  }
  const preset = GROUND_PRESETS[site.ground]
  const mat = new THREE.MeshStandardMaterial({ color: preset.color, roughness: preset.roughness })
  ctx.mats.push(mat)
  return mat
}

// Box dời sẵn về (x,y,z) — bake transform vào geometry để mergeGeometries gộp 1 mesh.
function box(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(w, h, d)
  g.translate(x, y, z)
  return g
}

// Tường rào: 4 cạnh low-wall liền. tk = bề dày. Đứng trên mặt nền (y bắt đầu từ top).
function wallFenceGeos(
  halfW: number,
  halfD: number,
  h: number,
  top: number,
  tk: number
): THREE.BufferGeometry[] {
  const cy = top + h / 2
  return [
    box(halfW * 2 + tk, h, tk, 0, cy, halfD),
    box(halfW * 2 + tk, h, tk, 0, cy, -halfD),
    box(tk, h, halfD * 2 - tk, halfW, cy, 0),
    box(tk, h, halfD * 2 - tk, -halfW, cy, 0),
  ]
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
function buildFence(site: SiteState, ctx: SiteRenderCtx): void {
  const inset = site.fence.inset / 1000
  const h = site.fence.height / 1000
  const top = site.groundThick / 1000
  const halfW = site.lotWidth / 2000 - inset
  const halfD = site.lotDepth / 2000 - inset
  if (halfW <= 0 || halfD <= 0) return
  const isWall = site.fence.type === 'wall'
  const geos = isWall
    ? wallFenceGeos(halfW, halfD, h, top, 0.12)
    : woodFenceGeos(halfW, halfD, h, top)
  const merged = mergeGeometries(geos, false)
  for (const g of geos) g.dispose()
  if (!merged) return
  const mat = new THREE.MeshStandardMaterial(
    isWall ? { color: 0x9a9690, roughness: 0.95 } : { color: 0x8a6a45, roughness: 0.85 }
  )
  const mesh = new THREE.Mesh(merged, mat)
  mesh.castShadow = true
  mesh.receiveShadow = true
  ctx.geos.push(merged)
  ctx.mats.push(mat)
  ctx.group.add(mesh)
}
