# Character terrain-follow (đi-trên-đất-không-lún) trên nền `heightAt`

> **Trạng thái:** DEFERRED — ý tưởng nền-tảng, KHÔNG làm bây giờ (đừng pivot game sớm —
> web-3D/archviz là cầu nối; xem global memory `project-future-unreal-game-pivot`).
> **Nguồn:** NgQuan nhận ra (2026-06-08) terrain height-field = nền tảng cho nhân vật đi trên đất.

## Ý tưởng

`heightAt(hf, x, z)` (Phase 2 terrain, `threejs-modules/site/terrain.ts`) là **primitive đúng**
cho terrain-follow kiểu game:
```
mỗi frame: character.position.y = heightAt(hf, char.x, char.z) + footOffset
```
Cùng `heightAt` đang displace nền mesh + đặt gốc cỏ → nhân vật đọc CHUNG nguồn ⇒ **không lệch**
(single-source). PURE, no-GPU, no-dep, **deterministic (seeded)** → port engine/Unreal + multiplayer khớp client.

## Đã có (Phase 1–2)

- `heightAt(hf,x,z)` → Δy nền (m), O(1), seeded. `makeHeightField(terrain, maskRects, lotHalf…)`.
- Mask=0 ở pad/hồ/viền (đúng = phẳng). `Math.max(dy,0)` → không bao giờ âm.

## Còn thiếu để "đi-không-lún hoàn chỉnh" (3 layer, theo độ ưu tiên)

1. **Surface-resolver gộp khối-CHỒNG** — `heightAt` chỉ tả GÒ NỀN, KHÔNG biết móng/deck/slab
   zone (G1/G2)/mặt nước đặt TRÊN nền. Nhân vật lên deck → lún xuyên. Cần hàm
   `groundYAt(x,z) = max(heightAt, foundationTop, deckTop, zoneTop…)` (query các khối stacked).
2. **Normal/slope query** — finite-difference 3 điểm quanh (x,z) → cross product → ground normal
   (xoay chân theo mặt, phân loại leo-được/trượt). Rẻ, thêm vào `terrain.ts` được ngay khi cần.
3. **Collision vật thẳng đứng** — height-field = 1 Y/(x,z) → KHÔNG tả tường/overhang/hang. Đụng
   tường nhà cần collision THẬT (capsule vs mesh / physics) — height-field không thay thế.

## Feasibility

- (2) normal: ~15 dòng thêm vào `terrain.ts`, PURE. Thấp rủi ro.
- (1) surface-resolver: vừa — cần expose handle khối stacked (foundation/deck/zone) cho query.
  Domain boundary: nhân vật là domain MỚI (chưa tồn tại), không nhét vào site-kit/building-kit.
- (3) collision: lớn — cần physics layer (rapier/cannon hoặc capsule-cast tay). Tách hẳn, khi
  có character-controller thật.

## Liên hệ
- Lõi: `threejs-modules/site/terrain.ts` (`heightAt`, `makeHeightField`).
- Playbook: `playbooks/ground.md` §Terrain (Phase 1–2).
- Pivot context: global memory `project-future-unreal-game-pivot` (đừng pivot sớm).
