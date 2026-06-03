# Deferred: Voronoi — dùng cho VÀI HẠNG MỤC RỜI RẠC (không phải nền engine)

> Ghi lại để không mất. Chốt với NgQuan (2026-06-03): nhà ở vuông góc của ta dựng bằng
> **turtle + floor-plan** (building-kit) — KHÔNG dùng Voronoi làm lõi. Voronoi chỉ thêm khi cần
> một **điểm nhấn cụ thể**, đúng tinh thần accent-only như brick-3d (xem `project-brick3d-accent-only`).

---

## Voronoi là gì (1 dòng)

Chia mặt phẳng thành **ô tế bào** quanh các điểm seed: mỗi ô = vùng gần seed đó nhất. Dual = Delaunay.
→ Cho ra pattern **hữu cơ / tế bào** mà grid vuông không có.

---

## 2 đường thực thi (chọn theo mục đích)

| Đường | Khi nào | Cost | Phụ thuộc |
| --- | --- | --- | --- |
| **A. Geometry thật** (tính Voronoi 2D → cell polygon → extrude) | cần MESH thật (lô đất, tấm chắn nổi, paver) | trung bình–cao | lib Delaunay (`d3-delaunay` / `Delaunator`) — nhẹ, chưa có trong repo |
| **B. TSL shader** (worley/cellular noise trên UV/world) | chỉ cần PATTERN (màu/alpha/đục lỗ), không cần hình học | rẻ (per-fragment) | ⚠️ **verify** `three/tsl` 0.174 có node cellular/worley chưa; nhiều khả năng **tự viết** F1/F2 bằng `Fn` |

---

## Ứng viên — xếp theo độ HỢP với dự án

### 1. Chia lô đất (site-kit) — HỢP NHẤT ⭐
Khu đất lớn → seed points → Voronoi → từng **lô** (parcel) → extrude + đặt nhà.
- Đường **A** (geometry). Hợp với hướng `neighborhood-block-assembly-lod` + city procedural (Doraemon).
- Đầu ra ăn khớp `SiteState` (mỗi lô = 1 lot rect/polygon). Clip footprint nhà như cỏ-né-foundation đã làm.
- Feasibility: thêm `Delaunator` (~vài KB) + util `voronoiLots(seeds, bounds)` trong site-kit. Trung bình.

### 2. Màn chắn / lam mặt dựng (facade screen) — accent
Tấm chắn đục lỗ hữu cơ trên 1 mảng tường điểm nhấn.
- **B** (TSL worley → alpha/đục) cho rẻ + đổ bóng giả; hoặc **A** (cell extrude) nếu cần lỗ THẬT + đổ bóng thật → **accent-only** (budget triangle, như brick-3d).
- Module gợi ý: `threejs-modules/shaders/VoronoiScreen/` (B) hoặc `components/VoronoiPanel/` (A).

### 3. Đá lát / nền tự nhiên (paving) — material
Nền sỏi/đá tảng mép bất quy tắc.
- **B** (TSL worley) cho `site-kit` ground family — cạnh `GrassGround`/`AsphaltGround`. Rẻ, không thêm geometry.
- Cùng họ với `megascans-gaea-natural-ground` (deferred) nhưng procedural thay vì bake.

### 4. Fracture / đổ nát (game-pivot) — tương lai
Voronoi shatter để vỡ mảnh (destruction). Khớp `uDamage` + hướng game kiểu Unreal
(xem `project-future-unreal-game-pivot`). Chưa cần — ghi để nhớ.

---

## Ranh giới (đừng vượt)

- ❌ KHÔNG Voronoi-hóa nhà ở vuông góc (turtle/floor-plan vẫn là lõi).
- ✅ Chỉ dùng cho hạng mục **rời rạc** ở trên, mỗi cái 1 module độc lập.
- Budget: bản geometry **accent-only** (count cap), giống `project-brick3d-accent-only`.

## Thứ tự đề xuất (khi nào động tới)
```
Trước:  Chia lô đất (#1) — khi làm city/neighborhood procedural
Tiếp:   Facade screen (#2) — khi cần điểm nhấn mặt dựng
        Đá lát TSL (#3)   — khi nâng cấp ground tự nhiên
Sau:    Fracture (#4)     — khi/nếu pivot game
```

## Tham khảo
- Voronoi/Delaunay: https://en.wikipedia.org/wiki/Voronoi_diagram
- Delaunator (JS, nhanh): https://github.com/mapbox/delaunator · d3-delaunay (wrapper Voronoi cells)
- Worley/cellular noise (IQ): https://iquilezles.org/articles/voronoise/
