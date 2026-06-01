# PLAN — Thin out archplan → building-kit (live tracker)

> Đẩy logic **dựng-nhà** từ archplan xuống lõi building-kit: (1) một nguồn sự thật, (2) đóng **gốc** Gap 2
> (1 renderer thay 2), (3) archplan còn lại = vỏ GUI. Nguyên tắc: **KHÔNG đổi hành vi** — di dời + shim,
> verify xanh từng phase, nhìn `:3002` giống hệt.
> Kiến trúc tổng: [`deferred/systems/building-warehouse-pipeline.md`](deferred/systems/building-warehouse-pipeline.md).
> Luật: trước MỖI phase → tổng hợp trade-off + đề xuất rồi mới làm (memory feedback-per-phase-tradeoff-gate).

## Phân loại (ArchPlanLab 1396 dòng)

| GIỮ ở vỏ archplan | XUỐNG lõi building-kit |
|---|---|
| pointer/pick/paint, mode toggles, WASD/camera | `_renderScene`, `_buildFloor` (phần assemble) |
| `_setupGUI`/`_rebuildGUI`/host, scene/env/ground/sun | `_assembleFromConfig`, `_segToSpec` (mm→m) |
| DevHud, dispose, `_buildScene` (history+autosave) | `_locateInst`/`_floorBaseY`/`_instWallBase` |
| **pick-box insertion** (editor-only), modules đã tách | |
| `TURN_OPTIONS`/`ROT_OPTIONS` (GUI dropdown) | `state.ts` schema (✅ Phase 0) |

persistence.ts dùng `window.*` (localStorage/FS) → **giữ ở vỏ**, import serialize/parse từ lõi.

## Phases

### ✅ Phase 0 — Move SCHEMA (XONG 2026-06-01)
- `state.ts` (646 dòng: types + factories + SHAPE_CONFIGS + AP4 export + migration) → `building-kit/state.ts`.
- `archplan/state/state.ts` = **shim** `export * from 'building-kit/state'` + giữ TURN/ROT_OPTIONS (GUI).
- 9 importer **không đổi 1 dòng**. Gate: archplan tsc/eslint/build ✅, Doraemon tsc ✅, kit eslint ✅.
- Còn: mắt `:3002` (di dời thuần, rủi ro ~0).

### Phase 1 — Extract RENDERER → `building-kit/BuildingFromState.ts`
- **✅ 1a (commit 1735d69/52423cb):** `build/build.ts` → lõi + shim. Pure math, prerequisite renderer.
- **🟡 1b (gate MÁY xanh, CHỜ visual):** `BuildingFromState.ts` = `renderBuildingState(state, ctx) → Placement[]`.
  - Thiết kế: free-function + class transient `StateRenderer`, nhận `ctx` (group+arrays editor SỞ HỮU) →
    build vào đó, trả `Placement[]` (toạ độ pick-box). KHÔNG chuyển ownership (giống `assembleWall`).
  - Lift 1:1 từ ArchPlanLab: orchestration + buildFloor/structure/foundation/slab/balcony/stairs/columns/roof
    + **paint override** (→ Gap2#4) + segToSpec (mm→m). Pick-box MATH → placements; pick-MESH giữ ở editor.
  - `ArchPlanLab._renderScene` = `renderBuildingState(...)` + gắn `_addPick` từ placements + chrome (sun/heightGrid).
    Xoá 18 method (~404 dòng) + 30 dòng import thừa. 1396 → ~950 dòng.
  - Gate máy: archplan tsc/eslint/build ✅, kit eslint ✅, Doraemon tsc ✅.
  - **⚠️ CHỜ gate người:** refresh `:3002` → walls/structure/roof/paint render đúng + pick/paint/move/focus/highlight còn chạy. Chưa visual-verify thì 1b CHƯA chốt.

### ✅ Phase 2 — Retire BuildingFromPlan + headless wrapper (XONG 2026-06-01)
- **Phát hiện:** `BuildingFromPlan` (AP4 lossy) **dormant** — 0 caller; Doraemon dựng nhà bằng `Building`
  preset procedural (đường riêng). Gap 2 latent → Phase 1 đã đóng phần lõi (1 renderer canonical).
- Chọn **A**: retire BuildingFromPlan (xoá file) + `class BuildingRenderer` (wrapper headless own ctx +
  dispose, gọi renderBuildingState) + `BuildingFromState.example.ts` (smoke compile-checked).
- Gap 2 đóng bằng construction: chỉ còn 1 renderer (renderBuildingState) đọc BuildingState lossless →
  stairs/balcony/roof-rot/paint full fidelity. KHÔNG còn renderer thứ 2 để drift.
- Gate: kit tsc/eslint, archplan tsc/build, Doraemon tsc ✅. (Không test runner → smoke = example compile-checked + editor live.)
- **✅ 2 orphan do retire — đã giải quyết:**
  - `parts/Stair.ts` (makeStair) — **XOÁ** (d989417). Editor/headless dùng makePositionedStairs (builder khác, proven).
  - AP4 export — nút "📄 JSON" **đổi sang `serializeDesign`** (lossless, Load lại được) + **xoá 4 hàm AP4**
    (buildingStateToJSON/instanceToJSON/segmentToJSON/structureToJSON). Lớp serialization lossy retire TRỌN.

### ⏳ Phase 3 (sau, optional) — workspace package
- alias `../` đã chạy cho cả 2 → ngoài đường tới hạn. Làm khi Babylon tới.

### ⏳ Phase 4 — Reorg `building/` (SAU Phase 2 — nucleus đã đông file)
- `building/` giờ 11 .ts + 4 file lặp prefix "Building" (Building/BuildingConfig/BuildingFromPlan/BuildingFromState).
- Target subfolder theo vai trò (hết lặp "building/Building…"):
  ```
  core/   turtle · build · state · tokens · rand
  walls/  wallMaterials · wallAssembly
  render/ fromPlan · fromState        (bỏ prefix Building)
  preset/ Building→procedural · BuildingConfig→config
  parts/  textures/
  ```
- **LÀM SAU Phase 2** (Phase 2 đổi/retire renderer → reorg trước = sửa import 2 lần). Dùng shim re-export
  (Phase 0/1a) để mượt import path archplan + Doraemon, tránh KI-001. Thuần tổ chức, 0 đổi hành vi.

## Rủi ro
- Unit mm/m: lõi có schema mm + assembler m → `_segToSpec` đi cùng renderer, tài liệu hoá biên.
- Pick-box entanglement trong `_buildFloor` (Phase 1) — tách cẩn thận, verify visual + pick.
- Behavior parity mỗi phase: gate người ở `:3002`.
