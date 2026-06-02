# GrassGround

Procedural **bãi cỏ / lawn** ground material (TSL, WebGPU) — world-space XZ, **no UV**. Tier A
(material-roadmap). Anh em [`AsphaltGround`](../AsphaltGround/).

## Thuật toán (sample `positionWorld.xz`)

1. **Patch 3-tông** — fbm tần thấp → sage lạnh (patch thấp) ↔ cỏ tươi xanh (giữa) ↔ cỏ khô vàng (cao).
2. **Clump shadow** — noise tần trung → vệt tối giữa bụi cỏ (chiều sâu / AO giả).
3. **Macro + gió lùa** — vệt nắng/bóng lớn (tĩnh, phá cảm giác lát lặp) + dải sáng-tối **DI CHUYỂN** theo `setTime` (gió).
4. **Blade detail có hướng** — trộn noise vô hướng + streak dọc thớ cỏ → speckle màu + bump theo hướng.
5. **Normal** screen-space bump (LOD-fade chống lấp lánh ở xa); **roughness** matte cao (~0.92).

> Đây là **tier A (bề mặt phẳng)** — KHÔNG có lá 3D nhô lên / silhouette ở mép. Cỏ-nhú-3D = **tier B / G1**
> (InstancedMesh blade + vertex-wind, accent-only + LOD). GrassGround đóng vai **lớp nền + LOD-xa** dưới blade đó.

## Usage

```typescript
import { GrassGround } from 'threejs-modules/shaders/ground/GrassGround'

const grass = new GrassGround({ scale: 1.0, wind: 0.6 })
mesh.material = grass.getMaterial()
// Mỗi frame (tùy chọn — bỏ qua → cỏ tĩnh):
grass.setTime(clock.getElapsedTime()) // gió lùa chạy theo giây elapsed
// grass.setScale(1.5); grass.setDryness(0.6); grass.setBumpScale(0.4); grass.setWind(0.4)
grass.dispose() // giải phóng NodeMaterial
```

## Props

| Prop | Type | Default | Mô tả |
| ---- | ---- | ------- | ----- |
| `scale` | number | 1.0 | World-space scale (lớn = feature nhỏ hơn) |
| `baseColor` | Color | 0x4e7a32 | Cỏ tươi nền |
| `dryColor` | Color | 0x97a04e | Cỏ khô (mảng vàng, patch cao) |
| `darkColor` | Color | 0x2c4d22 | Tối giữa bụi cỏ |
| `coolColor` | Color | 0x52734f | Sage lạnh (patch thấp) → chiều sâu hue |
| `bladeScale` | number | 55 | Tần số lá cỏ (1/m) |
| `clumpScale` | number | 1.4 | Tần số bụi cỏ (1/m) |
| `patchScale` | number | 0.18 | Tần số mảng tươi/khô (1/m) |
| `dryness` | number | 0.45 | Tỉ lệ cỏ khô [0–1] |
| `bumpScale` | number | 0.5 | Cường độ normal lá cỏ |
| `wind` | number | 0.6 | Cường độ gió lùa [0–1] (cần `setTime` để chạy) |

## Performance

1 fbm(4 oct) + ~5 triNoise3D / fragment (node cache → emit 1 lần). Ground 1 mesh, `receiveShadow`.
LOD-fade blade chống shimmer. `setTime` chỉ ghi 1 uniform/frame (~0ms CPU).

## Dispose

```typescript
grass.dispose() // NodeMaterial — caller sở hữu texture/mesh nếu có
```
