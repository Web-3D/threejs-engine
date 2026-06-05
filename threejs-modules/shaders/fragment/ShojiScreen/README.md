# ShojiScreen

Tường **shoji (障子)** Nhật procedural — TSL `NodeMaterial`, lit, world-space triplanar.

Kết cấu (theo shoji thật):
1. **Khung ngoài** (per-wall, uv) — cạnh TRÊN + 2 cạnh BÊN (đáy = koshita).
2. **Grid kumiko** (world triplanar) — bar CHÍNH dày 1.0m (cả dọc+ngang) + bar mảnh **CHỈ DỌC** ~20cm trong mỗi ô (tate-shige).
3. **Koshita** (per-wall, uv) — đáy `koshita` (1/3) = GỖ ĐẶC, có **vân gỗ dọc** (triNoise).
4. **Nền giấy washi** (`paperColor`) ở các ô; gỗ MAT cao (roughness 0.97) né nhựa.

> `'jp-shoji'` = giấy; `'jp-shoji-glass'` = ô KÍNH (transparent, slider Reflect/Opacity). Walls ▸ Japanese. Anh em `SeigaihaScreen`.

## Usage

```typescript
import { ShojiScreen } from 'threejs-modules/shaders/fragment/ShojiScreen'
const s = new ShojiScreen({ scale: 1, paperColor: 0xf3ecd6, woodColor: 0x4a3826 })
mesh.material = s.getMaterial()
```

## Options

| Option | Type | Default | Mô tả |
| ------ | ---- | ------- | ----- |
| `scale` | number | `1` | World scale (lớn = ô nhỏ) |
| `paperColor` | ColorRep | `0xf3ecd6` | Giấy washi trắng-ấm; live `setPaperColor` |
| `woodColor` | ColorRep | `0x4a3826` | Gỗ kumiko + khung; live `setWoodColor` |
| `cellW` / `cellH` | number | `1.0` / `1.0` | Grid CHÍNH (m); fine dọc = cell/5 (~20cm) |
| `koshita` | number | `0.33` | Tỉ lệ đáy làm gỗ đặc (uv.y) |
| `glass` | boolean | `false` | Ô = kính (transparent + reflect) |
| `reflect` / `opacity` | number | `0.6` / `0.45` | (glass) độ phản chiếu / độ mờ ô kính |

## Dispose

```typescript
s.dispose()
```
