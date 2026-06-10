---
id: KI-014
title: viewportSharedTexture = 1 FramebufferTexture MODULE-GLOBAL — 2 renderer trong page giành nhau → flood copy-size + dispose nổ
category: shader
domain: thac-nuoc, pond
severity: high
status: fixed
when: ≥2 WebGPURenderer trong CÙNG page (editor chính + Lab preview) và ≥1 material dùng viewportSharedTexture ở renderer thứ 2 (canvas khác size)
where:
  - threejs-modules/components/Waterfall/index.ts (khúc xạ màn — ĐÃ đổi viewportTexture per-instance)
  - threejs-modules/components/WaterSurface/index.ts (refraction hồ — VẪN shared, an toàn khi chỉ editor render nó)
  - three/src/nodes/display/ViewportSharedTextureNode.js:7 (`let _sharedFramebuffer = null` — module-global)
discovered: 2026-06-10
fixed-in: (commit Waterfall A2 fix — chờ `1)
related:
  - ki:KI-012
  - ki:KI-013
tags: [viewportSharedTexture, viewportTexture, refraction, multi-renderer, lab-preview, framebuffer, webgpu]
---

## 1. Lỗi gì (triệu chứng)

Lab tab 🌊 (renderer WebGPU riêng) + editor chính cùng chạy: console **flood vàng**
`Texture copy range (copySize 2044×1408) touches outside of [Texture 1412×787] … [Invalid CommandBuffer
"renderContext_N"] … While calling [Queue].Submit` lặp mỗi frame; kèm **đỏ**
`Cannot read properties of undefined (reading 'destroy')` khi dispose material → rebuild thác fail → thác biến mất.

## 2. Khi nào & Ở đâu

Material thác dùng `viewportSharedTexture` cho khúc xạ, render trong **Lab preview** (canvas 1412×787)
trong khi **editor chính** (canvas 2044×1408) cùng page. 1 renderer thì không sao (WaterSurface ở editor
chạy shared nhiều tuần không lỗi).

## 3. Tại sao (root cause — verify đọc source three 0.174)

`ViewportSharedTextureNode.js` dòng 7: **`let _sharedFramebuffer = null` — biến MODULE-GLOBAL** — mọi node
instance, MỌI RENDERER trong page dùng CHUNG 1 `FramebufferTexture`. 2 renderer kích thước khác nhau thay
nhau resize/copy texture đó → copySize lệch với allocation → command buffer invalid (frame rụng) + backend
destroy trên resource trạng thái lẫn → `undefined.destroy`. **Cùng họ KI-012** (`_inReflector` module-global).

## 4. Sửa như thế nào

Đổi sang **`viewportTexture`** (per-NODE instance — doc node: *"creates an internal texture for each node
instance"*) → texture riêng, size theo đúng renderer đang vẽ nó. **Phải tự dispose**: giữ ref
`(node as {value: Texture}).value` → `dispose()` trong dispose chain (material.dispose KHÔNG đụng — texture
node sống ngoài material; không giữ = leak VRAM cỡ canvas mỗi lần rebuild). Cost: +1 bản copy framebuffer
riêng — chấp nhận cho module dùng trong preview đa-renderer.

## 5. Phòng tái phạm

- **Module có thể chạy ở renderer thứ 2 (Lab/preview) → MẶC ĐỊNH `viewportTexture`**, chỉ dùng
  `viewportSharedTexture` khi chắc chắn single-renderer (như WaterSurface trong editor).
- `viewportTexture` per-instance → **bắt buộc giữ ref texture + dispose** (thêm vào checklist dispose-pattern).
- Triệu chứng nhận diện: flood `copy range touches outside` với 2 size canvas khác nhau trong message =
  nghĩ NGAY tới shared-resource đa-renderer, đừng đổ cho resize.
- three hay giấu state module-global (`_inReflector` KI-012, `_sharedFramebuffer` KI-014) — gặp lỗi
  "chỉ-xảy-ra-khi-2-cái-cùng-chạy" → grep `let _` đầu file node liên quan.
