# SplashBurst

Vương miện + giọt nước **tung tóe** (GPU sprite burst) tại điểm va-chạm **rời** trên mặt nước — cá trồi/xác cá,
giọt mưa lớn, vật rơi. Đi kèm `WaterSurface.emitImpact` (gợn sóng) để hoàn chỉnh cú va chạm.

Khác `GPUParticleSystem`/`SparkSystem` (field **lặp vô hạn**): đây là **pool ghi birth-pos/vel/time per-particle
lúc emit** (giống ripple-pool của WaterSurface). Shader bay **đạn-đạo** theo tuổi → **0 CPU/frame** trừ lúc bắn.
Chỉ hợp **va chạm rời, bounded** — KHÔNG gắn cho mọi giọt mưa nền (mưa to = nghìn hạt → dùng lớp shader-dome
`setRainAmp`/splash-core của WaterSurface thay thế).

## Usage

```typescript
import { SplashBurst } from 'threejs-modules/effects/SplashBurst'

const splash = new SplashBurst({ life: 0.6, speed: 1.8, size: 7 })
scene.add(splash.getPoints())

// mỗi frame
splash.update(elapsedSeconds)

// khi có va chạm trên mặt nước (toạ độ WORLD, y = cao độ mặt nước):
water.emitImpact(localX, localZ, strength, /*reflect*/ true) // gợn sóng
splash.burst(worldX, waterY, worldZ, strength)               // giọt bắn
```

`strength` 0..1 (quy từ kích thước/khối lượng/vận tốc vật) → nhiều/cao/to giọt hơn.

## Options

| Option    | Type                 | Default    | Description                                  |
| --------- | -------------------- | ---------- | -------------------------------------------- |
| `count`   | number               | 256        | Tổng điểm pool (ring buffer)                 |
| `life`    | number (s)           | 0.6        | Đời 1 giọt                                   |
| `gravity` | number (m/s²)        | 9.8        | Gia tốc rơi                                  |
| `speed`   | number (m/s)         | 1.8        | Tốc độ ném gốc (×strength + jitter)          |
| `size`    | number (px)          | 7          | Cỡ giọt gốc (sizeAttenuation=false → pixel)  |
| `color`   | ColorRepresentation  | 0xbcd6e6   | Màu giọt                                     |
| `opacity` | number [0–1]         | 0.85       | Độ mờ đỉnh                                    |

Setter live: `setLife` · `setSpeed` · `setSize` · `setColor` · `setOpacity`.

## Performance

- **0 CPU/frame** trừ `burst()` (ghi O(K) attribute, upload 1 lần/emit). `update()` chỉ set 1 uniform.
- 1 draw call (Points). `count=256` ⇒ ~12+ burst đồng thời trước khi ring-buffer đè.
- `frustumCulled=false` (birth ghi world-coord vào `position` → boundingSphere sai). Pool nhỏ nên không lo cull cost.

## Dispose

```typescript
splash.dispose() // geometry + material + gỡ points khỏi parent
```
