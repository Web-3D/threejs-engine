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

Mô hình **G0 cỏ → tạo G-level (G1+) → mỗi zone add chọn LOẠI**: ① **Surface** (lớp vật liệu cũ) · ②
**Path** (rải đá tròn/ellipse Poisson, không chạm, chừa khe) · ③ **🧱 Sân gạch** (`zoneKind: 'paving'`,
2026-06-10 — `BrickPaving` viên block bond đều so le + DECAY rụng/lún/lệch/sạm; instance B1/B2…; consumer
op #3 gridOnSurface+copyToPoints; PHẲNG v1 — không Bám gò, khác path) · ④ **🧱 Tường cong**
(`zoneKind: 'wall'`, cùng ngày — `CurvedBrickWall` cung tròn R + góc quét 360°=vòng kín, viên nhô 2 mặt,
TÂM cung = Pos X/Z, length/width zone KHÔNG dùng, KHÔNG flatten terrain dưới nó; instance W1/W2…).
Loại zone chốt LÚC TẠO theo tab giữa [Mảng add | Path đá | Sân gạch | Tường cong | Khoét cut].
**Đích xa** = Voronoi crazy-paving (`geometry/voronoi-applications.md`).

## 2. Recipe dựng

- **Module** (`StoneScatter`): Bridson Poisson-disk (blue-noise) trong rect → tâm cách đều; mỗi tâm `r∈[rMin,rMax]`
  + aspect ellipse + xoay. `minDist=2·rMax+gap` ⇒ KHÔNG chạm. N phiến = 1 InstancedMesh = 1 draw. Props mm→m.
- **State** (`state.ts`): `GroundLayer.zoneKind?: 'surface'|'path'` (optional → 'surface' backward-compat) +
  `path?: StonePathParams` (rMin/rMax/ellipseMin/gap/thickness/seed/color/material). `makeStonePathParams` (seed
  ngẫu nhiên) + `parseStonePathParams` (clamp, rMin≤rMax). Khung = length/width/offset của CHÍNH zone (KHÔNG field riêng).
- **Render** (`fromState.ts` `addZoneMesh`): `zoneKind==='path'` → `addStonePathMesh` dựng StoneScatter (frame=length/
  width, Y=baseY) thay mesh surface. `userData.stonePath` = ref. `buildLevelZones`: path KHÔNG tính `maxTh`. **🏔️ BÁM
  GÒ** (`layer.drape`, dùng chung field surface-drape): drape zone NGOÀI `zoneRects` → terrain giữ gò dưới nó →
  `drapeStonesToTerrain` dời Y MỖI viên `+= heightAt(worldXZ)` (worldXZ = offset + xoay local theo rot). Cỏ vẫn né
  khuôn: `siteGrassExclude` +rect MỌI path-zone (vì bám-gò ngoài zoneRects → phải thêm tay; KHÔNG ăn vào mask terrain).
- **GUI** (archplan `gui/site.ts` `buildZonePane`): op='add' → `zoneKindRow` (**Type: Surface|Path**); path →
  `buildPathZoneBody` (**Form Chữ-nhật|Tròn** `pathFormRow` reuse `GroundLayer.shape` + Frame W/D + `pathSliderSpecs`
  R min/max·Ellipse·Gap·Thick·Seed + **`pathRotRow` Rotate° LIVE** + Material + Color). Đổi Type → reset shape→rect.
  **⚡ Perf:** slider structural KÉO = `applyZonesLive` (rebuild zone-only, NÉ water-RTT); Rotate° = `tunePathRotLive`
  (chỉ `mesh.rotation.y`, 0 rebuild); buông = `applySite`. KHÔNG route `applySite(false)` (= tái-tạo water-RTT/frame = tụt fps).
- **Lab** (`ArchPlanLab.ts`): `_rebuildGroundLayersLive` mesh `userData.stonePath` → dispose QUA `field.dispose`.
  `_applyZonesLive` (rAF → `_rebuildGroundLayersLive`) + `_tunePathRotLive` (`_layerMeshByIdx` → set rotation.y).
  `_collectPathTexKeys` → texture đá dùng chung cache border hồ. **Move (body-drag)**: `_layerDrag` lưu `startMeshPos`
  → `position = gốc + Δ` (giữ Y baseY; surface startMeshPos=0 = cũ); `_commitLayerDrag` trừ startMeshPos (khỏi cộng-đôi).

## 3. Tầng & toạ độ

- Path-zone sống trong `groundLayers` (op='add', level = G-level). Khung = length/width zone (0.5..40m), offset ±20m.
- Phiến: `rMin/rMax` 0.05..2m, `gap` 0..1m, `thickness` 1..30cm. Y = baseY của G-level (đá trên pad phẳng).
- Budget: khuôn 4×4m ≈ ~20 phiến × 64 tri ≈ 1.3k tri, **1 draw/zone**. Cap MAX_STONES=400 (module).

## 4. Lỗi thường gặp

- **Phiến nhô khỏi khung ≤ rMax:** Poisson sinh tâm trong rect, đĩa bán kính r tràn mép (khung vô hình → OK).
- **Đá phẳng pad (mặc định):** path-zone vào `zoneRects` → terrain phẳng dưới. Muốn theo gò → bật **Bám gò** (drape).
- **Bám gò: xoay LIVE lệch cao-độ tạm:** `tunePathRotLive` chỉ quay mesh, KHÔNG re-sample heightAt → đá lệch cao-độ
  vài cm lúc kéo Rotate°, buông (`applySite`) re-drape đúng. Chấp nhận (gò thoải).
- **Đổi Type mất focus tab:** `zoneKindRow` gọi `rebuild(flatIdx)` giữ focus zone đang sửa (đừng quên flatIdx).
- **Cỏ-tuft trong khe phiến:** path-zone né cỏ CẢ khung (qua `zoneRects`) → đá trên nền phẳng, chưa cỏ trong khe.
  Polish: per-stone exclude (feed `StoneScatter.getPlacements()` vào exclude) thay vì cả khung.
- **Move path phải click TRÚNG 1 viên đá** (raycast InstancedMesh, khe không bắt) — chưa có pick-plane khung. Chấp nhận v1.
- **Xoay path: grass-exclude giữ bbox AXIS-ALIGNED** (`layerRect` rot:0) — xoay nhiều → cỏ hở góc nhẹ. Chấp nhận v1.

## 5. Lịch sử nâng cấp

- **2026-06-08 — Phase A:** module `StoneScatter` (Poisson-disk Bridson + InstancedMesh đĩa, mulberry32 seed). v1
  tròn/ellipse rời (Voronoi = đích xa).
- **2026-06-08 — Phase B (tab Path):** ráp dạng `stoneFields[]` + tab Path riêng. **ĐÃ THAY** bằng tái cấu trúc dưới.
- **2026-06-09 — Shape + Xoay + Move:** NgQuan thêm 3 thứ cho path. (1) **Form Chữ-nhật|Tròn** — StoneScatter
  +option `shape:'rect'|'circle'` (circle = lọc tâm trong ellipse nội tiếp), reuse `GroundLayer.shape`. (2) **Rotate°**
  — `StonePathParams.rot` → `mesh.rotation.y`. (3) **Move body-drag** — fix `_layerDrag` (startMeshPos) để path dời
  đúng (trước = nhảy về gốc vì offset nằm ở mesh.position). Module 1.0→1.1.
- **2026-06-09 — Fix TỤT FPS xoay (+ slider path):** xoay route `applySite(false)` → `_rebuildSite` tái-tạo water-RTT
  + recompile NodeMaterial MỖI frame (bẫy PERFORMANCE.md). Fix: Rotate° = `tunePathRotLive` (transform thuần, 0
  rebuild); slider structural path = `applyZonesLive` (rebuild zone-only, né water-RTT). Buông vẫn `applySite` commit.
- **2026-06-09 — Bám gò:** toggle **Bám gò** (reuse `layer.drape` → zoneRects loại → terrain giữ gò) + `drapeStonesToTerrain`
  dời Y mỗi viên theo `heightAt`. Cỏ né khuôn qua `siteGrassExclude` (vì drape ngoài zoneRects). KHÔNG đổi state/module.
- **2026-06-08 — TÁI CẤU TRÚC:** NgQuan "bỏ path vào bên trong G1 — mỗi zone z1 có 2 loại Surface|Path". Bỏ
  `stoneFields[]`/tab Path → path = **zoneKind trong GroundLayer**. Edit route qua `applySite` (như surface zone),
  KHÔNG live-tune riêng. `_rebuildGroundLayersLive` xử path-mesh (dispose qua StoneScatter). Chờ verify :3002.
- **2026-06-11 — code1 (click-focus 3D) cho SÂN GẠCH + TƯỜNG CONG:** `BrickPaving`/`CurvedBrickWall` `getMesh()` trả
  **THREE.Group** (viên = InstancedMesh con, `userData.groundLayerIdx` nằm trên Group) → raycast trúng viên con KHÔNG
  có idx → `_tryClickLayer`/`_tryStartLayerDrag` (đọc `h.object.userData.groundLayerIdx` TRỰC TIẾP) bỏ sót → click
  không focus tab + Move không grab. Fix: helper **`_layerObjOf(o)`** walk-up parent tới ancestor mang `groundLayerIdx`
  (dừng ở siteGroup) + **`_pickLayer(hits)`** trả hit gần nhất resolve được. `_layerDrag.mesh` nới `THREE.Mesh`→`Object3D`
  (Group hợp lệ, chỉ dùng `.position`). Path/surface không đổi (idx ngay trên mesh). **GỘP LUÔN (cùng gốc Group≠Mesh):**
  (a) `_rebuildGroundLayersLive` bỏ lọc `instanceof Mesh` (lọc theo `groundLayerIdx !== undefined`) + tách helper
  **`_disposeLayerField(o)`** dispose path/paving/wall QUA field (`stonePath ?? brickPaving ?? curvedWall`, rút khỏi
  siteShaders) → hết **nhân-đôi lúc kéo slider terrain/zone**; (b) `_layerMeshByIdx` trả `Object3D` (bỏ lọc Mesh) →
  `_tunePathRotLive` rotate-LIVE chạy cho paving/wall (Group có rotation.y). Bỏ import `StoneScatter` (hết dùng). Gate
  tsc 0 + eslint 0.

## 6. Liên hệ

- Module: `components/StoneScatter` (README Poisson/props) · cặp `WaterSurface`/`GrassBlades`.
- Đích xa Voronoi: `deferred/geometry/voronoi-applications.md` · nền sân `deferred/systems/garden-ground-patches.md`.
- Hệ G-level/zone: `playbooks/ground.md` · pattern live-rebuild zone: `_rebuildGroundLayersLive` (distilled `archplan-rebuild-dirty-check`).
