---
id: KI-010
title: BufferGeometry custom (stone fence) "mất hình" 3 lần — thiếu uv + winding ngược theo trục + trộn index với RoundedBox
category: geometry
domain: fence
severity: high
status: fixed
when: Đổi fence wall sang 'stone' (geometry custom thay box) — tường KHÔNG hiện, hoặc hiện thiếu mặt, hoặc lại mất hẳn sau khi thêm cột góc RoundedBox
where:
  - threejs-modules/site/render/fromState.ts:stoneWallEdge      # build BufferGeometry tay (position+index+normal)
  - threejs-modules/site/render/fromState.ts:stoneWallFenceGeos # 4 cạnh + cột góc → mergeGeometries
  - threejs-modules/site/render/fromState.ts:stoneCornerPost    # RoundedBoxGeometry (non-indexed!)
discovered: 2026-06-05
fixed-in: '—'
related:
  - ki:KI-004
tags: [fence, stone, buffergeometry, uv, winding, normals, mergeGeometries, indexed, webgpu, triplanar, RoundedBoxGeometry]
---

## 1. Lỗi gì (triệu chứng)

Dựng tường rào đá bằng **BufferGeometry tự build** (profile chữ-nhật-đỉnh-tròn extrude dọc) → vấp **3 lần "mất hình"** liên tiếp, mỗi lần 1 nguyên nhân khác, tsc/eslint đều PASS:
1. **Mất hẳn** ngay từ đầu (không tam giác nào hiện).
2. Hiện rồi nhưng **2 cạnh vuông góc mất MẶT NGOÀI** (nhìn xuyên qua tường ở 2 cạnh kia).
3. Sau khi thêm cột góc đá `RoundedBoxGeometry` → **lại mất hẳn**.

## 2. Khi nào & Ở đâu

Trigger: `site.fence.type='wall'` + `wallTex='stone'` → `stoneWallFenceGeos` → `mergeGeometries` → material TexturedSurface (triplanar). 3 nguyên nhân TÁCH BIỆT, xuất hiện lần lượt khi sửa.

## 3. Tại sao (root cause — đã verify node)

**(a) Thiếu attribute `uv`.** WebGPU pipeline cho `MeshStandardNodeMaterial` cần `uv` dù triplanar KHÔNG đọc uv → geometry chỉ có `position`+`normal` → draw fail âm thầm → mất hình. (Bằng chứng: cinder dùng `BoxGeometry` CÓ uv → chạy; stone custom thiếu uv → mất. Khác biệt DUY NHẤT = uv.)

**(b) Winding ngược theo TRỤC.** Cùng thứ tự index `(a,b,d,b,c,d)` cho mọi cạnh, nhưng map `lat→z` (cạnh trục X) vs `lat→x` (cạnh trục Z) **đảo handedness** của cross-product → pháp tuyến mặt ngoài 2 cạnh trục-Z quay VÀO TRONG → FrontSide back-face cull → "mất 1 mặt". (Verify node: dot(outerNormal, outwardDir) = −1 cho cạnh Z trước khi lật.)

**(c) Trộn indexed × non-indexed.** Cạnh stone `setIndex()` = **indexed**; `RoundedBoxGeometry` (cột góc) = **non-indexed**. `mergeGeometries` trộn 2 loại → trả **NULL** → geometry rỗng → mất hình. (Đúng vết KI-004 §5 đã cảnh báo cho `buildFence`.)

## 4. Sửa như thế nào

- (a) Thêm `uv` placeholder (`g.setAttribute('uv', Float32(... f, k/(K-1) ...))`) — giá trị không quan trọng (triplanar bỏ qua), chỉ cần attribute TỒN TẠI.
- (b) `const flip = axis === 'z'` → lật thứ tự winding (`a,d,b,b,d,c`) + lật cap (`out !== flip`). Verify cả 4 cạnh dot(outer,out)=+1.
- (c) `g.computeVertexNormals()` (TRƯỚC, giữ normal mượt cung) **rồi** `return g.toNonIndexed()` → đồng bộ TẤT CẢ về non-indexed → merge OK. (Góc hở giữa 2 coping tròn = vấn đề riêng → cột góc `stoneCornerPost` RoundedBox ×1.18 dày, cao tới đỉnh coping, bo cạnh 2.5cm.)

## 5. Phòng tái phạm

- **Build BufferGeometry tay cho NodeMaterial/WebGPU:** LUÔN set đủ `position` + `uv` + (normal qua computeVertexNormals). Thiếu `uv` = mất hình ÂM THẦM (không throw), dù shader không đọc uv. So với 1 primitive đang chạy (Box/Plane) để biết attribute-set chuẩn.
- **Winding khi extrude theo trục khác nhau:** map lat→trục-khác = đảo handedness → 1 nhóm cạnh ngược pháp tuyến. Verify bằng node: build → computeVertexNormals → check `dot(outerFaceNormal, outwardDir)>0` cho MỖI hướng cạnh, ĐỪNG tin verify 1 cạnh rồi suy ra cả 4. Hoặc né hẳn: dựng theo world-up nhất quán / DoubleSide (đánh đổi cost+normal).
- **mergeGeometries (lại — xem KI-004):** primitive `RoundedBoxGeometry`/`Cylinder`/`Sphere`/`Box`/`Plane`/`Shape` có loại index KHÁC NHAU (RoundedBox = non-indexed!). Trước merge: `console.log(g.index)` mọi input, đồng bộ về 1 loại (`toNonIndexed()` rẻ + an toàn). Merge null = rỗng, KHÔNG throw → check `=== null`.
- **Quy trình:** mỗi lần "mất hình" geometry custom → chạy node test (build + check NaN + bbox + attrs + `mergeGeometries` result) TRƯỚC khi đoán. 3 lần này đều tìm ra root cause trong <2 phút bằng node test thay vì đoán mò.
