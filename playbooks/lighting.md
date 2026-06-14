---
domain: lighting
title: Ánh sáng môi trường — rig sun/hemi/IBL/sky + preset, tiến tới đèn fixture
status: building
tier: A
modules:
  - archplan/src/archplan/scene/scene.ts
  - archplan/src/archplan/interaction/sunGizmo.ts
  - threejs-modules/site/render/lamp.ts
  - threejs-modules/site/state.ts
issues: []
updated: 2026-06-14
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

## 5. Lịch sử nâng cấp

- `2026-06-12` — Phase A: `fill` vào SunOpts + ENV_PRESETS (☀️🌇☁️🌙) + khay 🌅 utilTray + dock ☀ sync theo preset; chữa nền tổng tối (tier A)
- `2026-06-13` — Sky bám preset: SkyGradient 1.1 `setOvercast` (trục u ám — xám + nuốt đĩa nắng, nền cho thời tiết) + `setDayOverride` (sun TẮT = trời đêm); `SunOpts.overcast` + slider ☁ khay 🌅
- `2026-06-13` — Thời tiết Phase A: module `effects/Precipitation` (mưa/tuyết field-paradigm) + tab 🧪 Lab ▸ 🌧️ Thời tiết (preview xoay-ngắm). CHƯA ráp scene (Phase B). Playbook MẢNG riêng tạo ở Phase B khi ráp thật.
- `2026-06-13` — Khay 🌅 redesign + 🌫️ Sương mù: layout DỌC 2 mục (Bầu trời / Thời tiết), slider CÓ NHÃN (Sáng nền/Mây mù/Sương mù · Nặng hạt/Cỡ hạt), dedupe icon (weather "tắt" ☀️→🚫). Thêm `SunOpts.fog` → `scene.fogNode` (density-fog, màu lerp xanh↔xám theo overcast + tối theo đêm); preset gắn fog (Trưa 0/Chiều .15/Âm u .35/Đêm .2/Bão .5)
- `2026-06-14` — **Phase B-đèn P1: đèn fixture trụ + tự-bật ban đêm.** `SiteState.lamps[]` (LampConfig x/z/height/color/intensity/range) + module `site/render/lamp.ts` (vỏ trụ+nón+bóng glow, trả LampTip cho editor) + GUI sub-tab 💡 Đèn (đa-instance Đ1/Đ2…, mirror Cầu). **Perf-an-toàn:** POOL N=8 `PointLight` editor tạo 1 LẦN (`castShadow=false`), gán N tip GẦN gốc nhất mỗi rebuild + bật/tắt bằng `intensity` (KHÔNG add/remove → né recompile); đèn xa cap = chỉ glow. **Tự đêm:** `_applySunToLamps` (cascade `_applySun`) — real-light intensity + bóng glow × `nightFactor`(1−day, hoặc 1 khi sun tắt), LIVE trên sun-drag. Bóng glow = `MeshBasicMaterial` editor-owned (lerp warm→tối, bơm qua `opts.lampGlowMat`). Hoãn P2: gán theo gần-CAMERA · đèn tường/dây · IES/spot · TiledLightsNode (>16) · `applyLampLive` (rebuild-chỉ-đèn) (tier A)

## 6. Liên hệ

- **Modules:** `archplan/scene/scene.ts` · `archplan/interaction/sunGizmo.ts` · `threejs-modules/effects/Precipitation` (mưa/tuyết)
- **Phase B-đèn:** ✅ **P1 XONG (trụ + tự đêm)** — `site/render/lamp.ts` + `SiteState.lamps[]` + pool N=8 `PointLight` editor (no shadow, gán N gần gốc, ×nightFactor) + GUI 💡 Đèn. **P2 (kế):** đèn tường/dây · gán theo gần-CAMERA · IES spot (`src/lights/webgpu/IESSpotLight.js` ✓) · `TiledLightsNode` (>16, examples/jsm 0.174) · `applyLampLive` (rebuild-chỉ-đèn cho kéo mượt)
- **Phase B-thời-tiết:** ráp Precipitation vào archplan (1 instance/scene) + preset 🌧️❄️⛈️ liên động `SunOpts.overcast` (bão = overcast 1 + mưa dày + gió mạnh + fill thấp). Phase C: streak mưa (Line), tuyết đọng mái, mưa gợn hồ, sét.
- **Memory:** [[per-key-material-cache-tradeoff]] (vỏ đèn ăn material per-key)
