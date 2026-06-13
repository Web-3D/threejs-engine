# WetGround

Nền **ướt khi mưa** — 1 mặt phẳng overlay **tối + roughness thấp** phủ trên ground: roughness thấp khiến nó **phản chiếu `scene.environment`** (sky/IBL) → ánh bóng ướt, đậm hơn ở **mảng vũng** (noise). Opacity theo mức ướt (`wetness` 0→1). **OVERLAY độc lập — KHÔNG sửa material nào**. 1 mesh, 1 draw.

## Usage

```typescript
import { WetGround } from 'threejs-modules/effects/WetGround'

const wet = new WetGround({ size: 80, groundY: 0 })
scene.add(wet.getMesh())

// caller ramp khi mưa (vd animation loop):
w = Math.min(1, w + dt * 0.1) // ~10s ướt đẫm
wet.setWetness(w) // LIVE

// tạnh → ramp về 0 rồi dispose
```

> **Cần `scene.environment`** (PMREM) để có phản chiếu — không có thì lớp ướt chỉ tối đi, không bóng. archplan đã set sẵn RoomEnvironment.

## Options

| Option | Type | Default | Mô tả |
| --- | --- | --- | --- |
| `size` | number | 80 | Cạnh mặt phủ (m) |
| `groundY` | number | 0 | Cao độ nền world (m) — ướt đặt cao hơn 1.5cm |
| `color` | Color | 0x0a0c12 | Màu lớp ướt (tối) — live `setColor` |
| `roughness` | number | 0.08 | Độ nhám — thấp = bóng/gương hơn |
| `maxOpacity` | number | 0.55 | Opacity tối đa khi ướt đẫm |
| `puddleScale` | number | 0.05 | Tần số mảng vũng (1/m) — thấp = vũng to |

## Dispose

```typescript
wet.dispose() // geometry + material + gỡ mesh khỏi parent
```

## Performance

- **1 draw** (1 mesh). `opacity = wetness × noise` fragment + PBR phản chiếu env → **0 CPU/frame** ngoài 1 ghi uniform `wetness`.
- `transparent` + `depthWrite=false`, đặt **1.5cm trên nền** né z-fight. Fresnel của PBR → góc xiên phản chiếu mạnh hơn = ướt thật.

## Giới hạn (Phase sau)

- Phản chiếu = **environment (PMREM)**, **KHÔNG phản chiếu geometry thật** (nhà/cây in xuống vũng) — cần SSR/planar reflection. Đủ "ướt" cho archviz.
- Chỉ **NỀN phẳng**. **Tường/mái sẫm-ướt** = per-material wetness (đụng material per-key) → phase phối hợp sau.
