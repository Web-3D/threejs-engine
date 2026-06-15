# PERFORMANCE.md — Hợp đồng chống tụt-FPS (live-edit)

> **Hệ quy chiếu BẮT BUỘC khi thêm BẤT KỲ element live-editable mới** (slider/drag/toggle dựng lại hình).
> Đọc TRƯỚC khi code element mới. `node check-perf.js` duyệt các luật grep-được (gate). Phần kiến-trúc
> (không grep được) = checklist §3 do bạn + review tự gác.
>
> Vì sao tồn tại: tụt-fps lúc kéo **tái phát hoài** — mỗi lần thêm vật mới (hồ/cỏ/rào/cổng/ban công…) lại
> vấp đúng 1 trong 8 cái bẫy dưới rồi sửa tới lui. File này = "sửa 1 lần, nhớ mãi". Mỗi luật ↔ 1 KI đã trả giá.
>
> File này = **rebuild-fps** — chỉ tụt khi **KÉO/SỬA** (slider/drag/toggle dựng lại). 2 loại "chậm" KHÁC HẲN:
> tụt khi **chạy đều** (render mỗi frame · đông cảnh) = **render-fps** → `GPU-BUDGETS.md §4`; **đen +
> `exceeds maximum per-stage limit`** = **binding** (vừa/vỡ) → `GPU-BUDGETS.md` (§8 ROUTER phân 3 trục).

---

## 1. Mô hình tư duy

**Live-edit = rebuild.** Chi phí nằm ở **(a) DỰNG LẠI CÁI GÌ** và **(b) DỰNG BAO NHIÊU LẦN/GIÂY.**
Tụt-fps = rebuild **quá nhiều** (a) hoặc **quá thường** (b). 8 luật = 8 cách giảm (a)×(b).

3 nguồn "nặng" đắt nhất (đụng = freeze): **(1) recompile NodeMaterial/TSL** (50–500ms), **(2) reflector
RTT** (WaterSurface — +1 render pass + dễ leak), **(3) dựng geometry lớn** (vài k–chục-k verts + merge + GPU upload).

---

## 2. Danh sách lỗi + cách sửa (8 bẫy)

### P1 — Đổi-1-phần nhưng rebuild-TOÀN-BỘ subsystem  · KI-005
**Triệu chứng:** kéo slider của X (rào/cổng/cỏ) → cả nước/RTT cũng dựng lại → tụt fps + leak đỏ.
**Gốc:** X nằm trong chữ-ký dựng-lại chung (`siteSig`) → đổi X = đổi sig = rebuild mọi thứ trong sig.
**Sửa:** X sống trong **GROUP RIÊNG bền** + **dirty-check sig riêng** (`_fenceSig`/`_grassSig`); **LOẠI X khỏi
sig cha** (`{...site, grass3d:0, fence:0}`). Đổi X → chỉ `_syncX()` dựng lại X. Tiền lệ: cỏ, rào.

### P2 — NodeMaterial tạo-mới mỗi rebuild → recompile shader  · (slab, fence — session 2026-06-05)
**Triệu chứng:** kéo mượt với material phẳng, nhưng có texture (TexturedSurface/PhotoGround) thì khựng từng frame.
**Gốc:** `new TexturedSurface(...)` / `new MeshStandardNodeMaterial()` trong hàm build chạy mỗi rebuild →
NodeMaterial **compile lại node-graph → WGSL → pipeline** mỗi lần (50–500ms).
**Sửa:** **CACHE material** — tạo 1 lần (khi texture load xong / lab-lifetime), **inject** vào lõi
(`opts.fenceWallMat` / `ctx.slabTexMat`); lõi dùng lại, KHÔNG `new`, KHÔNG push dispose (caller sở hữu).

### P3 — Geometry nặng dựng-lại mỗi frame kéo
**Triệu chứng:** kéo element có geometry tốn (gạch-3D, stone coping 12k verts, ban công nhiều cylinder) → tụt.
**Gốc:** builder dựng full-detail geometry mỗi frame drag.
**Sửa:** **LOD** — lúc kéo (`_liveRebuild`/`plainWalls`) dựng **proxy RẺ** (box thay coping, 'solid' thay
metal-rail, tường phẳng thay brick), buông tay → full. Tiền lệ: walls `plainWalls`, ban công `'solid'`, stone→box.

### P4 — Live-drag đi qua path "làm-mọi-thứ"  · (gate — session 2026-06-05)
**Triệu chứng:** đã tách group + cache material mà KÉO vẫn tụt.
**Gốc:** handler kéo gọi path nặng (`applySiteLive` → `_renderSite` + `_previewRebuild` mini-WebGPU + readout +
`_syncGrass`…) — toàn thứ KHÔNG liên quan element đang kéo.
**Sửa:** **path live TỐI THIỂU** chỉ đụng subsystem đổi (`_applyFenceLive` chỉ gọi `_syncFence`). Soi windows:
chúng mượt vì rebuild qua path gọn (`buildLive` chỉ đụng building).

### P5 — Live update không throttle
**Triệu chứng:** input slider bắn nhiều event/frame → nhiều rebuild/frame.
**Sửa:** **rAF guard** ≤1 rebuild/frame: `if (this._raf) return; this._raf = requestAnimationFrame(...)`.
Slider: `input`→live(throttle, commit=false), `change`→commit(persist=true).

### P6 — Multi-instance: drag rebuild TẤT CẢ instance mỗi frame  · KI-009
**Triệu chứng:** 1 shape kéo mượt, nhiều shape kéo tụt.
**Sửa:** **split-render** — instance đang kéo → group riêng (translate/rebuild rẻ), instance khác → group static
(dựng 1 lần). `filter` param ở `renderBuildingState`.

### P7 — GPU resource không dispose → leak + chậm dần  · KI-006
**Triệu chứng:** dùng lâu càng chậm; reflector "chết"/leak đỏ.
**Sửa:** **dispose chain ĐẦY ĐỦ** mọi Geometry/Material/Texture/RenderTarget. `reflector()` RTT KHÔNG tự
dispose — chuỗi viewCam→virtualCameras→renderTargets→RT.dispose. Mọi class GPU có `dispose()` (skill dispose-pattern).

### P8 — Geometry custom "mất hình" + churn merge  · KI-004, KI-010
**Triệu chứng:** geometry tự-build mất hình ÂM THẦM / merge trả null / mất 1 mặt.
**Sửa:** (a) `mergeGeometries` LUÔN check `=== null` (trộn indexed/non-indexed → null, KHÔNG throw); đồng bộ
`.toNonIndexed()` 1 bên. (b) BufferGeometry tay cho NodeMaterial/WebGPU **PHẢI có `uv`** (thiếu = mất hình).
(c) winding theo trục khác nhau → verify pháp-tuyến-ngoài MỖI hướng.

---

## 3. CHECKLIST bắt buộc — thêm 1 element live-editable mới

Tick HẾT trước khi commit element mới (X = element):

- [ ] **P1 Decouple:** X có group riêng + `_xSig` dirty-check? X bị LOẠI khỏi sig cha?
- [ ] **P2 Material cache:** material texture/NodeMaterial của X được CACHE + inject (không `new` mỗi rebuild)?
- [ ] **P3 LOD:** kéo X có dùng proxy rẻ (box/solid/phẳng)? Buông → full?
- [ ] **P4 Minimal path:** slider/drag X gọi path live TỐI THIỂU (chỉ `_syncX`), KHÔNG path nặng chung?
- [ ] **P5 Throttle:** live update có rAF guard ≤1/frame? input=live, change=commit?
- [ ] **P6 Split (nếu multi-instance):** drag instance này KHÔNG rebuild instance khác?
- [ ] **P7 Dispose:** mọi GPU resource của X có trong dispose chain?
- [ ] **P8 Geometry:** merge check null + có `uv` + winding đúng? (→ `node check-perf.js`)

P1–P7 = kiến-trúc (review tự gác). P8 + một phần P2 = `check-perf.js` bắt được.

---

## 4. Máy duyệt — `node check-perf.js`

Quét `threejs-modules/**` + `archplan/src/**`, exit 1 nếu có **ERROR**. Luật:

| Luật | Mức | Bắt gì | Né sai |
| --- | --- | --- | --- |
| **MERGE-NULL** | error | `mergeGeometries(...)` gán biến KHÔNG check null trong ~8 dòng (P8/KI-004) | check `if(!x)`/`===null`/`?` |
| **GEO-NO-UV** | error | `new THREE.BufferGeometry()` có `setAttribute('position'` nhưng THIẾU `uv` (P8/KI-010) | thêm uv, hoặc `// perf-ok` |
| **NODEMAT-IN-BUILDER** | warn | `new (TexturedSurface\|PhotoGround\|*NodeMaterial\|NodeMaterial)` trong hàm `build*/_render*/_sync*/_rebuild*/make*` (P2) | cache+inject, hoặc `// perf-ok: <lý do>` |

**Suppress:** thêm `// perf-ok` (kèm lý do) trên CÙNG dòng hoặc dòng NGAY TRÊN → bỏ qua (đã cân nhắc, chấp nhận).
ERROR phải sửa hoặc suppress; WARN chỉ nhắc.

Chạy: `node check-perf.js` (sau khi thêm geometry/material mới — hoặc trong quality gate).
