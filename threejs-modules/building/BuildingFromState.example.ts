/**
 * VỊ TRÍ   — threejs-modules/building/BuildingFromState.example.ts  (building-kit)
 * VAI TRÒ  — Smoke/demo HEADLESS: dựng 1 BuildingState → THREE.Group KHÔNG cần editor/DOM/renderer.
 *            Verify API BuildingRenderer (own ctx + rebuild + dispose). Compile-checked qua tsc.
 * LIÊN HỆ  — Editor (archplan) chạy renderBuildingState LIVE mỗi build (integration test thật ở :3002);
 *            file này chứng minh đường HEADLESS (consumer ngoài editor) compile + dùng đúng vòng đời.
 *
 * CÁCH DÙNG (consumer thật, vd Doraemon-từ-archplan / warehouse bake):
 *   const r = new BuildingRenderer(design)   // design: BuildingState (mm)
 *   scene.add(r.getGroup())
 *   r.dispose()                              // khi gỡ
 */

import { BuildingRenderer } from './BuildingFromState'
import { defaultBuildingState } from './state'

// Dựng nhà mặc định headless (1 tầng rectangle, tường material 'none') — không DOM, không WebGPU renderer.
const renderer = new BuildingRenderer(defaultBuildingState())
const group = renderer.getGroup()
console.log(`[BuildingFromState] headless build: ${group.children.length} object trong group`)

// State đổi (editor nhúng / warehouse variant) → rebuild tự clear bản cũ, trả Placement[] nếu cần pick.
renderer.rebuild(defaultBuildingState())

// Cleanup: giải phóng geos + mats + components + wallCache.
renderer.dispose()
