# Building tường cong — nâng building-kit hỗ trợ cạnh CUNG trong footprint

> Nguồn: NgQuan hỏi 2026-06-10 sau khi `CurvedBrickWall` (site-kit) ra đời: "đáng lẽ tường cong phải nằm
> trong hệ thống building chứ? thay thế tường shape hiện nay được không? hình như 2 kỹ thuật khác nhau."
> Trả lời: ĐÚNG là 2 kỹ thuật — và KHÔNG thay thế. File này giữ con đường nâng cấp khi cần NHÀ tường cong.

## Hiện trạng — 2 hệ tường, 2 mục đích

| | Building wall (building-kit) | CurvedBrickWall (site-kit) |
|---|---|---|
| Mô hình | `SegmentState` turtle: `length` + `turnBefore` — polygon CẠNH THẲNG khép kín | cung tròn tự do (R + góc quét), KHÔNG thuộc floor-plan |
| Tính năng | openings cửa/sổ + reveal, 12+ material (shader/tex/3d), panels decor, paint, merge, undo, nối góc, đỡ sàn/mái | viên gạch 2 mặt + decay; KHÔNG cửa, KHÔNG nối, KHÔNG chịu mái |
| Kỹ thuật geometry | box/extrude theo segment phẳng; brick-3d = InstancedBrickWall CULL lỗ trên mặt phẳng | op #2 sweep thân theo spine + op #3 rowsOnSurface rải viên trên mặt THAM SỐ |
| Vai | tường NHÀ | tường VƯỜN trang trí (rào thấp, bồn cây, giếng) |

**Không thay thế nhau:** đem CurvedBrickWall thay tường shape = mất cửa/sổ/material-hệ/merge/undo/mái.
Đem building wall ra vườn = vác cả floor-plan đi theo. Đúng chỗ của mỗi đứa.

## Nhưng kỹ thuật site-kit CHÍNH LÀ con đường nâng building lên cong

Mặt phẳng chỉ là trường hợp đặc biệt của mặt tham số `S(u,v)` — ops đã tổng quát sẵn:
- `rowsOnSurface` rải viên trên BẤT KỲ surf (đếm theo chiều dài thật — cung hay thẳng như nhau).
- Lỗ cửa trên cung = CULL viên theo (arc-length s, y) — InstancedBrickWall đã làm chính xác bài này
  trong tọa độ phẳng (rect + ellipse Minkowski), đổi hệ tọa độ là xong.
- Thân tường cong = op #2 sweep (đã chạy ở CurvedBrickWall + xà mái).

## Việc phải làm nếu kích hoạt (ước lượng — đụng SÂU building/*)

1. **State schema**: `SegmentState` thêm `arc?: { radius: number; dir: 1|-1 }` (cạnh cong thay thẳng) —
   migrate v9→v10, turtle-walk tính endpoint theo chord, polygon footprint thành mixed thẳng/cung.
2. **wallAssembly**: segment có arc → dựng bằng sweep thay box; brick-3d → generalize InstancedBrickWall
   nhận surf fn (hoặc dùng kỹ thuật CurvedBrickWall + cull lỗ theo arc-length).
3. **Openings**: định vị `x` theo ARC-LENGTH dọc cung (op #1 — pick-box, reveal cong theo).
4. **Downstream ăn theo biên cong**: slab/foundation tessellate cạnh cung, mái footprint cong (op #8
   Straight Skeleton càng cần), merge tường, manipulate/Move, fence-snap.

Khối lượng ≈ một phase riêng của building-kit; CHỜ: (a) nhu cầu nhà tròn/tường bao cong thật,
(b) luồng building rảnh (file building/* đang active luồng song song), (c) op #8 nếu muốn mái cong.

## Trigger mở lại

NgQuan nói "nhà tường cong / footprint cong / cạnh bo building" → đọc file này + bảng trên, bắt đầu từ
state schema (mục 1) — KHÔNG bắt đầu từ geometry (geometry là phần dễ, schema + downstream mới là núi).
