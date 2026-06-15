---
domain: lighting
title: Ánh sáng môi trường — rig sun/hemi/IBL/sky + preset, tiến tới đèn fixture
status: building
tier: A
modules:
  - archplan/src/archplan/scene/scene.ts
  - archplan/src/archplan/interaction/sunGizmo.ts
  - threejs-modules/site/render/lamp.ts
  - threejs-modules/site/lighting/SiteLightingSystem.ts
  - threejs-modules/site/lighting/BollardLights.ts
  - threejs-modules/site/lighting/StringLights.ts
  - archplan/src/archplan/lighting/LightingController.ts
  - archplan/src/archplan/lighting/FixtureDrag.ts
  - threejs-modules/site/state.ts
issues: []
updated: 2026-06-16
---

# Playbook — Ánh sáng môi trường

> **Ranh giới:** recipe + tầng + lịch sử. Chi tiết lỗi → `known-issues/`, API → module README.

## 1. Kết quả "hoàn chỉnh"

Một RIG thống nhất (mirror Unreal Environment Light Mixer): chỉnh 1 tham số chủ → cả bộ chuyển theo.
Nền tổng (mặt ngang xa hướng sun) không tối sầm; preset 1-nút đổi mood cả cảnh.

## 2. Recipe dựng

Rig = sun (DirectionalLight, shadow-caster DUY NHẤT) + HemisphereLight (fill có hướng) + IBL
(RoomEnvironment PMREM) + SkyGradient (backgroundNode). Mọi nguồn đổi sun đi qua `_applySun()` →
cascade grass-shadow/water-glint/sky/gizmo. Preset = `Object.assign(sunOpts, preset.opts)` — bảng
`ENV_PRESETS` ở `archplan/scene/scene.ts`, GUI = khay 🌅 (utilTray) + dock ☀ (gizmo kéo + slider).
Persist: localStorage `archplan:sun` (KHÔNG nằm trong design state → không đụng DESIGN_SCHEMA_V).

## 3. Tầng & toạ độ

Sun trên vòm bán kính 48m (`DOME_R`, elevation clamp 5–89°). Fill cho mặt NGANG = hemi+IBL — sun xiên
thấp thì mặt ngang gần như chỉ sống bằng fill: `hemi=(0.06+0.29·day)·fill`, `IBL=(0.05+0.25·day)·fill`
(`day` từ độ cao sun, fill default 1.5 — fill=1 là mức cũ từng gây tối).

## 4. Lỗi thường gặp

| Triệu chứng | Nguyên nhân (1 dòng) | Chi tiết & fix |
| --- | --- | --- |
| Nền tổng tối sầm, lô vẫn sáng | mặt ngang ăn fill bị bóp (≠ shadow-frustum — ngoài frustum trả sáng) | tăng `fill` (khay 🌅) |
| Toggle sun lag 1–3s | đổi `visible` đèn → WebGPU recompile MỌI NodeMaterial | giữ visible, set `intensity=0` |
| 🌙 Đêm mà trời vẫn xanh sáng | day-factor tính theo ĐỘ-CAO sun, không biết sun đã TẮT | `setDayOverride(0)` khi `enabled=false` |
| Bật shadow đèn → ĐEN + texture-leak + camera đứng | point-shadow = +1 **sampled-texture** +1 **SAMPLER**/đèn → vượt 16/stage → pipeline VỠ (chí mạng, ≠ cosmetic — [[webgpu-cosmetic-flood-masks-fatal-errors]]) | 2 lớp: (1) texture nâng được → `main.ts` `requiredLimits.maxSampledTexturesPerShaderStage`=adapter.max (clamp). (2) **SAMPLER cap CỨNG 16, KHÔNG nâng** → vật liệu nặng (mix+reflector+IBL+sun-shadow) ~14 → chỉ còn ~1-2 cho đèn → cap `LAMP_SHADOW_N=1` (1 bóng bám đèn-active, margin an toàn). Nhiều bóng = ground-bake (deferred `lamp-shadow-production.md`) |

## 5. Lịch sử nâng cấp

- `2026-06-12` — Phase A: `fill` vào SunOpts + ENV_PRESETS (☀️🌇☁️🌙) + khay 🌅 utilTray + dock ☀ sync theo preset; chữa nền tổng tối (tier A)
- `2026-06-13` — Sky bám preset: SkyGradient 1.1 `setOvercast` (trục u ám — xám + nuốt đĩa nắng, nền cho thời tiết) + `setDayOverride` (sun TẮT = trời đêm); `SunOpts.overcast` + slider ☁ khay 🌅
- `2026-06-13` — Thời tiết Phase A: module `effects/Precipitation` (mưa/tuyết field-paradigm) + tab 🧪 Lab ▸ 🌧️ Thời tiết (preview xoay-ngắm). CHƯA ráp scene (Phase B). Playbook MẢNG riêng tạo ở Phase B khi ráp thật.
- `2026-06-13` — Khay 🌅 redesign + 🌫️ Sương mù: layout DỌC 2 mục (Bầu trời / Thời tiết), slider CÓ NHÃN (Sáng nền/Mây mù/Sương mù · Nặng hạt/Cỡ hạt), dedupe icon (weather "tắt" ☀️→🚫). Thêm `SunOpts.fog` → `scene.fogNode` (density-fog, màu lerp xanh↔xám theo overcast + tối theo đêm); preset gắn fog (Trưa 0/Chiều .15/Âm u .35/Đêm .2/Bão .5)
- `2026-06-15` — **GUI hệ đèn (code3) + Focus (code1) + Move 🤚.** code3: sub-tab 💡 Đèn nâng thành Tabs LỒNG folder-style **gold/brass** (`ap-lamp-*`) — cấp NGOÀI = LOẠI đèn (🏮 Trụ sân; chừa 🔆 Hắt tường cho Phase 2 building-lights), cấp TRONG = instance Đ1/Đ2/＋ (`buildLampDomain` nested). code1 Focus: vỏ đèn bọc **1 group/đèn** (`lamp.ts`) tag `group.userData.lampRef` (mirror bridge) → `_tryClickLamp` raycast siteGroup → `navigateToLamp(idx)` (drawer Ground ▸ 💡 Đèn ▸ Trụ sân ▸ Đn). **Move**: `_tryStartLampDrag`/`_lampDragMove`/`_commitLampDrag` (mirror `_bridgeDrag`) — kéo `group.position` mặt-phẳng-ngang (0 rebuild), buông gập Δ vào `lamp.x/z` + `_applySite` (pool real-light gán tip mới), right-click trả gốc. Còn Pick/Paint chưa cần (đèn = SITE element, chỉnh qua GUI) (tier A)
- `2026-06-15` — **Live slider đèn + đèn ĐỔ BÓNG.** Live (`applyLampLive`, ctx): kéo slider Cao/X/Z/Tầm/Sáng/Màu cập nhật 3D NGAY — `tuneLampLive` (lõi `lamp.ts`) transform group+3 part (post scale.y theo H/baseH, cap/bulb dời Y) 0 rebuild + `_assignLampPool(lamps.map(lampTip))` recompute real-light/glow; THROTTLE `_siteRaf`, buông → `_applySite(true)` commit. Part tag `userData.lampPart`, `group.userData.lampH`. **Shadow:** `LAMP_SHADOW_N=1` — **1 bóng real bám đèn ĐANG cầm** (`pool[0]`=active: click-Focus/kéo Move/slider qua `_setActiveLamp`+`_orderedLampTips`; `_lampDragMove` cập nhật pool[0] XZ live → bóng theo lúc kéo). GUARD: castShadow set lúc TẠO + `autoUpdate=false` (vẽ lại khi rebuild/move/active-đổi) + map 512 + far 30m. **RÀNG BUỘC binding:** point-shadow +1 texture +1 **sampler**/đèn; texture nâng được (`main.ts` `requiredLimits`=adapter.max) NHƯNG **sampler cap CỨNG 16** → vật liệu nặng ~14 → đèn ≤1-2. Bóng ĐẦY ĐỦ (nhiều đèn/mọi mặt) = **ground-bake gác tới production** (deferred `lamp-shadow-production.md`) (tier A)
- `2026-06-15` — **Lighting Pattern Phase 0 + 🔦 đèn pha uplight (F1).** Hệ đèn fixture mới TÁCH RIÊNG khỏi god-module (NgQuan: "không cấy ghép / không gộp drawer"): lõi `site/lighting/SiteLightingSystem` (SpotLight **no-shadow** → **+0 sampler**; pure three, dispose đủ) + vỏ archplan `lighting/` — `LightingController` orchestrator + `LightPanel` float **MẶT RIÊNG** (ngoài drawer Ground) + `UplightDrag` (Move/Focus mirror SunGizmo) + `store` persist **`archplan:lighting`** (độc lập SiteState → né `state.ts` Factory). ArchPlanLab chỉ delegate (diff 45+/2-, wrapper `_lt*` giữ complexity ≤10, extract `_setupSceneInteractors`). Đèn pha tự sáng theo nightFactor (cascade `_applySunToLamps`). KHÔNG đụng pool point cũ — gộp Phase 3. **Đợt kế (light-types công nghiệp game verified 0.174 — Spot/IES/RectArea đều có `*Node` TSL):** F3 emissive+bloom · F2 bollard · F4 RectArea hắt tường · F5 IES · F6 gobo. (tier A)
- `2026-06-16` — **Lighting Pattern Phase 2 — 🌑 đèn ĐỔ BÓNG cho fixture (uplight + bollard).** Tận dụng headroom sampler **vừa cắt** (Factory hạ `MAX_MIX_SLOTS` 4→2 ⇒ ground worst 15→**11** ⇒ dư ~5 slot-shadow). `UplightConfig`/`BollardConfig` thêm `shadow:boolean`; lõi `_applyShadow` (spot-shadow, **`autoUpdate=false`** + map 512 + near/far + `needsUpdate` khi đổi/kéo — mirror pool đèn cũ `_configLampShadow`). **Ngân sách CHUNG `SHADOW_BUDGET=3`** (controller `_enforceShadowBudget`): tổng uplight+bollard bật bóng ≤3 (vượt → ép `shadow=false`, đèn vẫn sáng, mất bóng — KHÔNG vỡ binding). Tính: ground 11 + pool cũ 1 = 12, chừa 4 lấy 3 (margin 1 dưới trần 16); muốn 4 = bỏ pool point cũ (Phase 3). **GLOBAL**: spot-shadow = +1 sampler vào MỌI pipeline lit. GUI: `LightPanel` thêm hàng **toggle checkbox** (🌑 Đổ bóng) — bật quá trần tự bỏ tick (rebuild phản ánh budget). castShadow đổi = recompile → toggle là **commit** (hiếm), KHÔNG live-drag. Đèn dây = PointLight (×6 mặt) → **KHÔNG shadow**. Persist `shadow` trong store. ArchPlanLab **0 sửa**. Gates xanh. (tier A)
- `2026-06-15` — **Lighting Pattern Phase 1 — 🟡 bollard (F2) + 🎏 đèn dây emissive (F3, KHÔNG bloom).** 2 lõi sibling tự-chứa cắm vào pattern (KHÔNG đụng `SiteLightingSystem` đã commit): `BollardLights` (trụ thấp + SpotLight **rọi xuống** no-shadow, thân scale.y theo height) + `StringLights` (chuỗi bóng **emissive `MeshBasicMaterial toneMapped:false`** võng catenary giữa 2 cọc + 1 PointLight hắt nền; bóng = **InstancedMesh 1 draw** + tube). **Cả 2 +0 sampler** (no-shadow/emissive) → an toàn trần 16. Vỏ thống nhất: `UplightDrag`→**`FixtureDrag`** (interface `{pick,getBase,moveBase}` — 3 hệ xài chung qua adapter; đèn dây kéo **CẢ chuỗi** qua midpoint + dịch subgroup 0-rebuild) · `store` lên **3 nhóm** `{uplights,bollards,strings}` (back-compat array uplights cũ) · `LightPanel` **3 mục** dumb-renderer (PanelSection by-index, 0 `any`) · `LightingController` cầm 3 hệ + 3 drag. **String slider `liveDrag=false`** (rebuild geometry → cập nhật lúc buông). **ArchPlanLab 0 SỬA** (API controller giữ nguyên — surgical, né Factory hoover). **Bloom GÁC** → `deferred/rendering/future-postprocessing.md` (scene-wide, đụng render-loop main.ts Factory, perf always-on; emissive đã tự glow). Gates: tsc/eslint/check-perf xanh (0 warn lighting mới). (tier A)
- `2026-06-14` — **Phase B-đèn P1: đèn fixture trụ + tự-bật ban đêm.** `SiteState.lamps[]` (LampConfig x/z/height/color/intensity/range) + module `site/render/lamp.ts` (vỏ trụ+nón+bóng glow, trả LampTip cho editor) + GUI sub-tab 💡 Đèn (đa-instance Đ1/Đ2…, mirror Cầu). **Perf-an-toàn:** POOL N=8 `PointLight` editor tạo 1 LẦN (`castShadow=false`), gán N tip GẦN gốc nhất mỗi rebuild + bật/tắt bằng `intensity` (KHÔNG add/remove → né recompile); đèn xa cap = chỉ glow. **Tự đêm:** `_applySunToLamps` (cascade `_applySun`) — real-light intensity + bóng glow × `nightFactor`(1−day, hoặc 1 khi sun tắt), LIVE trên sun-drag. Bóng glow = `MeshBasicMaterial` editor-owned (lerp warm→tối, bơm qua `opts.lampGlowMat`). Hoãn P2: gán theo gần-CAMERA · đèn tường/dây · IES/spot · TiledLightsNode (>16) · `applyLampLive` (rebuild-chỉ-đèn) (tier A)

## 6. Liên hệ

- **Modules:** `archplan/scene/scene.ts` · `archplan/interaction/sunGizmo.ts` · `threejs-modules/effects/Precipitation` (mưa/tuyết)
- **Lighting pattern (đèn fixture MỚI):** `site/lighting/` (lõi `SiteLightingSystem` uplight · `BollardLights` · `StringLights`) + archplan `lighting/` (controller/panel + **`FixtureDrag` chung 3 hệ**) — **tách riêng**, persist `archplan:lighting` 3 nhóm. ✅ **F1 đèn pha · F2 bollard · F3 đèn dây emissive** (mặc định +0 sampler). ✅ **uplight/bollard ĐỔ BÓNG tuỳ chọn** (spot-shadow, ngân sách CHUNG `SHADOW_BUDGET=3`, controller cap — vượt ép tắt, không vỡ binding; đèn dây không shadow). Thêm fixture mới (F4 RectArea · F5 IES · F6 gobo) = **+1 lõi sibling** cắm vào pattern (mirror Bollard/String), **KHÔNG phình god-module**, vỏ tái dùng FixtureDrag/LightPanel/store. Bloom đèn-dây = gác (`deferred/rendering/future-postprocessing.md`). Pool point cũ gộp vào Phase 3 (giải phóng 1 slot-shadow → budget có thể lên 4).
- **Phase B-đèn:** ✅ **P1 XONG + GUI nested + Focus/Move + live slider + ĐỔ BÓNG** — `site/render/lamp.ts` (group/đèn, `lampTip`/`tuneLampLive`) + `SiteState.lamps[]` + pool N=8 `PointLight` editor (**castShadow=true, autoUpdate=false guard**, gán N gần gốc, ×nightFactor) + GUI 💡 Đèn (Tabs lồng gold). **P2 (kế):** đèn tường/dây (consumer #2, building-kit) · gán theo gần-CAMERA · IES spot (`src/lights/webgpu/IESSpotLight.js` ✓) · `TiledLightsNode` (>16, deferred `tiled-lights-forward-plus.md`)
- **Phase B-thời-tiết:** ráp Precipitation vào archplan (1 instance/scene) + preset 🌧️❄️⛈️ liên động `SunOpts.overcast` (bão = overcast 1 + mưa dày + gió mạnh + fill thấp). Phase C: streak mưa (Line), tuyết đọng mái, mưa gợn hồ, sét.
- **Memory:** [[per-key-material-cache-tradeoff]] (vỏ đèn ăn material per-key)
