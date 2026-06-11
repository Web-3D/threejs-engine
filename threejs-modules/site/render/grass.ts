/**
 * VỊ TRÍ   — threejs-modules/site/render/grass.ts  (site-kit)
 * VAI TRÒ  — Sub-domain CỎ 3D của renderer lô: GrassBlades scatter (bám gò height-field, né exclude)
 *            + chữ ký structural (grassBuildSig — caller dirty-check né re-scatter).
 * LIÊN HỆ  — Tách từ fromState.ts (god-module 1966 dòng, 2026-06-11) — code di NGUYÊN VĂN.
 *            Import `zoneRects` NGƯỢC từ fromState (value circular AN TOÀN: function declaration hoisted,
 *            chỉ gọi lúc runtime — cùng bài state↔state-parse).
 * DISPOSE: buildVegetation push ctx.shaders (lõi quản); buildSiteGrass = CALLER sở hữu (editor skipGrass).
 */

import { GrassBlades, type GrassExcludeRect } from '../../components/GrassBlades'
import { type SiteState } from '../state'
import { heightAt, makeHeightField } from '../terrain'
import { type SiteRenderCtx, zoneRects } from './fromState'

// Cỏ 3D nhú lên (tier B — GrassBlades) = LỚP THỰC VẬT ĐỘC LẬP, KHÔNG dính loại surface: mọc trên nền BẤT KỲ
// (grass/soil/gravel) khi grass3d.enabled. Gốc ở mặt trên nền. dispose qua ctx.shaders. exclude = footprint
// foundation → cỏ né (lá rơi trong rect bị bỏ). Surface material (GrassGround/soil/gravel) là lớp riêng (buildGround).
export function buildVegetation(
  site: SiteState,
  ctx: SiteRenderCtx,
  exclude: GrassExcludeRect[]
): GrassBlades | null {
  const blades = buildSiteGrass(site, exclude)
  if (!blades) return null
  ctx.group.add(blades.getMesh())
  ctx.shaders.push(blades) // lõi quản dispose qua ctx.shaders (consumer KHÔNG skipGrass)
  return blades
}

// Dựng RIÊNG bãi cỏ (GrassBlades) cho lô — KHÔNG add vào ctx, KHÔNG track dispose → CALLER sở hữu (add
// mesh + dispose). Dùng khi caller=editor tự quản cỏ trong group bền + dirty-check (skipGrass), để né
// re-scatter 24000 lá mỗi lần sửa thứ KHÔNG liên quan cỏ. Trả null nếu cỏ tắt.
export function buildSiteGrass(site: SiteState, exclude: GrassExcludeRect[]): GrassBlades | null {
  if (!site.grass3d.enabled) return null // độc lập surface — bất kỳ nền nào cũng rải được
  const g = site.grass3d
  // 🏔️ Cỏ bám gò: height-field DÙNG CHUNG maskRects với nền — exclude (foundation+hồ) ≡ buildHeightField
  // (buildingFootprint+hồ, cùng _foundationRects()+waterRect) ⇒ gốc lá khớp ĐÚNG mặt nền displaced. Tắt → null.
  const terr = site.terrain
  const hf =
    terr && terr.enabled
      ? makeHeightField(
          terr,
          [...exclude, ...zoneRects(site)], // 🏔️ cỏ KHỚP nền: chừa phẳng dưới zones (như buildHeightField)
          site.lotWidth / 2000,
          site.lotDepth / 2000
        )
      : null
  const blades = new GrassBlades({
    width: site.lotWidth / 1000,
    depth: site.lotDepth / 1000,
    baseY: site.groundThick / 1000,
    density: g.density,
    bladeHeight: g.height,
    bladeWidth: g.bladeWidth,
    midWidth: g.midWidth,
    segments: g.segments,
    taper: g.taper,
    curveLR: g.curveLR,
    bend: g.bend,
    cup: g.cup,
    cupGeo: g.cupGeo,
    cupNormalGain: g.cupNormalGain,
    bladesPerClump: g.bladesPerClump,
    clumpRadius: g.clumpRadius,
    clumpSplay: g.clumpSplay,
    color: g.color,
    innerColor: g.innerColor,
    shadowDark: g.shadowDark,
    shadowSpan: g.shadowSpan,
    contactDark: g.contactDark, // luôn dựng contact mesh nếu >0 → toggle live cả 2 chiều
    contactRadius: g.contactRadius,
    heightAt: hf ? (x, z) => heightAt(hf, x, z) : undefined, // 🏔️ gốc lá bám gò (null → cỏ phẳng như cũ)
    exclude,
  })
  if (!g.contactOn) blades.setContactDark(0) // tắt vệt = uniform 0 (mesh vẫn có, bật lại live được)
  // Cỏ NHẬN bóng sun (nhà/rào/mái đổ xuống bãi) — xài lại shadow map có sẵn, rẻ. KHÔNG castShadow:
  // lá 6mm < 1 texel @19mm/texel của shadow cam ±20m → rớt/nhấp nháy; self-shadow đã có bóng-gốc-giả lo.
  blades.getMesh().receiveShadow = true
  return blades
}

// Chữ ký STRUCTURAL của bãi cỏ: CHỈ field buộc dựng lại geometry/scatter — KHÔNG gồm field live (màu/bóng/
// vệt = uniform, đổi qua setter KHÔNG rebuild). Caller so sánh sig: giống → giữ nguyên mesh (bỏ re-scatter
// khi sửa thứ KHÔNG liên quan cỏ: di chuyển nhà, đổi màu tường…); khác → dựng lại. Footprint/hồ đổi (exclude)
// → sig đổi → rải lại (cỏ né chỗ mới). contactDark>0 = mesh vệt CÓ/KHÔNG (giá trị + on/off vẫn live).
export function grassBuildSig(site: SiteState, exclude: GrassExcludeRect[]): string {
  const g = site.grass3d
  if (!site.show || !g.enabled) return 'off'
  return JSON.stringify([
    site.lotWidth,
    site.lotDepth,
    site.groundThick,
    g.density,
    g.height,
    g.bladeWidth,
    g.midWidth,
    g.segments,
    g.taper,
    g.curveLR,
    g.bend,
    g.cup,
    g.cupGeo,
    g.cupNormalGain,
    g.bladesPerClump,
    g.clumpRadius,
    g.clumpSplay,
    g.contactDark > 0,
    // 🏔️ terrain đổi → cỏ rải lại bám gò mới; KÈM groundLayers (zone đổi → mask phẳng-dưới-zone đổi → re-scatter)
    site.terrain && site.terrain.enabled ? [site.terrain, site.groundLayers ?? []] : null,
    exclude,
  ])
}
