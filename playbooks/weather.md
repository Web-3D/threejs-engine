---
domain: weather
title: Thời tiết — mưa/tuyết field + preset bão liên động sky
status: building
tier: A
modules:
  - threejs-modules/effects/Precipitation
  - threejs-modules/effects/SnowCover
  - threejs-modules/components/WaterSurface
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
`archplan:weather`. Module `effects/Precipitation` (field-paradigm, xem README) dựng 1 instance/scene.
ArchPlanLab: `_applyWeatherState()` → `_applyWeather()` dispose+tạo lại Precipitation theo
`PRECIP_OPTS[effectiveMode]` rồi `setOpacity(heavy)`; `update(dt)` trong onUpdate.

**GUI = code3 nested-tab khay 🌅 ▸ Thời tiết** (`_wxTabs`, ui/Tabs): 🌧️ Mưa (tô xanh) | ❄️ Tuyết (trắng-xám).
Mỗi tab có toggle Bật + **bão riêng**: ⛈️ bão mưa (mode `storm`, trời TỐI `STORM_SKY` + sét) vs 🌨️ bão tuyết
(mode `blizzard`, trắng XÓA `BLIZZARD_SKY` + gió mạnh, KHÔNG sét). Model = `base` (none/rain/snow) + cờ
`rainStorm`/`snowStorm` → `_effectiveMode()` (5 mode). Bật loại này tự tắt loại kia (mode đơn).

**Gợn mặt hồ (mưa chạm nước)** = 2 lớp HYBRID trên `WaterSurface` (xem README — công thức): **(a) ambient
rain-cell O(1)** (lớp dày phủ khắp khi mưa — `setRainWet`=heavy; 6 slider tab Mưa ▸ ☔ Mưa nền) + **(b) pool
va-chạm rời** (`emitImpact`, nổ khi cá/vật chạm; phản xạ tường ping-pong cho hồ chữ nhật; 4 slider ▸ 🌊 Va chạm
+ toggle 🧪 Demo). Lab đẩy tham số mỗi rebuild: `_applyRainWet`/`_applyRainParams`/`_applyRippleParams`.

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
- `2026-06-13` — ↩️ **GỠ wetness**: thử module `effects/WetGround` (overlay tối phản chiếu env) + ráp archplan, nhưng hiện tượng nền ướt CHƯA đúng → NgQuan yêu cầu xóa, làm lại từng bước. Module + 6 móc ráp ArchPlanLab gỡ hết; giữ Precipitation + SnowCover. Wetness dựng lại từ đầu (tier A)
- `2026-06-13` — **code3 khay Thời tiết + 🌨️ bão tuyết**: GUI từ hàng-nút → nested-tab Mưa/Tuyết (ui/Tabs, `_wxTabs`); bão gộp từng tab — thêm mode `blizzard` (trắng xóa `BLIZZARD_SKY`, KHÔNG sét, KHÁC ⛈️ bão mưa). Model `base`+cờ `rainStorm`/`snowStorm` → `_effectiveMode` (5 mode). Persist mở rộng + migrate format cũ (tier A)
- `2026-06-13` — **🌊 Gợn mặt hồ (mưa-gợn-hồ XONG)** — hybrid 2 lớp trên `WaterSurface` (chi tiết README): **ambient rain-cell O(1)** (ô lưới hash-phase, sample 2×2, phủ khắp mật-độ-vô-hạn chi-phí-cố-định; `setRainWet`=heavy; 6 slider mm scope/lamda/size/số-bước-sóng/wave-spd/mật-độ) + **pool va-chạm rời** (`emitImpact`, event-driven — bỏ rain-spam + Tần suất; `RIPPLE_SLOTS` 50→16). **🏓 Phản xạ tường** = method of images (4 vòng-ảnh gương qua 4 tường rect, ảnh xa→tới-trễ=quãng-dội) + toggle 🧪 Demo va chạm. Kế: cá P3 gọi `emitImpact(reflect=rect)` (tier A)

## 6. Liên hệ

- **Modules:** `threejs-modules/effects/Precipitation` (README — props/perf/paradigm) · `components/WaterSurface` (README — gợn va-chạm pool + ambient rain-cell + phản xạ tường, công thức)
- **Liên động:** [[lighting]] playbook — ⛈️ Bão áp `STORM_SKY` / 🌨️ bão tuyết áp `BLIZZARD_SKY` qua `_applyEnvPreset`
- **Đã xong C1/C2:** streak mưa (LineSegments) · sét flash (AmbientLight) · tuyết đọng NỀN ([[SnowCover]]) · **🌊 mưa gợn mặt hồ** (hybrid ambient O(1) + pool va-chạm + 🏓 phản xạ tường, WaterSurface)
- **Phase C còn (đụng vùng nhạy):** nền ướt mưa (GỠ — NgQuan làm lại từng bước) · wetness tường/mái per-material (material per-key = Factory) · tuyết bám MÁI (geometry mái) · cỏ/cây nghiêng gió bão (GrassBlades wind) · **cá P3** trồi/xác gọi `emitImpact` (chờ Factory đóng PondFish)
- **Audio:** [[audio-web-procedural]] (deferred) — sấm đồng bộ `_updateLightning`, mưa/gió theo `_weather.mode`
