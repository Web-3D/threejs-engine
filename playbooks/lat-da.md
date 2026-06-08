---
domain: lat-da
title: Lối đi lát đá — path = 1 LOẠI zone trong G-level (StoneScatter Poisson)
status: building
tier: —
modules:
  - threejs-modules/components/StoneScatter
  - threejs-modules/site/render/fromState.ts
  - threejs-modules/site/state.ts
  - archplan/src/archplan/gui/site.ts
issues: []
updated: 2026-06-08
---

# Playbook — Lối đi lát đá (stepping-stone / stone path)

> **Ranh giới:** recipe + tầng/toạ độ + lịch sử mảng "rải đá". Thuật toán Poisson + đĩa instanced →
> `components/StoneScatter/README.md`. v1 = đá RỜI có khe (KHÔNG Voronoi ghép-khít).

## 1. Kết quả

Mô hình **G0 cỏ → tạo G-level (G1+) → mỗi zone add chọn LOẠI**: ① **Surface** (lớp vật liệu cũ) hoặc ②
**Path** (rải đá tròn/ellipse Poisson, không chạm, chừa khe). **Path KHÔNG còn tab riêng** — là 1 zoneKind bên
trong hệ G-level. Khuôn vô hình = CHÍNH rect zone. **Đích xa** = Voronoi crazy-paving (`geometry/voronoi-applications.md`).

## 2. Recipe dựng

- **Module** (`StoneScatter`): Bridson Poisson-disk (blue-noise) trong rect → tâm cách đều; mỗi tâm `r∈[rMin,rMax]`
  + aspect ellipse + xoay. `minDist=2·rMax+gap` ⇒ KHÔNG chạm. N phiến = 1 InstancedMesh = 1 draw. Props mm→m.
- **State** (`state.ts`): `GroundLayer.zoneKind?: 'surface'|'path'` (optional → 'surface' backward-compat) +
  `path?: StonePathParams` (rMin/rMax/ellipseMin/gap/thickness/seed/color/material). `makeStonePathParams` (seed
  ngẫu nhiên) + `parseStonePathParams` (clamp, rMin≤rMax). Khung = length/width/offset của CHÍNH zone (KHÔNG field riêng).
- **Render** (`fromState.ts` `addZoneMesh`): `zoneKind==='path'` → `addStonePathMesh` dựng StoneScatter (frame=length/
  width, Y=baseY level — zone trong `zoneRects` → terrain phẳng pad dưới đá) thay mesh surface. `userData.stonePath`
  = ref StoneScatter (live-rebuild dispose đúng). `buildLevelZones`: path KHÔNG tính `maxTh` (không dày stacking).
- **GUI** (archplan `gui/site.ts` `buildZonePane`): op='add' → `zoneKindRow` (selectRow **Type: Surface|Path**);
  path → `buildPathZoneBody` (Frame W/D + `pathSliderSpecs` R min/max·Ellipse·Gap·Thick·Seed + Material + Color),
  surface → `buildSurfaceZoneBody` (cũ). Đổi Type → `rebuild(flatIdx)` dựng lại pane + `applySite`.
- **Lab** (`ArchPlanLab.ts`): path-zone edit route qua `applySite`/`_rebuildSite` như slider surface zone (KHÔNG
  tune riêng). `_rebuildGroundLayersLive`: mesh có `userData.stonePath` → dispose QUA `field.dispose` + rút khỏi
  siteShaders (né double-dispose geo). `_collectPathTexKeys` → texture đá DÙNG CHUNG cache border hồ/RockCluster.

## 3. Tầng & toạ độ

- Path-zone sống trong `groundLayers` (op='add', level = G-level). Khung = length/width zone (0.5..40m), offset ±20m.
- Phiến: `rMin/rMax` 0.05..2m, `gap` 0..1m, `thickness` 1..30cm. Y = baseY của G-level (đá trên pad phẳng).
- Budget: khuôn 4×4m ≈ ~20 phiến × 64 tri ≈ 1.3k tri, **1 draw/zone**. Cap MAX_STONES=400 (module).

## 4. Lỗi thường gặp

- **Phiến nhô khỏi khung ≤ rMax:** Poisson sinh tâm trong rect, đĩa bán kính r tràn mép (khung vô hình → OK).
- **Đá nằm pad phẳng (không bám gò):** path-zone vào `zoneRects` → terrain phẳng dưới nó. Bám-gò-zone = polish.
- **Đổi Type mất focus tab:** `zoneKindRow` gọi `rebuild(flatIdx)` giữ focus zone đang sửa (đừng quên flatIdx).
- **Cỏ-tuft trong khe phiến:** path-zone né cỏ CẢ khung (qua `zoneRects`) → đá trên nền phẳng, chưa cỏ trong khe.
  Polish: per-stone exclude (feed `StoneScatter.getPlacements()` vào exclude) thay vì cả khung.

## 5. Lịch sử nâng cấp

- **2026-06-08 — Phase A:** module `StoneScatter` (Poisson-disk Bridson + InstancedMesh đĩa, mulberry32 seed). v1
  tròn/ellipse rời (Voronoi = đích xa).
- **2026-06-08 — Phase B (tab Path):** ráp dạng `stoneFields[]` + tab Path riêng. **ĐÃ THAY** bằng tái cấu trúc dưới.
- **2026-06-08 — TÁI CẤU TRÚC:** NgQuan "bỏ path vào bên trong G1 — mỗi zone z1 có 2 loại Surface|Path". Bỏ
  `stoneFields[]`/tab Path → path = **zoneKind trong GroundLayer**. Edit route qua `applySite` (như surface zone),
  KHÔNG live-tune riêng. `_rebuildGroundLayersLive` xử path-mesh (dispose qua StoneScatter). Chờ verify :3002.

## 6. Liên hệ

- Module: `components/StoneScatter` (README Poisson/props) · cặp `RockCluster`/`WaterSurface`/`GrassBlades`.
- Đích xa Voronoi: `deferred/geometry/voronoi-applications.md` · nền sân `deferred/systems/garden-ground-patches.md`.
- Hệ G-level/zone: `playbooks/ground.md` · pattern live-rebuild zone: `_rebuildGroundLayersLive` (distilled `archplan-rebuild-dirty-check`).
