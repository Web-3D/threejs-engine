# GPU-BUDGETS.md — Ngân sách GPU: **binding** (vừa/vỡ) vs **perf** (nhanh/chậm)

> **Tra khi:** gặp lỗi `exceeds the maximum per-stage limit` / pipeline VỠ (đen + texture-leak), hoặc cần
> hiểu sampler/texture/UBO/shadow ăn gì, hoặc tối ưu material/đèn. Ref greppable — nhảy thẳng `## N`.
>
> Vì sao tồn tại: vụ bật shadow đèn 2026-06-15 làm vỡ pipeline (vượt 16 sampler/stage) → đào ra mới thấy
> nhiều người (kể cả AI) **lẫn 2 ngân sách khác hẳn nhau**. File này tách rõ 1 lần, nhớ mãi.
> Anh em: `PERFORMANCE.md` (rebuild-cost live-edit) · `deferred/rendering/lamp-shadow-production.md` (ground-bake).
>
> **3 TRỤC đừng lẫn** (router đầy đủ §8): ĐEN+crash = **binding** (vừa/vỡ — đây §2) · chạy-ĐỀU-mà-chậm =
> **render-fps** (mỗi frame — đây §4) · chỉ-chậm-khi-**KÉO/SỬA** = **rebuild-fps** (`PERFORMANCE.md`, khác hẳn).

---

## 0. ⚠️ BẢNG NGÂN SÁCH TRẦN — TRA TRƯỚC KHI LÀM (bắt buộc)

> **Trước khi thêm BẤT KỲ feature đụng GPU** (đèn-shadow · texture/map mới · material-mix thêm lớp · render-pass/RTT
> · post-fx · instancing lớn): **(1)** xác định nó ăn ngân sách NÀO · **(2)** số HIỆN TẠI vs trần · **(3)** headroom
> còn lại · **(4)** **trình trade-off + đề xuất TRƯỚC khi code**. Đồng bộ luật per-phase-tradeoff-gate. Vượt binding
> = CRASH (đen), vượt perf = tụt fps — cả hai phải tính TRƯỚC, không phát hiện lúc đã code xong (vụ shadow 2026-06-15).

### Binding (vượt = CRASH đen + texture-leak) — per fragment stage
| Ngân sách | Trần | Dùng hiện tại (worst-case đã biết) | Headroom |
| --- | --- | --- | --- |
| **Sampler** | **16 — CỨNG, không nâng** | ~15 (mix 4-slot 13 + IBL + sun-shadow) | **~1** → đúng 1 đèn-shadow (`LAMP_SHADOW_N=1`) |
| Sampled texture | 16 → **48** (đã nâng, `main.ts requiredLimits`) | ~15 | dư nhiều |
| UBO | 12 | (chưa đo — đo khi nghi) | — |
| Color attachment (MRT) | 8 | 1 (forward) | deferred mới đụng |

### Perf (vượt = tụt fps) — từ `PERFORMANCE.md` + 3 quy tắc engine
| Ngân sách | Trần |
| --- | --- |
| Draw calls | **< 100** |
| Triangles | **< 500k** |
| Texture size | **≤ 2048²** |
| Texture read / fragment | watch — bombing 4× (PhotoGroundMix ~52 read) = chỗ ăn fps nền |
| Recompile NodeMaterial lúc kéo | **0** (cache material — `PERFORMANCE.md` P2) |
| Shadow depth-pass | autoUpdate=false + ít caster (point = ×6 mặt) |

→ Số "dùng hiện tại" = **worst-case đã biết**, đo lại khi scene đổi lớn. **Cập nhật bảng này khi thêm/bớt nguồn
ngân sách** (đèn-shadow, lớp mix, RTT, post-fx). Đây là bảng SỐNG, không phải snapshot 1 lần.

---

## 1. Cốt lõi — có HAI ngân sách, đừng lẫn

| | **BINDING-fit** (sampler thuộc đây) | **PERF-speed** |
| --- | --- | --- |
| Câu hỏi | "có **VỪA** pipeline không?" | "chạy **NHANH** không?" |
| Lúc nào | compile-time (lúc tạo pipeline) | runtime (mỗi fragment × mỗi frame) |
| Đo bằng | **SỐ binding** (đếm tài nguyên) | **KHỐI LƯỢNG** (số phép tính/đọc) |
| Vượt thì | **CRASH** — `CreateRenderPipeline` fail → đen + leak | **TỤT FPS** — vẫn chạy, chỉ chậm |
| Phụ thuộc value? | KHÔNG (cấu trúc, dù intensity=0 vẫn chiếm) | có (đọc nhiều/ít) |
| Tối ưu bằng | **GỘP/PACK** (atlas, array, ORM, dedup) | **GIẢM tap/mip/LOD**, mix-thay-branch |

> 1 câu: **binding = "vừa hay vỡ", perf = "nhanh hay chậm".** Sampler khiến CRASH vì là *binding*; thứ thật sự
> ăn fps của nền ta là **số lần ĐỌC texture**, không phải số sampler. Hai chuyện độc lập.

---

## 2. Họ hàng của sampler — các BINDING limit per-stage (vượt = CRASH)

`GPUSupportedLimits` của WebGPU. Default = mức TỐI THIỂU spec đảm bảo; adapter có thể cao hơn (xin qua
`requiredLimits` — NHƯNG fail-cứng nếu xin quá adapter → phải clamp theo `adapter.limits`, xem `archplan/src/main.ts`).

| Limit | Default | Là gì | Nâng được? |
| --- | --- | --- | --- |
| `maxSamplersPerShaderStage` | **16** | **sampler** = "đầu đọc" texture (filter/wrap/compare) | thường **CỨNG 16** ⚠️ |
| `maxSampledTexturesPerShaderStage` | 16 | texture ĐỌC trong shader | thường được (máy ta 48) |
| `maxUniformBuffersPerShaderStage` | 12 | **UBO** — params material, mảng đèn, ma trận xương | tùy |
| `maxStorageBuffersPerShaderStage` | 8 | **SSBO** — data compute, instancing lớn | tùy |
| `maxStorageTexturesPerShaderStage` | 4 | texture GHI (compute pass) | tùy |
| `maxBindGroups` | 4 | số NHÓM binding/pipeline | hiếm đụng |
| `maxColorAttachments` | 8 | render target song song (**MRT** — deferred G-buffer đụng) | tùy |
| `maxVertexAttributes` | 16 | thuộc tính / vertex | hiếm |

**Vượt BẤT KỲ dòng nào → pipeline fail → đen + `[Budget] Texture leak` (vì frame lỗi lặp).** Giống hệt sampler.

> **Đếm theo TỪNG pipeline (mỗi material = 1 pipeline), KHÔNG cộng toàn-app.** Mỗi material chỉ kiểm
> sampler/texture của RIÊNG nó ở fragment stage ⇒ chỉ **pipeline NẶNG NHẤT vỡ trước**. Scene ta: `PhotoGroundMix`
> (~15, §6) = nặng nhất; nước/mái/building/đèn ít hơn nhiều, đếm RIÊNG (không gộp với ground). **NHƯNG shadow
> sampler dùng CHUNG mọi material lit** → +1 đèn-shadow = +1 cho **MỌI** pipeline lit, nên ground-mix 15→16 (vừa)
> →17 (vỡ). ⇒ Trần đèn-shadow thực = `16 − (sampler của pipeline nặng nhất)` = 1.

### Texture ≠ sampler (vì sao count lệch: vd 18 texture / 17 sampler)
- **Texture** = dữ liệu ảnh (mảng texel). **Sampler** = CÁCH đọc (linear/nearest · repeat/clamp · so-sánh-depth).
- Nhiều texture **cùng config đọc** → dùng CHUNG 1 sampler (dedup) → sampler ít hơn texture.
- **Shadow** dùng *comparison sampler* (kiểu riêng, so depth) → **KHÔNG dedup với sampler thường** → mỗi shadow +1 sampler riêng.

---

## 3. Cách ĐẾM + tối ưu mỗi loại binding

| Loại | Đếm sao | Đòn bẩy gộp |
| --- | --- | --- |
| **Sampler** | 1/đèn-shadow + (textures cùng-config gộp 1) | dedup config · **atlas/array** (N shadow → 1 sampler) · **ORM pack** |
| **Texture** | mỗi texture object 1 binding (bombing đọc 4× vẫn = **1** binding) | **ORM map** (ao+rough+metal → R/G/B của 1 texture, 3→1) · atlas · texture-array |
| **UBO** | mỗi uniform buffer 1 | gộp uniform vào ít buffer · **instancing** (1 buffer cho nghìn vật) |

> **ORM pack** = đòn lớn nhất cho ground: gộp ao/roughness/metalness vào 3 kênh 1 texture → giảm **2 texture +2 sampler / lớp**.

---

## 4. Ngân sách PERF — cái THẬT SỰ ăn fps (khác hẳn binding)

| Thứ | Cost | Tối ưu |
| --- | --- | --- |
| **Texture READ** (sample) | **Cao nhất** — bandwidth-bound | giảm tap (bombing 4→2) · **mipmap** (khử alias, đỡ supersample) · LOD-fade chi tiết xa |
| `pow / exp / log / sin` | ~4–8× một `mul` | polynomial approx · fold hằng ra CPU |
| **Branch** (if/else divergent) | GPU chạy **CẢ 2** nhánh | `mix()` / `step()` thay if |
| **Shadow depth-pass** | render lại scene từ đèn (**point = ×6 mặt**) | `shadow.autoUpdate=false` (vẽ 1 lần) · giảm caster · bake |
| **Overdraw** (trong suốt) | fragment vẽ chồng nhiều lần | sort, giảm lớp alpha, `discard` ít |
| **Recompile NodeMaterial** | 50–500ms freeze | cache material (xem `PERFORMANCE.md` P2) |

> Ví dụ ta: `PhotoGroundMix` **bombing 4 tap × 13 texture ≈ 52 read/fragment** — ĐÓ là chỗ ăn fps, KHÔNG
> phải 15 sampler. Sampler chỉ quyết "vừa pipeline".

---

## 5. Shadow ăn CẢ 2 ngân sách (case study: đèn point-shadow)

1 đèn `castShadow` tốn ĐỒNG THỜI:
- **Binding:** +1 sampled-texture (depth map) **+1 sampler** (comparison) ở fragment stage.
- **Perf:** +1 shadow render = N depth-pass (point-light = **×6 mặt cube**).

→ Vì thế chặn đèn-bóng bởi **CẢ** "vừa pipeline" (sampler) lẫn "đủ fps" (depth-pass). Atlas gỡ binding nhưng
KHÔNG gỡ perf; `autoUpdate=false` gỡ perf nhưng KHÔNG gỡ binding. Phải xử cả hai.

**Sun tắt KHÔNG trả sampler:** app tắt sun bằng `intensity=0` (giữ `visible`+`castShadow` → né recompile mọi
NodeMaterial). Binding = **compile-time** theo *đèn có mặt + castShadow*, KHÔNG theo intensity → sun đêm vẫn
giữ 1 sampler. Đổi `castShadow` runtime = recompile (đắt) → không đáng đổi 1 slot. Giữ tĩnh = ổn định (compile
1 lần cho worst-case sun-bật → toggle sun không bao giờ vỡ lại).

**Fix đã áp (2026-06-15):** `main.ts` query adapter → `requiredLimits.maxSampledTexturesPerShaderStage`=adapter.max
(clamp; máy chỉ-16 giữ mặc định) — texture **nâng được**. Sampler **CỨNG 16, không nâng** → cap `LAMP_SHADOW_N=1`
(1 bóng real bám đèn-đang-cầm). Bóng đầy đủ → ground-bake production (deferred).

---

## 6. Ví dụ thật — đếm 15 sampler của `PhotoGroundMix` (vật liệu nặng nhất scene)

Mix nền worst-case = BASE + 4 slot + mask vẽ:

| # | Sampler | Nguồn |
| --- | --- | --- |
| 1–4 | base **baseColor / normal / roughness / ao** | lớp nền (rough+ao CHỈ của base — "đỡ 8 tap") |
| 5–6 | slot1 **baseColor + normal** | lớp trộn 1 |
| 7–8 | slot2 baseColor + normal | lớp trộn 2 |
| 9–10 | slot3 baseColor + normal | lớp trộn 3 |
| 11–12 | slot4 baseColor + normal | lớp trộn 4 |
| 13 | **paint mask** (DataTexture, R/G/B/A = 4 slot) | mask vẽ tay |
| 14 | **IBL / environment** (RoomEnvironment PMREM) | phản chiếu môi trường (mọi material lit) |
| 15 | **sun shadow** (directional depth + comparison sampler) | mặt trời (mọi material lit) |

= **13 texture vật liệu + IBL + sun-shadow = 15**. +1/đèn-shadow → khớp log lỗi: N=1→16 ✅ · N=2→17 VỠ · N=4→19.
**Tùy số slot:** zone base+1 slot = 4+2+1 + 2(global) = **9** → nhẹ. Material compile theo số slot nó CÓ; 15 = trần xấu nhất.

---

## 7. Đòn bẩy tối ưu cho scene này (xếp lời/công)

| Đòn bẩy | Tiết kiệm | Loại | Sân |
| --- | --- | --- | --- |
| **ORM pack** ground (ao+rough+metal → 1 tex) | −2 sampler & −2 read / lớp | binding+perf | Factory ground |
| Giảm slot mix dùng (4→2) | −4 sampler & −16 read | binding+perf | dùng đúng nhu cầu |
| **mipmap** (KTX2 genmipmap) | −alias, −read xa | perf | ✅ đã làm |
| **LOD-fade** chi tiết xa (cỏ/foliage) | −read | perf | ✅ đã làm |
| bombing 4→2 tap | −26 read/fragment | perf | PhotoGroundMix tune |
| **atlas shadow** / ground-bake | gộp sampler shadow → 1 | binding | production (deferred) |
| **instancing** (gạch/cây) | −draw call & −UBO | binding(CPU)+perf | đã có chỗ |

---

## 8. ROUTER — triệu chứng → đọc đâu (đọc CÁI NÀY trước → nhảy 1 section)

| Triệu chứng | Trục | Đọc | Sửa bằng |
| --- | --- | --- | --- |
| **ĐEN** + `exceeds maximum per-stage limit` + texture-leak | **binding** (vừa/vỡ · compile-time) | đây §2 §3 §5 §6 | **GỘP/PACK** — ORM · atlas · giảm slot · requiredLimits |
| Chạy **ĐỀU mà chậm** (đông cảnh · nhiều texture-read · nhiều đèn-bóng) | **render-fps** (runtime · mỗi frame) | đây §4 §5 | **GIẢM** — tap/mip/LOD · mix-thay-branch · autoUpdate=false |
| Chỉ **chậm khi KÉO/SỬA** (slider/drag/toggle) | **rebuild-fps** (live-edit) | `PERFORMANCE.md` §2 | **DECOUPLE/CACHE** — group riêng · cache material · LOD · throttle |

- **Binding** = compile-time, đếm tài nguyên, sửa bằng **gộp**. KHÔNG phải fps.
- **Render-fps** = runtime mỗi frame, khối lượng đọc/tính, sửa bằng **giảm**.
- **Rebuild-fps** = chỉ lúc live-edit (dựng-lại nhiều/thường) → đẩy sang `PERFORMANCE.md`.
- **Shadow** = nạn nhân CỦA CẢ binding (+1 sampler) lẫn render-fps (×6 depth-pass).
- **Sampler cap 16 không nâng**; texture nâng được. Pack (ORM/atlas) = cách duy nhất tăng đèn-bóng mà không bake.
