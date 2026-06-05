# TexturedSurface

Surface **PBR triplanar** (world-space) từ texture ảnh — đúng **MỌI hướng mặt** (sàn ngang, tường dọc, đáy hồ,
**mái nghiêng**) mà KHÔNG cần UV. "Unified" material: 1 cái cho slab / fence-wall / pond-bottom / roof.

Anh em `PhotoGround` (world-XZ phẳng +Y, rẻ hơn — chỉ cho ground NGANG). Dùng `TexturedSurface` khi mặt
**không phải ngang thuần** (tường, mái) hoặc muốn 1 material dùng chung mọi hướng.

> **Module KHÔNG load texture** (rule độc lập). Caller LOAD theo manifest `assets/textures/<name>` (loader
> chọn KTX2Loader/.ktx2 hay TextureLoader/.jpg theo ĐUÔI FILE) + set `wrapS/T=RepeatWrapping`, `colorSpace`,
> `anisotropy` → bơm vào `maps`. Xem `assets/textures/PROTOCOL.md`.

## Usage

```typescript
import { TexturedSurface } from 'threejs-modules/shaders/surface/TexturedSurface'

const s = new TexturedSurface({
  maps: { baseColor, normal, roughness, ao },
  tileSizeMeters: 2, // texture lặp mỗi 2m world
})
mesh.material = s.getMaterial()
```

## Options

| Option | Type | Default | Mô tả |
| ------ | ---- | ------- | ----- |
| `maps.baseColor` | Texture | — | Albedo (sRGB). **Bắt buộc** |
| `maps.normal` | Texture? | — | Normal tangent hệ GL (whiteout blend) |
| `maps.roughness` | Texture? | — | Roughness grayscale |
| `maps.ao` | Texture? | — | Ambient occlusion grayscale |
| `tileSizeMeters` | number | `2` | Kích thước lát (m). `setTileSizeMeters` live |
| `normalScale` | number | `1` | Cường độ normal [-2,2]. Âm = flip. `setNormalScale` live |
| `roughnessScale` | number | `1` | Nhân roughness [0,3]. `setRoughnessScale` live |

## Trade-off (triplanar)

- **3× texture sample/fragment** (sample 3 mặt phẳng, blend theo normal) ≈ 3× bandwidth so với 1 UV. Chỉ
  dùng cho mặt cần (slab/fence/roof diện vừa) — không phủ full-screen vô tội vạ.
- **Không UV control** — lát world-scaled theo `tileSizeMeters`, không layout UV tuỳ ý (logo/trim).
- **Seam nhẹ ở góc 45°** (2 mặt blend đều) — chấp nhận với texture tileable.
- normal = whiteout blend (đúng cả mặt xiên); blend RGB thuần SAI ở mặt nghiêng nên KHÔNG dùng.

## Dispose

```typescript
s.dispose() // chỉ NodeMaterial — texture do CALLER dispose
```
