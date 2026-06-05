# Ground layer — khoét lỗ lộ lớp dưới (carve-to-reveal)

> Phase sau của hệ **ground nhiều tầng** (`site.groundLayers[]`). Tầng xếp chồng đã xong (2026-06-05);
> phần khoét lỗ để lộ lớp dưới — tạo tầng-lớp 3D nghệ thuật — hoãn lại.

## Đã có (nền tảng)
- `GroundLayer { material, thickness }` + `site.groundLayers[]` (state.ts, additive optional).
- Render: `buildGroundLayers` — mỗi layer = `ExtrudeGeometry(lotShape)` dày riêng, xếp chồng Y lên base.
- `lotShape(site)` ĐÃ carve lỗ hồ (water polygons) → pattern khoét-lỗ sẵn dùng lại được.
- GUI: Ground ▸ instance-tab G0/G1/…/＋ (mỗi layer Surface + Thickness 1–10cm).

## Cần làm (carve)
- Thêm `GroundLayer.holes?: { x, z, w, d, rot? }[]` (mm, local tâm lô) — vùng khoét MỖI layer.
- Render: nhét holes vào shape của layer đó (giống `lotShape` thêm `s.holes.push(path)`) → ExtrudeGeometry
  có lỗ → lớp dưới (Y thấp hơn) lộ ra qua lỗ. Mặt-cắt-dày của lỗ = vách đứng (thấy được vì layer có thickness).
- Tương tác editor: vẽ/kéo vùng khoét trên mặt layer (raycast → rect local), giống drag opening/balcony.
  Có thể tái dùng pick-box pattern (Move/Paint) đã có ở ArchPlanLab.
- GUI: trong pane layer Gn thêm danh sách "Holes" (＋ thêm rect, slider x/z/w/d, ✕) hoặc vẽ trực tiếp 3D.

## Lưu ý kỹ thuật
- ExtrudeGeometry với holes SINH uv + side-faces tự động → PhotoGround (world-XZ) vẫn map đúng mặt trên;
  vách lỗ map theo world-XZ (chấp nhận được cho tường mỏng). KHÔNG vướng KI-010 (ExtrudeGeometry có uv).
- KI-004: KHÔNG mergeGeometries trộn indexed/non-indexed. ExtrudeGeometry là non-indexed → giữ riêng/đồng bộ.
- Perf: mỗi layer = 1 mesh/draw-call. Nhiều layer + nhiều hole vẫn rẻ (geometry tĩnh). Cảnh báo nếu >~8 layer.

## Lý do hoãn
User (2026-06-05): "sau này khoét vị trí nào thì lớp dưới hiện ra" — xác nhận carve là bước sau. Ưu tiên
trước: dựng được nhiều tầng xếp chồng + chỉnh dày/vật liệu (đã xong). Carve cần thêm tầng tương tác 3D (vẽ
vùng) → tách phase để không kéo dài scope đợt này.
