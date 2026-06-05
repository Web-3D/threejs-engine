# ShojiScreen

Tường **shoji (障子)** Nhật procedural — TSL `NodeMaterial`, lit, world-space triplanar.

Gồm 3 lớp:
1. **Lưới gỗ kumiko** — đường mảnh dọc + ngang đều theo `cellW`×`cellH` (mặc định 0.11×0.14 m → ô đứng).
2. **Nền giấy washi** — `paperColor` trắng-ấm (cảm giác mờ cho ánh sáng xuyên).
3. **Khung tấm** — lưới world `panelW`×`panelH` (0.9×1.8 m), gỗ đậm hơn.

> Dùng qua `WallMaterial = 'jp-shoji'` (Walls ▸ Japanese ▸ Shoji). Anh em `SeigaihaScreen` (fusuma tranh sóng).

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
| `cellW` / `cellH` | number | `0.11` / `0.14` | Kích thước ô kumiko (m) |
| `panelW` / `panelH` | number | `0.9` / `1.8` | Kích thước tấm shoji (m) |

## Dispose

```typescript
s.dispose()
```
