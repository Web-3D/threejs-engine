# StoneScatter

Rải các mảng đá **dẹt tròn/ellipse** trong một **khuôn chữ nhật vô hình**, phân bố **Poisson-disk** (Bridson 2007 → _blue-noise_): cách đều ngẫu nhiên, **không chạm nhau** (luôn chừa khe cỏ). Toàn bộ phiến gộp **1 `InstancedMesh` = 1 draw**. Dùng cho lối đi lát đá / bãi đá dăm sân vườn (stepping-stone v1).

> **Không phải** crazy-paving ghép-khít (đa giác sát nhau). Đó là Voronoi — đích xa, chưa làm. Module này đá xếp **thưa, có khe**.

## Thuật toán

1. **Bridson Poisson-disk** trong rect `frameW × frameD` với `minDist = 2·rMax + gap` → tâm phiến blue-noise (rải đều, không vón cục, không thẳng hàng). Lưới gia tốc `cell = minDist/√2` → kiểm tra lân cận O(1), tổng O(n).
2. Mỗi tâm gán bán kính `r ∈ [rMin, rMax]` + **aspect ellipse** `∈ [ellipseMin, 1]` + xoay Y ngẫu nhiên.
3. **Không chạm** được đảm bảo: bounding-circle mỗi phiến `= r ≤ rMax` (vì `rz = r·aspect ≤ r`), mà mọi tâm cách nhau `≥ minDist = 2·rMax + gap` → khe mép-mép `≥ gap > 0`, kể cả ellipse xoay.
4. **Deterministic**: cùng `seed` → cùng layout (PRNG mulberry32, stream liên tục).

## Usage

```typescript
import { StoneScatter } from 'threejs-modules/components/StoneScatter'

const field = new StoneScatter({ frameW: 4, frameD: 4, rMax: 0.35, gap: 0.06, seed: 1 })
scene.add(field.getMesh())
console.log(field.getStoneCount(), 'phiến,', field.getTriangleCount(), 'tris')
```

### Bơm texture đá (caller-owned)

```typescript
// material ngoài (vd TexturedSurface triplanar đá) → đá dùng nó thay màu phẳng. KHÔNG dispose ở module.
const field = new StoneScatter({ frameW: 4, frameD: 4, material: stoneMat })
```

## Options

| Option | Type | Default | Description |
| ------ | ---- | ------- | ----------- |
| `frameW` | number (m) | 4.0 | Bề ngang khuôn vô hình (X) |
| `frameD` | number (m) | 4.0 | Chiều sâu khuôn vô hình (Z) |
| `rMin` | number (m) | 0.18 | Bán kính phiến nhỏ nhất |
| `rMax` | number (m) | 0.35 | Bán kính phiến lớn nhất (= bán kính bao → quyết định `minDist`) |
| `ellipseMin` | 0..1 | 0.6 | Aspect ellipse tối thiểu (1 = tròn hết; <1 = dẹt) |
| `gap` | number (m) | 0.06 | Khe cỏ tối thiểu giữa 2 phiến (mép-mép) |
| `thickness` | number (m) | 0.05 | Dày phiến nhô trên cỏ |
| `radialSegments` | int ≥6 | 16 | Độ mịn vành đĩa (tris ≈ ×4/phiến) |
| `seed` | int | 0 | Seed deterministic — đổi layout + cỡ phiến |
| `shape` | `'rect'`\|`'circle'` | `'rect'` | Khung rải: chữ nhật `frameW×frameD` hoặc ellipse nội tiếp (loại phiến tâm ngoài) |
| `color` | ColorRepresentation | 0x9b948a | Màu đá (material nội bộ) — live `setColor` |
| `material` | THREE.Material | undefined | Material ngoài (caller-owned) → đá dùng thay màu phẳng |

## API

| Method | Mô tả |
| ------ | ----- |
| `getMesh()` | `InstancedMesh` — add vào scene |
| `getStoneCount()` | số phiến thực rải được (Poisson tự cap khi chật) |
| `getPlacements()` | `readonly StonePlacement[]` — vị trí/cỡ từng phiến (LOCAL) cho grass-exclude / picking |
| `getTriangleCount()` | tổng tris (verify budget) |
| `setColor(c)` | đổi màu (chỉ material nội bộ) — live |

## Performance

- **1 DRAW** (InstancedMesh) cho N phiến. Đĩa 16-seg ≈ 64 tri/phiến; 30 phiến ≈ **1.9k tri**.
- Poisson + dựng matrix = **build-time**, không per-frame. Cap `MAX_STONES = 400` (trần ~26k tri).
- Số phiến **suy ra** từ `frame × rMin/rMax × gap` — phiến to / gap lớn ⇒ ít phiến. (Chưa có prop count trực tiếp.)
- Lưu ý: phiến gần mép có thể **nhô khỏi khuôn ≤ rMax** (khuôn vô hình nên thường chấp nhận).

## Dispose

```typescript
field.dispose() // geometry + material NỘI BỘ + InstancedMesh. Material NGOÀI (bơm vào) = caller tự dispose.
```
