---
domain: grass
title: Cỏ 3D — lá instanced 2 mặt, vệt tiếp đất giả theo nắng, né foundation/hồ
status: building
tier: B
modules:
  - threejs-modules/components/GrassBlades       # lá 3D instanced (tier B)
  - threejs-modules/shaders/ground/GrassGround    # bề mặt cỏ procedural (tier A) — LỚP RIÊNG
issues:
  - KI-003
updated: 2026-06-04
---

# Playbook — Cỏ 3D

> Ranh giới: recipe + tầng/toạ độ + nâng cấp ở đây; chi tiết lỗi → `known-issues/`, API/props → module README.

## 1. Kết quả "hoàn chỉnh"

Bãi cỏ phủ lô: **lá 3D** nhú lên (cong, thon ngọn, gom thành bụi), **2 mặt 2 màu** (ngoài sáng/trong tối),
đổ rạp theo gió, có **vệt tiếp đất** tối ở gốc đổ theo hướng nắng (cho cảm giác bám đất). KHÔNG mọc xuyên
nền nhà (foundation) hay mặt hồ. Nhận bóng sun của nhà/rào hắt xuống.

## 2. Recipe dựng

**2 lớp ĐỘC LẬP** (đừng gộp — surface là material, blades là vật thể):
- **Bề mặt (tier A)** = `GrassGround` shader (procedural, trông thật) phủ trên slab nền. Là MATERIAL của nền,
  không phụ thuộc lá. Có thể thay bằng soil/gravel mà lá vẫn rải được.
- **Lá 3D (tier B)** = `GrassBlades` = **InstancedMesh + TSL**. Mỗi lá: segments + taper (thon ngọn) +
  bladeWidth/midWidth + curve LR + bend + cup; gom **bụi** (bladesPerClump/clumpRadius/clumpSplay).

**2 mặt 2 màu:** `frontFacing` (1=mặt ngoài +Z, 0=mặt trong −Z) → `mix(uInnerColor, uColor, ff)`. Live:
`setColor`/`setInnerColor`.

**Vệt tiếp đất (contact streak)** = bóng-tiếp-đất GIẢ (lá 6mm quá nhỏ cho shadow map → né bằng quad):
quad suy biến ở gốc lá, **`positionLocal.add(offset)`** (KHÔNG replace `positionNode` — xem KI-003), hướng/
dài/đậm = uniform `sun` (live `setSun`). Cost: +1 draw, shadow-map = 0. Toggle: `setContactDark(0)` để tắt.
→ kỹ thuật chung: memory `knowledge/distilled/sun-contact-shadow-instanced-foliage`.

**Né vùng:** truyền `exclude: GrassExcludeRect[]` (footprint foundation + bbox hồ) → lá rơi trong rect bị bỏ
("nơi có nhà/nước thì không mọc cỏ"). Gió = `setTime` mỗi frame. Nhận bóng: `mesh.receiveShadow=true`,
KHÔNG `castShadow` (lá < 1 texel → nhấp nháy).

Skills: `shader-tsl`, `dispose-pattern`. Tích hợp lô: `site/render/fromState.buildVegetation`.

## 3. Tầng & toạ độ

```
lá 3D (tier B, InstancedMesh)     ← gốc ở mặt trên nền (baseY = groundThick)
  └ vệt tiếp đất (quad suy biến)  ← cùng gốc, lệch theo sun
bề mặt cỏ (tier A, GrassGround)   ← material của slab nền (LỚP RIÊNG)
slab nền                          ← buildGround
```

- Instancing: mỗi lá = 1 instance (instanceMatrix). Biến dạng theo lá PHẢI cộng vào `positionLocal`, KHÔNG
  ghi đè `positionNode` (xoá instanceMatrix → dồn gốc — KI-003).
- `exclude` ở world XZ (rect tâm cx/cz + half + rot). Hồ free-form → né theo **bbox** (giống lưới ở pond).

## 4. Lỗi thường gặp

| Triệu chứng | Nguyên nhân (1 dòng) | Chi tiết & fix |
| --- | --- | --- |
| Mọi lá dồn về gốc toạ độ (preview 1 lá giấu) | `positionNode = vec3(...)` replace xoá instanceMatrix | `known-issues/KI-003` |
| Lá nhấp nháy / mất khi bật castShadow | lá 6mm < 1 texel shadow cam ±20m | KHÔNG castShadow; dùng vệt-tiếp-đất giả thay |
| Cỏ mọc xuyên nhà/hồ | thiếu rect trong `exclude` | thêm footprint vào `exclude` (foundation + bbox hồ) |

## 5. Lịch sử nâng cấp

- tier B — lá instanced (segments/taper/curve/bend/cup) + bụi (clump).
- vệt tiếp đất giả theo nắng (+ toggle on/off) — distilled `sun-contact-shadow-instanced-foliage`.
- `2026-06-04` — 2 mặt 2 màu (ngoài/trong) + GUI Lab reorg (Số đo / Bóng đổ / Vệt).

## 6. Liên hệ

- **Modules:** [GrassBlades](../threejs-modules/components/GrassBlades/README.md) (lá) · `shaders/ground/GrassGround` (bề mặt)
- **Skills:** `shader-tsl`, `dispose-pattern`
- **Knowledge:** memory `knowledge/distilled/sun-contact-shadow-instanced-foliage` (vệt giả), `nested-tabs-css-template` (GUI)
- **KI:** `KI-003` (instancing + positionLocal.add)
- **Liên quan:** [pond](pond.md) (cùng `site/render/fromState`, cùng cách né bbox)
