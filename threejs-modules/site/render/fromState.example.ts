/**
 * VỊ TRÍ   — threejs-modules/site/render/fromState.example.ts  (site-kit)
 * VAI TRÒ  — Smoke headless: dựng SiteState mặc định vào group rời rồi dispose. Compile-checked
 *            (không test runner) — verify renderSiteState + dispose-pattern hợp lệ độc lập.
 */

import * as THREE from 'three'

import { defaultSiteState } from '../state'
import { renderSiteState, type SiteRenderCtx } from './fromState'

const group = new THREE.Group()
const geos: THREE.BufferGeometry[] = []
const mats: THREE.Material[] = []
const ctx: SiteRenderCtx = { group, geos, mats }

renderSiteState(defaultSiteState(), ctx)
console.log(`site: ${group.children.length} mesh, ${geos.length} geo, ${mats.length} mat`)

// Dispose (caller sở hữu resource — renderer không giữ gì).
for (const g of geos) g.dispose()
for (const m of mats) m.dispose()
group.clear()
