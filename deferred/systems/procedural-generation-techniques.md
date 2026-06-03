# Deferred: Họ kỹ thuật SINH HÌNH THỦ TỤC — bản đồ + cái nào hợp ta

> Context (2026-06-03): từ câu hỏi Voronoi → map cả "họ nhà" để thấy Voronoi đứng đâu và **người nhà
> nào đáng giá hơn cho NHÀ/THÀNH PHỐ vuông góc**. Voronoi = nhánh hữu cơ (chi tiết:
> `geometry/voronoi-applications.md`). Ta đang ở nhánh **L-system** (turtle building-kit).
> Mục tiêu: khi làm city / build-editor thì biết chọn đúng công cụ thay vì mặc định Voronoi.

---

## Họ 1 — Phân hoạch không gian (anh em RUỘT của Voronoi)

| Kỹ thuật | Quan hệ với Voronoi | Hợp ta? |
| --- | --- | --- |
| **Delaunay** | dual của Voronoi (tam giác hoá từ cùng seed) | mesh/terrain |
| **CVT / Lloyd relaxation** | lặp Voronoi → ô ĐỀU hơn, đẹp hơn | lô đất gọn |
| **Power diagram** | Voronoi có TRỌNG SỐ → ô to/nhỏ khác nhau | lô đất khác cỡ |
| **Poisson-disk sampling** | rải seed ĐỀU (không cụm) → input cho Voronoi | phân bố cây/cột/đèn |
| **BSP / Quadtree / k-d tree** | phân hoạch theo TRỤC (cắt vuông góc) | ⭐ **hợp ta** — chia lô VUÔNG tốt hơn Voronoi |

→ Muốn chia lô đất **ô vuông** thì **BSP/quadtree** hợp hơn Voronoi (Voronoi cho lô méo hữu cơ).

## Họ 2 — Noise tế bào (bản SHADER của Voronoi)

- **Worley / cellular noise** = chính Voronoi trong shader (khoảng cách F1, F2). Cho facade/đá lát.
- **Voronoise** (IQ) — blend mượt voronoi ↔ value noise.
- Anh em noise: **Perlin/Simplex**, **fBm**, **domain warping** (ta đã có fBm trong `Terrain.ts`).

## Họ 3 — SINH KIẾN TRÚC (gốc cho building/city) ⭐ — quan trọng hơn Voronoi cho ta

| Kỹ thuật | Là gì | Hợp ta? |
| --- | --- | --- |
| **Shape / split grammar (CGA — Esri CityEngine)** | chia khối → tầng → ô facade theo LUẬT đệ quy | ⭐⭐ chuẩn ngành cho building/city — generalize đúng cái turtle ta hand-code |
| **L-system (Lindenmayer)** | viết lại chuỗi ký hiệu → turtle vẽ; branching | ✅ **đang dùng** (footprint turtle) |
| **Wave Function Collapse (WFC)** | lắp tile theo ràng buộc kề nhau (constraint solve) | ⭐ hợp bố trí phòng / tilemap nội thất |
| Cellular automata / reaction-diffusion | pattern hữu cơ lan toả | ❌ không hợp nhà vuông |
| Tessellation: hex · Penrose · Truchet · Wang tiles | lát mặt phẳng (đều/phi chu kỳ) | sàn / facade pattern |
| Subdivision surface · SDF/implicit | làm mượt / khối ngầm | hình hữu cơ, niche |

---

## Chốt — cho dự án nhà VUÔNG của ta, "người nhà" đáng giá hơn Voronoi

1. **Shape grammar (CGA)** — tổng quát hoá đúng cái turtle đang hand-code → **revisit khi làm build-editor hoặc cần nhiều kiểu nhà** (liên hệ `systems/archplan-build-editor.md`, `building-warehouse-pipeline.md`).
2. **WFC** — bố trí phòng / tile nội thất theo ràng buộc.
3. **BSP / quadtree** — chia lô đất VUÔNG (thay Voronoi khi muốn lô vuông; Voronoi để dành lô hữu cơ).

> Voronoi vẫn giữ vai trò **accent rời rạc** (facade screen, đá lát, fracture) — không xung đột với 3 cái trên.

## Tham khảo
- Shape grammar / CGA: Müller et al. "Procedural Modeling of Buildings" (SIGGRAPH 2006) · Esri CityEngine
- WFC: https://github.com/mxgmn/WaveFunctionCollapse
- L-system: Prusinkiewicz "The Algorithmic Beauty of Plants"
- BSP/quadtree: phân hoạch không gian kinh điển (game dev)
