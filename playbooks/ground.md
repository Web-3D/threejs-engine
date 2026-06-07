---
domain: ground
title: Ground — sân nền đa-tầng (zones) + khoét (cut) lộ lớp dưới
status: building
tier: —
modules:
  - threejs-modules/site/render/fromState.ts
  - threejs-modules/site/state.ts
issues:
  - KI-011
updated: 2026-06-07
---

# Playbook — Ground (sân nền đa-tầng + khoét)

> **Ranh giới:** recipe + sơ đồ tầng/toạ độ + lịch sử. Lỗi chi tiết → `known-issues/KI-NNN`. API/props → module README.

## 1. Kết quả "hoàn chỉnh"

Base ground (G0) = slab liền dưới đáy. Trên đó xếp **G-level** (1,2,…); mỗi level nhiều **zone** (mảng material
rect/circle/ellipse) đồng phẳng. **Cut (khoét)** cùng level đục lỗ CHÍNH XÁC mọi shape (phủ một phần/cắt mép
cong/xóa hết) → **lộ lớp ngay dưới** (zone level thấp hơn hoặc base), KHÔNG viền/góc thừa/wedge.

## 2. Recipe dựng

- **State** (`state.ts`): `GroundLayer` = `material` + `thickness` + `shape`(rect/circle/ellipse/free) + `points` +
  `offsetX/Z` + **`level`**(1-based) + **`op`**(add\|cut). `groundLayers[]` PHẲNG (flat) — `level`/`op` nhóm lúc render.
  **`site.groundLevels`** (số, optional) = SỐ G-level tường minh → cho phép tầng RỖNG; parse migrate `?? max(level)`,
  luôn ≥ max(level) (đừng ẩn tầng có layer). Render vẫn DERIVE level từ layers (rỗng = no-op, Y-stacking +0).
- **Render** (`fromState.ts` → `buildGroundLayers`): mỗi level → `buildLevelZones` (zones đồng phẳng @baseY) rồi
  `buildLevelCutPatches` (mảng xám highlight, ẩn).
- **Khoét = polygon-boolean** (`layerGeometry`): `difference([contour], ...cuts+nước)` (lib `polygon-clipping`) →
  MultiPolygon → mảng `Shape` → `ExtrudeGeometry`. Rỗng → `null` → bỏ mesh. KHÔNG earcut-hole (→ KI-011).
- **Editor** (archplan `gui/site.ts`): nested-tabs `G0(base)|G1|G2…|＋`; mỗi G = `[Mảng add | Khoét cut]`, mỗi tab
  = instance `Z1|Z2|＋` / `C1|C2|＋`. Cut highlight xám hiện CHỈ khi layer active (chọn tab GUI / click 3D / Move-drag)
  qua `ctx.setActiveGroundLayer` → Lab toggle `.visible` (raycaster vẫn pick dù ẩn). Tab G enumerate `1..groundLevels`
  (`groundEditorLevels`) → **`＋` G = +1 tầng RỖNG** (KHÔNG tự sinh Z1); **`✕ Remove G`** = xoá tầng + dồn level trên xuống.
- **Form** zone/cut: `Rect | Tròn | Ellipse | Free (bezier)` (`groundFormRow`). Đổi → Free: seed blob 8-điểm
  (`rectBezierPoints`, DÙNG CHUNG với hồ) từ `length×width`. **Nắn 3D** (`interaction/groundDrag.ts` GroundTool, mirror
  waterDrag): Move + layer free active → overlay đỉnh (vàng) + 2 tay-cầm bezier in/out (cyan) + line; kéo đỉnh/tay-cầm
  → ghi `points[]` live + viền vàng định-vị; buông = commit (rebuild đặt lỗ-cut). Body-drag (dời layer) vẫn ở Lab `_layerDrag`.

## 3. Tầng & toạ độ (Y stacking)

```
baseY(lv=1) = groundThick/1000           # mặt trên base slab (mặc định 10mm = 0.01m)
zone (add): đáy=baseY, đỉnh=baseY + thickness/1000      # dày slider 1–10cm
top(level)  = baseY + max(thickness zones)/1000
cut: khoét XUYÊN TRỌN zone (difference); highlight phẳng @ y = top + 0.005 (nổi 5mm, KHÔNG khối)
baseY(lv+1) = top                         # level kế chồng tiếp lên
```

Local→world: `shapeToLocalPolygon` (mét, tâm gốc) + `offsetX/Z÷1000`. Shape XY dùng `(x, −z)` rồi `rotateX(−90)`.

## 4. Lỗi thường gặp

| Triệu chứng | Nguyên nhân (1 dòng) | Chi tiết & fix |
| --- | --- | --- |
| Cut để viền/góc thừa, wedge tròn/ellipse, cut==zone không xóa | earcut-hole chạm biên + cover-test ray-cast ở biên | `known-issues/KI-011` |
| Đáy/lớp dưới vô hình sau khoét | merge index lệch / backdrop đặc che | `known-issues/KI-004` |
| Kéo 1 layer → rebuild cả site | thiếu dirty-check / RTT tái tạo | `known-issues/KI-005` |

## 5. Lịch sử nâng cấp

- `2026-06-05` — site-kit GROUND đa-tầng `groundLayers[]` (box độc lập, xếp chồng Y, đục lỗ nước) + G1+ kéo-được
- `2026-06-06` — free-form shape (rect/circle/ellipse) + cut-reveal (clip-hole) + "bộ nền" phím tắt (Phase 2 inc 1)
- `2026-06-07` — nested-tabs G-level `[Mảng add|Khoét cut]` + cut highlight xám-khi-chọn + **khoét = polygon-boolean** (hết viền/góc/wedge, KI-011)
- `2026-06-07` — +4 texture surface (artificial_turf/grass_o/thai sand 2K+4K) → 3 hệ: ground surface + bộ nền (phím 5-7, `_photoEditorGround` share PhotoGround) + **water bottom** (texture đáy hồ, `basinMaterial` inject `groundMatByKey`); 4K né prefetch (chỉ tải khi chọn)
- `2026-06-07` — **add/cut mảng FORM TỰ DO** (Free bezier): `groundFormRow`+`Free`, seed blob `rectBezierPoints` (chung hồ), **GroundTool** (`interaction/groundDrag.ts`) nắn đỉnh+tay-cầm 3D (mirror waterDrag; outline-khi-kéo, commit-khi-buông; body-drag giữ Lab). Render contour cong đã sẵn từ `2026-06-06`
- `2026-06-07` — **G rỗng** (`site.groundLevels` count tường minh): `＋`G = +1 tầng RỖNG (bỏ auto-Z1) + **`✕ Remove G`** (xoá tầng + dồn level + clear active); editor enumerate `groundEditorLevels(1..N)`, render KHÔNG đổi (derive layers). Parse migrate `?? max(level)`, không bump schema

## 6. Liên hệ

- **Modules:** [fromState.ts](../threejs-modules/site/render/fromState.ts) · [state.ts](../threejs-modules/site/state.ts) · [shapes.ts](../threejs-modules/site/shapes.ts) (tessellate rect/circle/ellipse/free)
- **Editor:** archplan `gui/site.ts` (nested-tabs + Form + cut highlight) · `interaction/groundDrag.ts` (GroundTool nắn đỉnh/tay-cầm free) · `ArchPlanLab.ts` (`_applyCutVisibility` + `_activeLayerIdx` + `_layerDrag` body)
- **Deferred:** WYSIWYG live-rebuild geometry khi kéo (hiện chỉ outline) · cut "lộ lớp riêng từng level" (hiện lộ-xuyên theo stacking) · offsetPolygon concave gắt tự-cắt (lib offset robust)
- **KI:** KI-011 (cần polygon-boolean) · KI-004 · KI-005
