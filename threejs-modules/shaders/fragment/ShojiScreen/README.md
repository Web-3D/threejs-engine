# ShojiScreen

Tường **shoji (障子)** Nhật procedural — TSL `NodeMaterial`, lit, world-space triplanar.

Kết cấu (theo shoji thật):
1. **Khung ngoài** (per-wall, uv) — cạnh TRÊN + 2 cạnh BÊN (đáy = koshita).
2. **Grid kumiko** (world triplanar) — **trục gỗ** dọc 25cm (dày) + **nan gỗ** 12.5cm (mảnh, cả dọc+ngang → ô vuông) + 1 **trục gỗ ngang** trên top.
3. **Koshita** (per-wall, uv) — đáy `koshita` (1/3) = GỖ ĐẶC, có **vân gỗ dọc** (triNoise).
4. **Nền giấy washi** (`paperColor`) ở các ô; gỗ MAT cao (roughness 0.97) né nhựa.

> `'jp-shoji'` = giấy; `'jp-shoji-glass'` = ô KÍNH (transparent, slider Reflect/Opacity). Walls ▸ Japanese. Anh em `SeigaihaScreen`.

## Quy ước thuật ngữ (NgQuan, dùng khi yêu cầu chỉnh)

| Từ | Nghĩa | Code |
| --- | --- | --- |
| **trục gỗ** | Cạnh gỗ DỌC 25cm (dày) + 1 thanh NGANG trên top | `_gridLattice` `trucV` (`_bars(pu, cellW, 0.013)`) + `_woodness` `trucTop` (uv ~0.92) |
| **nan gỗ** | Đường gỗ NHỎ 12.5cm (cả dọc+ngang) chia ô VUÔNG | `_gridLattice` `nanV`/`nanH` (`_bars(_, cellW/2, 0.006)`) |
| khung | Cạnh ngoài (trên + 2 bên) | `_woodness` frame (uv) |
| koshita (腰板) | Gỗ đặc đáy 1/3 | `_woodness` koshita (uv.y < `koshita`) |

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
| `trucCell` | number | `0.25` | Khoảng cách trục gỗ dọc (m) — slider GUI |
| `nanCell` | number | `0.125` | Khoảng cách nan gỗ (m, dọc+ngang) — slider GUI |
| `grain` | number | `0.4` | Độ nhiễu vân gỗ / nhám koshita [0–1] — slider GUI |
| `koshita` | number | `0.33` | Tỉ lệ đáy làm gỗ đặc (uv.y) |
| `glass` | boolean | `false` | Ô = kính (transparent + reflect) |
| `reflect` / `opacity` | number | `0.6` / `0.45` | (glass) độ phản chiếu / độ mờ ô kính |

## Dispose

```typescript
s.dispose()
```
