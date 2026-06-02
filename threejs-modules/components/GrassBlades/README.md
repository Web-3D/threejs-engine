# GrassBlades

Cỏ **3D** (lá geometry nhú lên) — **tier B** (geometry/silhouette, material-roadmap).
Cặp với [`GrassGround`](../../shaders/ground/GrassGround/) (tier A) làm **lớp nền + LOD-xa**.

> **Đang rebuild tăng dần (preview-first).** Phiên bản này = **B0**: hình dáng trần (lá phẳng đứng) + 1 màu.
> Preview 1 lá (archplan) **dùng chung model** với bãi → trông y hệt. Các bước sau thêm dần:
> B1 thon ellipse · B2 màu gradient · B3 cong tĩnh · B4 tiết diện cong · B5 xoắn · B6 gió · B7 cao-thấp · B8 ngả 1 chiều · B9 đổ bóng.

## Kỹ thuật (B0)

1. **1 lá** = strip phẳng đứng (y: 0→H, x: ±W/2), S đốt, normal +Z — dựng theo mét.
2. **InstancedMesh** rải N lá (jitter-grid trong rectangle); mỗi lá xoay Y ngẫu nhiên, scale 1.
3. **Màu**: `colorNode = uColor` (uniform) → `setColor` chỉnh **LIVE** (không dựng lại material).

## Usage

```typescript
import { GrassBlades } from 'threejs-modules/components/GrassBlades'

const grass = new GrassBlades({ width: 12, depth: 9.6, baseY: 0.01, density: 100 })
scene.add(grass.getMesh())
// Live (uniform): grass.setColor(0x4f7a33)
// Structural (density/bladeHeight/bladeWidth/segments) → tạo instance MỚI — đừng gọi mỗi frame
grass.dispose() // geometry + NodeMaterial + gỡ mesh
```

## Props

| Prop | Type | Default | Mô tả |
| ---- | ---- | ------- | ----- |
| `width` / `depth` | number | 12 / 9.6 | Vùng rải (m) — X / Z |
| `baseY` | number | 0.01 | Cao độ gốc lá (m) = mặt trên nền |
| `density` | number | 100 | Lá/m² |
| `maxBlades` | number | 24000 | Trần count (budget, accent-only) |
| `bladeHeight` / `bladeWidth` | number | 0.28 / 0.006 | Kích thước lá (m) |
| `segments` | number | 5 | Số đốt dọc (độ mịn) |
| `color` | Color | 0x4f7a33 | Màu lá (1 màu — B0) |

## Budget (luật tier-B — bắt buộc)

- **Instanced** ✅ · **accent-only** (count cap qua `maxBlades`) ✅ · **cặp tier-A** (GrassGround) ✅.
- ⚠️ **LOD-theo-camera = bước sau**: v1 cap count đủ an toàn cho **1 lô**. Bật **nhiều lô / city** PHẢI
  thêm distance-cull kẻo vỡ budget triangle.
- Mặc định ~`density·area` ≤ `maxBlades` lá × (segments·2) tri.

## Dispose

```typescript
grass.dispose() // geometry.dispose + material.dispose + remove khỏi parent
```
