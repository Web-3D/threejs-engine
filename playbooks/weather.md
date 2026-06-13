---
domain: weather
title: Thời tiết — mưa/tuyết field + preset bão liên động sky
status: building
tier: A
modules:
  - threejs-modules/effects/Precipitation
  - archplan/src/archplan/ArchPlanLab.ts
issues: []
updated: 2026-06-13
---

# Playbook — Thời tiết

> **Ranh giới:** recipe + tầng + lịch sử. Chi tiết lỗi → `known-issues/`, API → module README.

## 1. Kết quả "hoàn chỉnh"

Bấm 1 nút trong khay 🌅 → mưa/tuyết phủ quanh người xem; ⛈️ Bão đổi cả cảnh (trời xám đặc + mưa
dày + gió mạnh). Hạt rơi mượt, không pop, không tụt fps. Mode + độ nặng lưu qua reload.

## 2. Recipe dựng

Thời tiết = thuộc tính MÔI TRƯỜNG (như sun), KHÔNG vào design state — persist riêng localStorage
`archplan:weather` ({mode, heavy}). Module `effects/Precipitation` (field-paradigm, xem README) dựng
1 instance/scene. ArchPlanLab: `_setWeather(mode)` → `_applyWeather()` dispose+tạo lại Precipitation
theo `PRECIP_OPTS[mode]` rồi `setOpacity(heavy)`; `update(dt)` trong onUpdate. GUI = hàng nút trong
khay 🌅 (`_envWeatherRow`): ☀️Tắt/🌧️Mưa/❄️Tuyết/⛈️Bão + slider Nặng (opacity live). ⛈️ Bão = combo:
`_applyWeather('storm')` (mưa dày) + `_applyEnvPreset(STORM_SKY)` (overcast 1 + sun yếu — tái dùng
cơ chế preset sky, sync 2 slider fill/overcast).

## 3. Tầng & toạ độ

Precipitation phủ TRỤ bám camera (`cameraPosition` uniform): scene chính radius 30m, cột cao 28m, đáy
y=0 (nền editor). Hạt thuộc `this.scene` (không group con) — render cùng mọi vật, sau mặt nước trong
suốt nhờ depthWrite=false. Storm dùng cột cao 30m + radius 32 + gió 6.5.

## 4. Lỗi thường gặp

| Triệu chứng | Nguyên nhân (1 dòng) | Chi tiết & fix |
| --- | --- | --- |
| Đổi mode lag giật | mode đổi = dispose + new Points (recompile) | chỉ khi BẤM nút, không kéo — chấp nhận |
| Mưa "trượt ngang" khi pan nhanh | trụ bám cam tịnh tiến cứng, cam nhanh hơn hạt | tăng radius / chấp nhận (archviz cam chậm) |

## 5. Lịch sử nâng cấp

- `2026-06-13` — Phase A: module `effects/Precipitation` (mưa/tuyết Points field, vertex-shader rơi) + tab 🧪 Lab preview (tier A)
- `2026-06-13` — Phase B: ráp scene archplan (1 instance) + hàng nút khay 🌅 (☀️🌧️❄️⛈️ + slider Nặng) + ⛈️ Bão combo liên động overcast SkyGradient; persist `archplan:weather` (tier A)

## 6. Liên hệ

- **Modules:** `threejs-modules/effects/Precipitation` (README — props/perf/paradigm)
- **Liên động:** [[lighting]] playbook — ⛈️ Bão áp `STORM_SKY` qua `_applyEnvPreset` (overcast SkyGradient)
- **Phase C (sau):** streak mưa (Line — Points không stretch), tuyết ĐỌNG mái/nền, mưa gợn mặt hồ, sét flash, cỏ/cây nghiêng theo gió bão
