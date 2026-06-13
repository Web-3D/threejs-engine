---
domain: wall
title: Push/Pull tường 2 CẤP — Cấp 1 hốc/khối bề mặt · Cấp 2 bay đẩy mass footprint (SketchUp Push-Pull · Houdini PolyExtrude)
status: building
tier: —
modules:
  - threejs-modules/building/parts/WallSingle.ts
  - threejs-modules/building/wallAssembly.ts
  - threejs-modules/building/build.ts
  - threejs-modules/building/render/fromState.ts
  - archplan/src/archplan/gui/sections.ts
issues: []
updated: 2026-06-14
---

# Playbook — Khối tường Push/Pull

> **Ranh giới:** recipe + tầng + lịch sử. Chi tiết lỗi → `known-issues/`, API → module README.
> Tham chiếu: SketchUp **Push/Pull** · Blender **E/I** · Houdini **PolyExtrude SOP** (inset + distance).
> **Procedural-not-mesh-edit:** UX "giống Blender" nhưng dưới nắp là THAM SỐ (vùng + depth lưu state, regen
> mỗi rebuild) — KHÔNG mesh-editing tự-do (sẽ phá regen/undo/persist). Đúng cho editor procedural.

## 1. Kết quả "hoàn chỉnh"

**2 cấp** (khác nhau ở "có ruột không"):
- **Cấp 1 — mặt tường:** khoanh vùng rồi đặt `depth` → **NHÔ RA** (raised box) hoặc **LÕM VÀO** (niche sâu
  thật trong BỀ DÀY tường, nhìn vào thấy pocket). KHÔNG đổi không gian bên trong. Slider x/y/w/h/depth, live.
- **Cấp 2 — bay (mass):** đẩy cả MẢNG tường ra/vào → **footprint biến dạng** → bay nhô/ô văng/sảnh thụt
  **CÓ không gian bên trong thật** (sàn/móng theo outline; mái bbox phình). Slider x/w/depth, live. Lưu qua reload.

## 2. Recipe dựng

State = `SegmentState.panels[]` (`DecorPanel{x,y,w,h,depth,mode}`, đơn vị **mm**) — đã có sẵn, persist round-trip.
2 chiều = `mode`:

- **`raised`** (nhô ra) = box additive trên mặt +Z (`_buildDecorPanels`, đã có). depth = độ nhô.
- **`niche`** (lõm vào) = **carve lỗ + back-plug**, KHÔNG CSG (né KI-001):
  1. Vùng niche đưa vào danh sách lỗ (`_nicheToOpening` → PositionedOpening) → thân tường tự khoét void
     (post-and-lintel `_buildWallSegments` cho rect, holes-geo cho round) — **0 đổi logic carve**.
  2. Thêm 1 **back-plug** box bịt phần sau (`_buildNichePlugs`): depth = `wallDepth − nicheDepth`, đặt z=−d/2.
  3. Pocket nhìn từ ngoài sâu đúng `d`; 4 vách = mặt cắt segment có sẵn; đáy hốc = mặt trước plug (wallMat).

GUI: `buildPushPullFolder` (sections.ts) — 1 folder "🧱 Khối (N)" tự-chứa (folder con + nút thêm, KHÔNG
tab-bar → né nuke `.ap-tab-bar` của opening). Mỗi khối: toggle Ra/Vào + 5 slider `live()` + Remove.

**Giới hạn Cấp 1:** chỉ tường **material SURFACE** (none/concrete/metal/brick-tex) — `assembleWall` dispatch
brick-3d/wood-3d/wood-strip TRƯỚC `assembleSurface` nên các loại instanced bỏ qua panels. Niche **rect**
(round-niche để sau). Vùng niche **không chồng** cửa/sổ (post-and-lintel giả định không overlap x).

### Cấp 2 — bay (đẩy MASS footprint)

State = `SegmentState.bay {x, w, depth}` (mm; depth>0 = ra, depth<0 = lõm vào). Cơ chế = **`expandBays`**
(`build.ts`, điểm convert `toSegPlans` DUY NHẤT dùng chung cho `planWalls`+`planBbox`+`planOutline`):
- segment có bay → tách thành **≤5 đoạn jog** (flank-trái · jog-ra · mặt-bay · jog-vào · flank-phải); jog ra
  `dep` rồi quay lại path gốc (lateral huỷ nhau) → footprint còn lại không đổi. Đoạn rỗng dồn turn qua `carry`
  → heading sau bay luôn về gốc. → **walls/slab/móng/mái tự bám** (đều derive từ `toSegPlans`).
- `WallConfig.segIdx` = index segment GỐC (5 jog-wall đều trỏ cha) → renderer pick/focus dùng `cfg.segIdx`
  (click bay → focus segment cha trong GUI). `keyBase` giữ loop-index `si` (non-bay: si===segIdx, leaf-key cũ).
- Slab/móng: `instOutline` (fromState.ts) bật outline-following khi `instHasBay(inst)` (như shape 'round')
  → sàn theo polygon bay. Mái: `makeRoof(w,d)` = bbox, tự phình bao bay (over-cover, chấp nhận MVP).

GUI: `buildBayFolder` (sections.ts) — folder 🏗️ Bay: toggle Bật + 3 slider x/w/depth (`live()`). Persist:
`serializeDesign` (JSON full) + **`copySegExtras` đã thêm `s.bay`** (sống qua reshape — clamp ở expandOneBay).

**Giới hạn Cấp 2:** bay = **ĐẶC** (cửa/sổ của segment ẩn khi bay bật, state giữ nguyên); bay full-height;
**mái bbox phình** (mái-bám-outline = sân Factory, hoãn); móng concrete `expandOutline` xấp xỉ ở góc bay.

## 3. Tầng & toạ độ

Wall local: tâm (0, h/2, 0), depth D theo Z, **mặt ngoài = +Z (+D/2)**. Panel `x,y` = mép trái/dưới từ
góc tường → local center `cx = x + w/2 − W/2`, `cy = y + h/2`. raised box ở `z = +D/2 + depth/2` (nhô +Z).
niche plug ở `z = −d/2`, dày `D − d` (lấp [−D/2, D/2−d]); pocket lộ z∈[D/2−d, D/2]. `d` clamp `< D − 10mm`.

## 4. Lỗi thường gặp

| Triệu chứng | Nguyên nhân (1 dòng) | Chi tiết & fix |
| --- | --- | --- |
| Niche xuyên thủng ra mặt sau | depth ≥ wallDepth (không còn vách sau) | lõi clamp d ≤ wallDepth−10mm; tăng Wall depth |
| Niche không hiện trên tường gạch/gỗ | brick-3d/wood-* dispatch trước assembleSurface | đổi material về none/concrete/metal/brick-tex |
| Răng cưa mép niche khi chồng cửa | post-and-lintel giả định lỗ không overlap x | tách vùng niche khỏi cửa/sổ (KI-001) |
| Bật bay → cửa/sổ segment biến mất | bay = ĐẶC (expandOneBay làm openings rỗng) | đúng thiết kế MVP; tắt bay → cửa/sổ hiện lại (state giữ) |
| Bay đẩy SAI hướng (vào trong) | dấu `depth` theo winding footprint | flip dấu depth (− ↔ +) ở slider Đẩy ± |
| Click bay → focus sai folder | quên dùng `cfg.segIdx` (dùng loop-index) | renderer pick phải dùng `cfg.segIdx` (segment cha) |

## 5. Lịch sử nâng cấp

- `2026-06-14` — **Cấp 1 / Phase 1** (geometry + slider): mode `niche` (carve+back-plug, push-in thật) + dựng
  lại GUI 🧱 Khối (raised/niche, 5 slider live). Lõi WallSingle `makePositionedWall` tách niche→carve+plug.
- `2026-06-14` — **Cấp 2 / bay (mass)**: đẩy mảng tường ra/vào → footprint biến dạng, CÓ ruột thật.
  `SegmentState.bay{x,w,depth}` + **`expandBays`** (build.ts, tách ≤5 jog tại điểm convert chung) +
  `WallConfig.segIdx` (pick/focus về segment cha) + `instOutline` bật khi `instHasBay` (sàn/móng theo) +
  GUI 🏗️ Bay (3 slider live) + persist `copySegExtras.bay`. Mái bbox phình (chấp nhận). Gates xanh.
  Hoãn: Cấp 1 Phase 2 (vẽ-kéo + gizmo) · round-niche · cửa/sổ trên mặt bay · mái-bám-outline (Factory).

## 6. Liên hệ

- **Modules Cấp 1:** `building/parts/WallSingle.ts` (`makePositionedWall` · `_buildNichePlugs` · `_buildWallBody`) ·
  `building/wallAssembly.ts` (`AsmPanel`/`assembleSurface`) · `archplan/.../gui/sections.ts` (`buildPushPullFolder`)
- **Modules Cấp 2:** `building/build.ts` (`expandBays` · `instHasBay` · `WallConfig.segIdx`) ·
  `building/render/fromState.ts` (pick `cfg.segIdx` · `instOutline`-khi-bay) · `state.ts` (`BaySpec`/`copySegExtras`) ·
  `archplan/.../gui/sections.ts` (`buildBayFolder`)
- **Tham chiếu:** SketchUp Push/Pull · Blender E/I · Houdini PolyExtrude SOP (→ kệ `ops/` op #7 tương lai)
- **Playbook anh em:** [[window]] (lỗ cửa/sổ — cùng cơ chế carve)
- **KI:** KI-001 (overlap opening → răng cưa post-and-lintel)
