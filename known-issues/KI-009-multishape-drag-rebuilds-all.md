---
id: KI-009
title: Kéo khi CÓ NHIỀU shape → rebuild MỌI shape mỗi frame (fast-path chỉ cứu 1 shape) + LOD chưa phủ foundation/stairs → tụt fps
category: perf
domain: building, drag
severity: high
status: fixed
when: ArchPlanLab Move-tool, scene có >1 shape. Kéo CẢ KHỐI (multi-instance) hoặc kéo ELEMENT (cột/cửa/cầu thang) → fps tụt; 1 shape thì mượt. (KI-005 fast-path `translateBuildingLive` chỉ chạy khi instanceCount==1.)
where:
  - archplan/src/archplan/interaction/manipulate.ts # dragStart→beginInstDragSplit (đa-shape), dragMove (inst→translate / element→rebuildDragShape), dragEnd→endInstDragSplit; _splitActive
  - archplan/src/archplan/ArchPlanLab.ts             # _dragGroup/_dragGeos/_dragMats/_dragInstId, _beginInstDragSplit, _renderDragShape, _rebuildDragShapeLive (throttle rAF), _instDragTranslate, _endInstDragSplit
  - threejs-modules/building/render/fromState.ts     # renderBuildingState(...,filter) instance-filter (split); plainWalls LOD MỞ RỘNG: foundType→'concrete' (bỏ lưới cột deck) + stairs style→'solid' (bỏ ván)
discovered: 2026-06-05
fixed-in: —
related:
  - ki:KI-005
  - memory:archplan-rebuild-dirty-check-and-transform-not-rebuild
tags: [rebuild, drag, fps, multi-shape, split-render, instance-filter, lod, foundation, stairs, per-shape-group, throttle]
---

## 1. Lỗi gì (triệu chứng)

Sau khi KI-005 fix (LOD tường phẳng + dirty-check), kéo **1 shape duy nhất** mượt — nhưng scene **NHIỀU shape**:
- Kéo CẢ KHỐI shape (multi-instance) → tụt fps. (Fast-path `translateBuildingLive` của KI-005 chỉ kích hoạt khi `instanceCount==1`; nhiều shape → rơi xuống `_buildSceneLive` rebuild full.)
- Kéo ELEMENT (cột/cửa sổ/cầu thang) → vẫn tụt **ngay cả sau khi split** — vì shape đang kéo nếu phức tạp (foundation gỗ Nhật **lưới cột** + **cầu thang ván**) thì rebuild riêng nó vẫn nặng (LOD `plainWalls` của KI-005 chỉ làm phẳng TƯỜNG, không đụng foundation/stairs).

## 2. Tại sao (root cause — verify đọc code)

`renderBuildingState` nhồi MỌI shape vào **1 group chung**, merge geometry **theo bucket VẬT LIỆU toàn cục** (`mergeWalls`) để < 100 draw call → **không tách dời từng shape**. Nên `_renderScene` (clear + rebuild) buộc dựng lại CẢ N shape mỗi frame kéo → cost ×N. Fast-path KI-005 (dời group) chỉ đúng khi group = đúng 1 shape. Và `plainWalls` LOD chỉ ép tường `'none'`, để nguyên `buildStructure` → foundation deck+**lưới cột** (hàng chục box merge) + stairs **ván** dựng full mỗi frame.

## 3. Sửa như thế nào (split-render + LOD mở rộng)

**A. Instance-filter ở lõi.** `renderBuildingState(state, ctx, plainWalls, hidden, filter?)` — filter bỏ-DỰNG instance không khớp (vẫn cộng chiều cao stacking). Cho editor render TÁCH: shape khác (static) ↔ shape đang kéo.

**B. Split-render lúc kéo (editor).** `dragStart` (đa-shape, không phải 'inst' fast) → `_beginInstDragSplit(id)`: dựng 1 LẦN — shape khác (filter `!=id`) vào `buildingGroup` + pick; shape đang kéo (filter `==id`) vào `_dragGroup` RIÊNG (visual, KHÔNG pick — không cần raycast giữa drag). Mỗi frame:
- Kéo SHAPE ('inst'): `_instDragTranslate` = `_dragGroup.position.set(dx,lift,dz)` — **0 rebuild**.
- Kéo ELEMENT: `_rebuildDragShapeLive` (throttle rAF ≤1/frame) = rebuild CHỈ shape đang kéo vào `_dragGroup`.
Buông/huỷ → `_endInstDragSplit`: dọn `_dragGroup` + `_buildScene` full (merge lại, pick đủ, commit).

**C. LOD mở rộng (lõi, lúc plainWalls).** foundation `foundType→'concrete'` (slab phẳng, bỏ lưới cột deck) + stairs `style→'solid'` (bỏ ván nhiều mảnh). Footprint/cao giữ nguyên → không nhảy hình.

## 4. Trade-off (chấp nhận)

- **Draw call tăng TẠM lúc kéo**: 2 bộ bucket vật liệu (static + dragged) thay vì 1 merge → buông tay merge lại. Transient, chấp nhận.
- **Pick shape đang kéo BỎ giữa drag** (không raycast mid-drag) → buông `_buildScene` dựng pick đủ → tránh drift (KI-001). Trade: shape đang kéo không re-pickable giữa lúc kéo (vô hại).
- **LOD lúc Move mode**: foundation hiện slab concrete (mất lưới cột gỗ Nhật) + stairs đặc (mất ván) + tường phẳng (mất gạch) = "blueprint" lúc đang chỉnh. Chi tiết đầy đủ về khi THOÁT Move / commit-ngoài-Move. (Đồng nhất với LOD tường phẳng của KI-005.)
- 1 split-rebuild ở drag-start (2 render-pass thay 1) — 1 lần/phiên, rẻ.

## 5. Phòng tái phạm

- **Thêm chi tiết structural nặng mới (lưới cột, ván, lam…)?** → cho nó nhánh **LOD lúc `plainWalls`** (đơn-giản-hoá khi kéo), kẻo rebuild/frame nặng. Đừng để `buildStructure` dựng full lúc live-drag.
- **Per-object move trong scene merge-toàn-cục**: dùng **instance-filter split** (object kéo → group riêng translate/rebuild; còn lại static), KHÔNG rebuild cả. Đừng mở rộng fast-path "dời cả group" cho >1 object (sai — dời hết).
- **Rebuild mỗi-frame BẮT BUỘC throttle rAF** (≤1/frame) — né poll chuột 120+/giây.
- Cùng họ KI-005: "kéo lag" = khoanh CPU-rebuild trước; phần nào dựng-full-mỗi-frame-mà-không-cần = chỗ phí.
