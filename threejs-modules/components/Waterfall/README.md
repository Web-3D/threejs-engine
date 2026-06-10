# Waterfall

Thác nước stylized (tier B) theo công thức industry (RiME/Season) — **Phase A3**: màn nước = mesh cong +
**texture vệt nước** cuộn xuống **3 lớp** khác tốc độ + fresnel + **khúc xạ màn** + foam band + **điều dòng**
(tách dòng / cuộn xiết qua strip 64×1); chân thác = **mist** (bốc lên) + **splash** (bắn ngang) sprite mềm.
**0 RTT, 0 asset** — texture vệt sinh 1 lần bằng Canvas 2D. **3 draw call.**

```
   crest (mặt ngang) ━━━━━╮ drawdown: upstream cao = sâu-dòng, võng về y=0 đúng mép
lip (gốc group, y=0) ─────┐ band trắng tràn mép → vùng "glass" trong veo
                          │ màn: z = arc·√t · 3 lớp vệt cuộn (×1 / ×0.72 đảo U / ×1.5 distort)
                          │ trắng dần về chân (aeration) + fresnel mép cong + lắc mép (wobble)
            mist (y=−h) ⋯⋯└─ foot band sủi + mist bốc lên + splash bắn ngang
```

## Usage

```typescript
import { Waterfall } from 'threejs-modules/components/Waterfall'

const wf = new Waterfall({ width: 2, height: 1.8, arc: 0.28 })
wf.getGroup().position.set(0, wallTopY, wallFaceZ) // gốc = TÂM MÉP TRÊN (lip) — đặt tại mép đổ
scene.add(wf.getGroup())

// mỗi frame
wf.setTime(clock.getElapsedTime())
```

**Tune trực quan:** Lab tab **🌊 Thác** trong archplan (`gui/waterfall-lab.ts`) — slider đủ mọi prop.

## Options

| Option | Type | Default | Mô tả |
| ------ | ---- | ------- | ----- |
| `width` | `number` | `2` | Bề ngang màn (m) — structural |
| `height` | `number` | `1.8` | Chiều cao rơi (m) — structural |
| `arc` | `number` | `0.28` | Dạt ra trước ở chân (m), `z = arc·√t` — structural |
| `flow` | `number` | `1.1` | Tốc độ chảy — live `setFlow` |
| `surge` | `number` | `0.5` | **Cường độ nguồn (master vật lý)**: 0 êm trong veo · 0.5 trung tính · 1 ồ ạt trắng xóa — live `setSurge` |
| `crestLength` | `number` | `1` | Dài đoạn mặt nước NẰM NGANG trên đỉnh (m, 0 = tắt) — structural |
| `crestDepth` | `number` | `0.08` | Độ sâu dòng mặt ngang (m) — drawdown võng về mép — structural |
| `crestSpeed` | `number` | `0.6` | Tốc chảy mặt ngang (× flow) — live `setCrestSpeed` |
| `crestRipple` | `number` | `0.5` | Gợn mặt ngang (0 = lặng gương) — live `setCrestRipple` |
| `crestAlpha` | `number` | `0.55` | Độ đặc mặt ngang (thấp = trong veo) — live `setCrestAlpha` |
| `streakScale` | `number` | `1.6` | Tile vệt theo bề ngang — live `setStreakScale` |
| `waterColor` | `ColorRepresentation` | `0x9fc6d8` | Màu nước (ám lên khúc xạ) — live `setWaterColor` |
| `foamColor` | `ColorRepresentation` | `0xf2fbff` | Màu foam/mist — live `setFoamColor` |
| `opacity` | `number` | `0.95` | Alpha màn (gần đặc — "trong" từ khúc xạ) — live `setOpacity` |
| `tint` | `number` | `0.35` | Ám màu lên khúc xạ — live `setTint` |
| `refract` | `number` | `0.6` | Méo khúc xạ theo vệt — live `setRefract` |
| `posterize` | `number` | `0` | Banding stylized (1 = 4 nấc RiME) — live `setPosterize` |
| `wobble` | `number` | `0.035` | Lắc mép dưới (m) — live `setWobble` |
| `bulge` | `number` | `0.045` | **Phồng 3D màn (m)** — WPO sin-noise cuộn xuống, 0 = phẳng — live `setBulge` |
| `mistCount` | `number` | `220` | Hạt mist (cap 600; splash = 45%; 0 = tắt) — structural |
| `mistIntensity` | `number` | `0.7` | Đậm mist/splash — live `setMistIntensity` |
| `footFoam` | `number` | `0.65` | **Vòng bọt loang chân thác** (0 = ẩn) — live `setFootFoam` |
| `glint` | `number` | `0.5` | **Lấp lánh** — đốm overbright lõi sợi (specular giả) — live `setGlint` |

`getGroup()` trả Group (sheet + crest + mist + splash) · `getTriangleCount()` = tri sheet (2880) · mọi
setter = uniform-cheap (KHÔNG rebuild/recompile — hợp đồng PERFORMANCE.md).

## Mặt ngang đỉnh (crest) — Phase A3.3

Đoạn nước **nằm ngang** chảy tới trước khi đổ (plane XZ trên nóc tường/vách, mép đổ tại z=0 khớp lip màn
rơi, kéo ngược về z=−crestLength). **Drawdown vật lý**: mặt upstream cao bằng `crestDepth` (độ sâu dòng)
rồi võng mượt về y=0 **đúng tại mép** — nước tăng tốc mỏng dần, nối liền màn rơi không hở. Dùng **chung
flow strip** với màn → tách dòng/tốc cột nối tiếp từ mặt ngang xuống màn; ăn theo master `surge` (êm =
lặng gương trong veo, ồ ạt = gợn trắng + sủi ở mép gãy). **KHÔNG khúc xạ** — "trong" bằng alpha thật nhìn
xuyên xuống đáy (rẻ hơn +1 copy framebuffer/frame, né rủi ro KI-014). +384 tri, +1 draw khi bật.

## Cường độ nguồn — `setSurge(v)` (Phase A3.2)

1 slider master mô phỏng **lưu lượng nguồn** (laminar → turbulent), đan vào 7 điểm shader bằng `mix()`
qua **điểm trung tính ×1 tại 0.5** (mặc định = đúng look đã tune, không phá):

| Điểm | Êm (0) | Ồ ạt (1) |
| ---- | ------ | -------- |
| Vùng glass từ lip | kéo sâu tới giữa màn, xóa ~90% trắng (trong veo) | co sát mép, gần tắt |
| Aeration (bọt sủi) | chỉ sát chân, nhạt | bốc cao gần tới mép, đậm |
| Vệt trắng | mờ ×0.4 | đậm ×1.6 |
| Méo UV toàn màn | phẳng lì ×0.5 | loạn ×1.5 |
| Lắc mép (wobble) | ×0.2 | ×1.8 |
| Vỡ hạt nền | 0 | surge > 0.65 tự đục alpha (phá cấu trúc) |
| Mist/splash | gần như tắt ×0.2 | mù mịt ×1.8 |
| Alpha màn | trong hơn ×0.7 | đặc hơn ×1.3 |

## Điều dòng — `setFlowProfile(samples)` (Phase A3)

Chia màn theo BỀ NGANG để **tách dòng** (khe hở) và tạo chỗ **cuộn xiết** — điều khiển qua strip
`DataTexture` 64×1 RGBA sample theo `uv().x` (R = tốc cột/2 · G = mật độ · B = xiết). **LIVE**: mỗi lần gọi
chỉ ghi lại 256 byte texture — 0 rebuild, 0 recompile.

```typescript
import type { FlowSample } from 'threejs-modules/components/Waterfall'

// Mảng mẫu trải đều theo u∈[0..1], nội suy linear giữa mẫu; field thiếu = trung tính.
wf.setFlowProfile([
  { density: 1, churn: 0.8, speed: 1.5 }, // mép trái: dòng xiết chảy nhanh
  { density: 0 },                         //           khe — CẮT dòng (tách)
  { density: 1, speed: 0.8 },             // mép phải: dòng êm chảy chậm
])
wf.setFlowProfile([]) // reset về dòng đều
```

| Kênh | Tác dụng trong shader |
| ---- | --------------------- |
| `speed` [0–2] | Nhân tốc cuộn vệt PER-CỘT — ranh nhanh/chậm tự "xé" vệt như thác thật |
| `density` [0–1] | Gate alpha màn (smoothstep mép mềm) — 0 = khe hở, tách thành nhiều dòng |
| `churn` [0–1] | Khuếch đại méo UV (cuộn xoáy) + sủi foam trắng cục bộ |

**Giới hạn (chấp nhận, tier B):** ① xiết là hiệu ứng FRAGMENT (méo + foam) — không đổi hình học màn
(sample texture ở vertex stage WebGPU cần `textureSampleLevel`, chưa verify TSL tự hạ cấp); ② mist/splash
KHÔNG gate theo khe — sương chân thác vẫn trải đều bề ngang (thực tế cũng vậy); ③ tách dòng là CẮT alpha
trên cùng 1 mesh — các dòng vẫn chung arc; dòng bay tách hẳn quỹ đạo = chẻ geometry N ribbon (phase sau
nếu cần).

## Theo đoạn rơi — `setFallProfile(samples)` (Phase A3.1)

Đối xứng với điều dòng ngang: strip **DỌC** 64×2 sample theo `1−uv.y` (mẫu`[0]` = đỉnh/lip → mẫu cuối =
chân, nội suy linear giữa mẫu → chuyển tiếp mượt giữa đoạn). LIVE — ghi 512 byte texture, 0 rebuild.

```typescript
wf.setFallProfile([
  { opacity: 0.7, gloss: 0.8 },            // ĐỈNH: trong + láng gương (nước mới rời mép còn phẳng)
  { noise: 0.4 },                          // GIỮA: nhiễu loạn dần
  { haze: 0.8, breakup: 0.7, opacity: 1 }, // CHÂN: bụi tán + vỡ hạt răng cưa
])
```

| Kênh | Tác dụng trong shader |
| ---- | --------------------- |
| `opacity` [0–1] | Nhân alpha màn per đoạn (độ trong suốt) |
| `gloss` [0–1] | Sheen trắng sáng theo góc nhìn (fresnel boost) — look láng gương |
| `haze` [0–1] | Sương trắng mờ phủ ĐỀU đoạn (bụi nước phân tán, không theo vệt) |
| `noise` [0–1] | Khuếch đại méo UV đoạn đó (cộng dồn với `churn` ngang) |
| `breakup` [0–1] | Đục thủng alpha ở vùng KHÔNG vệt — màn tách thành tia/hạt răng cưa, hết mượt |

Lab tab 🌊: section **"Theo đoạn rơi"** — chip Đỉnh/Giữa/Chân + 5 slider áp cho đoạn đang chọn.
"Gương" là sheen giả tier B (không reflector — xem mục dưới); phản chiếu cảnh thật = RTT, cố tình né.

## Công thức màn nước (đối chiếu khi tune)

1. **Texture vệt (A4)** — Canvas 2D 256×512: **Voronoi sợi** (lattice 12×4 → cell cao ~128px = sợi nước
   dài, hash theo chu kỳ → tự tileable 2 trục) + **value-noise 2 octave distort** (sợi cong vẹo) + độ đậm
   per-sợi theo cell id. Industry (Season/RealtimeVFX): chất "vón cục tơi" của nước đến từ CELL noise,
   không phải vạch kẻ. Chi phí: ~30–100ms JS per-pixel, BUILD-TIME mỗi structural commit.
2. **3 lớp cuộn** — A ×1 · B ×0.72 (đảo U) · C ×1.5 tile nhỏ; C sample trước làm UV-distort cho A/B.
3. **White mask** — vệt + aeration `(1−v)²` + fresnel (normal màn cong) + lip/foot band; posterize optional.
4. **Màu** — `mix( mix(khúc-xạ-méo, waterColor, tint), foamColor, white )` — màn gần đặc, "độ trong" đến từ
   ảnh backbuffer sau màn (`viewportSharedTexture`, +0 pass — cùng kỹ thuật WaterSurface).
5. **Wobble + Bulge (A4 WPO)** — positionNode: lắc mép dưới theo sin(v, x, t) + **phồng 3D** = sin 2 octave
   THUẦN MATH cuộn xuống (không sample texture ở vertex stage — bẫy textureSampleLevel), neo lip, biên độ
   ăn theo `surge` (êm = phẳng lì, ồ ạt = cuồn cuộn). Normal KHÔNG tính lại sau displace (stylized chấp nhận).
6. **Chân thác (A5)** — vòng bọt loang: plane ngang từ đường chạm loang ra trước, texture đốm tròn blur
   (radial gradient, tileable 9-vị-trí) 2 lớp lệch tốc nhân nhau → blob tan/hợp như bọt thật; gate theo
   flow strip (khe cắt dòng bớt bọt); depthWrite=false + renderOrder 2 (nằm trên mặt hồ Phase B).
   **Lấp lánh**: lõi sợi sáng nhất → glint OVERBRIGHT cộng vào màu (fresnel × surge: êm/láng rõ, đục chìm)
   — gộp trong shader màn + crest, 0 draw thêm.
7. **Hạt** — InstancedMesh quad + SpriteNodeMaterial billboard; spawn/hướng/phase per-hạt sinh TRONG
   shader từ `instanceIndex + hash` (zero custom attribute — né luôn đường dispose-attribute từng nổ).
   ⚠️ KHÔNG dùng THREE.Points trên WebGPU: point luôn 1px, `pointUV` = WebGL-only, và PointsNodeMaterial
   offset clip-space theo position-attr (spawn ≠ 0 → hạt văng khắp màn — KI-013). Khúc xạ dùng
   `viewportTexture` per-instance, KHÔNG `viewportSharedTexture` (module-global đa-renderer — KI-014).

## Vì sao KHÔNG reflector (khác WaterSurface)

Màn thác đứng + sủi trắng → mắt không đọc phản chiếu; reflector chỉ đáng cho mặt nước NGANG. Bỏ reflector
= không thêm pass, không dính chuỗi bẫy KI-006/007/008/012.

## Transparent ordering (Phase B)

Sheet `transparent, depthWrite=true` (như WaterSurface — mặt nước đặc). Khi ráp cạnh mặt hồ: hồ vẽ TRƯỚC
(khúc xạ hồ cần backbuffer có đáy), thác vẽ SAU (`renderOrder` cao hơn). Mist/splash `depthWrite=false`.

## Dispose

```typescript
wf.dispose() // geometry + material (sheet/mist/splash) + CanvasTexture + gỡ group khỏi parent
```

## Liên hệ

- `components/WaterSurface` — mặt hồ ngang (reflector + refraction); thác đổ vào pond ở Phase B.
- Lab harness: `archplan/src/archplan/gui/waterfall-lab.ts` + `waterfall-preview.ts` (tab 🌊 Thác).
- Vách đá đỡ thác (điểm nhấn tĩnh) = Houdini bake — `deferred/systems/houdini-bake-accents.md`.
- Tham khảo industry: Cyanilux Waterfall Shader Breakdown · RiME waterfall (Math Roodhuizen) · Season (RealtimeVFX).
