# Precipitation

Mưa / tuyết **procedural field** — N hạt `Points` rải trong **trụ bám camera**, rơi + wrap modulo chạy **hoàn toàn vertex shader** (0 CPU/frame ngoài 1 uniform `time`), **1 draw** cho cả màn.

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
| `size` | number | 1.6 / 4 | Cỡ hạt (px, sizeAttenuation) — live |
| `color` | Color | 0xaeb8c4 / 0xfafcff | Màu hạt — live |
| `opacity` | number | 0.35 / 0.8 | Độ mờ — live |
| `wind` | [number, number] | [2.4,0] / [0.6,0] | Gió ngang (m) lệch theo quãng rơi — live |
| `drift` | number | 0 / 0.5 | Biên độ drift sin ngang (m) — live |

Setter live: `setSpeed/setRadius/setHeight/setGroundY/setSize/setOpacity/setColor/setWind/setDrift`.

## Dispose

```typescript
rain.dispose() // geometry + material + gỡ points khỏi parent
```

## Performance

- **1 draw** (Points). Rơi/wrap/gió/drift = vertex shader → **0 CPU/frame** ngoài 1 ghi uniform `time`.
- Chi phí thật = **overdraw transparent** → cap `count`. `depthWrite=false`, `frustumCulled=false` (trụ bám camera).
- Mọi prop trừ `count`/`mode` = **uniform live** (0 recompile). `cameraPosition` (uniform three auto) → hạt luôn quanh người xem, tịnh tiến cứng theo cam (không trượt trong khung nhìn).

## Ghi chú thiết kế

- **KHÔNG reuse `effects/GPUParticleSystem`**: đó là **emitter-paradigm** (hạt phát từ 1 điểm theo `aDir` + bell-envelope lifecycle). Mưa/tuyết là **field** (hạt rải đều thể tích, rơi cùng hướng, spawn theo VỊ TRÍ). Base class hardcode `sampleDir` → không cấp spawn-position; tự viết là đúng paradigm.
- **Giới hạn Phase A (MVP):** mưa = chấm Points tròn, **chưa có vệt kéo dài (streak)** — `Points` không stretch được; streak cần Line/quad → để Phase C polish. Phân biệt rain↔snow hiện dựa vào tốc độ + drift + cỡ + màu (đủ đọc ra trong chuyển động).
- **Chưa có:** tuyết ĐỌNG trên mái/nền, mưa gợn mặt hồ, sét — các thứ này đụng material/scene khác → Phase C.
