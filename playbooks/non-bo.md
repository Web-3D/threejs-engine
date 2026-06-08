---
domain: non-bo
title: Non bộ — cụm đá mỏm procedural (RockCluster) ráp vào sân vườn
status: building
tier: —
modules:
  - threejs-modules/components/RockCluster
  - threejs-modules/site/render/fromState.ts
  - threejs-modules/site/state.ts
  - archplan/src/archplan/gui/site.ts
issues: []
updated: 2026-06-08
---

# Playbook — Non bộ (hòn non bộ / rockery)

> **Ranh giới:** recipe + tầng/toạ độ + lịch sử. Đá craggy chi tiết → `components/RockCluster/README.md`.
> Kế hoạch tổng (3 đường đá, vì sao terrain KHÔNG làm đá) → `deferred/systems/non-bo-rockery-builder.md`.

## 1. Kết quả "hoàn chỉnh"

Cảnh non bộ = **terrain mound (ĐẾ)** + **RockCluster (ĐÁ mỏm craggy)** + **hồ** (WaterSurface) sát chân +
**rêu/cỏ** (GrassBlades màu rêu). Phase A = module đá rời ✅. **Phase B (đang)** = tab **Rock** trong Ground
đặt/tune cụm đá đa-instance, đá BÁM cao-độ gò. Phase C = preset 1-nút + triplanar texture + rêu-slope.

## 2. Recipe dựng

- **Module đá** (`RockCluster`): N viên Icosahedron displace craggy (fbm3 tự-chứa) xếp MỎM (đế rộng→đỉnh hẹp)
  → merge 1 mesh flatShading. Props mm→m. KHÔNG overhang/hang (đá xếp chồng → khe+craggy). 1 draw/cụm.
- **State** (`state.ts`): `RockConfig` (enabled + offsetX/Z + footprintRadius/height + rockCount/craggy/rockScale/
  detail/seed + color) trong `SiteState.rocks?[]` (optional → backward-compat []). `renderRocks` = enabled. `makeRock`
  /`parseRock`/`parseRocks` (clamp khớp slider, int hoá count/detail/seed; seed ngẫu nhiên → mỗi cụm khác hình).
- **Render** (`fromState.ts` `buildRocks`, EXPORT): mỗi cụm bật → `new RockCluster` → mesh tại `(offsetX/1000,
  topY + heightAt(hf, x, z), offsetZ/1000)` (BÁM gò ở TÂM cụm; hf = `buildHeightField` khi terrain bật).
  `userData.rockIdx` → editor rebuild rock-only. push `ctx.shaders` (cluster.dispose lo geo+mat). Trả `SiteHandle.rocks`.
- **GUI** (archplan `gui/site.ts`): sub-tab **🪨 Rock** cạnh Water (index 4) — instance `R1│R2│＋` (`buildRockDomain`/
  `buildRockTabs`/`buildRockPane`). Pos X/Z + Color = **live** (`ctx.tuneRock` → mesh.position/setColor, KHÔNG rebuild);
  structural (`rockSliderSpecs`) = kéo `ctx.applyRocksLive` (rebuild CHỈ rock, né water-RTT) / buông `applySite`.
- **Lab** (`ArchPlanLab.ts`): `_siteRocks` zip cfg↔cluster; `_tuneRock` (live), `_rebuildRocksLive` (dispose cụm cũ
  khỏi siteShaders + `buildRocks` lại) ← mirror `_rebuildGroundLayersLive`.

## 3. Tầng & toạ độ

- Vị trí: `offsetX/Z` mm lệch tâm lô (= world XZ /1000). Slider ±15m. Y = `groundThick/1000 + heightAt(gò)` ở TÂM.
- Đá đứng TRÊN mặt nền/gò (gốc viên y≥0, vươn lên). Terrain tắt → ngồi trên slab phẳng.
- Budget: detail=2 × 22 viên ≈ 7k tri, **1 draw/cụm**. Cap rockCount 60, detail 3.

## 4. Lỗi thường gặp

- **Đá lơ lửng/lún khi kéo Pos trên gò:** Pos live chỉ dời X/Z (Y giữ) → buông (`applySite`) mới sample lại cao-độ
  gò. Chấp nhận (commit chuẩn). Muốn bám-gò-realtime lúc kéo = sample heightAt trong tuneRock (polish sau).
- **Kéo structural tụt fps nếu route nhầm `applySiteLive`** (tái-tạo water-RTT). PHẢI `applyRocksLive` (rock-only).
- **Cỏ đâm xuyên đế đá:** chưa exclude grass dưới footprint đá (đá thưa, đế craggy che phần lớn). Polish: thêm
  rockRect vào `siteGrassExclude` + `grassBuildSig`.

## 5. Lịch sử nâng cấp

- **2026-06-08 — Phase A:** module `RockCluster` (đá mỏm procedural, fbm3 tự-chứa). 4 file + validate.
- **2026-06-08 — Phase B:** tab **Rock** ráp vào archplan (state `rocks[]` + `buildRocks` bám gò + GUI đa-instance
  R1│R2│＋ + live Pos/Color + rebuild rock-only). Kéo-thả 3D = hoãn (slider trước, như mound 3a→3b).

## 6. Liên hệ

- Module: `components/RockCluster` (README props/thuật toán) · cặp `WaterSurface`/`GrassBlades`/terrain `terrain.ts`.
- Kế hoạch + giới hạn height-field: `deferred/systems/non-bo-rockery-builder.md` · `[[character-terrain-follow]]`.
- Pattern live-rebuild né water-RTT: như `_rebuildGroundLayersLive` (ground zones) — distilled `archplan-rebuild-dirty-check`.
