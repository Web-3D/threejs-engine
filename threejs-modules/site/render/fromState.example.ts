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
const shaders: { dispose(): void }[] = []
const ctx: SiteRenderCtx = { group, geos, mats, shaders }

renderSiteState(defaultSiteState(), ctx)
console.log(`site: ${group.children.length} mesh, ${geos.length} geo, ${shaders.length} shader`)

// Dispose (caller sở hữu resource — renderer không giữ gì).
for (const g of geos) g.dispose()
for (const m of mats) m.dispose()
for (const s of shaders) s.dispose()
group.clear()
