# SeigaihaScreen

Tường tranh Nhật Bản (**fusuma / byōbu**) procedural — TSL `NodeMaterial`, lit (nhận sáng + bóng), world-space triplanar.

Gồm 3 lớp:
1. **Khung gỗ chia ô** (fusuma grid) — lưới world theo `panelW`×`panelH` (mặc định 0.9×1.8 m).
2. **Nền washi / vàng kim** (kinpaku) — `paperColor`.
3. **Sóng Seigaiha (青海波)** — Voronoi lưới so le (tâm vảy: x cách 1, y cách 0.5, hàng lẻ lệch ½) → khoảng-cách-tới-tâm-gần-nhất cho **vòng cung đồng tâm** + biên vảy. Band xen kẽ + đường mảnh `waveColor` (chàm).

> Dùng qua hệ `WallMaterial` = `'jp-screen'` (Walls ▸ Japanese ▸ Seigaiha). Không phải module standalone thường dùng trực tiếp.

## Usage

```typescript
import { SeigaihaScreen } from 'threejs-modules/shaders/fragment/SeigaihaScreen'

const jp = new SeigaihaScreen({ scale: 1, paperColor: 0xe7d6a0, waveColor: 0x2a4d7a })
mesh.material = jp.getMaterial() // hoặc qua makeSurfaceMaterial (wallMaterials.ts)
```

## Options

| Option | Type | Default | Mô tả |
| ------ | ---- | ------- | ----- |
| `scale` | number | `1` | World scale (lớn = motif nhỏ) |
| `paperColor` | ColorRep | `0xe7d6a0` | Nền washi/vàng kim; live `setPaperColor` |
| `waveColor` | ColorRep | `0x2a4d7a` | Màu sóng (chàm); live `setWaveColor` |
| `frameColor` | ColorRep | `0x3a2a1c` | Khung gỗ chia ô; live `setFrameColor` |
| `rings` | number | `5` | Số vòng cung mỗi vảy sóng |
| `panelW` / `panelH` | number | `0.9` / `1.8` | Kích thước ô fusuma (m, world) |

## Performance

Procedural thuần (không texture). 9 lần `length` (Voronoi 3×3 unroll) × 3 mặt triplanar — fragment vừa phải. Không bump/roughness node.

## Dispose

```typescript
jp.dispose() // giải phóng NodeMaterial
```
