# GrassBlades

Cỏ **3D thật** (lá geometry nhú lên + đong đưa gió) — **tier B** (geometry/silhouette, material-roadmap).
Rút gọn kỹ thuật Ghost of Tsushima cho web/WebGPU. Cặp với [`GrassGround`](../../shaders/ground/GrassGround/)
(tier A) làm **lớp nền + LOD-xa**.

## Kỹ thuật

1. **1 lá** = strip vài segment (dựng theo mét), thon dần về ngọn — vài triangle/lá.
2. **InstancedMesh** rải N lá (jitter-grid trong rectangle); mỗi lá scale đều + xoay Y + tint random.
3. **Vertex-wind (TSL)**: gốc đứng yên, ngọn cong — `bend ∝ (y/H)²`; `sin(time)` + flutter; biên độ theo `wind`.
4. **Phase per-lá từ world-XZ** (gust trôi trong không gian) — bake qua `instancedBufferAttribute(vec4)`.

> Gió chạy bằng built-in `time` node (tự tăng) — **không cần** gọi update mỗi frame.

## Usage

```typescript
import { GrassBlades } from 'threejs-modules/components/GrassBlades'

const grass = new GrassBlades({ width: 12, depth: 9.6, baseY: 0.01, density: 100 })
scene.add(grass.getMesh())
// Live (uniform — KHÔNG dựng lại material): gió/màu tinh chỉnh tức thì
// grass.setWind(0.7); grass.setWindSpeed(2.0); grass.setColors(0x39611f, 0x9bbb55)
// Structural (density/bladeHeight/bladeWidth/segments) → tạo instance MỚI (recompile) — đừng gọi mỗi frame
grass.dispose() // geometry + NodeMaterial + gỡ mesh
```

## Props

| Prop | Type | Default | Mô tả |
| ---- | ---- | ------- | ----- |
| `width` / `depth` | number | 12 / 9.6 | Vùng rải (m) — X / Z |
| `baseY` | number | 0.01 | Cao độ gốc lá (m) = mặt trên nền |
| `density` | number | 100 | Lá/m² |
| `maxBlades` | number | 24000 | Trần count (budget, accent-only) |
| `bladeHeight` / `bladeWidth` | number | 0.28 / 0.024 | Kích thước lá (m) |
| `segments` | number | 4 | Segment dọc (cong mượt) |
| `baseColor` / `tipColor` | Color | 0x39611f / 0x9bbb55 | Gốc tối → ngọn sáng |
| `wind` | number | 0.5 | Cường độ gió [0–1] |
| `windSpeed` | number | 1.6 | Tốc độ đong đưa |

## Budget (luật tier-B — bắt buộc)

- **Instanced** ✅ · **accent-only** (count cap qua `maxBlades`) ✅ · **cặp tier-A** (GrassGround) ✅.
- ⚠️ **LOD-theo-camera = bước sau**: v1 cap count đủ an toàn cho **1 lô**. Bật **nhiều lô / city** PHẢI
  thêm distance-cull (shrink/loại lá ngoài bán kính) kẻo vỡ budget triangle.
- Mặc định ~`density·area` ≤ `maxBlades` lá × (segments·2) tri. VD 12×9.6m, 100/m² ≈ 11.5k lá × 8 tri ≈ 92k tri.

## Dispose

```typescript
grass.dispose() // geometry.dispose + material.dispose + remove khỏi parent
```
