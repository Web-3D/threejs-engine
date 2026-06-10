# Waterfall

Thác nước stylized (tier B) theo công thức industry (RiME/Season) — **Phase A2**: màn nước = mesh cong +
**texture vệt nước** cuộn xuống **3 lớp** khác tốc độ + fresnel + **khúc xạ màn** + foam band; chân thác =
**mist** (bốc lên) + **splash** (bắn ngang) sprite mềm. **0 RTT, 0 asset** — texture vệt sinh 1 lần bằng
Canvas 2D. **3 draw call.**

```
lip (gốc group, y=0) ─┐ band trắng tràn mép → vùng "glass" trong veo
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
| `streakScale` | `number` | `1.6` | Tile vệt theo bề ngang — live `setStreakScale` |
| `waterColor` | `ColorRepresentation` | `0x9fc6d8` | Màu nước (ám lên khúc xạ) — live `setWaterColor` |
| `foamColor` | `ColorRepresentation` | `0xf2fbff` | Màu foam/mist — live `setFoamColor` |
| `opacity` | `number` | `0.95` | Alpha màn (gần đặc — "trong" từ khúc xạ) — live `setOpacity` |
| `tint` | `number` | `0.35` | Ám màu lên khúc xạ — live `setTint` |
| `refract` | `number` | `0.6` | Méo khúc xạ theo vệt — live `setRefract` |
| `posterize` | `number` | `0` | Banding stylized (1 = 4 nấc RiME) — live `setPosterize` |
| `wobble` | `number` | `0.035` | Lắc mép dưới (m) — live `setWobble` |
| `mistCount` | `number` | `220` | Hạt mist (cap 600; splash = 45%; 0 = tắt) — structural |
| `mistIntensity` | `number` | `0.7` | Đậm mist/splash — live `setMistIntensity` |

`getGroup()` trả Group (sheet + mist + splash) · `getTriangleCount()` = tri sheet (1280) · mọi setter =
uniform-cheap (KHÔNG rebuild/recompile — hợp đồng PERFORMANCE.md).

## Công thức màn nước (đối chiếu khi tune)

1. **Texture vệt** — Canvas 2D 256×512, ~150 vệt dọc fade 2 đầu, vẽ lặp ±w/±h (translate) → tileable 2 trục.
2. **3 lớp cuộn** — A ×1 · B ×0.72 (đảo U) · C ×1.5 tile nhỏ; C sample trước làm UV-distort cho A/B.
3. **White mask** — vệt + aeration `(1−v)²` + fresnel (normal màn cong) + lip/foot band; posterize optional.
4. **Màu** — `mix( mix(khúc-xạ-méo, waterColor, tint), foamColor, white )` — màn gần đặc, "độ trong" đến từ
   ảnh backbuffer sau màn (`viewportSharedTexture`, +0 pass — cùng kỹ thuật WaterSurface).
5. **Wobble** — positionNode lắc mép dưới theo sin(v, x, t).
6. **Hạt** — InstancedMesh quad + SpriteNodeMaterial billboard; spawn/hướng/phase per-hạt sinh TRONG
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
