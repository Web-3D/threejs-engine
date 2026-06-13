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
| `count` | number | 8 | Số cá (cap 64). **Constructor-only** — đổi = tạo instance mới |
| `tier` | number | 4 | 🆕 BẬC chuỗi thức ăn (1..6; pond dùng 4-6). Phase 1 chỉ LƯU + `getTier()` — predation lớn-ăn-bé (bậc nhỏ ăn bậc lớn-số) = Phase 3. Nhiều đàn/pond = `WaterConfig.fishSchools[]` (archplan) |
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
| `burstRate` | number | 0 | Hành vi: tần suất BỨT TỐC ngẫu nhiên (0..1; 0 = tắt) — vài con phóng vọt rồi khựng — live `setBurstRate` |
| `satiation` | number | 1 | 🆕 ĐỘ NO (slider "Đói", 0..1 ≈ level 0..20): >6/20 sống (càng đói bơi **chậm dần** ×1→×0.35); **≤6/20 = vùng CHẾT THEO TỈ LỆ** (level 6→1/6 đàn, 5→2/6, …, 0→cả đàn — `_deadCount`). Con `i<deadCount` animate chết per-con — live `setSatiation`. Lao nhanh bâu mồi = khi click-thả-mồi (rush ∝ 1−satiation, sau) |
| `bounds` | PondBounds | — | 🆕 VÙNG BƠI = lòng hồ thật (polygon local + `surfaceY` + `floorYAt`) — live `setBounds`. Có → cá bám hình hồ, đụng vách quay lại, rải giữa mặt↔đáy theo gò; **bỏ qua** `areaRadius`/`depthY`/`swimDepth` |

`PondBounds = { polygon: {x,z}[]; surfaceY: number; floorYAt: (x,z)=>number }` (đơn vị m, LOCAL so gốc mesh = tâm hồ).

API khác: `getMesh()` · `getCount()` · `getTriangleCount()` · `update(dt)`.

## Hành vi bơi (v1.3)

- **Lượn chữ S liên tục** (sine heading per-con — cá thật không bao giờ bơi thẳng, biên độ ×`swayAmp`) +
  wander random-walk (đổi hướng bất chợt, ×`wanderAmp`); **sát vách quay lại** (`bounds`: ngoài polygon hoặc
  cách cạnh < ~thân cá → lái về centroid; không `bounds`: r > 85%`areaRadius` → lượn về tâm) ⇒ không xuyên bờ.
- **Vùng bơi = LÒNG HỒ THẬT** (v1.3, `bounds`): ngang bám **polygon** hình hồ (không còn vòng tròn); đứng rải
  `yFrac` per-con giữa **mặt nước** (`surfaceY`) và **đáy theo gò** (`floorYAt(x,z)` — đáy lồi lõm). Thiếu `bounds`
  → fallback khối trụ `areaRadius`×`swimDepth`, đỉnh tại `depthY` (v1.2).
- **Bứt tốc ngẫu nhiên** (v1.3, `burstRate`>0): mỗi con cooldown random (∝ 1/burstRate) → **phóng vọt** (×4 tốc,
  ~0.55s) rồi **khựng** (×0.08, ~0.35s); mỗi con roll độc lập nên chỉ vài con bứt cùng lúc. 0 = tắt (bơi đều).
- **Đói / chết THEO TỈ LỆ** (v1.4, `satiation`): no → bơi nhanh-thường; càng đói (còn sống) → bơi-thường **CHẬM
  dần** (×`(0.35+0.65·satiation)`, lờ đờ). Lao nhanh bâu mồi = **chỉ lúc click-thả-mồi** (rush ∝ `1−satiation`, sau).
  **Chết theo SỐ con** (`_deadCount` từ slider, level ≤6): con `i<deadCount` chết, mỗi con `dp` ramp RIÊNG. Đuôi LIMP
  per-con qua `uniformArray` `aLife` (×biên độ vẫy, đọc theo `instanceIndex`). 1 path blend (không giật/teleport):
  - **CHẾT** (`DEATH_DUR`≈7s, đứng tại chỗ): `[0,0.3]` **GIẬT TRƯỚC** (`_throe` ~2-3 cú CHẬM, nhẹ ≈½ cũ) → `[0.3,1]`
    **xoay bụng lên chậm** (roll 0→π) → **nửa xoay (p≈0.6) mới NỔI** thẳng chậm lên dưới mặt (buoyancy, G≪9.8).
    Nổi hẳn: đung đưa XZ±3cm + đong đưa Y±3cm + lắc bụng (pha ×con).
  - **HỒI SINH** (cùng `DEATH_DUR` → **xoay bụng ĐÚNG TỐC xoay khi chết**, công thức `flip` dùng chung 2 chiều):
    `[p 1→0.8]` **giật ~2-3 cú NHANH dần** (ease-in, nhịp giãn, tắt sạch — không rung sau) → xoay bụng xuống.
    **KHÔNG rớt Y**: `rise=1` giữ đúng XYZ chết ở mặt suốt hồi sinh; xong (`dp`→0) đặt `wake=1` rồi ease 0 qua
    `WAKE_DUR`≈2.6s = `_swim` **bơi xuống từ từ** (không rơi thẳng).
- **Tốc nhấp nhô** theo thời gian (lướt ↔ rướn) — phá đều tăm tắp giữa các con.
- Mỗi con: tốc/cỡ/pha vẫy/tần lượn/mức-đứng/bộ màu riêng (deterministic — LCG seed cố định, tái lập).
- Nhấp nhô Y ±3cm ×`bobAmp`. Heading → `rotation.y` (forward local = +X).
- ⚠️ Gotcha TSL đã vá (v1.1): pattern màu phải sample `positionGeometry` (attribute gốc) — `positionLocal`
  là varying bị `positionNode` ghi đè → sample theo toạ độ đang vẫy = hoạ tiết "trượt khỏi thân".

## Performance

- 8 con ≈ **1k tri, 1 draw**; cap 64 con ≈ 8.4k tri.
- Vẫy = vertex shader (0 CPU); CPU chỉ ≤40 matrix compose/frame.
- `castShadow = false` (cá chìm dưới nước — bóng xuyên mặt nước nhìn sai, lại rẻ).
- Vertex-bend giữ instanceMatrix đúng bài KI-003 (`positionLocal.add`, không replace positionNode).

## Dispose

```typescript
fish.dispose() // geometry + material + instanceMatrix buffer + gỡ khỏi parent
```
