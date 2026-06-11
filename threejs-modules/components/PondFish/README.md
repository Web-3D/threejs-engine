# PondFish

Đàn cá koi **procedural** bơi lượn trong vùng tròn — dành cho lòng hồ (basin của WaterSurface).
Không asset, không rig: thân low-poly dựng tay (~131 tri/con), **đuôi vẫy = TSL vertex-bend sine chạy
GPU**, màu koi (trắng kem + mảng cam + đốm đen) sinh per-con từ `hash(instanceIndex)` + `triNoise3D`.
Cả đàn = 1 `InstancedMesh` = **1 draw**.

> Vì sao không GLTF skinned: đàn cá realtime trong industry dùng vertex sine-bend, skeletal per-con chỉ
> đáng cho cá hero cận cảnh. Procedural = 0 download (production web), đổi size/màu/số con bằng prop.

## Usage

```typescript
import { PondFish } from 'threejs-modules/components/PondFish'

const fish = new PondFish({ count: 8, areaRadius: 1.6, depthY: -0.25 })
fish.getMesh().position.set(pondX, waterSurfaceY, pondZ) // gốc mesh = tâm hồ tại MẶT nước
scene.add(fish.getMesh())

// animation loop
fish.update(dt) // tiến vẫy đuôi + dời đàn (CPU rẻ)
```

## Options

| Option | Type | Default | Description |
| ------ | ---- | ------- | ----------- |
| `count` | number | 8 | Số cá (cap 40). **Constructor-only** — đổi = tạo instance mới |
| `areaRadius` | number | 1.6 | Bán kính vùng bơi (m) — live `setAreaRadius` |
| `depthY` | number | -0.25 | Cao độ bơi so với gốc mesh (m, âm = chìm) — live `setDepthY` |
| `fishLength` | number | 0.28 | Chiều dài cá (m), per-con ±20% — live `setFishLength` |
| `speed` | number | 0.25 | Tốc độ bơi (m/s), tần vẫy theo tốc — live `setSpeed` |
| `colorSeed` | number | 0 | Xáo bộ màu cam/đốm cả đàn — live `setColorSeed` |

API khác: `getMesh()` · `getCount()` · `getTriangleCount()` · `update(dt)`.

## Hành vi bơi

- Wander random-walk (quay có kẹp) trong đĩa bán kính `areaRadius`; ra gần biên (80%) tự lượn về tâm.
- Mỗi con: tốc/cỡ/pha vẫy/bộ màu riêng (deterministic — LCG seed cố định, tái lập).
- Nhấp nhô Y nhẹ ±3cm. Heading → `rotation.y` (forward local = +X).

## Performance

- 8 con ≈ **1k tri, 1 draw**; cap 40 con ≈ 5.2k tri.
- Vẫy = vertex shader (0 CPU); CPU chỉ ≤40 matrix compose/frame.
- `castShadow = false` (cá chìm dưới nước — bóng xuyên mặt nước nhìn sai, lại rẻ).
- Vertex-bend giữ instanceMatrix đúng bài KI-003 (`positionLocal.add`, không replace positionNode).

## Dispose

```typescript
fish.dispose() // geometry + material + instanceMatrix buffer + gỡ khỏi parent
```
