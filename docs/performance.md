---
title: Production Performance — master reference + pre-deploy gate
---

# Production Performance — master + gate nghiêm ngặt

> **Trang CHÍNH về perf cho production.** Mục tiêu: ship sản phẩm chạy **60fps trên GPU YẾU/lạ**, vừa đẹp vừa
> tối ưu. Đây là **bản đồ + checklist** cắt-ngang mọi ngóc ngách; chi tiết từng trục → 3 doc sâu (router §0).
> Đọc TRƯỚC khi deploy + khi tối ưu production. Số liệu engine verify THREEJS r0.174 WebGPU (2026-06-16).

## 0. Trang này so với 3 doc sâu (đọc đúng chỗ, đừng trùng)

| Cần gì | Đọc |
|---|---|
| **Bức tranh production + checklist deploy + nooks rộng** | ← **trang này** |
| ĐEN/crash `exceeds per-stage limit` (sampler/UBO…) = **binding** | [GPU-BUDGETS.md](../GPU-BUDGETS.md) §0 §2 §8 |
| Chạy ĐỀU mà chậm = **render-fps** | [GPU-BUDGETS.md](../GPU-BUDGETS.md) §4 |
| Chỉ chậm khi KÉO/SỬA = **rebuild-fps** (editor live-edit) | [PERFORMANCE.md](../PERFORMANCE.md) + `node check-perf.js` |
| Texture/sampler/ORM sâu | [pbr-texture-maps.md](pbr-texture-maps.md) |

→ Trang này KHÔNG lặp chi tiết 3 doc trên — nó **gom toàn cảnh** + phần **production-only** (load/bundle/DPR/device-tier/đo-đạc) mà 3 doc kia không có, và là **gate cuối trước deploy**.

---

## 1. Tư duy PRODUCTION — khác hẳn editor

| | **Editor (Edition)** | **Production (Viewer/deploy)** |
|---|---|---|
| Phần cứng | máy bác — **kịch khung** | **GPU LẠ**: mobile, integrated, máy yếu |
| Sampler/binding | adapter max (có thể >16) | **coi 16 là sàn** (an toàn mọi máy) |
| Mục tiêu | chỉnh sửa thoải mái | **60fps ổn định + load nhanh + đẹp** |
| Đo cái gì | rebuild-fps khi kéo | **render-fps đều + startup + bundle + VRAM** |

**Frame budget:** 60fps = **16.6 ms/frame** · 30fps = 33 ms. Trong đó GPU **và** CPU phải CÙNG vừa — chậm 1 bên là tụt.
**CPU-bound hay GPU-bound?** GPU-bound: giảm độ phân giải (DPR) → fps tăng. CPU-bound: giảm DPR **không** đổi, nhưng giảm số object/draw-call/JS thì tăng. → §4 đo để biết.

**3 trục perf** (router đầy đủ [GPU-BUDGETS §8](../GPU-BUDGETS.md)): **binding** (vừa/vỡ, crash) · **render-fps** (mỗi frame) · **rebuild-fps** (live-edit). Production chủ yếu lo **render-fps + binding + load**; rebuild-fps là chuyện editor.

---

## 2. Bản đồ chi phí — MỌI nguồn ăn perf

| Nhóm | Ăn gì | Đòn bẩy chính | Sâu ở |
|---|---|---|---|
| **Draw call** | CPU (overhead/lệnh) | instancing · BatchedMesh · merge geometry · ít đổi material | §3.1 |
| **Geometry / tris** | GPU vertex + CPU cull | LOD · frustum/occlusion cull · poly budget · index buffer | §3.2 |
| **Texture / VRAM** | bộ nhớ + bandwidth + load | KTX2/Basis nén · mipmap · ≤2048² · atlas/array · ORM | §3.3 |
| **Fill-rate / overdraw** | GPU fragment | **DPR/resolution scale** · giảm lớp alpha · post-fx ít | §3.4 |
| **Shader** | GPU fragment | giảm tap/branch · mix-thay-if · LOD-fade | [GPU-BUDGETS §4](../GPU-BUDGETS.md) |
| **Lighting / shadow** | binding + GPU pass | autoUpdate=false · ít caster · atlas · bake | [GPU-BUDGETS §5](../GPU-BUDGETS.md) |
| **Post-processing** | GPU (1 fullscreen pass/effect + RT) | gộp pass · half-res · tắt trên low-tier | §3.4 |
| **Transparency** | GPU overdraw + sort | sort · giảm chồng · OIT (nặng) | §3.4 |
| **CPU / JS / GC** | main thread | KHÔNG `new` trong loop · pool · matrixAutoUpdate=false · raycast thưa | §3.5 |
| **Load / bundle / startup** | mạng + parse + transcode | code-split · lazy · draco/meshopt · nén · preload | §3.6 |
| **Binding limit** | compile-time (CRASH) | gộp/pack (ORM/atlas/array) | [GPU-BUDGETS §2](../GPU-BUDGETS.md) |

---

## 3. Chi tiết từng trục (production-focused)

### 3.1 Draw call & batching
- **Mỗi draw call = 1 lệnh CPU→GPU.** Trần production: **< ~100–200** (mobile thấp hơn). Nhiều object nhỏ = CPU-bound.
- **InstancedMesh**: N bản cùng geometry+material → **1 draw** (gạch, cây, cọc rào, đàn cá). Lớn nhất đòn bẩy.
- **BatchedMesh** (r0.174): nhiều geometry KHÁC nhau, cùng material → 1 draw + per-instance cull/LOD.
- **Merge** (`BufferGeometryUtils.mergeGeometries`) cho geometry tĩnh cùng material — nhưng mất cull riêng từng phần.
- **Ít đổi material/state**: gom theo material; mỗi đổi pipeline = state change. (Verify merge `=== null` — [PERFORMANCE.md P8](../PERFORMANCE.md).)

### 3.2 Geometry — LOD & culling
- **Poly budget production: < 500k tris** hiển thị (mobile ~100–150k). Đếm bằng `renderer.info.render.triangles`.
- **Frustum culling**: `object.frustumCulled = true` (mặc định) — ngoài khung không vẽ. Geometry merge to → bounding lớn → cull kém; cân nhắc chia.
- **LOD**: `THREE.LOD` đổi mesh theo khoảng cách; xa = ít tris. Foliage/cỏ dùng LOD-fade ([GPU-BUDGETS §7](../GPU-BUDGETS.md) ✅).
- **Occlusion**: WebGPU chưa có sẵn HW occlusion tiện; dùng phân vùng + manual cull cho scene lớn.
- **Index buffer** (`setIndex`) — dùng lại vertex, giảm vertex-shader work.

### 3.3 Texture / VRAM / loading
- **VRAM = tổng texel × 4 byte × 1.33 (mipmap).** 1 ảnh 2048² RGBA ≈ **22 MB** uncompressed → **đây là nơi ngốn bộ nhớ nhất**.
- **KTX2 / Basis nén GPU** (`KTX2Loader`): giữ nén TRÊN GPU (UASTC cho normal/data, ETC1S cho albedo) → VRAM giảm 4–8×. Kho ta đã có `.ktx2` ✅.
- **Mipmap bắt buộc** (KTX2 genmipmap ✅): khử aliasing + giảm bandwidth khi xa. Thiếu mip = nhấp nháy + đọc phí.
- **Resolution budget**: ≤ **2048²**; nhỏ hơn cho map ít quan trọng (ao/rough 1024). Đừng 4K trừ khi thật cần.
- **Atlas / texture-array**: nhiều texture nhỏ → 1 → giảm cả sampler lẫn draw ([pbr-texture-maps §8.2](pbr-texture-maps.md)).
- **ORM pack** (ao+rough+metal → 1) — [pbr-texture-maps §4](pbr-texture-maps.md).
- **Mesh nén**: `DRACOLoader` (geometry) + `MeshoptDecoder` — giảm size tải; transcode tốn CPU lúc load (1 lần).

### 3.4 Fill-rate, overdraw, DPR, post-fx
- **DPR (devicePixelRatio)**: `renderer.setPixelRatio(Math.min(dpr, 2))` — màn retina dpr=3 = **9× fragment**. **Cap 1.5–2**; đòn bẩy fill-rate **lớn nhất** cho mobile.
- **Dynamic resolution**: tụt fps → hạ render scale (render RT nhỏ rồi upscale). Xem §3.7.
- **Overdraw trong suốt**: nước/kính/particle vẽ chồng → giảm lớp alpha, sort đúng, `discard` ít.
- **Post-processing**: mỗi effect = 1+ fullscreen pass + RT (bloom/SSAO/SSR/DOF/TAA). Production: gộp pass (TSL chain), **half-res** cho bloom/SSAO, **tắt trên low-tier**. (WebGPU: `PostProcessing` từ `three/webgpu`.)

### 3.5 CPU / JS / GC
- **KHÔNG cấp phát trong render loop**: `new THREE.Vector3()`/array/object mỗi frame → GC stutter. **Tái dùng** scratch object ngoài loop.
- **Object pooling**: particle/mồi/cá — pool, không create/destroy liên tục.
- **`matrixAutoUpdate = false`** cho object tĩnh → bỏ tính ma trận mỗi frame (gọi `updateMatrix()` 1 lần).
- **Raycast** (click/hover) thưa + giới hạn `layers`/subset, KHÔNG raycast cả scene mỗi mousemove.
- **dispose discipline**: rời scene → dispose geometry/material/texture/RT (leak = chậm dần — [PERFORMANCE.md P7](../PERFORMANCE.md)).

### 3.6 Load / bundle / startup (PRODUCTION-only)
- **Bundle size**: cây Three.js + app. **Code-split** entry (Vite multi-page: editor nặng KHÔNG vào bundle viewer). Tree-shake — import đúng module.
- **Lazy load**: asset/feature không cần ngay → tải sau (post-fx, vùng xa, đàn cá lớn).
- **Asset nén + transcode**: KTX2/Draco/Meshopt — nhỏ khi tải, GPU/CPU giải nén. Gzip/Brotli ở server.
- **Preload thứ tự**: texture/mesh khung-hình-đầu trước; phần còn lại stream.
- **Startup ngân sách**: TTI (time-to-interactive) — đo bằng DevTools. Tránh compile MỌI NodeMaterial lúc khởi động (warm-up dần hoặc precompile pipeline quan trọng).

### 3.7 Adaptive quality (chạy mọi máy)
- **Device-tier**: dò `adapter.limits`/`navigator.hardwareConcurrency`/GPU string → high/mid/low → preset (DPR, post-fx on/off, shadow on/off, LOD bias, slot mix).
- **Dynamic resolution**: theo dõi frame-time, tụt → hạ render scale; ổn → nâng lại.
- Production = **degrade gracefully**, không cứng 1 cấu hình. Editor không cần (kịch khung).

---

## 4. ĐO — không đoán (đo trước, tối ưu sau)

| Công cụ | Cho biết | Dùng khi |
|---|---|---|
| **`renderer.info`** | `.render.{calls,triangles}` · `.memory.{geometries,textures}` · `.programs` | đếm draw/tris/VRAM-objects mỗi lúc |
| **DevHud** (project) | tex/draw/fps live trong viewer (`?hud`) | sanity nhanh runtime |
| **Chrome DevTools › Performance** | CPU main-thread, GC, long task, TTI; track GPU | tìm CPU-bound, stutter, startup |
| **Spector.js** | capture 1 frame: mọi draw call + state + texture | soi vì sao 1 frame nặng |
| **WebGPU timestamp query** | thời gian GPU từng pass (ns) | tách pass nào tốn GPU |
| **stats.js / rAF delta** | fps + frame-time ms | theo dõi liên tục |

**Phân biệt bound:** hạ `setPixelRatio(0.5)` → fps tăng nhiều = **GPU/fill-bound**; gần như không đổi = **CPU-bound** (giảm draw/JS).
**Test trên máy YẾU thật** (hoặc DevTools CPU throttle 4–6×, GPU mid-tier) — không chỉ máy bác.

---

## 5. Ngân sách production (mục tiêu số)

| Hạng mục | Mục tiêu production | Đo bằng |
|---|---|---|
| Frame time | ≤ **16.6 ms** (60fps) · low-tier ≥ 30fps | stats / delta |
| Draw calls | **< 100–200** | `renderer.info.render.calls` |
| Triangles | **< 500k** (mobile ~150k) | `renderer.info.render.triangles` |
| Texture | ≤ **2048²**, nén KTX2 | meta + `renderer.info.memory.textures` |
| Sampler/stage | **≤ 16** (sàn) | [GPU-BUDGETS §0](../GPU-BUDGETS.md) |
| VRAM textures | ngân sách theo target (mobile ~256–512 MB) | tổng texel × 4 × 1.33 |
| Bundle (viewer) | càng nhỏ — code-split | `vite build` report |
| DPR | cap **1.5–2** | `setPixelRatio` |

→ Số binding SỐNG (sampler hiện tại/headroom) ở [GPU-BUDGETS §0](../GPU-BUDGETS.md) — bảng đó là nguồn chân lý, đừng chép số vào đây.

---

## 6. ✅ CHECKLIST nghiêm ngặt — trước khi DEPLOY

Tick HẾT. Mỗi nhóm có doc sâu nếu cần đào.

**Binding (CRASH nếu vượt — [GPU-BUDGETS](../GPU-BUDGETS.md))**
- [ ] Pipeline nặng nhất (ground-mix) ≤ **16 sampler** tính theo **sàn 16** (không phải adapter editor)?
- [ ] Mọi feature đụng GPU đã qua bảng trade-off [GPU-BUDGETS §0](../GPU-BUDGETS.md) trước khi code?
- [ ] Texture đa-map đã ORM-pack chỗ đáng? ([pbr-texture-maps](pbr-texture-maps.md))

**Render-fps**
- [ ] Draw calls < ngân sách (`renderer.info`)? Instancing/batch chỗ lặp nhiều?
- [ ] Triangles < 500k? LOD cho chi tiết xa + foliage?
- [ ] DPR cap ≤ 2? Post-fx half-res / tắt được trên low-tier?
- [ ] Texture-read/fragment hợp lý (bombing tap, mip)? ([GPU-BUDGETS §4](../GPU-BUDGETS.md))
- [ ] Shadow: autoUpdate=false + ít caster?

**CPU / runtime**
- [ ] KHÔNG cấp phát object trong render loop (scratch tái dùng)?
- [ ] Object tĩnh `matrixAutoUpdate=false`? Pool cho particle/spawn?
- [ ] Raycast thưa + giới hạn subset?
- [ ] **Dispose chain đầy đủ** mọi GPU resource (đổi cảnh không leak)? ([PERFORMANCE.md P7](../PERFORMANCE.md))

**Memory / load**
- [ ] Texture nén KTX2 + mipmap? VRAM trong ngân sách target?
- [ ] Mesh nén (Draco/Meshopt) nếu lớn?
- [ ] Bundle code-split (viewer ≠ editor)? Lazy-load phần không cần ngay?
- [ ] TTI/startup chấp nhận được? Không compile-all-material lúc khởi động?

**Adaptive / thiết bị**
- [ ] Có device-tier preset (DPR/shadow/post-fx/LOD theo high/mid/low)?
- [ ] Dynamic resolution khi tụt fps?
- [ ] **Test trên GPU yếu/mobile thật** (hoặc throttle) — KHÔNG chỉ máy dev?

**Gate tự động**
- [ ] `node check-perf.js` xanh (merge-null, geo-uv, nodemat-in-builder)?
- [ ] `vite build` xanh + xem bundle report?

---

## 7. Liên hệ

| Doc | Vai trò |
|---|---|
| [GPU-BUDGETS.md](../GPU-BUDGETS.md) | binding (vừa/vỡ) + render-fps + router 3-trục + bảng số SỐNG |
| [PERFORMANCE.md](../PERFORMANCE.md) | rebuild-fps (live-edit) 8 bẫy + `check-perf.js` |
| [pbr-texture-maps.md](pbr-texture-maps.md) | texture/sampler/ORM sâu + survey chuyên ngành |
| `deferred/rendering/lamp-shadow-production.md` | ground-bake gỡ sampler cho production (deferred) |

---

## 8. Trạng thái (2026-06-16)

| Đã có | Chưa / deferred |
|---|---|
| KTX2 + mipmap (kho) ✅ · LOD-fade foliage ✅ · cache material (rebuild) ✅ · `MAX_MIX_SLOTS=2` ✅ · `check-perf.js` ✅ · DevHud ✅ · multi-entry editor/viewer ✅ | ORM-pack (đã thiết kế, chưa build) · device-tier preset · dynamic resolution · ground-bake shadow · đo VRAM/TTI thực tế · profile máy yếu |

> ⚠️ Bảng "đã có" = tính tới ngày trên. Số binding thực → [GPU-BUDGETS §0](../GPU-BUDGETS.md). Verify file/tool còn tồn tại trước khi tin.
