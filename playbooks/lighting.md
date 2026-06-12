---
domain: lighting
title: Ánh sáng môi trường — rig sun/hemi/IBL/sky + preset, tiến tới đèn fixture
status: seed
tier: A
modules:
  - archplan/src/archplan/scene/scene.ts
  - archplan/src/archplan/interaction/sunGizmo.ts
issues: []
updated: 2026-06-12
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

## 5. Lịch sử nâng cấp

- `2026-06-12` — Phase A: `fill` vào SunOpts + ENV_PRESETS (☀️🌇☁️🌙) + khay 🌅 utilTray + dock ☀ sync theo preset; chữa nền tổng tối (tier A)

## 6. Liên hệ

- **Modules:** `archplan/scene/scene.ts` · `archplan/interaction/sunGizmo.ts`
- **Phase B (kế):** đèn fixture parametric (LampConfig[] site-kit — trụ sân vườn/tường/dây) = prefab mesh + emissive + real light KHÔNG shadow, cap ~8–16, xa rớt emissive-only; >16 mới cần `TiledLightsNode` (examples/jsm, verified 0.174). IES: `src/lights/webgpu/IESSpotLight.js` ✓
- **Memory:** [[per-key-material-cache-tradeoff]] (vỏ đèn ăn material per-key)
