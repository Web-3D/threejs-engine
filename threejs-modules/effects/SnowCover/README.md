# SnowCover

Tuyết **đọng trên nền** — 1 mặt phẳng overlay trắng phủ ngang trên ground, opacity theo **noise + mức tích lũy** (`accum` 0→1): tuyết "mọc" từ những mảng loang rồi lan ra phủ kín. **OVERLAY độc lập — KHÔNG sửa material nào** (an toàn với building-kit). 1 mesh, 1 draw.

## Usage

```typescript
import { SnowCover } from 'threejs-modules/effects/SnowCover'

const snow = new SnowCover({ size: 80, groundY: 0 })
scene.add(snow.getMesh())

// caller ramp dần khi đang có tuyết (vd trong animation loop):
accum = Math.min(1, accum + dt * 0.05) // ~20s phủ kín
snow.setAccum(accum) // LIVE
```

## Options

| Option | Type | Default | Mô tả |
| --- | --- | --- | --- |
| `size` | number | 80 | Cạnh mặt phủ (m) — nên ≥ lô |
| `groundY` | number | 0 | Cao độ nền world (m) — tuyết đặt cao hơn 2cm né z-fight |
| `color` | Color | 0xfdfdff | Màu tuyết — live `setColor` |
| `patchScale` | number | 0.06 | Tần số mảng loang (1/m) — thấp = mảng to |
| `maxOpacity` | number | 0.92 | Opacity tối đa khi phủ kín |

## Dispose

```typescript
snow.dispose() // geometry + material + gỡ mesh khỏi parent
```

## Performance

- **1 draw** (1 mesh). `opacity = smoothstep(1−accum, …, noise) × maxOpacity` chạy fragment shader → **0 CPU/frame** ngoài 1 ghi uniform `accum` khi đổi.
- `transparent` + `depthWrite=false`, đặt **2cm trên nền** né z-fight. `accum` = uniform **LIVE** (0 rebuild).

## Giới hạn (Phase sau)

- **Phẳng** — chỉ phủ mặt nền ngang. **KHÔNG bám mái** (cần geometry mái → snow-on-mesh per-object, đụng material) và **KHÔNG né mặt hồ** (phủ phẳng cả lô, kể cả vùng nước). Mái + loại-trừ-hồ = phase polish sau.
- Mảng loang neo theo **world-XZ** (mặt tĩnh nên không trượt).
