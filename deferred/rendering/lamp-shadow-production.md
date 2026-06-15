# lamp-shadow-production — đèn đổ bóng ĐẦY ĐỦ (nhiều đèn) bằng ground-bake, làm gần production

> User chốt 2026-06-15: bóng đèn ĐẦY ĐỦ (mọi đèn, mọi mặt) **gác tới gần production** — lúc cảnh/đèn đã CỐ
> ĐỊNH + xác nhận (bake cần tĩnh; bake khi còn sửa = bake-lại liên tục, phí). Editor hiện chỉ giữ **1 bóng
> real bám đèn-đang-cầm** (`LAMP_SHADOW_N=1`, đủ để đặt đèn) — xem playbook `lighting.md`.
> **Revisit khi:** chuẩn bị render/xuất production công trình có đèn, hoặc cần nhiều đèn-bóng cùng lúc.

---

## Vì sao KHÔNG làm real-time nhiều đèn (bài học binding-limit, đã vấp 2026-06-15)

Point-shadow ăn **+1 sampled-texture +1 SAMPLER / đèn** ở fragment stage:
- **Texture**: nâng được → `main.ts` query adapter → `requiredLimits.maxSampledTexturesPerShaderStage`=adapter.max
  (máy này 48; clamp — máy chỉ-16 giữ mặc định). BaseWorld nhận opt `requiredLimits`. ✅ giải.
- **SAMPLER**: adapter thường **cap CỨNG 16, KHÔNG nâng** (warning không offer số cao hơn). Vật liệu nặng cảnh
  (ground mix + reflector + IBL + **sun-shadow=1**) đã ~14 sampler → **chỉ còn ~1-2 cho đèn**. >2 = pipeline VỠ
  (đen + texture-leak + camera đứng). Đây là RÀNG BUỘC PHẦN CỨNG, không vượt bằng code thường.
- Sun off (`intensity=0`, KHÔNG đổi castShadow) **vẫn giữ sampler** của nó (binding = compile-time, không theo
  intensity) → đêm không "trả slot" cho đèn. Giữ vậy CỐ Ý (toggle castShadow = recompile mọi NodeMaterial).

→ Nhiều đèn-bóng real-time là BẤT KHẢ trên trần 16. Phải **gộp về 1 sampler** = bake/atlas.

## 3 đường (so trade-off cho cảnh ta: WebGPU 0.174, đầy trong-suốt, live-edit, deploy GPU tạp)

| Đường | Sampler | Nhận bóng | Live | Đụng three-core | Ghi chú |
| --- | --- | --- | --- | --- | --- |
| **Ground-bake** ⭐ | **1** (gộp mọi đèn) | chỉ NỀN | bake (re-bake khi buông) | KHÔNG (1 RT pass) | **khuyến nghị production** |
| Fake-blob | 0 | chỉ nền | live | không | rẻ nhất, vệt tròn xấp xỉ (≠ silhouette) |
| Atlas/array | 1 | mọi mặt | live | CÓ (thay shadow node) | nặng, khoá version 0.174, cube point khó |
| Deferred | n/a | mọi mặt | live | viết lại pipeline | XUNG ĐỘT trong-suốt (nước/glow) — loại |

## Ground-bake — recipe (đường khuyến nghị)

= "lightmap chỉ-cho-NỀN, chiếu top-down thay UV2" (né UV2 = thứ giết lightmap trên geometry procedural-merged):
```
BAKE (1 lần, đèn/vật cố định):
  OrthographicCamera nhìn THẲNG XUỐNG trùm lô → render occlusion đèn (vật chặn sáng) → 1 texture world-XZ
RUNTIME:
  ground material: điểm nền (x,z) → đọc shadowTex[x,z] → nhân tối   (Y HỆT PhotoGround đọc albedo world-XZ)
```
- Gộp N đèn → **1 texture → 1 sampler** (hết trần 16). 0 UV2. Bóng silhouette THẬT.
- **Giới hạn:** chỉ NỀN nhận bóng (bóng leo tường / vật-trên-vật = không). Với đèn sân vườn (vật đứng trên đất)
  = phần thấy chính → chấp nhận.
- Editor live-edit: re-bake lúc **buông** đèn (1 RT pass, throttle), KHÔNG mỗi frame.
- An toàn version: chỉ RT pass + 1 texture, KHÔNG thay shadow node three (≠ atlas).

## Liên hệ
- Trạng thái editor hiện: `ArchPlanLab` pool N=8, `LAMP_SHADOW_N=1` (pool[0]=đèn active, bám click/kéo/slider,
  `_setActiveLamp`/`_orderedLampTips`). `requiredLimits` ở `main.ts`+`BaseWorld` (giữ cho +1 shadow-texture).
- Họ hàng render-core: [[tiled-lights-forward-plus]] (atlas point-shadow = cùng họ "tự viết shading TSL").
- Bake chung: `bake-procedural-to-texture.md` (cùng triết lý editor-procedural / production-bake).
- Memory: [[webgpu-cosmetic-flood-masks-fatal-errors]] (lỗi binding = chí mạng, ≠ cosmetic).
