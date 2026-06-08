# RockCluster

Đá mỏm procedural (non bộ Phase A) — **N viên Icosahedron displace craggy** (value-noise 3D fbm) xếp thành
**MỎM** đế-rộng → đỉnh-hẹp, merge thành **1 mesh** flatShading faceted. Deterministic theo `seed` (cùng seed =
cùng đá). Là mảnh "đá núi" còn thiếu để ráp cảnh non bộ: **terrain mound làm ĐẾ, RockCluster làm ĐÁ**, hồ
(`WaterSurface`) + rêu (`GrassBlades`) bổ trợ.

> **Giới hạn:** KHÔNG overhang/hang thật — đá xếp chồng cho ra **khe + bề mặt craggy**, không đục hang xuyên.
> Muốn hang thật cần SDF/marching-cubes (project riêng). MVP chấp nhận silhouette "hòn non bộ" đọc được từ xa.

## Usage

```typescript
import { RockCluster } from 'threejs-modules/components/RockCluster'

const rock = new RockCluster({ footprintRadius: 1.3, height: 1.7, rockCount: 22, seed: 3 })
scene.add(rock.getMesh())

console.log(rock.getTriangleCount()) // verify budget
rock.setColor(0x9a8f80)              // live đổi màu (material nội bộ flat)

// Texture triplanar đá (caller-owned, KHÔNG dispose ở module):
const surf = new TexturedSurface({ maps, tileSizeMeters: 0.5 })
const textured = new RockCluster({ footprintRadius: 1.3, height: 1.7, material: surf.getMaterial() })
```

## Options

| Option            | Type                       | Default    | Description                                                     |
| ----------------- | -------------------------- | ---------- | -------------------------------------------------------------- |
| `footprintRadius` | number (m)                 | `1.2`      | Bán kính đế mỏm                                                |
| `height`          | number (m)                 | `1.6`      | Cao mỏm                                                        |
| `rockCount`       | number                     | `20`       | Số viên đá (budget — cap 60)                                   |
| `craggy`          | number (0..1)              | `0.35`     | Biên độ lởm chởm — displace dọc bán kính viên (vừa bướu vừa khe) |
| `rockScale`       | number (×)                 | `1.0`      | Phóng/thu cỡ viên (khít ↔ hở)                                 |
| `detail`          | number (1..3)              | `2`        | Subdiv icosa (1=80, 2=320, 3=1280 tri/viên)                    |
| `seed`            | number                     | `0`        | Seed deterministic — đổi layout + hình đá                      |
| `color`           | THREE.ColorRepresentation  | `0x8a8278` | Màu đá xám-nâu (material NỘI BỘ flat) — live `setColor`        |
| `material`        | THREE.Material             | `undefined`| Material NGOÀI (caller-owned, vd TexturedSurface triplanar đá) → đá dùng nó thay flat; **KHÔNG** dispose ở module |

## API

| Method                | Mô tả                                         |
| --------------------- | --------------------------------------------- |
| `getMesh()`           | `THREE.Mesh` merged (1 draw) để add vào scene |
| `getTriangleCount()`  | Số tam giác merged — verify budget            |
| `setColor(color)`     | Đổi màu đá (live, tức thì)                     |
| `dispose()`           | Giải phóng geometry + material + gỡ parent     |

## Thuật toán

1. **`icosaRock`** — `IcosahedronGeometry(r, detail)` (non-indexed), mỗi đỉnh dịch dọc pháp-tuyến-cầu một đoạn
   `craggy · r · fbm3(pos·freq + seedOff)`. Displacement chỉ là hàm vị-trí ⇒ đỉnh trùng-vị-trí dịch giống nhau
   → **không nứt mặt**. `fbm3` = value-noise 3D (hash lattice + trilinear) 3 octave, tự-chứa, không dependency.
2. **Xếp mỏm** — `t = i/(N-1)`; vòng `ringR = footprintRadius·(1−t)` (đế rộng → đỉnh hẹp), góc xoắn ốc
   `GOLDEN_ANGLE`, cao `y = height·t^0.8`, viên nhỏ dần lên đỉnh. Bake rotate/dẹt/dời vào geometry.
3. **Merge** — `mergeGeometries(..., false)` → 1 mesh, `flatShading` cho facet đá.

## Performance

Merged → **1 draw call**. `detail=2` (320 tri) × 20 viên ≈ **6.4k tri**; `detail=1` ≈ 1.6k. Cap `rockCount` 60 +
`detail` 3 = trần ~76k (1 cụm cận cảnh). Displace + merge chạy **build-time** (không per-frame); `setColor` live
= cập nhật uniform (rẻ). Dùng cho vài cụm điểm nhấn — nhiều cụm/lô thì giảm `rockCount`/`detail`.

## Dispose

```typescript
rock.dispose() // Giải phóng merged geometry + material, gỡ mesh khỏi parent
```

## Roadmap (non bộ)

- **Phase A** (module này) ✅ — đá mỏm procedural độc lập.
- **Phase B** — ráp trong archplan: RockCluster trên mound + hồ sát chân + rêu (GrassBlades màu rêu) + GUI tune +
  preset 1-nút "Non bộ".
- **Phase C** — polish: triplanar rock-texture (NodeMaterial + `triplanarTexture`, reuse `rock_rough`/
  `icelandic_jagged`/`coal_stone`), rêu bám khe theo slope, vệt nước mép đá.
