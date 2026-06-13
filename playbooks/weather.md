---
domain: weather
title: Thời tiết — mưa/tuyết field + preset bão liên động sky
status: building
tier: A
modules:
  - threejs-modules/effects/Precipitation
  - threejs-modules/effects/SnowCover
  - threejs-modules/effects/WetGround
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
| Đổi mode lag giật | mode đổi = dispose + new (recompile, rain↔snow khác Line/Points) | chỉ khi BẤM nút, không kéo — chấp nhận |
| Mưa "trượt ngang" khi pan nhanh | trụ bám cam tịnh tiến cứng, cam nhanh hơn hạt | tăng radius / chấp nhận (archviz cam chậm) |

## 5. Lịch sử nâng cấp

- `2026-06-13` — Phase A: module `effects/Precipitation` (mưa/tuyết Points field, vertex-shader rơi) + tab 🧪 Lab preview (tier A)
- `2026-06-13` — Phase B: ráp scene archplan (1 instance) + hàng nút khay 🌅 (☀️🌧️❄️⛈️ + slider Nặng) + ⛈️ Bão combo liên động overcast SkyGradient; persist `archplan:weather` (tier A)
- `2026-06-13` — Precipitation 1.1: cỡ hạt GẦN camera = max, XA = min (×0.28) theo `distance()` shader (sizeAttenuation=false, tự clamp); default ×2 (rain 3.2/snow 8); slider 🔍 Cỡ hạt (× hệ số) khay 🌅
- `2026-06-13` — Phase C1: Precipitation 1.2 mưa = **LineSegments VỆT streak** (đuôi tại `tFall−streak/height` dọc quỹ đạo, snow giữ Points) + **⚡ sét flash** ⛈️ Bão (AmbientLight lóe, archplan, không đụng `_applySun`). Hoãn C2: tuyết đọng mái / mưa gợn hồ (tier A)
- `2026-06-13` — Phase C2: **❄️ tuyết đọng NỀN** module `effects/SnowCover` (overlay phẳng, opacity noise×accum mọc dần phủ kín; KHÔNG sửa material = an toàn building-kit/Factory) + ráp archplan (mode snow → ramp accum ~20s, dispose khi tắt). Hoãn tuyết-bám-MÁI (cần geometry mái/material) + mưa-gợn-hồ (đụng WaterSurface + Factory) (tier A)
- `2026-06-13` — Phase C2 wetness: **💧 nền ƯỚT** module `effects/WetGround` (overlay tối roughness-thấp phản chiếu scene.environment + vũng noise; KHÔNG sửa material) + ráp archplan (rain/storm → wetness ramp ~6s, NGÓT ~12s khi tạnh rồi dispose). Per-material wetness tường/mái = phối hợp Factory sau (tier A)

## 6. Liên hệ

- **Modules:** `threejs-modules/effects/Precipitation` (README — props/perf/paradigm)
- **Liên động:** [[lighting]] playbook — ⛈️ Bão áp `STORM_SKY` qua `_applyEnvPreset` (overcast SkyGradient)
- **Đã xong C1/C2:** streak mưa (LineSegments) · sét flash (AmbientLight) · tuyết đọng NỀN ([[SnowCover]]) · nền ƯỚT mưa ([[WetGround]] phản chiếu env)
- **Phase C còn (đụng vùng nhạy):** wetness tường/mái per-material (material per-key = Factory) · tuyết bám MÁI (geometry mái) · mưa gợn mặt hồ (WaterSurface reflector) · cỏ/cây nghiêng gió bão (GrassBlades wind)
- **Audio:** [[audio-web-procedural]] (deferred) — sấm đồng bộ `_updateLightning`, mưa/gió theo `_weather.mode`
