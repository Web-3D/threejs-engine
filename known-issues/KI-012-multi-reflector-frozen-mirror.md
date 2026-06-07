---
id: KI-012
title: ≥2 hồ phản chiếu → gương ĐƠ (RTT không cập nhật) mọi góc; 1 hồ thì ok
category: gpu-dispose
domain: pond
severity: high
status: fixed
when: Bật ≥2 WaterSurface (pool/pond, reflector bounces=false) cùng lúc — gương 1 (hoặc cả 2) đứng hình MỌI góc nhìn; 1 hồ thì bình thường. KHÔNG do terrain (tắt terrain vẫn bị).
where:
  - threejs-modules/components/WaterSurface/index.ts:161   # reflector({bounces:false})
  - archplan/src/archplan/ArchPlanLab.ts                    # _rebuildSite set layer + onInit enable camera/_ray
  - three/src/nodes/utils/ReflectorNode.js:372             # `if (bounces===false && _inReflector) return false`
discovered: 2026-06-07
fixed-in: "67050c5"
related:
  - ki:KI-006
  - commit:67050c5
tags: [reflector, mirror, water, pond, _inReflector, layer, multi-instance, nested-render]
---

## 1. Lỗi gì (triệu chứng)

Khi lô có **≥2 hồ phản chiếu** (pool/pond đều dùng `WaterSurface` reflector) bật cùng lúc → ảnh gương **đứng hình ("đơ")** ở MỌI góc nhìn (không chỉ top-down). Với **1 hồ** thì gương chạy bình thường. Độc lập terrain (tắt terrain vẫn bị) — KHÔNG phải bug terrain.

## 2. Khi nào & Ở đâu

Trigger: `renderWaters(site)` trả ≥2 → mỗi hồ 1 `WaterSurface` → mỗi cái 1 `reflector({ bounces:false })` ([WaterSurface/index.ts:161](../threejs-modules/components/WaterSurface/index.ts#L161)). three `ReflectorNode.js` (0.174).

## 3. Tại sao (root cause — verify, đã đọc three source)

three `ReflectorBaseNode.updateBefore` (bounces=false) dùng **biến MODULE-GLOBAL dùng chung MỌI reflector**: `_inReflector` + loạt temp (`_view`/`_normal`/`_target`…). Cơ chế:
- Hồ A.updateBefore: `_inReflector=true` (dòng 374) → `renderer.render(scene, virtualCameraA)` — **render LẠI cả scene** vào RTT.
- Scene đó **CHỨA mặt nước hồ B** → render B's water → kích `B.updateBefore` CHEN VÀO lúc `_inReflector===true` → dòng 372 `if (bounces===false && _inReflector) return false` → B bail.
- Re-entrancy + temp dùng chung giữa 2 reflector lồng nhau → RTT của B không được cập nhật đúng → **gương B đứng hình** (1 hồ thì không có ai chen → ok).

Đã verify: đọc `ReflectorNode.js` (372/401/484), `NodeFrame.updateBeforeNode` (retry khi return false), `updateReference` mặc định (`return this` → key riêng). Triệu chứng "2 hồ luôn bị, 1 hồ ok" do user cung cấp = khớp re-entrancy.

## 4. Sửa như thế nào

**Cho mặt nước KHÔNG xuất hiện trong pass phản chiếu** (commit `67050c5` + `fa562b5`/`f66bddf`):
- Mặt nước → layer riêng `WATER_REFLECT_LAYER=1` (`x.surf.getMesh().layers.set(1)` mỗi `_rebuildSite`).
- Camera chính + raycaster `_ray` (pick + water-drag raycast mesh THẬT) **`.layers.enable(1)`** (cộng dồn, vẫn hit layer 0) → vẫn THẤY + click/kéo được hồ.
- ⚠️ **MẤU CHỐT (fix đầu thiếu bước này → vẫn đơ):** `getVirtualCamera` = **`camera.clone()`** ([ReflectorNode.js:323]) → virtualCamera **COPY `layers` của camera chính** (đã bật layer 1) ⇒ virtualCamera VẪN render mặt nước. Phải **`virtualCamera.layers.disable(1)` MỖI FRAME** (sau khi nó được tạo ở render đầu): `WaterSurface.excludeReflectionLayer(1)` → `setTime` disable trên `_reflector.virtualCameras.get(_camera)`.
- Hệ quả: mất "nước-phản-chiếu-nước" (vốn không cần + né đệ quy reflector).

## 5. Phòng tái phạm

- **Mọi instance reflector dùng chung trong 1 scene → mặt phản chiếu phải ở layer mà virtual-camera reflector KHÔNG render.** Reflector three KHÔNG tự loại mặt nước khác khỏi RTT.
- Dời mesh sang layer ≠ 0 → PHẢI enable layer đó trên **camera chính + MỌI raycaster nhắm mesh đó** (water-drag raycast mesh thật, không qua pick-box) kẻo mất render/click.
- Liên quan dispose RTT reflector: [KI-006](KI-006-reflector-rtt-not-auto-disposed.md). Bug "đơ gương top-down/facing-away" (1 hồ) đã trị riêng bằng `forceUpdate` mỗi frame trong `WaterSurface.setTime` — KHÁC bug đa-hồ này (forceUpdate KHÔNG cứu vì dòng 372 nằm trước 401).
