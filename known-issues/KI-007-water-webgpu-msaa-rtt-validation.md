---
id: KI-007
title: WaterSurface reflect+refract bắn WebGPU validation errors (depth MSAA mismatch + copy out-of-bounds) → command bị từ chối + spike
category: shader
domain: pond
severity: high
status: mitigated   # antialias:false (archplan) CONFIRMED khôi phục phản chiếu + hết WebGPU error (2026-06-04). FXAA post pending cho cạnh. Gốc three reflector✗MSAA vẫn còn.
when: Scene có WaterSurface đang render (reflect `reflector()` + refract `viewportSharedTexture`). Lỗi bắn MỖI frame nước hiện — nhưng BỊ CHE tới khi console hết flood khác (sau vá KI-006 + contactQuad-normal) mới lộ. WebGPU cắt log ở "too many warnings".
where:
  - threejs-modules/components/WaterSurface/index.ts:145   # reflector({ resolution:0.5, bounces:false }) → RTT + depth
  - threejs-modules/components/WaterSurface/index.ts:41     # viewportSharedTexture (khúc xạ) — copy framebuffer
  - threejs-modules/utils/core/BaseWorld/index.ts:47        # ⚠ VERIFIED: new WebGPURenderer({ antialias: true }) = MSAA bật → gốc mismatch
discovered: 2026-06-04
fixed-in: —
related:
  - ki:KI-006
tags: [webgpu, msaa, reflector, viewportSharedTexture, rtt, depth, hdr, validation]
---

## 1. Lỗi gì (triệu chứng)

Console (DevTools) ngập **WebGPU validation errors** khi scene có hồ nước:

```
Sample count 16 of Texture (… Depth16Plus) doesn't match expectation (multisampled: 0)
  → While validating entries[1] … texture {sampleType: Depth, multisampled: 0}
  → While calling [Device].CreateBindGroup ([BindGroupDescriptor "bindGroup_object"])
Texture copy range (copySize height:736, depthOrArrayLayers:2) touches outside of
  [Texture (1421×540, RGBA16Float) mip 0 size depthOrArrayLayers:1]
  → While encoding CopyTextureToTexture(Dst, Src, Size)
  → While calling [Queue].Submit([[Invalid CommandBuffer from CommandEncoder "render(context_id"]])
[Invalid BindGroup "bindGroup_object" is invalid due to a previous error
WebGPU: too many warnings, no more warnings will be reported … for this GPUDevice
```

Kèm `[Violation] requestAnimationFrame handler took 57ms` (spike lẻ tẻ). **HỆ QUẢ NHÌN THẤY (user 2026-06-04):** nước **KHÔNG phản chiếu** bóng nhà/vật xuống mặt hồ — vì command buffer của reflector RTT bị GPU TỪ CHỐI (Invalid CommandBuffer → Submit fail) → RTT phản chiếu không ra → mặt nước chỉ còn khúc xạ (thấy đáy), MẤT gương. (Khúc xạ `viewportSharedTexture` vẫn ~ổn nên đáy vẫn thấy.) → KI này KHÔNG cosmetic: nó LÀM VỠ phản chiếu — tính năng chính của tier B/C.

## 2. Khi nào & Ở đâu

- **Trigger:** mỗi frame có `WaterSurface` render (reflect+refract). Không phụ thuộc kéo/sửa — là lỗi RENDER-time của pipeline nước, không phải rebuild.
- **Tại sao giờ mới thấy:** trước bị `TSL.NormalNode` flood (contactQuad thiếu normal) + KI-006 leak che; WebGPU lại cắt ở "too many warnings". Vá 2 cái kia xong → các error này lộ.
- **Ở đâu:** `WaterSurface/index.ts` — `reflector()` (RTT có depth) + `viewportSharedTexture` (copy framebuffer làm khúc xạ). Tương tác với **framebuffer chính** đang là MSAA (sample count) + HDR (`RGBA16Float`).

## 3. Tại sao (root cause — GIẢ THUYẾT, chưa verify đủ)

Hai validation fail RIÊNG, cùng gốc "RTT/viewport của nước không khớp framebuffer chính":

1. **Depth MSAA mismatch** — `reflector()`/pipeline bind 1 depth texture **multisampled (sample count 16)** vào slot kỳ vọng **non-multisampled** (`multisampled:0`). MSAA depth phải *resolve* trước khi sample như texture thường.
2. **Copy out-of-bounds** — `viewportSharedTexture` (khúc xạ) `CopyTextureToTexture` với `copySize height:736, layers:2` vào texture HDR `1421×540, layers:1` → vượt biên (sai cả chiều cao lẫn số layer).

**VERIFIED (2026-06-04):** renderer chính `BaseWorld:47` = `new WebGPURenderer({ antialias: true })` → **MSAA BẬT**. Khi MSAA bật, framebuffer + depth là multisampled; `reflector()` (three 0.174 WebGPU) bind/copy depth-RTT theo kỳ vọng **non-multisampled** → validation fail → command buffer invalid → reflector pass không submit được → mất gương. HDR `RGBA16Float` + copy 2-layer là biểu hiện cùng gốc MSAA pipeline. **CHƯA verify (bước test kế):** đặt `antialias:false` có (a) hết error + (b) phản chiếu hiện lại không — nếu CÓ = chốt MSAA là gốc.

## 4. Sửa như thế nào (status: open — hướng dự kiến + rủi ro)

Theo thứ tự ít-rủi-ro → nhiều:
1. **TEST gốc: `antialias:false`** — `BaseWorld:47` đang `antialias:true`. Đặt false (hoặc thêm option để ArchPlanLab opt-out, GIỮ default lõi) → reload → kỳ vọng: hết WebGPU error + **phản chiếu hiện lại**. Nếu đúng = chốt MSAA. Rủi ro: cạnh răng cưa (bù bằng FXAA/TAA post sau).
2. Nếu tắt MSAA khôi phục được mà muốn GIỮ AA: thêm **post-process AA** (FXAA/TAA) thay MSAA hardware → reflector hết xung khắc mà cảnh vẫn mượt cạnh.
3. Nếu là `viewportSharedTexture` (copy 2-layer): thử **bỏ khúc xạ tạm** (chỉ reflect) → hết copy-error → thủ phạm refraction copy; lấy nền-sau-nước cách khác (clamp copy theo size thật).
4. Kiểm tra **three 0.174** issues: `reflector` + MSAA đã biết lỗi chưa (`node_modules/three/src/nodes/…ReflectorNode.js`). Có thể là giới hạn version → nâng three / workaround.

⚠ Đừng "sửa mò" bằng đổi `resolution`/`bounces` — không phải gốc MSAA/copy.

## 5. Phòng tái phạm

- **Mọi RTT/viewport-copy node (reflector, viewportSharedTexture, post-FX) phải khớp framebuffer chính** về **sample count (MSAA) + format (HDR) + layer count**. Thêm 1 node loại này → kiểm tra console WebGPU validation NGAY (đừng để flood khác che).
- **Giữ console SẠCH để validation errors không bị "too many warnings" nuốt** — flood cosmetic (vd thiếu `normal` attribute) phải vá sớm, kẻo che lỗi GPU thật (chính KI này bị che bởi contactQuad-normal + KI-006).
- Khi thấy `Invalid CommandBuffer … Submit` → GPU đang TỪ CHỐI việc, không phải warning suông: truy ngược `While …` stack tới lệnh gốc (CreateBindGroup / CopyTextureToTexture).
