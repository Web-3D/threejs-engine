# PhotoGround

Ground **PBR từ texture ảnh** (scan/photogrammetry) — `MeshStandardNodeMaterial` với map/normal/roughness/ao.
Lát theo **world-XZ ÷ tileSizeMeters** → tiling đều mọi kích thước lô, độc lập geometry UV (Box LẪN ShapeGeometry).

Anh em `GrassGround` (procedural, không texture). Dùng khi muốn cỏ/đất **thật** từ ảnh scan.

> **Module KHÔNG load texture** (rule độc lập). Caller LOAD theo manifest `assets/textures/<name>` (loader chọn
> KTX2Loader/.ktx2 hay TextureLoader/.jpg theo ĐUÔI FILE) + set `wrapS/T=RepeatWrapping`, `colorSpace`,
> `anisotropy` → BƠM vào `maps`. Xem `assets/textures/PROTOCOL.md`.

## Usage

```typescript
import { PhotoGround } from 'threejs-modules/shaders/ground/PhotoGround'

// baseColor.colorSpace = SRGBColorSpace; normal/roughness/ao = NoColorSpace; tất cả wrap=Repeat.
const g = new PhotoGround({
  maps: { baseColor, normal, roughness, ao },
  tileSizeMeters: 2, // texture lặp mỗi 2m world (khớp scanArea asset)
})
mesh.material = g.getMaterial()
```

## Options

| Option | Type | Default | Mô tả |
| ------ | ---- | ------- | ----- |
| `maps.baseColor` | Texture | — | Albedo (sRGB). **Bắt buộc** |
| `maps.normal` | Texture? | — | Normal tangent hệ **GL**. Lồi/lõm ngược → `normalScale` âm |
| `maps.roughness` | Texture? | — | Roughness grayscale |
| `maps.ao` | Texture? | — | Ambient occlusion grayscale |
| `tileSizeMeters` | number | `2` | Kích thước lát vật lý (m). `setTileSizeMeters` live |
| `normalScale` | number | `1` | Cường độ normal [-2,2]. Âm = flip green. `setNormalScale` live |
| `roughnessScale` | number | `1` | Nhân roughness [0,3]. `setRoughnessScale` live |
| `detail` | number? | `undefined` | 🏔️ Micro-relief PROCEDURAL [0,1] (`mx_noise_float`). Truyền (kể cả 0) = BẬT (noise ~0.1ms luôn tính); bỏ trống = tắt hẳn (0 cost). `setDetail` live |
| `detailScale` | number | `4` | Tần số micro-relief (1/m world). Cao = sần mịn. Đổi cần dựng lại material |

> **`detail` (Phase 4 terrain):** perturbation normal noise tần-số-cao **CỘNG lên** normal map (không thay) → phá vẻ
> "nhựa CG" của mặt nền gò nhẵn. Gradient = finite-diff 3 mẫu `mx_noise_float` world-XZ. `uDetail=0` → no-op (vẫn tính
> noise). Driver = `terrain.detail` (site-kit bơm; live qua `setDetail`, KHÔNG recompile → hợp per-key material cache).

## Normal (ground phẳng +Y)

`NormalMapNode` built-in tính TBN từ **default `uv()`** → lệch khi sample world-UV. Vì ground luôn phẳng +Y,
module dựng tay: GL tangent `n=tex*2−1` → world `vec3(n.x·s, n.z, n.y·s)` (T→X, N→Y, B→Z) → `transformNormalToView`.

## Dispose

```typescript
g.dispose() // chỉ NodeMaterial — texture do CALLER dispose (PhotoGround không sở hữu)
```
