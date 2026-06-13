# Precipitation

Mưa / tuyết **procedural field** rải trong **trụ bám camera**, rơi + wrap modulo chạy **hoàn toàn vertex shader** (0 CPU/frame ngoài 1 uniform `time`), **1 draw** cho cả màn. Mode `rain` = **LineSegments** (vệt streak dọc quỹ đạo) · `snow` = **Points** (chấm bông).

## Usage

```typescript
import { Precipitation } from 'threejs-modules/effects/Precipitation'

const rain = new Precipitation({ mode: 'rain', count: 6000 })
scene.add(rain.getObject())

// mỗi frame:
rain.update(deltaTime) // giây — tiến thời gian rơi

// liên động hệ thời tiết (live, 0 rebuild):
rain.setSpeed(22)
rain.setWind(4, 0)      // gió ngang → vệt nghiêng
rain.setOpacity(0.5)
```

`'snow'` = chậm, hạt to, trắng, **drift sin** (bông lắc lư); `'rain'` = nhanh, nhỏ, xanh-xám, **nghiêng theo gió**.

## Options

| Option | Type | Default (rain / snow) | Mô tả |
| --- | --- | --- | --- |
| `mode` | `'rain' \| 'snow'` | `'rain'` | Kiểu hạt — constructor-only (đặt defaults) |
| `count` | number | 6000 / 2500 | Số hạt (trần 30000) — constructor (rebuild geometry) |
| `radius` | number | 18 | Bán kính trụ phủ quanh camera (m) — live |
| `height` | number | 22 | Chiều cao cột rơi (m) — live |
| `groundY` | number | 0 | Cao độ đáy world (m) — live |
| `speed` | number | 17 / 2.4 | Tốc độ rơi (m/s) — live |
| `size` | number | 3.2 / 8 | Cỡ hạt GẦN camera (px max) — xa thu nhỏ ×0.28 theo distance — live |
| `color` | Color | 0xaeb8c4 / 0xfafcff | Màu hạt — live |
| `opacity` | number | 0.35 / 0.8 | Độ mờ — live |
| `wind` | [number, number] | [2.4,0] / [0.6,0] | Gió ngang (m) lệch theo quãng rơi — live |
| `drift` | number | 0 / 0.5 | Biên độ drift sin ngang (m) — live |
| `streak` | number | 0.9 | Độ dài vệt mưa (m, **chỉ `rain`**) — live |

Setter live: `setSpeed/setRadius/setHeight/setGroundY/setSize/setOpacity/setColor/setWind/setDrift/setStreak`.

## Dispose

```typescript
rain.dispose() // geometry + material + gỡ points khỏi parent
```

## Performance

- **1 draw** (Points). Rơi/wrap/gió/drift/cỡ-theo-distance = vertex shader → **0 CPU/frame** ngoài 1 ghi uniform `time`.
- Cỡ hạt: `sizeAttenuation=false` + tự nhân `mix(1, 0.28, smoothstep(near, radius, dist))` → gần camera = `size` (max), rìa trụ = `size×0.28` (min). Clamp rõ ràng, không bị perspective chia 2 lần.
- Chi phí thật = **overdraw transparent** → cap `count`. `depthWrite=false`, `frustumCulled=false` (trụ bám camera).
- Mọi prop trừ `count`/`mode` = **uniform live** (0 recompile). `cameraPosition` (uniform three auto) → hạt luôn quanh người xem, tịnh tiến cứng theo cam (không trượt trong khung nhìn).

## Ghi chú thiết kế

- **KHÔNG reuse `effects/GPUParticleSystem`**: đó là **emitter-paradigm** (hạt phát từ 1 điểm theo `aDir` + bell-envelope lifecycle). Mưa/tuyết là **field** (hạt rải đều thể tích, rơi cùng hướng, spawn theo VỊ TRÍ). Base class hardcode `sampleDir` → không cấp spawn-position; tự viết là đúng paradigm.
- **Vệt mưa (streak, v1.2):** `rain` = `LineSegments`, 2 vertex/hạt. Đuôi (aEnd=1) lấy vị trí tại `tFall − streak/height` — tức điểm CAO hơn `streak` mét dọc CHÍNH quỹ đạo rơi → vệt nối liền, nghiêng đúng theo gió, 0 thêm CPU. `snow` giữ `Points` (chấm tròn hợp bông tuyết).
- **Chưa có (Phase C tiếp):** tuyết ĐỌNG trên mái/nền, mưa gợn mặt hồ — đụng material/scene khác. (Sét flash đã làm ở tầng archplan, không trong module.)
