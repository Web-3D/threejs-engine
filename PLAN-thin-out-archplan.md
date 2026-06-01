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

### ⏳ Phase 1 — Extract RENDERER → `building-kit/BuildingFromState.ts`
- Hàm headless `BuildingState(mm) → THREE.Group` (walls+structure+roof), KHÔNG pick-box/chrome.
- **Khó:** tách pick-box (editor-only, trong `_buildFloor`) khỏi assemble → lõi trả `group + placement metadata`,
  ArchPlanLab bọc ngoài thêm pick-box + chrome.
- Mang `_segToSpec` (mm→m boundary) theo. Gate từng sub-step + verify pick/paint/move còn chạy.

### ⏳ Phase 2 — Converge headless + đóng Gap 2
- `BuildingFromPlan` → wrapper mỏng (AP4→BuildingState→BuildingFromState) HOẶC Doraemon dùng thẳng.
- stairs/balconies/roof-rot/paint tự chảy → **Gap 2 đóng**. Thêm **parity test** (build-from-state vs AP4).

### ⏳ Phase 3 (sau, optional) — workspace package
- alias `../` đã chạy cho cả 2 → ngoài đường tới hạn. Làm khi Babylon tới.

## Rủi ro
- Unit mm/m: lõi có schema mm + assembler m → `_segToSpec` đi cùng renderer, tài liệu hoá biên.
- Pick-box entanglement trong `_buildFloor` (Phase 1) — tách cẩn thận, verify visual + pick.
- Behavior parity mỗi phase: gate người ở `:3002`.
