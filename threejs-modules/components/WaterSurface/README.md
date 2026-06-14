# WaterSurface

Hồ/ao nước **phản chiếu gương thật** cho site-kit (anh em `GrassGround`, nhưng là **component** vì sở hữu mesh). Soi trời + nhà xuống mặt nước bằng `reflector()` node của Three.js (WebGPU), kèm gợn sóng thủ tục + fresnel + đốm nắng đổi theo mặt trời.

> ⚠ **Tier cao.** `reflector()` render lại scene mỗi frame vào một render-target → tốn ~1 render pass. Chỉ dùng cho 1–2 hồ, **không đại trà**. Mức rẻ hơn (không phản chiếu) → dùng material nước TSL thường.

## Cách hoạt động

1. **`reflector({ resolution: 1, bounces: false })`** — three dựng virtual-camera đối xứng qua mặt nước, render scene vào RTT (HalfFloat). ⚠ **`resolution` PHẢI = 1** trên three r174 WebGPU — `<1` làm RT reflector lệch kích thước với `viewportSharedTexture` (khúc xạ copy full drawing-buffer) → out-of-bounds crash (`KI-011`). RTT = **drawing-buffer × resolution** = full màn hình (tỉ-lệ-MÀN-HÌNH, KHÔNG theo diện tích hồ). `bounces:false` = render 1 lần/frame, né reflector-soi-reflector.
2. **Gợn sóng** — FBM 2 octave (4 lớp `triNoise3D`): octave lớn (tần 0.6×, sóng to) + octave chi tiết (tần 2.2× lệch, cuộn ngược 1.4× → phá tính đều) cuộn theo `uTime*uFlow` → `surfaceNormal` lắc quanh trục Y. **Không cần texture** → module tự chứa, copy ra dùng được ngay.
3. **Distortion** — `surfaceNormal.xz` dời `uvNode` của reflector + uv khúc xạ → mặt gương + đáy "rung" theo sóng.
4. **Khúc xạ (B)** — `viewportSharedTexture(viewportSafeUV(screenUV + lệch))` lấy cái-SAU-nước trong framebuffer (đáy/nền) → **nhìn xuyên thấy đáy, gợn sóng**. Ám về `waterColor` theo `tint` (absorption giả). Nước `transparent=true` (vẽ sau opaque → có đáy để khúc xạ).
5. **Fresnel (Schlick)** — `mix(refraction, reflection, fresnel)`: nhìn xiên (grazing) → gương; nhìn thẳng xuống → **xuyên thấy đáy**.
6. **Đốm nắng** — `reflect(-sunDir, normal)` chấm với hướng nhìn, mũ `shininess` → glint dịch theo `setSun(x,y,z)` (cùng pattern `GrassBlades`).

> Đáy hồ (basin) + khoét lỗ nền KHÔNG thuộc component này — site-kit (`site/render/fromState`) dựng từ `WaterConfig` (`depthY`, `bottomColor`). Component chỉ lo MẶT nước (reflect+refract).

## Usage

```typescript
import { WaterSurface } from 'threejs-modules/components/WaterSurface'

const water = new WaterSurface({ width: 12, depth: 9.6, baseY: 0.02 })
water.setSun(sunPos.x, sunPos.y, sunPos.z) // hướng glint
scene.add(water.getMesh())

// mỗi frame:
water.setTime(clock.getElapsedTime()) // sóng cuộn
// khi mặt trời đổi: water.setSun(sp.x, sp.y, sp.z)
```

Mesh tự nằm ngang trong XZ (`rotation.x = -π/2`) tại `baseY`. `reflector.target` được `add()` làm con của mesh → mặt phẳng phản chiếu **bám theo mesh** (xoay/dời mesh thì gương đi theo).

## Props

| Prop | Type | Default | Mô tả |
| ---- | ---- | ------- | ----- |
| `width` | number | `12` | Bề ngang hồ (m, X) |
| `depth` | number | `9.6` | Chiều sâu hồ (m, Z) |
| `baseY` | number | `0.02` | Cao độ mặt nước (m) |
| `waterColor` | ColorRepresentation | `0x254a59` | Màu nước (nhìn thẳng xuống); live `setWaterColor` |
| `sunColor` | ColorRepresentation | `0xffffff` | Màu đốm nắng glint |
| `reflectivity` | number | `0.35` | rf0 [0–1] — phản chiếu khi nhìn thẳng; live `setReflectivity` |
| `rippleScale` | number | `4` | Tần số gợn sóng (1/m) — THẤP = sóng to/thưa; live `setRippleScale` |
| `flow` | number | `0.4` | Tốc độ cuộn sóng (cần `setTime`); live `setFlow` |
| `distortion` | number | `0.4` | Cường độ rung gương + nghiêng normal; live `setDistortion` |
| `detail` | number | `0.4` | Biên độ octave-2 FBM (độ nhiễu/turbulence chi tiết) [0–1.5]; live `setDetail` |
| `refract` | number | `1` | Hệ số méo ảnh KHÚC XẠ (×distortion) [0–2] — gợn ảnh đáy nhìn-xuyên-nước; live `setRefract` |
| `shininess` | number | `100` | Độ gắt đốm nắng (mũ specular) |
| `alpha` | number | `1` | Độ mờ [0–1]; <1 = trong suốt |
| `resolution` | number | `1` | Tỉ lệ RTT — ⚠ **PHẢI = 1** (`<1` crash `KI-011`); KHÔNG hạ được để gạt cost |
| `points` | `{x,z}[]` (m, local) | `undefined` | Polygon mặt nước tự do (≥3 đỉnh) → `ShapeGeometry`; bỏ trống = chữ nhật. Đổi live: `setShape(points)` |
| `tint` | number | `0.4` | Ám màu nước lên ảnh khúc xạ [0–1] (absorption giả; cao = đục, đáy mờ); live `setTint` |

## Form tự do (polygon)

Mặc định mặt nước là chữ nhật (`PlaneGeometry` từ `width`×`depth`). Truyền `points` (≥3 đỉnh, mét, **local so tâm**) → dựng bằng `THREE.Shape` + `ShapeGeometry` (earcut). Mesh xoay −90°X (XY→XZ): đỉnh local `(x,z)` ↦ world `(x,z)` khi Shape point = `(x, −z)` (không mirror). Reflector + shader **không đổi** (vẫn mặt phẳng ngang).

```typescript
const w = new WaterSurface({ points: [ {x:-2,z:-1.5}, {x:2,z:-1.5}, {x:2.5,z:1.5}, {x:-2,z:1.5} ] })
// nắn live (kéo đỉnh editor): chỉ dựng lại geometry, GIỮ material + reflector (KHÔNG tốn RTT mới)
w.setShape(newPoints)
```

`setShape` dispose geometry cũ + gán mới vào mesh — rẻ, gọi được mỗi frame khi kéo đỉnh. <3 đỉnh → fallback chữ nhật.

## Gợn va chạm (impact ripple)

Khi **bất cứ gì chạm mặt nước** (giọt mưa, cá trồi/xác dập dìu, vật rơi…) → vòng sóng đồng tâm loang ra rồi tắt. Vì mặt nước **phẳng** (sóng nằm trong normal, KHÔNG displace đỉnh), gợn cũng **cộng vào normal** — reflection/refraction/fresnel tự gợn theo.

```typescript
// tại điểm (x,z) WORLD, biên độ strength 0..1 (caller tự quy từ kích thước/khối lượng/vận tốc)
water.emitRipple(worldX, worldZ, 0.4)
// 🏓 va chạm tại điểm LOCAL (so tâm hồ) — reflect=true (hồ CHỮ NHẬT) → thêm 4 vòng dội tường (ping-pong)
water.emitImpact(localX, localZ, 0.7, true)
water.setRippleAmp(0) // 🧊 TẮT toàn bộ gợn — mặt băng phẳng lì (đóng băng); 1 = bật lại
water.setSplashAmp(1) // 💦 "bắn tâm": dome lồi nẩy NGAY TÂM trước khi vòng tỏa (chung pool + rain); 0 = tắt
```

> **💦 Splash-core (bắn tâm):** ngay tâm va-chạm/giọt, TRƯỚC khi vòng tỏa, dome lồi nẩy lên rồi tắt nhanh (`setSplashAmp`, chung pool + rain-cell). Vẫn normal-only → "đọc ra nẩy" bằng ánh sáng. **Hạt nước dựng đứng + bụi tung tóe THẬT** không dựng được trong normal → dùng module bạn **`effects/SplashBurst`** (GPU sprite, gọi `burst(x,y,z,s)` kèm `emitImpact`).

> **🏓 Phản xạ tường (method of images):** `emitImpact(localX, localZ, s, reflect)` bắn vòng gốc + (nếu `reflect`) **4 vòng-ẢNH** = gương của điểm qua 4 tường (`±width/2`, `±depth/2`), strength ×`RIPPLE_REFLECT` (0.6). Ảnh xa hơn → wavefront tới TRỄ = **đúng quãng dội** (tự khớp, không cần timer). Chỉ chuẩn cho **hồ chữ nhật**; tròn/ellipse/free → `reflect=false`.

- **Pool 16 vòng** (`RIPPLE_SLOTS`) — CHỈ cho va-chạm RỜI (cá/vật; mưa-dày do lớp ambient rain-cell lo): mỗi `emitRipple` ghi 1 slot **xoay vòng** (uniform `vec4` = tâm X, Z, t0, strength) → bắn liên tục thì vòng cũ nhất bị đè. **0 CPU/frame** trừ lúc bắn (chỉ ghi 1 uniform); shader đọc `uTime` so với `t0`.
- Mỗi vòng: `front = d − age·SPEED` (loang ra 1.3 m/s) × dải sóng quanh front (smoothstep WIDTH) × tắt theo tuổi (LIFE ~2.6s) × `cos(front·WAVES)` (lăn tăn) → nghiêng normal **theo hướng ra tâm** (×`RIPPLE_AMP`). Tự tắt sau ~2.6s.
- **Biên độ theo vật chạm:** API chỉ phơi 1 núm `strength`; caller quy đổi (mưa ~0.3 · cá trồi ~theo size · vật to/nhanh → cao). `setRippleAmp` = núm tổng (×) — dùng để TẮT khi băng. Hiển thị qua fresnel + đốm nắng (độc lập distortion) + offset gương (×distortion).
- **Cost:** 16 slot × (~1 `cos` + 1 `sqrt` + 2 `smoothstep`)/fragment **mặt nước** (O(N) theo slot) — nhẹ. Build 1 lần ở constructor (`emitRipple` chỉ set uniform → KHÔNG recompile). Độ-dày-mưa KHÔNG còn dựa pool (ambient rain-cell lo) → pool gọn cho va-chạm rời.

## ☔ Ambient rain-ripple (hybrid — mưa dày phủ khắp)

Pool analytic ở trên hợp cho **va chạm RỜI** (cá/vật/giọt nhấn) nhưng tốn O(N) khi muốn rất dày. Cho **mưa nền phủ khắp** dùng lớp **thủ tục O(1)**: chia world-XZ thành **ô lưới**, mỗi ô tự phát 1 giọt loang theo `fract(uTime + hash(ô))` (lệch pha, tâm jitter), sample **2×2 ô/fragment** → vòng cắt biên ô vẫn liền, **phủ KHẮP mặt nước, mật độ vô hạn, chi phí CỐ ĐỊNH 4 ô** (không phụ thuộc số giọt).

```typescript
water.setRainWet(0.7) // ☔ cường độ mưa nền [0..1] — caller set = độ nặng mưa; 0 = khô (tắt lớp này)
// 6 tham số HÌNH-DẠNG live (đơn vị Ô — caller quy từ mm/density): cell · amp · rate · maxR(scope) · waves(k=2π/λ) · width(dải)
water.setRainCell(0.34) // cạnh ô (m) — nhỏ = mưa dày hơn
water.setRainAmp(1.4); water.setRainRate(1.3)
water.setRainScopeRange(0.21, 0.42) // 🎲 dải bán kính [min,max] (ô) — mỗi giọt RANDOM cỡ vòng trong dải; chặn ≤0.6
water.setRainWaves(22) // k = 2π/λ (ô); water.setRainWidth(0.12) // bề rộng dải = số-bước-sóng × λ
water.setRainGlint(3); water.setRainGlintSize(0.2) // 👑 đốm "vương miện" TIA SAO loé ngẫu nhiên tâm giọt: trần sáng + cỡ(×dải)
```

- Mỗi ô: `cycle = fract(uTime·RAIN_RATE + hash(ô))` (đời 1 giọt) → `front = d − cycle·RAIN_MAXR` (loang trong ô) × dải × `(1−cycle)` (giọt mới mạnh) × `cos` → nghiêng normal ra tâm. ×`uRainWet`.
- **Hybrid:** ambient lo nền-mưa-dày (rẻ) + pool 16 vòng lo va-chạm-rời (cá/vật). Mật độ mưa nền = `RAIN_CELL` (ô nhỏ = dày hơn), KHÔNG đụng `RIPPLE_SLOTS`.
- **🎲 Scope random + 📉 falloff:** mỗi giọt `maxR = mix(min,max, hash(drop))` (cỡ vòng to/nhỏ khác nhau mỗi chu kỳ, không cố định) — `setRainScopeRange`; biên độ × `oneMinus(smoothstep(0,maxR,d))` → **nhỏ dần khi lan ra xa tâm**. + 💦 splash-core (dome nẩy tâm, `setSplashAmp`).
- **👑 Đốm vương miện (`_rainGlint`):** loé sáng cộng `× sunColor` tại TÂM mỗi giọt lúc vừa đâm, cường độ NGẪU NHIÊN per-giọt (`pow(hash,3)` → đa số nhẹ, thi thoảng loé to = lấp lánh), **hình TIA SAO** (`atan2` + `cos(ang·rays)`, xoay ngẫu nhiên per-ô) thay hình tròn. `setRainGlint`(trần sáng [0–8]) + `setRainGlintSize`(cỡ ×dải [0.02–1]).
- **Cost:** 4 ô × 2 vòng-lặp (normal + glint) × (~`hash`/`sqrt`/`cos`/`atan2`/`smoothstep`)/fragment — rẻ hơn pool, **không tăng theo độ dày**.

## Performance

- **Reflector pass:** mỗi frame render lại scene qua virtual-camera → ~+1 render pass, draw calls vùng đó nhân đôi. Đây là cái giá của "gương thật".
- **Cost theo SỐ HỒ, KHÔNG theo diện tích:** RTT = `drawing-buffer × resolution` (tỉ-lệ-MÀN-HÌNH) + render TOÀN scene → **hồ to và hồ nhỏ tốn RTT Y HỆT**; 2 hồ ≈ 2× bất kể kích cỡ (2 hồ nhỏ > 1 hồ to). Phần THEO diện tích chỉ là **fragment fill-rate** (theo screen-coverage) — nhẹ hơn RTT nhiều. ⇒ Biển/hồ-lớn = 1 RTT + fill-rate cực-đại (full-screen) = **worst case planar**; muốn rẻ phải đổi NGUỒN phản chiếu (probe), KHÔNG phải thu nhỏ hồ.
- **Cần gạt:** ⚠ KHÔNG hạ được `resolution` (=1 cứng, `KI-011`). Đòn thật = **ít hồ planar hơn** (tier probe/LOD theo khoảng-cách: `deferred/rendering/water-reflection-probe-tier.md`) + `bounces:false` (đã mặc định) + tránh đặt hồ nơi nhìn thấy nhiều mesh nặng (cả đống bị render thêm lần nữa).
- **Fragment:** 4 `triNoise3D` (FBM 2 octave, sóng) + fresnel + specular — vẫn nhẹ so với reflector pass.
- **`forceUpdate=true` mỗi frame (BẮT BUỘC — né bug three) + shader tắt gương khi facing-away:** `ReflectorNode.updateBefore` set `_inReflector=true` (dòng 374) rồi reset SAU render (484); nhưng nhánh facing-away `if(isFacingAway && !forceUpdate) return` (401) thoát SỚM **bỏ qua reset** → `_inReflector` kẹt true → guard `if(bounces===false && _inReflector) return` (372) làm gương **chết VĨNH VIỄN** sau lần đầu camera chui dưới mặt nước. `forceUpdate=true` né nhánh 401 → luôn reset → không kẹt. Cái giá: khi camera DƯỚI mặt nước reflector render gương "từ dưới lên" SAI → **`_buildColor` tắt mượt** bằng `fres·smoothstep(0, 0.04, eye.y)`. ⚠ Phép thử PHẢI dùng **`eye.y`** (= dot eye với normal PHẲNG +Y), KHÔNG dùng normal SÓNG `dot(eye,n)` — normal sóng nghiêng ±21° theo XZ → phụ-thuộc-azimuth → mất gương ở vài góc quay ngang dù camera vẫn trên nước.
- **Tắt gương khi NHÌN GẦN THẲNG XUỐNG (top-down):** `fres·(1−smoothstep(0.97, 0.997, eye.y))`. Ở near-vertical virtualCamera reflector suy biến (`lookAt ∥ up`) → ảnh gương ĐƠ khi xoay azimuth. Fade về 0 ở elevation ~76°→86° → hiện khúc xạ (đáy hồ) thay ảnh đơ — top-down soi đáy hợp lý. Giữ gương cho mọi góc xiên thường. Kết quả: mọi góc TRÊN nước gương đúng+live; chui xuống dưới hiện khúc xạ (không ảnh sai, không đứng hình). `mesh.frustumCulled=false` chống freeze-do-cull khi pan.
- **⚠ ≥2 hồ phản chiếu cùng scene → gương ĐƠ (KI-012):** three reflector dùng cờ module-global `_inReflector` (`bounces:false`); hồ A render RTT lại render mặt nước hồ B → chen → B đơ (1 hồ thì ok). Fix: caller để mặt nước trên **layer riêng** (bật ở camera+raycaster để vẫn thấy/click) rồi gọi **`excludeReflectionLayer(layer)`** → `setTime` `virtualCamera.layers.disable(layer)` mỗi frame (vì `getVirtualCamera`=`camera.clone()` COPY layers) → reflector né mặt nước. `known-issues/KI-012`.
- **⚠ MSAA + post-AA:** renderer phải `antialias:false` — MSAA phần cứng làm GPU TỪ CHỐI reflector RTT pass (mất phản chiếu + flood WebGPU validation, `KI-007`). FXAA/PostProcessing-pass cũng **xung khắc reflector** trong WebGPU (đã thử & bỏ) → hiện **không post-AA** (chấp nhận răng cưa). Chi tiết + nguồn cộng đồng: `known-issues/KI-007`.

## Dispose

```typescript
water.setCamera(camera) // 1 lần sau khi tạo — cho dispose() giải phóng đúng RTT reflector
water.dispose()         // giải phóng geometry + material + RTT reflector (nếu đã setCamera)
```

⚠ **RTT reflector:** Three.js giữ RTT trong `WeakMap<virtualCamera, RenderTarget>` (virtualCamera lại trong `WeakMap<viewCamera, virtualCamera>`) và **không expose API dispose** — `material.dispose()` KHÔNG đụng tới → **leak GPU** (GC JS không free GPU mem). `dispose()` tự truy chuỗi `viewCam→virtualCameras→renderTargets→RT.dispose()` để giải phóng → **BẮT BUỘC `setCamera()` trước** (không set → RTT rớt cho GC = leak). Truy field nội-bộ three (fragile khi nâng version — `scan-versions.js` soi drift). Chi tiết: `known-issues/KI-006`.
