---
id: KI-011
title: Cut khoét ground để lại viền/góc + "pie-slice wedge" tròn/ellipse — clip-hole earcut không đủ, cần polygon-boolean
category: geometry
domain: ground
severity: high
status: fixed
when: cut (op:'cut') chồm qua mép zone cong (tròn/ellipse), HOẶC cut cùng kích thước zone (khít mép), HOẶC cut phủ một phần
where:
  - threejs-modules/site/render/fromState.ts:layerGeometry
  - threejs-modules/site/render/fromState.ts:buildLevelZones
discovered: 2026-06-07
fixed-in: "—"
related:
  - ki:KI-004
  - ki:KI-010
tags: [ground, cut, khoét, earcut, polygon-boolean, polygon-clipping, wedge, point-in-polygon, esm-named-export]
---

## 1. Lỗi gì (triệu chứng)

Cut **không xóa hết** zone: để lại **viền mỏng** hoặc **1 góc nhỏ** thừa. Trên zone **tròn/ellipse** xuất hiện
**"pie-slice wedge"** (mảnh nêm hình quạt). Cut **cùng cỡ** zone (cả 2 mặc định 3000mm) đặt khít → **không xóa
được** (lẽ ra biến mất). Nhìn như bug geometry dù tsc/eslint xanh.

## 2. Khi nào & Ở đâu

`layerGeometry` (cũ) thêm mỗi cut/nước làm **hole của `ExtrudeGeometry`** (clip về contour rồi `shape.holes.push`).
`buildLevelZones` (cũ) thử "phủ trọn → bỏ zone" bằng ray-cast point-in-polygon. Lỗi bật khi cut chạm/cắt biên cong,
hoặc khít mép, hoặc phủ một phần.

## 3. Tại sao (root cause — VERIFY bằng node test, không đoán)

**(a) earcut wedge:** hole của ExtrudeGeometry khi **chạm/trùng biên contour** (cut cắt qua mép tròn/ellipse →
clip-hole chia sẻ cung với contour) → earcut bắc "cầu" hole↔contour degenerate → **mảnh nêm**. Clip-hole **về bản
chất không làm nổi** "phủ một phần shape cong" sạch.
**(b) cover-test ở biên:** `pointInPolyXY` (ray-casting) trả **false** cho đỉnh nằm **ĐÚNG trên cạnh** cut. Cut==zone
(cùng 3000mm) → 4 góc zone nằm đúng mép cut → "phủ trọn" = false → không bỏ zone → **không xóa hết**. (Verify:
node test 4 case rect — coincident covers=false, bigger=true.)
**(c) gotcha lib khi sửa:** `polygon-clipping` bản ESM **chỉ export default** (`export {index as default}`); `.d.ts`
khai báo named **lệch runtime** → `import {difference}` = **undefined lúc chạy** trong Vite (tsc vẫn xanh vì đọc
.d.ts). Verify bằng **esbuild bundle** (đúng bộ Vite dùng), KHÔNG tin `node` thuần (đọc `main` CJS, interop khác).

## 4. Sửa như thế nào

Thay clip-hole+cover-test bằng **polygon-boolean difference THẬT** (`polygon-clipping`/Martinez): `layerGeometry` =
`difference([contour], ...cuts+nước)` → **MultiPolygon** (cut chẻ zone thành nhiều mảnh, mỗi mảnh ring[0]=biên,
ring[1..]=lỗ) → mảng `THREE.Shape` → `ExtrudeGeometry(shapes[])`. Rỗng (cut phủ trọn) → **`null` → caller không
dựng mesh** (xóa sạch). Gỡ ~90 dòng Sutherland-Hodgman/pointInPoly/coversXZ. Import **default**
`import polygonClipping from 'polygon-clipping'` → `polygonClipping.difference(...)`. Đã verify 9 case qua esbuild.

## 5. Phòng tái phạm

- **Đục lỗ polygon mà lỗ có thể CHẠM/CẮT biên → KHÔNG earcut-hole.** Dùng polygon-boolean (difference). earcut-hole
  chỉ an toàn khi lỗ **nằm trọn trong**, không chạm biên (vd nước trong lô).
- **"Phủ trọn?" KHÔNG tin point-in-polygon ở biên** (đỉnh trên cạnh = nhập nhằng). Boolean rỗng = phủ trọn.
- **Lib JS: VERIFY export RUNTIME bằng bundle thử (esbuild/Vite), KHÔNG tin `.d.ts`** (types ≠ runtime). `node` thuần
  đọc field `main` (CJS) → interop khác Vite (`module`/ESM) → kết luận sai.
- **Test toán hình học HEADLESS (node/esbuild) trước khi tin visual** — 9 case carve verify được mà không cần mở 3D.
