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
| `areaRadius` | number | 1.6 | Bán kính vùng bơi NGANG (m) — live `setAreaRadius` |
| `swimDepth` | number | 0 | Bề DÀY bơi ĐỨNG (m) — cá rải khối trụ radius×swimDepth (0 = đĩa phẳng) — live `setSwimDepth` |
| `depthY` | number | -0.25 | Cao độ ĐỈNH khối bơi so gốc mesh (m, âm = chìm) — live `setDepthY` |
| `fishLength` | number | 0.28 | Chiều dài cá (m), per-con ±20% — live `setFishLength` |
| `bodyWidth` | number | 1 | Độ MẬP thân (×tiết diện, ≥0.2) — live `setBodyWidth` |
| `speed` | number | 0.25 | Tốc độ bơi (m/s), tần vẫy theo tốc — live `setSpeed` |
| `colorSeed` | number | 0 | Xáo bộ mảng/đốm cả đàn — live `setColorSeed` |
| `baseColor`/`patchColor`/`spotColor` | number | kem/cam/đốm | 3 màu koi (hex) — live `setColors(base,patch,spot)` |
| `patchAmount` | number | 0.5 | Tỉ lệ mảng 0..1 (cao = nhiều mảng) — live `setPatchAmount` |
| `swayAmp` | number | 1 | Hành vi: biên độ lượn chữ S (×) — live `setSwayAmp` |
| `wanderAmp` | number | 1 | Hành vi: độ lăng xăng / random dart (×) — live `setWanderAmp` |
| `bobAmp` | number | 1 | Hành vi: nhấp nhô dọc (×±3cm) — live `setBobAmp` |

API khác: `getMesh()` · `getCount()` · `getTriangleCount()` · `update(dt)`.

## Hành vi bơi (v1.2)

- **Lượn chữ S liên tục** (sine heading per-con — cá thật không bao giờ bơi thẳng, biên độ ×`swayAmp`) +
  wander random-walk (đổi hướng bất chợt, ×`wanderAmp`) trong vùng `areaRadius`; sát biên (85%) tự lượn về tâm.
- **Khối bơi ĐỨNG** (v1.2): cá rải mức `yFrac` per-con trong bề dày `swimDepth` (radius×swimDepth = trụ),
  không còn dẹp 1 mặt. `depthY` = đỉnh khối.
- **Tốc nhấp nhô** theo thời gian (lướt ↔ rướn) — phá đều tăm tắp giữa các con.
- Mỗi con: tốc/cỡ/pha vẫy/tần lượn/mức-đứng/bộ màu riêng (deterministic — LCG seed cố định, tái lập).
- Nhấp nhô Y ±3cm ×`bobAmp`. Heading → `rotation.y` (forward local = +X).
- ⚠️ Gotcha TSL đã vá (v1.1): pattern màu phải sample `positionGeometry` (attribute gốc) — `positionLocal`
  là varying bị `positionNode` ghi đè → sample theo toạ độ đang vẫy = hoạ tiết "trượt khỏi thân".

## Performance

- 8 con ≈ **1k tri, 1 draw**; cap 40 con ≈ 5.2k tri.
- Vẫy = vertex shader (0 CPU); CPU chỉ ≤40 matrix compose/frame.
- `castShadow = false` (cá chìm dưới nước — bóng xuyên mặt nước nhìn sai, lại rẻ).
- Vertex-bend giữ instanceMatrix đúng bài KI-003 (`positionLocal.add`, không replace positionNode).

## Dispose

```typescript
fish.dispose() // geometry + material + instanceMatrix buffer + gỡ khỏi parent
```
