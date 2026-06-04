---
id: KI-005
title: Sửa/kéo 1 phần tử → rebuild MỌI thứ không-đổi (cỏ re-scatter, hồ tái tạo RTT, gạch-3D dựng lại) → tụt fps + leak đỏ
category: perf
domain: grass, pond, wall
severity: high
status: fixed
when: Mỗi lần edit/kéo bất kỳ (di chuyển nhà/cửa/cột/cầu thang, đổi màu tường…) trong ArchPlanLab — đường _buildScene/_buildSceneLive → _renderScene → _renderSite + renderBuildingState dựng lại TẤT CẢ, 60×/giây lúc kéo
where:
  - archplan/src/archplan/ArchPlanLab.ts        # _renderSite (dirty-check site _siteSig), _syncGrass (_grassSig/_grassParamSig grass dirty-check), _renderScene (truyền plainWalls = LOD lúc kéo)
  - threejs-modules/site/render/fromState.ts    # skipGrass opt, buildSiteGrass, grassBuildSig, siteGrassExclude
  - threejs-modules/building/render/fromState.ts # renderBuildingState(state, ctx, plainWalls) — LOD lúc kéo (bỏ brick-3d/gỗ instanced)
discovered: 2026-06-04
fixed-in: —
related:
  - ki:KI-004
  - memory:archplan-rebuild-dirty-check-and-transform-not-rebuild
tags: [rebuild, dirty-check, re-scatter, reflector, rtt-leak, drag, fps, grass, water, brick-3d, instanced, lod, shadow]
---

## 1. Lỗi gì (triệu chứng)

ArchPlanLab "vấn đề muôn thuở": **sửa/di chuyển 1 thứ → mọi thứ khác cũng dựng lại theo.**
- Đổi màu tường / sửa cửa / kéo bất kỳ → **toàn bộ bãi cỏ re-scatter** (tới 24000 lá, CPU `Matrix4.compose`) → khựng.
- Kéo cả căn nhà → **RuntimeGuard đỏ ("leak")**: mỗi frame tạo+dispose lại `WaterSurface` (reflector RTT + recompile NodeMaterial).
- Kéo BẤT KỲ element building (nhà/**cửa/ban công/cầu thang/cột**) → **fps 60→20** ngay cả khi đã hết leak + đóng băng bóng: mỗi frame **dựng lại toàn bộ geometry nhà**, mà tường `brick-3d`/`wood-3d` = `InstancedBrickWall` **tính lại ma trận từng viên gạch** (1 nhà = hàng nghìn viên) trên CPU ≈ 34ms/frame.

## 2. Khi nào & Ở đâu

Trigger: MỌI commit/live-drag. `_buildScene`/`_buildSceneLive` → `_renderScene` → `_renderSite` → `_clearSite()` + `renderSiteState()` (dựng lại cỏ + hồ + nền + rào) **vô điều kiện**. Move-tool `dragMove` (`manipulate.ts`) ghi field rồi `_buildSceneLive()` → rebuild hình nhà **mỗi frame**.

## 3. Tại sao (root cause — đã verify đọc code)

Renderer **headless, không trạng thái**: gọi là dựng lại từ đầu (clear + build). Editor lại gọi nó cho MỌI edit, kể cả khi input của hệ con KHÔNG đổi. Sự phụ thuộc thực tế hẹp hơn nhiều:
- **Cỏ** chỉ phụ thuộc `grass3d` + kích thước lô + `exclude` (footprint nhà/hồ). Đổi màu tường/sửa cửa KHÔNG đụng mấy thứ đó → re-scatter là phí 100%.
- **Nền/nước/rào** chỉ phụ thuộc `site`. Kéo nhà đổi `state` (nhà) chứ KHÔNG đổi `site` → tái tạo reflector RTT mỗi frame là phí 100% (và dispose RTT không kịp → guard báo leak).
- **Hình nhà** khi kéo CẢ NHÀ chỉ đổi `posX/posZ` (1 phép tịnh tiến). Nhưng `renderBuildingState` **bake world-coord vào geometry** → đổi vị trí = phải re-bake = rebuild.
- **Thủ phạm CPU lớn nhất (đã chứng minh):** rebuild đó dựng lại **tường `brick-3d`/`wood-3d`/`wood-strip` = `InstancedBrickWall`/`WoodSiding*`**, mỗi cái **tính lại ma trận từng viên gạch/thanh gỗ** (hàng nghìn/nhà) — làm 60×/giây dù gạch KHÔNG đổi. Shadow KHÔNG phải thủ phạm (đóng băng vẫn lag); render/GPU KHÔNG phải (kéo HỒ = chỉ `mesh.position.set`, cùng cảnh đó vẫn 60fps). CHỈ còn lại CPU-rebuild geometry, mà LOD-bỏ-gạch làm hết lag ⇒ **chốt: instancing gạch là toàn bộ chi phí.**

## 4. Sửa như thế nào

Nguyên tắc: **chỉ dựng lại khi INPUT của hệ đó đổi; bỏ phần đắt-nhất-không-đổi khi rebuild 60×/s.**
3 nguyên nhân RIÊNG BIỆT, mỗi cái 1 fix (đừng gộp); và CHỈ giữ fix đánh trúng thủ phạm đã chứng minh:

1. **Cỏ re-scatter — dirty-check + group bền.** Cỏ sống trong `_grassGroup` RIÊNG (không bị `_clearSite` xoá). Lõi thêm `skipGrass` opt + export `buildSiteGrass`/`grassBuildSig`/`siteGrassExclude`. `_syncGrass(exclude)` so `grassBuildSig` (chỉ field STRUCTURAL, bỏ màu/bóng/vệt = uniform live); giống → giữ nguyên scatter. Lúc LIVE-drag chỉ đổi `exclude` (kéo nhà/hồ) → **hoãn re-scatter tới khi buông** (so thêm param-sig bỏ exclude).
2. **Reflector RTT churn — dirty-check site.** `_renderSite` so `_siteSig = JSON({...site, grass3d:0})`; kéo nhà → `site` không đổi → **bỏ qua** `_rebuildSite()` (gồm reflector RTT). Phần nặng tách ra `_rebuildSite`.
3. **★ Brick-3D instancing — LOD lúc kéo (FIX CHÍNH).** `renderBuildingState(state, ctx, plainWalls)`: khi `_liveRebuild` → ép mọi tường về `'none'` (phẳng, GIỮ màu) + bỏ panel decor → KHÔNG dựng `InstancedBrickWall`/`WoodSiding*` (per-brick matrices = thủ phạm). Cửa vẫn khoét lỗ. Buông → rebuild full (material brick vẫn trong `WallMaterialCache` → KHÔNG recompile; `plainWalls` còn **skip `cache.sweep`**).

Đánh đổi (chấp nhận): lúc kéo tường PHẲNG (mất vân gạch) → gạch full khi buông. Cỏ né-lại-footprint cũng snap khi buông.

**Đã THỬ rồi GỠ (đừng phí công lại):** (a) skip shadow lúc kéo — bác bỏ vì *đóng băng bóng vẫn lag* (shadow vô can); (b) skip pick/readout/heightGrid — phỏng đoán, không đo được lợi; (c) `liveTranslateBuilding` fast-path (dời group thay rebuild) — chỉ chạy khi 1 instance & không cứu vì brick mới là chi phí chính; (d) **"bóng ma" `_setBuildingGhost` (set `transparent=true`+opacity 0.2 che LOD) — TỤT FPS LẠI**: bật `transparent` đẩy cả nhà sang TRANSPARENT PASS (blend+sort/frame) đắt hơn opaque nhiều (nhất là máy software/WARP). ⇒ **Che-LOD bằng transparency = KHÔNG khả thi; nếu cần che phải dùng cách OPAQUE** (vd tint uniform màu preview). → Bài học: **khoanh đúng thủ phạm TRƯỚC, rồi mới fix**; mọi "đòn phụ" phải đo lại fps, đừng tin chay.

## 5. Phòng tái phạm

**Phương pháp chẩn "lag lúc kéo" (đã hiệu nghiệm — loại trừ từng tầng):**
1. Đóng băng SHADOW (bỏ `needsUpdate` lúc kéo) → còn lag? ⇒ KHÔNG phải shadow-pass.
2. Có thao tác kéo CÙNG CẢNH mà chỉ `mesh.position.set` (vd kéo hồ) chạy 60fps? ⇒ render/GPU OK, thủ phạm là **CPU-rebuild**.
3. Tắt phần nghi nặng nhất của rebuild (vd LOD bỏ instancing) → hết lag? ⇒ chốt đúng thủ phạm.
→ Đừng đoán; loại trừ. "reflector/instancing/recompile-shader" là 3 nghi can đắt nhất.

- **Thêm hệ con render-được mới (cây, decor, đèn…)?** Hỏi NGAY: input thật của nó là gì? Cho nó **dirty-check riêng** (group bền + signature theo input STRUCTURAL), đừng nhét vào vòng `_clearSite`/`renderSiteState` vô điều kiện.
- **Vật liệu instanced (brick-3d/wood) dựng per-primitive = CỰC đắt khi rebuild.** Editor có chế độ live-drag (rebuild 60×/s) → BẮT BUỘC có đường LOD bỏ instancing lúc kéo, hiện full khi buông.
- **Signature = CHỈ field buộc dựng lại** (geometry/scatter). Field uniform-live (màu/độ phản chiếu/sóng…) cập nhật qua setter → KHÔNG cho vào signature kẻo false-positive rebuild.
- **Tịnh tiến/xoay thuần 1 đối tượng** → dời transform của group, đừng re-bake geometry. Nhớ **reset transform** ở đường rebuild (kẻo offset kẹt) + xử **huỷ giữa chừng**.
- Khi điều tra "lag/leak lúc sửa/kéo": xem cái gì bị **dựng lại mỗi frame** mà input KHÔNG đổi — đó là chỗ phí. (`reflector()` = +1 RTT + recompile/lần dựng → đắt nhất.)
- Cùng họ với KI-004 (cũng `site/render/fromState`): mọi thứ nặng trong renderer đó cần được editor gọi CÓ ĐIỀU KIỆN.
