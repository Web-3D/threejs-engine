# neighborhood-block-assembly-lod — quy hoạch khu phố N nhà: bake + instance + LOD

> User hỏi 2026-05-30: "bỏ vào quy hoạch khu phố thì cần bake ở bước cuối đúng ko?"
> Trả lời: bake giải **Triangle + Shimmer**, KHÔNG giải **Draw call**. Khu phố cần CẢ bake (per-house)
> LẪN instance/merge + LOD (block). Đây là production phase — **chưa làm**.
> Revisit khi: chốt xong vài kiểu nhà + muốn dựng khu phố thật trong World (BuildingFromPlan).

---

## 3 nút nghẽn — 3 cách giải khác nhau (đừng gộp vào 1 chữ "bake")

| Nút | Hiện trạng 10 nhà | Cách giải | Loại |
|---|---|---|---|
| **Triangle** (<500k) | brick-3d ~14k tris/tường × 10 nhà → vỡ | bake relief geometry → plane + normal/AO map | bake |
| **Shimmer xa** | shader procedural không mipmap → alias | bake procedural → texture mipmapped | bake → [[bake-procedural-to-texture]] |
| **Draw call** (<100) | mỗi tường geometry-material = 1 mesh, 40+ call | InstancedMesh (trùng kiểu) / merge (unique tĩnh) / **BatchedMesh (unique + động per-căn)** | gộp/nhân bản, KHÔNG phải bake |

→ Bake KHÔNG hạ draw call. Draw call phải instance/merge.

## ArchPlanLab = editor 1-nhà, KHÔNG phải tool quy hoạch khu phố

- Ground/grid lab 80×80m = 6400 m². 10 nhà (~lô 12×18m ≈ 216 m²) ≈ 2160 m² → đất thừa (~1/3). Area KHÔNG phải giới hạn.
- `ShapeInstance` (posX/posZ/rotY) thiết kế để ghép 1 nhà từ nhiều khối (L-shape), không phải quản lý N nhà.
- → Thiết kế từng căn riêng (Save mỗi nhà 1 design file), layout N căn ở **World/môi trường**.

## Pipeline production (industry: Cities Skylines / GTA = LOD prefab + instancing)

**Per-house (khi chốt từng căn — chỗ "bake"):**
1. Editor giữ procedural + geometry thật → live-edit (hiện tại).
2. Bake: brick-3d/wood relief + shader → plane + normal+rough+AO mipmapped. 14k→~12 tris, hết shimmer.
3. Ra "house asset" nhẹ, 2 LOD: gần=geometry thật, xa=baked-flat.

**Block (quy hoạch khu phố — KHÔNG bake, mà instance/batch/LOD):**
4. Trùng kiểu → `InstancedMesh` (1 draw call / N căn). Unique TĨNH hẳn → `mergeGeometries`.
   **Unique + cần transform/ẩn per-căn → `BatchedMesh`** (xem mục dưới — đường chính cho 50 nhà khác dạng).
5. LOD theo khoảng cách camera + occlusion culling (BatchedMesh có per-item frustum culling sẵn).

## BatchedMesh per material-key — đường chính cho N nhà KHÁC dạng (user chốt 2026-06-12)

> User: "sau này sẽ có khoảng 50 căn nhà khác dạng, không thể xài InstancedMesh được."
> Verified 0.174: `src/objects/BatchedMesh.js` ✓ + `src/nodes/accessors/BatchNode.js` ✓
> (TSL/WebGPU đọc `_matricesTexture`/`_colorsTexture` per-item qua `textureLoad`) — chạy đường WebGPURenderer.

**Insight then chốt: building-kit ĐÃ BatchedMesh-ready.** Output kit = geometry theo bucket material-key
(per-key material cache). Đó đúng là input BatchedMesh cần:

```
1 BatchedMesh per material-key (toàn cảnh) ← mỗi nhà addGeometry() bucket của nó
→ ~10 draw cho cả 50 căn; mỗi nhà = N geometryId có matrix riêng
→ kéo cả căn live (setMatrixAt) KHÔNG rebuild; ẩn/hiện per-căn (setVisibleAt)
```

**Đặt ở TẦNG nào — quyết định kiến trúc:**
- archplan editor **giữ per-Mesh** — edit 1 lô, draw thấp sẵn; BatchedMesh phải pre-allocate
  `maxVertexCount` cố định → khắc tinh live-edit rebuild (đổi size buffer = recreate cả batch).
- BatchedMesh chỉ vào ở **tầng ráp cảnh production/viewer** (tầng chưa tồn tại) — nhà là output ĐÃ chốt
  từ editor, geometry ổn định, chỉ còn transform + visibility per-căn.

**Rủi ro khi làm:**
1. Biến hoá per-nhà ngoài matrix/color (tile/tint khác) vẫn khoá theo key — cùng giới hạn
   [[per-key-material-cache-tradeoff]], không tệ hơn hiện tại.
2. Raycast pick trả `batchId` → tự quản sổ map batchId→căn nhà.
3. KI-003 là gotcha của instancing (`instanceMatrix`); BatchedMesh dùng `drawIndex`/matricesTexture —
   pattern TSL displace phải re-verify, chưa có tiền lệ trong repo.

## Lưu ý
- wood-strip ĐÃ là plain mesh "1 khối" → mergeable xuyên nhà, nhưng wiring merge-xuyên-instance trong lab **chưa làm**.
- brick-3d giữ accent-only kể cả sau bake-vào-World cho căn cận cảnh (memory project-brick3d-accent-only).

## Liên hệ
- [[bake-procedural-to-texture]] — bake shader procedural (vế Shimmer + Triangle cho material shader).
- `archplan-ap5-extensions` (deferred/systems) — World render / BuildingFromPlan áp material per-house.
