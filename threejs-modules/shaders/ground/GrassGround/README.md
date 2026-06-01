# GrassGround

Procedural **bãi cỏ / lawn** ground material (TSL, WebGPU) — world-space XZ, **no UV**. Tier A
(material-roadmap). Anh em [`AsphaltGround`](../AsphaltGround/).

## Thuật toán (sample `positionWorld.xz`)

1. **Patch lush↔dry** — fbm tần thấp → mảng cỏ tươi (xanh) ↔ cỏ khô (vàng).
2. **Clump shadow** — noise tần trung → vệt tối giữa bụi cỏ (chiều sâu).
3. **Blade speckle** — noise cao tần → lốm đốm sáng-tối mô phỏng lá cỏ.
4. **Normal** screen-space bump từ blade+clump (LOD-fade chống lấp lánh ở xa); **roughness** matte cao (~0.92).

## Usage

```typescript
import { GrassGround } from 'threejs-modules/shaders/ground/GrassGround'

const grass = new GrassGround({ scale: 1.0 })
mesh.material = grass.getMaterial()
// grass.setScale(1.5); grass.setDryness(0.6); grass.setBumpScale(0.4)
grass.dispose() // giải phóng NodeMaterial
```

## Props

| Prop | Type | Default | Mô tả |
| ---- | ---- | ------- | ----- |
| `scale` | number | 1.0 | World-space scale (lớn = feature nhỏ hơn) |
| `baseColor` | Color | 0x4e7a32 | Cỏ tươi nền |
| `dryColor` | Color | 0x97a04e | Cỏ khô (mảng vàng) |
| `darkColor` | Color | 0x2c4d22 | Tối giữa bụi cỏ |
| `bladeScale` | number | 55 | Tần số lá cỏ (1/m) |
| `clumpScale` | number | 1.4 | Tần số bụi cỏ (1/m) |
| `patchScale` | number | 0.18 | Tần số mảng tươi/khô (1/m) |
| `dryness` | number | 0.45 | Tỉ lệ cỏ khô [0–1] |
| `bumpScale` | number | 0.5 | Cường độ normal lá cỏ |

## Performance

1 fbm + 3 triNoise3D / fragment. Ground 1 mesh, `receiveShadow`. LOD-fade blade chống shimmer.

## Dispose

```typescript
grass.dispose() // NodeMaterial — caller sở hữu texture/mesh nếu có
```
