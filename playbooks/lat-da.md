---
domain: lat-da
title: Lối đi lát đá — rải đá tròn/ellipse Poisson (StoneScatter) trong khuôn vô hình
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

> **Ranh giới:** recipe + tầng/toạ độ + lịch sử của mảng "rải đá trong khuôn". Thuật toán Poisson + đĩa
> instanced chi tiết → `components/StoneScatter/README.md`. v1 = đá RỜI có khe (KHÔNG Voronoi ghép-khít).

## 1. Kết quả

Mô hình **G0 cỏ → G1 khuôn VUÔNG VÔ HÌNH → rải mảng đá tròn/ellipse** random, cách đều, **không chạm nhau**
(chừa khe cỏ). Như lối đi lát đá sân vườn. Đa-instance (tab Path: P1│P2│＋). **Đích xa** = Voronoi crazy-paving
(ghép khít, đa giác) — `geometry/voronoi-applications.md`.

## 2. Recipe dựng

- **Module** (`StoneScatter`): Bridson Poisson-disk (blue-noise) trong rect → tâm cách đều; mỗi tâm gán
  `r∈[rMin,rMax]` + aspect ellipse + xoay. `minDist=2·rMax+gap` ⇒ KHÔNG chạm (bounding-circle ≤ rMax). N phiến =
  1 InstancedMesh = 1 draw. Material nội bộ flat / bơm material ngoài. Props mm→m.
- **State** (`state.ts`): `StoneFieldConfig` (enabled + offsetX/Z + frameW/D + rMin/rMax + ellipseMin + gap +
  thickness + seed + color + material) trong `SiteState.stoneFields?[]` (optional → backward-compat []).
  `renderStoneFields` = enabled. `makeStoneField` (seed ngẫu nhiên) + `parseStoneField(s)` (clamp, rMin≤rMax).
- **Render** (`fromState.ts` `buildStoneFields`, EXPORT): mỗi khuôn bật → `new StoneScatter` → mesh tại
  `(offsetX/1000, topY + heightAt(hf,x,z), offsetZ/1000)` (BÁM gò ở TÂM khuôn). `userData.stoneFieldIdx`.
  Cỏ né: `stoneFieldRect` (cả khuôn) vào `siteGrassExclude` → blade không đâm xuyên phiến.
- **GUI** (archplan `gui/site.ts`): sub-tab **Path** (index 5) cạnh Rock — instance `P1│P2│＋`
  (`buildStoneDomain`/`buildStoneTabs`/`buildStonePane` + `stoneSliderSpecs`). Pos X/Z + Color = **live**
  (`tuneStoneField`); structural = kéo `applyStoneFieldsLive` (rebuild stone-only, né water-RTT) / buông `applySite`.
- **Lab** (`ArchPlanLab.ts`): `_siteStoneFields` zip cfg↔field; `_tuneStoneField`, `_rebuildStoneFieldsLive`
  (dispose field cũ + `buildStoneFields`) ← mirror `_rebuildRocksLive`. Texture đá dùng chung cache border hồ.

## 3. Tầng & toạ độ

- Vị trí: `offsetX/Z` mm lệch tâm lô (= world XZ /1000). Slider ±15m. Khuôn `frameW×D` 0.5..20m (vô hình).
- Phiến: `rMin/rMax` 0.05..2m, `gap` 0..1m, `thickness` 1..30cm. Y = `groundThick/1000 + heightAt(gò)` ở TÂM.
- Budget: khuôn 4×4m ≈ ~20 phiến × 64 tri ≈ 1.3k tri, **1 draw/khuôn**. Cap MAX_STONES=400 (module).

## 4. Lỗi thường gặp

- **Phiến nhô khỏi khuôn ≤ rMax:** Poisson sinh tâm trong rect, đĩa bán kính r tràn mép (khuôn vô hình → OK).
- **Đá float/lún khi kéo Pos trên gò:** Pos live chỉ dời X/Z (Y giữ) → buông (`applySite`) mới sample lại cao-độ.
- **Cả khuôn nằm 1 cao-độ trên gò dốc:** bám gò ở TÂM (1 điểm) → khuôn lớn trên sườn sẽ lệch. Per-stone drape = polish.
- **Cỏ-tuft trong khe giữa phiến:** v1 exclude CẢ khuôn (đá trên nền xanh phẳng) → chưa có cỏ mọc trong khe.
  Polish: per-stone exclude (feed `getPlacements()` vào exclude) thay vì cả khuôn.

## 5. Lịch sử nâng cấp

- **2026-06-08 — Phase A:** module `StoneScatter` (Poisson-disk Bridson + InstancedMesh đĩa, mulberry32 seed).
  4 file + validate. v1 tròn/ellipse rời (Voronoi = đích xa).
- **2026-06-08 — Phase B:** tab **Path** ráp archplan (state `stoneFields[]` + `buildStoneFields` bám gò + GUI
  đa-instance P1│P2│＋ + live Pos/Color + rebuild stone-only + texture đá dùng chung cache border hồ + cỏ né khuôn).
  Kéo-thả 3D đặt khuôn = hoãn (slider trước, như rock/mound). Chờ verify :3002.

## 6. Liên hệ

- Module: `components/StoneScatter` (README Poisson/props) · cặp `RockCluster`/`WaterSurface`/`GrassBlades`.
- Đích xa Voronoi ghép-khít: `deferred/geometry/voronoi-applications.md` · nền sân `deferred/systems/garden-ground-patches.md`.
- Pattern live-rebuild né water-RTT: như `_rebuildRocksLive` — distilled `archplan-rebuild-dirty-check`.
