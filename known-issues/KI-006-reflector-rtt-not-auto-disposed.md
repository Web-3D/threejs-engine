---
id: KI-006
title: reflector() RTT KHÔNG tự dispose → leak GPU mỗi lần WaterSurface bị dispose (material.dispose không đụng tới)
category: gpu-dispose
domain: pond
severity: medium
status: fixed
when: Mỗi lần dispose WaterSurface (sửa site → _clearSite dispose+tạo-lại nước; hoặc kéo nhà cũ rebuild nước/frame). RTT GPU rớt lại → textures count leo → RuntimeGuard "Texture leak?" đỏ.
where:
  - threejs-modules/components/WaterSurface/index.ts   # setCamera + _disposeReflectorRT (truy chuỗi WeakMap)
  - archplan/src/archplan/ArchPlanLab.ts               # _rebuildSite: surf.setCamera(this.camera) sau khi tạo
discovered: 2026-06-04
fixed-in: —
related:
  - ki:KI-005
  - memory:threejs-reflector-rtt-dispose
tags: [reflector, render-target, rtt, leak, gpu-dispose, weakmap, water, three-internals]
---

## 1. Lỗi gì (triệu chứng)

Hồ nước (`reflector()`) — mỗi lần `WaterSurface.dispose()` chạy → **RTT (render target) GPU KHÔNG được giải phóng** → `renderer.info.memory.textures` leo dần → RuntimeGuard cảnh báo `[Budget] Texture leak?` (đỏ). Per-frame churn (kéo nhà cũ rebuild nước mỗi frame) = leo nhanh = đỏ ngay; per-action (sửa site) = leo chậm.

## 2. Khi nào & Ở đâu

`material.dispose()` trong `WaterSurface.dispose()` KHÔNG đụng RTT của reflector. Mọi đường dispose nước (`_clearSite` qua siteShaders; rebuild site) đều rò 1 RTT. (Trước khi có site dirty-check KI-005, kéo nhà rebuild nước/frame → rò liên tục → "leak đỏ".)

## 3. Tại sao (root cause — đã verify đọc three 0.174)

`ReflectorBaseNode` (three `src/nodes/utils/ReflectorNode.js`) giữ RTT trong **`renderTargets: WeakMap<virtualCamera, RenderTarget>`**, mà virtualCamera lại trong **`virtualCameras: WeakMap<viewCamera, virtualCamera>`** (`virtualCamera = viewCamera.clone()`). Three **KHÔNG expose dispose** cho RTT này — header cũ của WaterSurface ghi "GC thu khi camera+node hết ref". NHƯNG **GC JS KHÔNG giải phóng GPU memory** → RTT thật sự rò. (Audit toàn repo: CHỈ WaterSurface dùng `reflector()` → lỗ hổng cô lập, không lan.)

## 4. Sửa như thế nào

Tự truy chuỗi 2 WeakMap nội-bộ rồi `RenderTarget.dispose()`:
1. `WaterSurface.setCamera(viewCamera)` — editor gọi 1 lần sau khi tạo (cần view-camera đang render).
2. `dispose()` → `_disposeReflectorRT()`: `vc = _reflector.virtualCameras.get(viewCam)` → `_reflector.renderTargets.get(vc)?.dispose()`. An toàn timing: RTT tạo lazy lúc render-đầu → chưa render thì `get()` undefined → bỏ qua (không có RTT nên không rò).
3. Cast `ReflectorBaseLike` (2 WeakMap không có trong .d.ts công khai).

PMREM env cùng họ: giữ ref `RenderTarget` (không chỉ `.texture`) → `rt.dispose()` cả wrapper.

## 5. Phòng tái phạm

- **Bất kỳ `reflector()`/`RenderTarget`/PMREM mới** → CHỦ ĐỘNG dispose RTT; ĐỪNG tin `material.dispose()`/GC lo (GC không free GPU mem). Class GPU phải nhận camera (hoặc cách khác) để dispose đúng RTT.
- **Truy field NỘI-BỘ three** (`virtualCameras`/`renderTargets`) = không-public-API → fragile khi nâng version. Dùng optional-chaining (`?.` → đổi tên thì im lặng về GC-leak chứ KHÔNG crash) + chạy `scan-versions.js` sau mỗi upgrade three để soi drift.
- **Verify bằng RuntimeGuard/DevHud:** ghi `textures` baseline → "tra tấn" đường dispose (sửa/xoá/reset ×N) → count phải về baseline. Per-frame leak tự cảnh báo; per-action leak phải nhìn count tuyệt đối (không "rising 3 frame" nên không auto-warn).
- Cùng họ KI-005 (cũng reflector RTT, nhưng góc "rebuild-churn").
