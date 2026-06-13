# Water-type ecosystem features — pool/pond/puddle đặc trưng riêng

> **DECIDED 2026-06-13** (NgQuan: "từ giờ phải phân biệt rõ pool/pond/puddle"). Luật 3 loại nước đã chốt +
> enforce ở code (cá `WaterConfig.fish` pond-only, `floorTerrain` gò đáy pond-only). Các tính năng ĐẶC TRƯNG
> sâu hơn cho từng loại = hoãn tới khi NgQuan gọi. Xem playbook [[pool]] / [[pond]].

## Luật nền (đã enforce — KHÔNG hoãn)

- **pool** = hồ bơi nhân tạo: tile sạch, đáy PHẲNG. KHÔNG cá / cây cỏ / địa hình gồ ghề.
- **pond** = hồ thiên nhiên: CÓ cá (`WaterConfig.fish`) + đáy gò (`floorTerrain`) + (cây thủy sinh — dưới).
- **puddle** = vũng: chỉ nước (extras — dưới).

## Hoãn — tính năng đặc trưng per-loại

| Loại | Tính năng | Ghi chú feasibility |
|---|---|---|
| **pool** | Setup hồ-bơi-chuẩn: thang inox, lằn bơi (lane lines) đáy, gạch mép bo, đèn ngầm, mặc-định tile xanh bể | Geometry box/instanced + decal đáy; thang = vài box; lane = texture/strip đáy. Rẻ, không RTT thêm |
| **pond** | **Cây thủy sinh** (súng/sen/rong/cỏ nước) — instanced billboard/low-poly mọc từ đáy theo `floorYAt`, né vùng cá | Mirror GrassBlades nhưng dưới nước; reuse `bounds.floorYAt` đặt gốc. Cân nhắc lá nổi mặt nước (z ở surfaceY) |
| **pond** | **Cho cá ăn** (click mặt nước / ném mồi) → cá BÂU vào điểm theo độ đói; auto-giảm `satiation` về 0 theo giờ (đói dần → chết nếu quên cho ăn) | Nền ĐÃ có: `FishSchool.satiation` + `PondFish` (đói→nhanh, 0→chết phơi bụng). Thiếu: raycast mặt nước → food point + seek/arrival steering (lực ∝ `1−satiation`, gia tốc lao ∝ đói) + timer decay |
| **pond** | Đá/sỏi đáy, lũa, bùn — scatter decor đáy (reuse StoneScatter + border stone) | Reuse cache đá border hồ; rải trong polygon đáy theo Poisson |
| **pond** | **Mặt hồ ĐÓNG BĂNG** (mùa đông) → cá không vượt qua mặt | **KHÔNG cần lớp vỏ/collider per-con** (NgQuan hỏi 2026-06-13): cá bơi PROGRAMMATIC (y do `_levelY`/`surfTop` chốt, KHÔNG physics) → chỉ cần thêm `iceLevel` rồi **clamp trần** `surfaceY = min(surfaceY, iceUnderside)` 1 dòng trong update (+ băng = mesh phẳng mờ trên mặt). Vỏ per-con = đắt (collision ×N) + vô ích |
| **puddle** | Extras "xem xét sau" (NgQuan để ngỏ): gợn mưa rơi (ripple impact), bóng phản chiếu nông, khô dần | Ripple = shader uniform theo `_weather.mode==='rain'`; khô = scale/opacity ramp |

## Revisit khi

NgQuan ra lệnh làm 1 loại cụ thể ("làm hồ bơi chuẩn" / "thêm cây thủy sinh cho pond" / "puddle khi mưa").
MVP slice 1 tính năng trước (vd pond: súng/sen nổi mặt nước) thay vì làm cả bộ.

## Liên quan

- Code đã làm 2026-06-13: `WaterConfig.fish` + `PondFish.bounds` (vùng bơi = lòng hồ + đụng vách quay lại +
  bứt tốc) + gate `floorTerrain` pond. Chi tiết: playbook `pond.md` §5 (2026-06-13).
- Cây thủy sinh ≈ [garden-ground-patches](garden-ground-patches.md) (mảng nền) + GrassBlades (instanced vegetation).
- Đá đáy ≈ [houdini-bake-accents](houdini-bake-accents.md) (đá variants) — hoặc StoneScatter procedural.
