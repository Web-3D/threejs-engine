# Pond cong tự nhiên (#9) + Foundation cột chạm đáy hồ (#11)

> Status: **WANTED 2026-06-05**, chưa build (turn quá dài). 2 yêu cầu pond-liên-quan của NgQuan.

## #9 — Bẻ cong mặt hồ pond theo đường cong (organic, không vuông như hồ bơi)
Pond đã có `shape:'free'` + `points[]` (kéo đỉnh). User muốn cạnh CONG mượt, không gãy-góc.
**Plan:** trước khi dựng `ShapeGeometry` (mặt nước + basin + carve nền), **nội suy points qua spline** (Catmull-Rom
khép kín) → subdivide ~8–12 điểm/cạnh → polygon mượt. Thêm field `WaterConfig.smooth?: boolean` (hoặc `edgeMode:'poly'|'spline'`).
Áp ở `waterGeo` (WaterSurface), `pondWorldXZ`/`basinGeometry`/`lotShape` carve (site/render/fromState) — DÙNG CHUNG 1 hàm
`smoothedPolygon(points)` (single source, né drift). Có thể +preset "blob/kidney lake" (circle + noise perturb).
- Liên hệ: `threejs-modules/components/WaterSurface` (waterGeo), `site/render/fromState` (pondWorldXZ, basinGeometry, lotShape), playbook `pond.md`.

## #11 — Cột foundation sàn gỗ tự nối xuống ĐÁY HỒ khi nằm trên mặt hồ (nhà sàn trên nước, 高床/Itsukushima)
Khi wood-deck foundation (lưới cột #10) đặt TRÊN hồ → cột nào nằm trong mặt hồ phải **kéo dài xuống chạm đáy basin** (depthY).
**KIẾN TRÚC (cross-system — building-kit ĐỘC LẬP site-kit):** building-kit nhận **probe** từ editor:
- `BuildRenderCtx.pondProbe?: (worldX, worldZ) => number` — trả ĐỘ SÂU THÊM (m, dưới mặt nền) tại điểm đó, 0 nếu không trên hồ.
- Editor (archplan `_renderScene`) dựng probe từ `site.waters`: point-in-polygon mỗi pond (`pondWorldXZ`) → trả `depthY/1000`.
- `makeWoodDeckFoundation`: mỗi cột tính WORLD XZ (rotateY(rotY)+worldX/Z) → `d = pondProbe(wx,wz)`; nếu d>0:
  `postH = (h - deckThick) + d`, `centerY = (-deckThick - d)/2` (đáy cột xuống `-h/2 - d` = đáy hồ). d=0 → như cũ (đã verify công thức nhất quán).
- Thread: thêm `pondProbe` vào `BuildRenderCtx` → `buildFoundation` → `makePositionedFoundation` (opts.pondProbe) → `makeWoodDeckFoundation`.
- Liên hệ: `building/parts/Structure.ts:makeWoodDeckFoundation` (#6/#10), `building/render/fromState.ts:buildFoundation`, archplan `_renderScene` + `pondWorldXZ` (site).
- Lưu ý: hồ + nhà-trên-hồ → có thể cần BỎ carve/đục đáy chỗ nhà, hoặc cột xuyên nước (khúc xạ thấy cột) — chốt khi build.
