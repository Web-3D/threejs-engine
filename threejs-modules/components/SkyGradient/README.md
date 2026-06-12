# SkyGradient

Bầu trời gradient **WebGPU-native qua `scene.backgroundNode`** (KHÔNG mesh → không bao giờ "thấy quả cầu từ ngoài", luôn phủ kín + tự theo camera): zenith→horizon, **lerp ngày↔đêm theo độ-cao mặt trời** + quầng nắng (đĩa + halo ấm lúc thấp = hoàng hôn). Dùng `positionWorldDirection` (hướng view world) làm hướng trời.

## Usage

```typescript
import { SkyGradient } from 'threejs-modules/components/SkyGradient'

const sky = new SkyGradient()
scene.backgroundNode = sky.getBackgroundNode() // KHÔNG add mesh

// mỗi khi mặt trời đổi (truyền hướng TỚI mặt trời):
const day = sky.setSun(sunLight.position.x, sunLight.position.y, sunLight.position.z)
// day ∈ [0..1] (1=trưa, 0=đêm/hoàng hôn) → caller mờ đèn fill/env lúc tối:
hemiLight.intensity = 0.06 + 0.29 * day
scene.environmentIntensity = 0.05 + 0.25 * day
```

## Options

| Option | Type | Default | Description |
| ------ | ---- | ------- | ----------- |
| `zenithDay` | Color | `0x2f6fd0` | Đỉnh trời ngày |
| `horizonDay` | Color | `0xbcd8f0` | Chân trời ngày |
| `zenithNight` | Color | `0x05070f` | Đỉnh trời đêm |
| `horizonNight` | Color | `0x18203a` | Chân trời đêm |
| `zenithOvercast` | Color | `0x5e6873` | Đỉnh trời u ám (ngày) |
| `horizonOvercast` | Color | `0x9aa2aa` | Chân trời u ám (ngày) |
| `sunColor` | Color | `0xfff0cf` | Màu quầng nắng |

## API

- `getBackgroundNode()` — node màu gán vào `scene.backgroundNode`.
- `setSun(x, y, z): number` — hướng tới mặt trời → cập nhật quầng + day-factor (trả [0..1], đã qua override). LIVE (uniform, không recompile).
- `setOvercast(v)` — mức u ám [0..1]: gradient xám dần + nuốt đĩa/quầng nắng (nền cho thời tiết mưa/bão). LIVE.
- `setDayOverride(v | null)` — ép day-factor (vd sun TẮT → `0` = trời đêm bất kể sun đang cao; cũng tắt đĩa nắng). `null` = theo độ-cao sun. LIVE.
- `getDayFactor(): number` — day-factor hiện tại.
- `dispose()` — KHÔNG sở hữu GPU resource (node do renderer compile); caller set `scene.backgroundNode = null`.

## Performance

0 draw thêm (renderer vẽ background sẵn). `setSun` = ghi uniform (~0ms) → kéo mặt trời live KHÔNG recompile/rebuild. Hợp `RuntimeGuard` budget.
