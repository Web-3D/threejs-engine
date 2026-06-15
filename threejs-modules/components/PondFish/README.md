# PondFish

Đàn cá koi **procedural** bơi lượn trong vùng tròn — dành cho lòng hồ (basin của WaterSurface).
Không asset, không rig: thân low-poly dựng tay (~145 tri/con — gồm **2 mắt** + **miệng há được**), **đuôi vẫy =
TSL vertex-bend sine chạy GPU**, màu koi (trắng kem + mảng cam + đốm đen) sinh per-con từ `hash(instanceIndex)` +
`triNoise3D`. Đầu có **mắt** (đĩa tối 2 bên) + **miệng** (môi tối, hé nghỉ + há mạnh khi đớp). Cả đàn = 1
`InstancedMesh` = **1 draw**.

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

| Option                               | Type       | Default     | Description                                                                                                                                                                                                                                                                                                        |
| ------------------------------------ | ---------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `count`                              | number     | 8           | Số cá (cap 64). **Constructor-only** — đổi = tạo instance mới                                                                                                                                                                                                                                                      |
| `tier`                               | number     | 4           | 🆕 BẬC chuỗi thức ăn (1..6; pond dùng 4-6). Phase 1 chỉ LƯU + `getTier()` — predation lớn-ăn-bé (bậc nhỏ ăn bậc lớn-số) = Phase 3. Nhiều đàn/pond = `WaterConfig.fishSchools[]` (archplan)                                                                                                                         |
| `areaRadius`                         | number     | 1.6         | Bán kính vùng bơi NGANG (m) — live `setAreaRadius`                                                                                                                                                                                                                                                                 |
| `swimDepth`                          | number     | 0           | Bề DÀY bơi ĐỨNG (m) — cá rải khối trụ radius×swimDepth (0 = đĩa phẳng) — live `setSwimDepth`                                                                                                                                                                                                                       |
| `depthY`                             | number     | -0.25       | Cao độ ĐỈNH khối bơi so gốc mesh (m, âm = chìm) — live `setDepthY`                                                                                                                                                                                                                                                 |
| `fishLength`                         | number     | 0.28        | Chiều dài cá (m), per-con ±20% — live `setFishLength`                                                                                                                                                                                                                                                              |
| `bodyWidth`                          | number     | 1           | Độ MẬP thân (×tiết diện, ≥0.2) — live `setBodyWidth`                                                                                                                                                                                                                                                               |
| `speed`                              | number     | 0.25        | Tốc độ bơi (m/s), tần vẫy theo tốc — live `setSpeed`                                                                                                                                                                                                                                                               |
| `colorSeed`                          | number     | 0           | Xáo bộ mảng/đốm cả đàn — live `setColorSeed`                                                                                                                                                                                                                                                                       |
| `baseColor`/`patchColor`/`spotColor` | number     | kem/cam/đốm | 3 màu koi (hex) — live `setColors(base,patch,spot)`                                                                                                                                                                                                                                                                |
| `patchAmount`                        | number     | 0.5         | Tỉ lệ mảng 0..1 (cao = nhiều mảng) — live `setPatchAmount`                                                                                                                                                                                                                                                         |
| `swayAmp`                            | number     | 1           | Hành vi: biên độ lượn chữ S (×) — live `setSwayAmp`                                                                                                                                                                                                                                                                |
| `wanderAmp`                          | number     | 1           | Hành vi: độ lăng xăng / random dart (×) — live `setWanderAmp`                                                                                                                                                                                                                                                      |
| `bobAmp`                             | number     | 1           | Hành vi: nhấp nhô dọc (×±3cm) — live `setBobAmp`                                                                                                                                                                                                                                                                   |
| `burstRate`                          | number     | 0           | Hành vi: tần suất BỨT TỐC ngẫu nhiên (0..1; 0 = tắt) — vài con phóng vọt rồi khựng — live `setBurstRate`                                                                                                                                                                                                           |
| `satiation`                          | number     | 1           | 🆕 ĐỘ NO (slider "Đói", 0..1 ≈ level 0..20): >6/20 sống (càng đói bơi **chậm dần** ×1→×0.35); **≤6/20 = vùng CHẾT THEO TỈ LỆ** (level 6→1/6 đàn, 5→2/6, …, 0→cả đàn — `_deadCount`). Con `i<deadCount` animate chết per-con — live `setSatiation`. Lao nhanh bâu mồi = khi click-thả-mồi (rush ∝ 1−satiation, sau) |
| `bounds`                             | PondBounds | —           | 🆕 VÙNG BƠI = lòng hồ thật (polygon local + `surfaceY` + `floorYAt`) — live `setBounds`. Có → cá bám hình hồ, đụng vách quay lại, rải giữa mặt↔đáy theo gò; **bỏ qua** `areaRadius`/`depthY`/`swimDepth`                                                                                                           |
| `bankAmp`                            | number     | 1           | 🎢 NGHIÊNG thân vào cua (×, ∝ tốc-quay) — đẹp khi lượn/zic-zac — live `setBankAmp`                                                                                                                                                                                                                                 |
| `pitchAmp`                           | number     | 1           | 🎢 CHÚI mũi khi lặn/ngoi (×, ∝ tốc-đứng) — live `setPitchAmp`                                                                                                                                                                                                                                                      |
| `schooling`                          | boolean    | false       | 🐟 BƠI THEO ĐÀN (boids cohesion+alignment) — tụm cụm + đồng hướng; separation luôn chạy — live `setSchooling`                                                                                                                                                                                                      |
| `forage`                             | boolean    | false       | 🍽 MÒ ĂN tự động — đói (satiation<0.5) tự rải viên nổi → cá tới ăn → satiation hồi (homeostasis) — live `setForage`. Rải TAY = caller gọi `scatterFood*`                                                                                                                                                            |
| `foodCount`·`foodDrop`·`foodSpread`  | number     | 10·0.12·0.7 | 🍽 cách thả mồi: số viên/lần · giãn RƠI giữa viên (s, so-le) · độ rộng vùng toả (m) — live `setFoodCount`/`setFoodDrop`/`setFoodSpread`                                                                                                                                                                            |

`PondBounds = { polygon: {x,z}[]; surfaceY: number; floorYAt: (x,z)=>number }` (đơn vị m, LOCAL so gốc mesh = tâm hồ).

API khác: `getMesh()` · `getCount()` · `getTriangleCount()` · `update(dt)` · 🍽 `scatterFood(n?)`/`scatterFoodAt(x,z,n?)` (rải viên RƠI từ cao, so-le) · `setEatRipple(fn)` (đớp viên → callback `(x,z)` để caller bắn sóng/giọt = `WaterSurface.emitImpact`+`SplashBurst`).

## Hành vi bơi (v1.6)

- **Lượn chữ S liên tục** (sine heading per-con — cá thật không bao giờ bơi thẳng, biên độ ×`swayAmp`) +
  wander random-walk (đổi hướng bất chợt, ×`wanderAmp`); **sát vách quay lại** (`bounds`: ngoài polygon hoặc
  cách cạnh < ~thân cá → lái về centroid; không `bounds`: r > 85%`areaRadius` → lượn về tâm) ⇒ không xuyên bờ.
- **🎢 NGHIÊNG THÂN** (v1.6, `bankAmp`/`pitchAmp`): thân **bank** nghiêng vào cua (∝ tốc-quay, kẹp ~40°) + **pitch**
  chúi mũi khi lặn/ngoi (∝ tốc-đứng, kẹp ~34°), lerp mượt (`TILT_LERP`). Pose = yaw · pitch(+Z) · roll(+X = bank +
  xoay-bụng-chết). Cá chết → tilt về 0 (death-pose lo xoay bụng). Thấy rõ khi prey bẻ cua/zic-zac né.
- **🐟 BƠI THEO ĐÀN (boids)** (v1.6, `schooling` bật/tắt — pond ít con → mặc định TẮT): lúc bơi thường, gom neighbor
  trong `SCHOOL_R`×dài → lái heading về **cohesion** (tâm cụm) + **alignment** (hướng chung, ×`ALIGN_W` nhỉnh hơn);
  **separation** (`_separate`) LUÔN chạy dù tắt. flee/hunt override; wander/sway vẫn phá đều trên nền hướng đàn.
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
- **🦈 SĂN MỒI / CHẠY TRỐN / TÁCH-THÂN** (v1.5 — predation, coordinator `PondPredation` điều phối cross-đàn cùng hồ):
  - **Săn** (predator = tier số NHỎ hơn, CHỈ khi `canHunt` = Đói vùng vàng level 6-10): rada **`DETECT_K`×dài ≈2.6m**
    (CHỦ Ý lớn hơn rada flee của prey ~1.5m → phát hiện SỚM + bám đuổi dù prey vọt xa) khoá mồi gần nhất → lao
    ×`HUNT_DART` 1.8 + lặn tới tầng mồi → **cắn** khi **MŨI** (tâm + heading×½thân) chạm **THÂN mồi** (½ dài-mồi + gape)
    → `consume` (ẩn instance) + nghỉ `EAT_COOLDOWN`≈1s. **KHÔNG còn gate chase-time cứng** — độ trễ + cơ-hội-thoát dời
    sang prey (cửa sổ sprint). 🦈 **CHỚP HÁ MIỆNG** (v1.6): miệng **hé nghỉ** sẵn (`MOUTH_REST` — đầu luôn thấy rõ là
    miệng, không 1 khối) + ngay khi đớp predator **há mạnh** 1 cú (`chomp` — sin há→ngậm ~0.28s) qua attribute `jaw`
    (bake: hàm trên nhếch + hàm dưới rớt) × `_uMouth` per-con × `MOUTH_GAPE`. Đầu phình + **môi tô tối** (|jaw|) + **2
    mắt** (đĩa `feat`=1 tô đen) → "ra mặt". API: `getFishView/getFishLength/canHunt/setHunt/clearHunt/consume/chomp/resetSchool`.
  - **Chạy trốn** (prey = tier số LỚN hơn): thấy predator trong `FLEE_K`×dài (~1.5m) → `setFlee` bơi NGƯỢC. **2s đầu =
    cửa sổ SPRINT** tốc NGẪU NHIÊN (`SPRINT_MIN`2.1..`SPRINT_MAX`3.4×, roll lúc chớm flee) **+ BẺ CUA zic-zac**
    (`ZIG_FREQ`9/`ZIG_AMP`1.2 — quẹo ngoằn ngoèo né): roll thấp ≈ngang predator → **bị đớp ngay**; roll cao > predator
    → **vọt lên thoát liền**. **Sau 2s** về ×`FLEE_DART`1.65 chạy thẳng (chậm hơn predator → dễ bị đớp). Ưu tiên
    **flee > hunt > wander** trong `_swim`.
  - **🌀 Chống xoay tại chỗ** (`SPIN_LIMIT`=2π, `STRAIGHT_DUR`=2s): cộng dồn góc quay khi flee; xoay > **1 vòng** cùng
    chỗ (kẹt vòng tròn với predator) → ép **đi thẳng 2s** (không quay theo predator) để thoát, rồi reset đếm. Phá
    deadlock "cả 2 bậc cùng xoay tại chỗ" (zic-zac đối xứng tự triệt nên không kích nhầm bộ đếm).
  - **Tách-thân** (`_separate`, mọi con sống): lọt trong `SEP_K`×dài của con khác → đẩy ra (2 pha, không nhập nhau).
  - **Spawn cách nhau** (`occupied` claims chung hồ — tâm+bán-kính): con/đàn sau né claim đàn trước → KHÔNG trùng vị
    trí lúc load (cả cross-đàn). `resetSchool()` hồi mọi cá bị ăn (nút Reset GUI).
- **Hành vi theo BẬC** (`FISH_TIER_PRESETS`, áp lúc tạo/đổi-bậc): bậc THẤP chậm hơn + bứt tốc/lăng xăng nhiều hơn (mồi tăng động).
- **Tốc nhấp nhô** theo thời gian (lướt ↔ rướn) — phá đều tăm tắp giữa các con.
- Mỗi con: tốc/cỡ/pha vẫy/tần lượn/mức-đứng/bộ màu riêng (deterministic — LCG seed cố định, tái lập).
- Nhấp nhô Y ±3cm ×`bobAmp`. Pose = yaw (`rotation.y`) · pitch (+Z) · bank-roll (+X); forward local = +X.
- ⚠️ Gotcha TSL đã vá (v1.1): pattern màu phải sample `positionGeometry` (attribute gốc) — `positionLocal`
  là varying bị `positionNode` ghi đè → sample theo toạ độ đang vẫy = hoạ tiết "trượt khỏi thân".

## Performance

- 8 con ≈ **1k tri, 1 draw**; cap 64 con ≈ 8.4k tri.
- 🪶 Material = **`MeshLambertNodeMaterial`** (KHÔNG PBR) — cá chìm dưới nước, stylized → không cần roughness/metalness.
  Compile NHANH hơn + fragment RẺ hơn hẳn MeshStandard (đỡ load + đỡ tụt fps). Đổi sang Phong nếu cần ánh bóng "ướt".
- Vẫy = vertex shader (0 CPU); CPU ≤64 matrix compose/frame + tách-thân O(n²)/đàn + predation O(pred×prey)/hồ (n≤64, rẻ).
- 🧹 `PondPredation` snapshot vị trí MỖI đàn **1 lần/frame** (Map) → tái dùng cho săn+trốn, bớt rác GC (trước gọi `getFishView` O(đàn²) lần).
- `castShadow = false` (cá chìm dưới nước — bóng xuyên mặt nước nhìn sai, lại rẻ).
- Vertex-bend giữ instanceMatrix đúng bài KI-003 (`positionLocal.add`, không replace positionNode).

## Dispose

```typescript
fish.dispose() // geometry + material + instanceMatrix buffer + gỡ khỏi parent
```
