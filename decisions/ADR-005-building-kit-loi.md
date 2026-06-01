# ADR-005 — building-kit là LÕI: dồn logic dựng-nhà, retire AP4, 1 renderer

**Ngày:** 2026-06-01 | **Trạng thái:** Accepted
**Revisit khi:** Babylon engine cần lõi (→ Phase 3 workspace package) hoặc warehouse pipeline lên production

## Context

`threejs-modules/building/` (alias `building-kit`) ban đầu chỉ là thư viện module rời. Logic *dựng-nhà*
thực sự nằm rải ở **vỏ**: `ArchPlanLab.ts` (1396 dòng) tự sở hữu schema `BuildingState`, build math,
và toàn bộ renderer (`_renderScene` + 18 method assemble/structure/foundation/slab/balcony/stairs/columns/roof).

Tệ hơn — tồn tại **renderer thứ 2**: `BuildingFromPlan.ts`, đọc dữ liệu qua lớp serialization **AP4**
(`buildingStateToJSON`...) **lossy**. Hai renderer + cầu nối lossy = **Gap 2 (schema drift)**: stairs /
balcony / paint / roof-rotation rụng khi đi qua AP4. Đây chính là KI-001 (copy code thay vì share →
drift) ở quy mô kiến trúc.

Định hướng chiến lược chốt cùng ngày: **building-kit là LÕI của cả ecosystem** — archplan (authoring 1
căn) và Doraemon (quy hoạch khu phố) chỉ là **vỏ** import lõi; tương lai Babylon cũng kéo lõi này.

## Decision

**Dồn toàn bộ logic dựng-nhà xuống lõi `building-kit`.** Luật ranh giới — **3 thùng logic**:

| Logic | Tầng | Lý do |
|---|---|---|
| dựng-nhà (schema, build math, renderer, walls, materials, roof) | **lõi** building-kit — *headless, no DOM* | một nguồn sự thật, mọi engine/vỏ dùng chung |
| GUI / pointer / pick / paint / camera | **vỏ** archplan | tương tác authoring, gắn DOM |
| quy hoạch khu phố (đặt N nhà theo layout) | **project** (Doraemon) | mỗi project 1 kế hoạch riêng |

archplan **KHÔNG** nhúng vào project nào (authoring 1 căn ≠ quy hoạch N căn = 2 việc khác).

Hệ quả cụ thể đã thực thi (thin-out Phase 0–4):
- `BuildingState` schema + factories + serialize/parse → `building-kit/state.ts`; vỏ giữ shim
  `export * from 'building-kit/state'` (9 importer không đổi 1 dòng).
- Build math → `building-kit/build.ts`.
- **1 renderer canonical:** `renderBuildingState(state, ctx) → Placement[]` (free fn cho editor, nhận
  ctx editor sở hữu) + `class BuildingRenderer` (wrapper headless own ctx + dispose) tại
  `building-kit/render/fromState.ts`. Đọc `BuildingState` **lossless** → full fidelity.
- **Retire `BuildingFromPlan` + lớp AP4 trọn vẹn** (xoá file + 4 hàm `*ToJSON`). Nút "📄 JSON" của
  editor đổi sang `serializeDesign` (lossless, Load lại được).
- Reorg lõi gọn: `render/` + `preset/`; engine primitive (turtle/build/state/tokens/rand/wallAssembly/
  wallMaterials) **giữ flat**; bỏ prefix "Building" ở tên FILE (lib = building-kit → thừa), **giữ** tên
  export/class (`Building`/`BuildingRenderer`/`renderBuildingState` — call-site ngoài cần ngữ cảnh).

**Nguyên tắc thực thi:** KHÔNG đổi hành vi (di dời + shim), verify máy + mắt `:3002` xanh từng phase.
Tracker: [`PLAN-thin-out-archplan.md`](../PLAN-thin-out-archplan.md).

## Alternatives đã cân nhắc

| Alternative | Lý do reject |
|---|---|
| Giữ 2 renderer, **converge AP4** cho lossless | Vẫn 2 đường code phải đồng bộ tay → drift quay lại (KI-001). 1 renderer đóng Gap 2 *bằng construction*. |
| Clone "build-tool template" về mỗi project | Nhân bản logic = N bản drift. Share lõi central + vỏ per-project mới đúng. |
| Share **thành phẩm baked** (warehouse) thay vì share source logic | Bổ sung chứ không thay: warehouse cho asset tĩnh tag-by-meta; lõi vẫn cần cho authoring động. Design tách riêng `deferred/systems/building-warehouse-pipeline.md`. |
| Reorg lõi sâu (`core/` + `walls/` subfolder) | Đo churn: move engine primitive làm gãy 14 file `parts/` (`../tokens`) + landmine `new URL('./textures/…')` tsc KHÔNG bắt → vỡ brick-tex âm thầm. Lợi ích ~0, rủi ro cao → giữ flat. |
| Tách lõi thành npm/workspace package ngay | Alias `../` đã chạy → ngoài đường tới hạn. Defer Phase 3 tới khi Babylon cần (revisit trigger). |

## Consequences

**Tốt:**
- **Gap 2 đóng bằng construction** — chỉ còn 1 renderer đọc `BuildingState` lossless, không còn renderer
  thứ 2 để drift. Stairs/balcony/roof-rot/paint full fidelity.
- Một nguồn sự thật cho cách dựng nhà → hết KI-001 drift. ArchPlanLab 1396 → ~950 dòng (vỏ thuần).
- Thêm tính năng nhà mới chỉ sửa 1 nơi (lõi) → mọi vỏ hưởng ngay.

**Sinh ra 2 luật vận hành** (đã ghi memory, áp dụng từ đây):
- Trước **mỗi phase** việc nhiều bước → tổng hợp trade-off + đề xuất rồi mới làm.
- Thêm chức năng → **phân loại vai trò đầy đủ** (lõi/vỏ/project + subfolder + tier vật liệu) rồi đặt đúng
  chỗ; không nhét bừa. (Lõi sẽ phình — đặt sai 1 lần = tái tạo mớ drift vừa dọn.)

**Chấp nhận được:**
- Biên đơn vị mm↔m: editor/`BuildingState` ở **mm**, assembler/renderer ở **mét** → `segToSpec` (/1000)
  đi cùng renderer trong lõi, tài liệu hoá tại biên.
- Vỏ giữ vài shim mỏng (`state.ts` re-export + TURN/ROT_OPTIONS GUI-only) — chấp nhận để 9 importer khỏi đổi.

**Không thay đổi:** hành vi runtime tool build (xác nhận với user) — chỉ cấu trúc gọn hơn.

> Liên hệ: ADR-Doraemon-001 (CityBuilding vs Building — 2 hệ procedural khác, không đụng lõi authoring này);
> memory `project-threejs-modules-ecosystem-nucleus` (gọi **"lõi"**, không "hạt nhân").
