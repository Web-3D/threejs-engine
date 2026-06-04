---
id: KI-004
title: Đáy hồ không hiện — basin merge trả null (trộn index) + nền backdrop đặc che basin dưới y=0
category: geometry
domain: pond
severity: high
status: fixed
when: Bật hồ (site.water) trong archplan; nhìn từ trên KHÔNG thấy đáy/lòng hồ, hạ mặt nước thì nước biến mất chìm dưới nền
where:
  - threejs-modules/site/render/fromState.ts:basinGeometry  # mergeGeometries([walls non-indexed, floor ShapeGeometry indexed])
  - threejs-modules/site/render/fromState.ts:buildWater      # baseY chìm > slab dày → nước rớt dưới slab
  - archplan/src/archplan/ArchPlanLab.ts:_setupScene         # PlaneGeometry(80×80) @ y=0 đặc = backdrop
  - archplan/src/archplan/ArchPlanLab.ts:gridHelper          # GridHelper(80,80) @ y=0 = sọc lưới đè lòng hồ
discovered: 2026-06-04
fixed-in: '—'
related:
  - ki:KI-003
tags: [pond, basin, mergeGeometries, indexed, occlusion, ground, carve]
---

## 1. Lỗi gì (triệu chứng)

Hồ nước bật lên nhưng **không thấy đáy/lòng hồ**. Mặt nước trông như miếng phẳng tối dán trên cỏ. Khi
hạ mặt nước xuống cho "lõm" thì **nước biến mất hẳn khi nhìn từ trên** (chỉ thấy từ dưới lên — ảnh chụp
cho thấy mặt nước lơ lửng dưới tấm cỏ trong khoảng tối, KHÔNG có vách/đáy nào quanh nó). Sau khi khoét
2 lớp nền + có đáy: ở chế độ surface = **grid** còn thấy **sọc lưới ngang/dọc đè lên lòng hồ** (lưới
`GridHelper` ở y=0 nằm TRÊN mặt nước −2cm).

## 2. Khi nào & Ở đâu

Trigger: `site.water.enabled` + dựng site (`buildWater` → `buildBasin`). 3 nguyên nhân chồng nhau:
- `basinGeometry` (fromState) trộn `walls` (non-indexed) với `floor` = `ShapeGeometry` (indexed).
- `buildWater` đặt `baseY = rim − lip(60mm)` trong khi slab nền chỉ dày `GROUND_THICK_MIN = 10mm`.
- `ArchPlanLab._setupScene`: nền backdrop `PlaneGeometry(80,80)` đặc tại `y=0`, FrontSide.

## 3. Tại sao (root cause — đã verify)

**(a) mergeGeometries trả NULL.** `mergeGeometries` yêu cầu MỌI geometry cùng "có index" hoặc "không
index" — trộn 2 loại → trả `null`. `basinGeometry` fallback `?? new BufferGeometry()` (rỗng) → **basin
không có tam giác nào** → mất cả vách lẫn sàn đáy. (Verify: đọc BufferGeometryUtils + carve-test node.)

**(b) Nước rớt dưới slab.** `lip` kẹp theo `depthY` mà KHÔNG kẹp theo `groundThick`. Slab mỏng 10mm,
lip 60mm → `baseY = 0.01 − 0.06 = −0.05` → mặt nước nằm dưới đáy slab, trong khoảng không.

**(c) Backdrop che.** Basin chạy từ `y=0` xuống `y=−0.59` — NẰM DƯỚI tấm nền editor `y=0` đặc. Nhìn từ
trên: tấm nền che hết phần dưới y=0. Nhìn từ dưới: tấm nền FrontSide bị backface-cull → thấy nước lơ lửng.
Đây là lý do carve lỗ ở slab cỏ (đã đúng — carve-test PASS) vẫn KHÔNG đủ: còn 1 mặt phẳng đặc thứ hai.

## 4. Sửa như thế nào

- (a) `floor.toNonIndexed()` trước khi merge → walls & floor cùng non-indexed → merge OK, có sàn đáy.
- (b) `baseY = max(yBot + 0.03, rim − 0.03)` (`yBot = rim − depthY`) → chìm vừa phải, LUÔN trên đáy ≥3cm,
  không phụ thuộc slab mỏng.
- (c) Vỏ `_rebuildEditorGround()`: khi có hồ → nền backdrop = `ShapeGeometry(80×80 − lỗ hồ)` dùng CÙNG
  `pondWorldXZ` (export từ lõi = single source) → nhìn xuyên thấy basin. Gọi sau mỗi `_renderSite`.
- (d) **Lưới (occluder thứ 3):** `GridHelper` là `LineSegments` — KHÔNG khoét lỗ được. Thay bằng
  `LineSegments` tự dựng (`_buildGridGeo`), mỗi đường //trục CẮT đoạn nằm trong bbox hồ → hết sọc đè
  lòng hồ. Rebuild theo bbox hồ ở `_rebuildGrid` (gọi cùng `_rebuildEditorGround`).

## 5. Phòng tái phạm

- **mergeGeometries:** trước khi merge, BẢO ĐẢM mọi input đồng nhất index. Trộn raw-position (non-indexed)
  với primitive geometry (PlaneGeometry/ShapeGeometry/Box… đều indexed) → `.toNonIndexed()` 1 bên. Merge
  trả null thì geometry RỖNG, KHÔNG throw → dễ "mất hình" âm thầm. Luôn check `merged === null`.
- **Lỗ xuyên nền:** khi khoét lỗ để nhìn xuống (hồ/giếng/tầng hầm), liệt kê **MỌI lớp che** ở/quanh y=0 —
  không chỉ 1. Ở đây có **3**: slab site (ExtrudeGeometry), backdrop editor (Plane→Shape-hole), **lưới
  GridHelper** (LineSegments → tự dựng cắt đoạn). Carve 1 lớp = vẫn bị lớp kia che. GridHelper/LineSegments
  KHÔNG hole được → phải tự dựng geometry.
- **Sink theo ràng buộc đúng:** offset cao độ phải kẹp theo cái nó không được vượt (đáy basin), KHÔNG kẹp
  theo biến không liên quan (slab dày). Slab mỏng là cái bẫy ẩn.
