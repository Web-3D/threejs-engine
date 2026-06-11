# Mix (PhotoGroundMix) lên TƯỜNG BUILDING — ✅ XONG 2026-06-11 (luồng building rảnh, NgQuan "tiếp plan 5")

> THỰC THI: SegmentState.mix? (+copySegExtras) · WallSpec.mix + WallAsmCtx.mixMat/extraMats (key `mix:N`
> WeakMap, mergeWalls tra extraMats khi cache miss) · BuildRenderCtx.wallMixMat + segToSpec + plainWalls drop
> mix · Lab _wallMixMat (range từ assembler — yBase/h thật) + target GENERIC `{ wallMix: params }` (consumer
> tường mới sau này KHÔNG cần thêm nhánh Lab) · GUI sections addWallMixSection (mkMixSection export từ site.ts,
> commit=ctx.build, CSS scope `.ap-mix-host` + vars tự khai báo → board sống trong lil-gui). 3 rule trọng lực
> ăn ngay (mapping 'wall'). KHÔNG cọ vẽ (như fence). Gate tsc 0 + eslint 0. Dưới = plan gốc giữ truy vết.

> Nguồn: NgQuan 2026-06-11 "bỏ nền mix vào tất cả tường... KỂ CẢ TƯỜNG WALL TRONG building".
> Stage 4 mix đã phủ: fence ✅ + vách hồ ✅ + đáy hồ ✅ (cùng ngày). Building wall = phần CÒN LẠI,
> CHẶN bởi: `threejs-modules/building/*` đang active luồng song song (wallAssembly.ts uncommitted
> lúc ghi file này) — đụng vào = giẫm chân.

## Móng ĐÃ SẴN (không cần làm lại)

- `PhotoGroundMix` mapping `'wall'` (planar đứng chọn trục theo |N|) + `'uv'` (uv mét baked) +
  normal frame TBN tại-mặt — shaders/ground/PhotoGroundMix (stage 4, 2026-06-11).
- Lab: `_groundMixFor(target)` cache theo GroundMixParams object + `_mixSpaceOf` + GUI `mkMixSection`
  (toggle + board, `paintable` flag) — archplan ArchPlanLab.ts + gui/site.ts.
- `sameMixTarget` (ctx.ts) — so target wrapper.

## Việc phải làm khi kích hoạt (đụng building/* + state nhà + sections GUI)

1. **State nhà** (`archplan/state/state.ts` hệ BuildingState — KHÁC SiteState): WallMaterial thêm
   key `'mix'` HOẶC `SegmentState.mix?: GroundMixParams` per-tường (per-segment hợp logic building
   hơn per-nhà). Parse + migrate version.
2. **wallMaterials.ts / wallAssembly.ts**: resolve material 'mix' → callback như `opts.fenceMixMat`
   (Lab bơm `_groundMixFor({ wallSeg: ... })`). Mặt tường building = box/extrude THẲNG đứng →
   mapping `'wall'` chạy ngay. Lỗ cửa/sổ: material áp cả mặt — mix không cần biết lỗ.
3. **Target mới** trong MixPaintTarget: `{ wallSeg: SegmentState }` (hoặc instId+segIdx) + 
   `_mixParamsOf`/`_mixSpaceOf`/`_liveMixParams` thêm nhánh. KHÔNG cọ vẽ v1 (như fence — mapping
   'wall'); muốn cọ → bake uv arc-length theo wallAssembly (đã có chiều dài segment).
4. **GUI**: `gui/sections.ts` khu Wall material — thêm mkMixSection (import từ site.ts hoặc tách
   helper chung ra file riêng `gui/mix-board.ts` nếu sections cần).
5. **Tường rêu phong 3 rule trọng lực** (catalog "BƯỚC NỐI") áp luôn ở đây sau khi có: chân tường
   gradient (1−y/h) + vệt nước chảy dọc (fbm nén trục y) + rêu góc ẩm — thêm mask node vào
   PhotoGroundMix (mapping ≠ 'xz') + 3 slider — KHÔNG đụng building/*, làm trước được.

## Trigger mở lại

Luồng building/* commit xong phần đang dở (wallAssembly sạch) + NgQuan gọi "mix tường building" →
bắt đầu từ mục 1 (state — phần khó là migrate, geometry/material là phần dễ vì móng sẵn).
