# WaterSurface — tier phản chiếu PROBE cho production web (thay planar reflector)

> Trạng thái: **PLANNED 2026-06-14** — đường perf nước THẬT cho production. Hiện `WaterSurface` dùng `reflector()`
> (planar, render lại TOÀN scene/frame vào RTT) = tier "Cao", đẹp nhưng đắt + bị khóa mọi hướng trim rẻ. Plan này
> thêm tier **PROBE** (cubemap update hiếm) làm DEFAULT production: xóa hẳn pass/frame, không đổi theo độ-đông-scene,
> port WebGL2 dễ. Tái dùng ~80% fragment hiện có. Revisit khi: bake site lên web product, hoặc cần ≥nhiều hồ/máy yếu.

---

## Bối cảnh — vì sao planar reflector sai cho production

`reflector()` ([components/WaterSurface](../../threejs-modules/components/WaterSurface/index.ts)) render **lại cả scene mỗi frame** vào RTT = ~2× scene. Với web (máy yếu/mobile/laptop tích hợp) là xa xỉ, và **càng thêm nhà/cây/cá càng nặng** (vẽ lại tất). Mọi hướng gạt rẻ đều **bị khóa** (verified 2026-06-14):

- **`resolution<1`** (rẻ nhất) → crash **KI-011**: `viewportSharedTexture` (refraction) copy full drawing-buffer trong pass reflector → out-of-bounds. Code ép `resolution:1`.
- **MSAA/post-AA** → **KI-007** (GPU từ chối RTT pass / flood validation).
- **Far-clip "chỉ soi N mét"** → **BẤT KHẢ THI**. Đọc `three/src/nodes/utils/ReflectorNode.js` `updateBefore`:
  ```js
  425  virtualCamera.near = camera.near;
  426  virtualCamera.far  = camera.far;                      // ⛔ ghi đè far ta set, MỖI frame
  429  virtualCamera.projectionMatrix.copy(camera.projectionMatrix); // ⛔ copy projection camera CHÍNH (far đầy đủ)
  ```
  Reflector clobber `far` + copy nguyên projection camera chính mỗi frame (chỉ sửa near-plane cho oblique). Set `vc.far` ở `setTime` vô nghĩa.
- **Layer-exclude** (loại cỏ/cá khỏi RTT) → **CHẠY ĐƯỢC** (`updateBefore` KHÔNG đụng `vc.layers`) nhưng chỉ chặn khi vật **độc quyền** trên layer bị loại (rời layer 0) → **rớt khỏi shadow map** (light cam ở layer 0) = mất bóng cỏ/cá. Surgery + đánh đổi cho lợi khiêm tốn → không đáng (đã từng wire `WATER_REFLECT_LAYER=1` cho KI-012 đa-hồ).

→ Reflector chỉ nên là **tier "Cao" desktop showcase**. Production cần nguồn phản chiếu khác.

## Mấu chốt — chỉ NGUỒN phản chiếu là đắt
Trong `_buildColor`, **chỉ `reflector()` (sm.rgb) là full-pass đắt**. Phần còn lại đều **rẻ, production-fine**: normal sóng FBM (`_surfaceNormal`), **khúc xạ screen-space** (`viewportSharedTexture` — sample backbuffer, +0 pass), fresnel, ripple pool, rain-cell ambient, splash, glint. → Lời giải = **thay nguồn phản chiếu, GIỮ phần kia**.

## Kiến trúc đề xuất — nước phân TIER

| Tier | Nguồn phản chiếu | Cost/frame | Dùng |
|---|---|---|---|
| **Probe (default web)** | Cubemap từ `CubeCamera`, update HIẾM/tĩnh | ~0 (amortize) | production, mọi máy |
| Cao (tùy chọn) | `reflector()` hiện tại (giữ nguyên) | +1 scene pass | desktop showcase, 1 hồ cận cảnh |
| Lite-lite (rẻ nhất) | Sample thẳng `SkyGradient` theo reflect-vector (KHÔNG probe) | ~0 | hồ không cần soi nhà |

**Thay trong `_buildColor`:** `mix(refr, sm.rgb, fres)` → `mix(refr, reflColor, fres)` với:
- Probe: `reflColor = <cube sample>(reflect(eye.negate(), n))` — sample cube render-target theo vector phản xạ.
- Lite-lite: `reflColor = skyNode(reflect(...))` (tái dùng `SkyGradient.getBackgroundNode` hoặc gradient theo reflect.y).

**CubeCamera (probe):** đặt tâm hồ, hơi trên mặt nước. `cubeCam.update(renderer, scene)` render 6 mặt → **chỉ gọi khi cần**: 1 lần lúc dựng (scene tĩnh) hoặc khi đổi mặt trời/đổi scene (cờ `dirty`). Amortize ≈ 0/frame. **Sky = `scene.backgroundNode` (SkyGradient, KHÔNG geometry)** → probe vẫn bắt được trời (đã verify cách dựng sky 2026-06-14). 1 probe **sky-dominant có thể CHIA chung mọi hồ** (rẻ nữa).

## ★ Quyết định TIER (NgQuan 2026-06-14) — áp triết lý "hero vs mass" của building cho hồ
Giống building (chỉ ~20% nhà có nội thất tương tác, còn lại khối rỗng) → áp y hệt cho hồ:
- **Mặc định MỌI hồ = probe** (cubemap chia chung, ~0/frame, scale khu phố vô tư).
- **~20% hồ "chính/hero" đánh dấu tay** → planar gương THẬT khi camera **tiến GẦN** (distance-LOD); xa = về probe.
- 80% còn lại = probe end-to-end (khối "rỗng").
- **KHÔNG auto-switch-planar cho mọi hồ** (né hitch mỗi-lần-lại-gần) — chỉ hero mới có planar.

**Hitch lại-gần hero** (planar compile lần đầu/hồ → cached sau): chỉ lần ĐẦU áp sát mỗi hero + số hero ít = bounded.
**Mitigate**: WARM shader hero lúc load (trong load-defer) → lại gần chỉ activate RTT, KHÔNG compile-freeze.

**Tách bạch 2 trục**: `dist-tới-camera` lái (a) LOAD reveal-order (gần trước, mọi hồ) + (b) runtime planar-trigger (CHỈ hero). Đồng bộ [[building-warehouse-pipeline]] (hero-procedural vs mass-baked) + [[neighborhood-block-assembly-lod]].

## ★ Biển + nhiều đảo cao (NgQuan 2026-06-14) — khi probe sky-dominant KHÔNG đủ
Biển MỞ = sky-dominant → probe chia-chung hoàn hảo. Nhiều ĐẢO CAO quanh biển = **nearby geometry** → shared sky-probe **SAI parallax**: cubemap coi mọi thứ ở ∞ → ảnh đảo lệch, không bám chân đảo, không trượt đúng khi camera dời; 1 probe tâm-biển → bờ xa soi đảo sai góc.
- **Cứu tinh: đảo STATIC → bake probe 1 LẦN → SỐ ĐẢO không thêm cost runtime** (chỉ bake-time + probe memory). Probe THẮNG ĐẬM planar ở đây: planar render lại MỌI đảo MỖI frame (50 đảo = 50× geo/RTT/frame); probe trả 1 lần.
- **Sửa parallax: box-projected cubemap** (parallax-corrected — ray ∩ bounding-box thay vì coi ∞) → đảo cự-ly hữu hạn bám đúng. Industry-standard (Source / Unity reflection-probe box projection). Runtime ~free. Nhiều cụm đảo rải xa → **multi-probe blend theo vùng** (vẫn bake-once).
- **Đảo on-screen + vật ĐỘNG (thuyền/người): SSR** (screen-space reflection) — đúng parallax + bắt vật động; off-screen → fallback cubemap. **Hybrid SSR + cubemap = công thức ocean chuẩn công nghiệp.**
- **Vùng lỗi KHU TRÚ:** ảnh đảo chỉ hiện ở **dải nước SÁT BỜ**; ra xa → grazing → fresnel cao → soi TRỜI. Probe-sai-parallax chỉ lộ ở near-shore band = đúng dải "hero" dành cho SSR/planar. Biển giữa vẫn probe sạch.
→ **Sea + đảo: probe box-projected bake-once (nền) + SSR/planar dải sát bờ.** KHÔNG planar full-screen. Càng nhiều đảo, probe-bake-once càng thắng. (Sea water-kind bậc 1-3 đã deferred ở fish-taxonomy.)

## Tái dùng (reuse map) — đập đi rất ít
- **GIỮ 100%:** `_surfaceNormal` (FBM normal), `viewportSharedTexture` refraction + tint, fresnel Schlick, `_rippleNormal` pool (+ RIPPLE_SLOTS 8), rain-cell ambient + glint + splash, `setSun`, toàn bộ config/state/parse/GUI, form tự do `points[]`.
- **THAY ~15–25 dòng:** nguồn reflection trong `_buildColor` + dựng `CubeCamera` thay `reflector()` trong constructor + `setTime`/update cadence.
- **ĐƠN GIẢN HƠN:** dispose — CubeCamera RT là explicit (`.dispose()`), KHÔNG cần chuỗi WeakMap nội-bộ-three như reflector (bỏ được `_disposeReflectorRT`, KI-006). Né luôn KI-007/011/012, bug `forceUpdate`/facing-away/top-down-đơ (toàn của reflector).

## Bẫy / quyết định phải chốt khi làm
1. **TSL cube-sample API** — verify node sample cube render-target theo vector trong three 0.174 (`cubeTexture` / `pmremTexture` / sample thủ công). **Grep `node_modules/three/src` trước khi code** (Verify Before Trust).
2. **Cadence update probe** — tĩnh (1 lần) vs sun-driven (cờ dirty khi `setSun` đổi đáng kể). Mỗi update = 6 mặt → đừng để mỗi frame.
3. **Probe KHÔNG soi vật ĐỘNG** (cá nhảy/người đi) + parallax gần đúng → OK cho hồ trang trí nhìn xiên/từ trên (sóng + khúc xạ che). Cần gương soi-động hoàn hảo → mới dùng tier Cao.
4. **Đa-hồ:** 1 probe sky-dominant chia chung (rẻ) vs probe/hồ (chuẩn parallax hơn). Bắt đầu = chia chung.
5. **Chọn tier:** option `reflectMode: 'probe' | 'planar' | 'sky'` hoặc gắn vào quality setting global. Default web = probe.
6. **WebGL2 fallback (nền tảng production):** probe + fragment thường **port WebGL2 dễ hơn nhiều** reflector. Quyết WebGPU-only hay có fallback là bài riêng nhưng probe mở đường.
7. **⚠ VERIFY RUNTIME:** TSL→WGSL compile lúc RUNTIME → `tsc/eslint/vite build` xanh VẪN có thể vỡ shader. **Bắt buộc soi `npm run dev` trước commit** — xem [[feedback-tsl-if-fn-gate-eager-material]] (đã vấp gate Fn 2026-06-13, đứng app).

## Industry signal
- Game/web: **reflection probe (cubemap, baked/periodic)** cho nước KHÔNG-hero; **planar reflection** dành hero/desktop; **SSR** ở giữa (artifact mép → ngại web). three's `Water` cổ điển dùng planar reflector+refractor (đẹp, đắt) — không scale web. → Probe = lựa chọn scale-web chuẩn.
- Khác với [[water-bottom-refraction]] (đã làm B = refraction, industry `Water2Mesh`): file đó về NHÌN XUYÊN ĐÁY (giữ nguyên), file này về NGUỒN PHẢN CHIẾU (đổi reflector→probe).

## Liên hệ
- [[water-bottom-refraction]] — refraction/đáy hồ (giữ 100% khi sang probe).
- [[material-roadmap]] — tier nước.
- `components/WaterSurface/README.md` §Performance — cảnh báo far-clip/If-gate (nguồn sự thật cạnh code).
- `known-issues/` KI-006/007/011/012 — toàn bug của planar reflector mà probe né được.
