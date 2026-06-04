---
id: KI-008
title: Bỏ reflector.forceUpdate → `_inReflector` kẹt true (bug three) → gương chết VĨNH VIỄN sau khi camera chui dưới mặt nước
category: api-version
domain: pond
severity: high
status: fixed
when: Reflector (WaterSurface) với `bounces:false`; camera orbit xuống tới mức tụt DƯỚI mặt phẳng nước 1 lần → từ đó gương đứng hình mãi (trồi lên không reset). Chỉ xảy ra khi KHÔNG ép `forceUpdate` mỗi frame.
where:
  - threejs-modules/components/WaterSurface/index.ts (setTime → forceUpdate; _buildColor → shader suppress)
  - node_modules/three/src/nodes/utils/ReflectorNode.js:372,374,401,484,486   # bug nằm ở đây
discovered: 2026-06-04
fixed-in: —
related:
  - ki:KI-007
tags: [reflector, three-bug, inreflector, forceUpdate, isFacingAway, freeze, water]
---

## 1. Lỗi gì (triệu chứng)

Gương mặt hồ render đúng ở góc thường. Nhưng khi orbit camera xuống **cực thấp** tới mức camera tụt **dưới** mặt phẳng nước (hồ sát đất nên dễ), gương hỏng — và **trồi camera lên lại KHÔNG reset**: gương đứng hình (ảnh sai) **vĩnh viễn** tới khi reload. (User: "góc xuống thấp bị hư ảnh chiếu, mỗi khi camera chui xuống rồi trồi lên ko reset ảnh nữa".)

## 2. Khi nào & Ở đâu

- Trigger: `reflector({ bounces:false })` + 1 lần camera facing-away (dưới mặt phẳng) + KHÔNG ép `forceUpdate`.
- Lộ ra khi: bỏ hack `forceUpdate=true` (tưởng nó chỉ "chống đứng gương" cosmetic). Vá KI-007 (MSAA off) làm gương hiện lại → mới thấy bug này.

## 3. Tại sao (root cause — đã VERIFY trong source three)

Bug trong `ReflectorNode.updateBefore` (three 0.174):
```
372  if ( this.bounces === false && _inReflector ) return false;   // guard chống đệ quy
374  _inReflector = true;
...
401  if ( isFacingAway === true && this.forceUpdate === false ) return;  // ⚠ thoát SỚM, KHÔNG reset _inReflector
...
476  renderer.render( scene, virtualCamera );
484  _inReflector = false;   // reset CHỈ tới được khi KHÔNG facing-away
486  this.forceUpdate = false;
```
`_inReflector` là cờ module-level chống reflector-soi-reflector. Nhánh facing-away (401) `return` **trước** dòng reset (484) → `_inReflector` **kẹt `true`**. Frame sau: guard 372 thấy `_inReflector===true` → `return` ngay → reflector KHÔNG bao giờ render lại → gương chết. `forceUpdate=true` né được nhánh 401 (điều kiện `forceUpdate===false` sai) → luôn chạy tới 484 → reset đúng. **VERIFY:** đọc trực tiếp ReflectorNode.js; khớp 100% triệu chứng "1 lần dưới nước → chết luôn".

## 4. Sửa như thế nào (đã áp)

GIỮ `forceUpdate=true` mỗi frame trong `setTime` (né bug `_inReflector`). Cái giá: lúc facing-away reflector render gương "từ dưới lên" SAI → **tắt ở shader**: `_buildColor` nhân `fres` với `smoothstep(0, 0.04, eye.y)` (camera dưới nước → fade gương về 0 → hiện khúc xạ thay ảnh sai). Kết quả: mọi góc TRÊN nước gương đúng+live; chui xuống hiện khúc xạ (không sai, không đứng hình).

⚠ **Phải dùng `eye.y` (normal PHẲNG +Y), KHÔNG `dot(eye, n_sóng)`** — `_surfaceNormal` nghiêng ±21° theo XZ → `dot(eye, n_sóng)` phụ-thuộc-azimuth → tụt dưới 0.04 ở vài góc QUAY NGANG dù camera vẫn trên nước → mất gương "sau khi vượt 1 góc azimuth". (Đã vấp 2026-06-04: dùng normal sóng → user báo "xoay ngang vượt góc là mất ảnh".) Mặt phẳng nước là phẳng → phép thử trên/dưới phải theo +Y.

## 5. Phòng tái phạm

- **KHÔNG bỏ `reflector.forceUpdate=true`** tưởng nó chỉ là perf/cosmetic — nó che bug `_inReflector` của three. Bỏ = gương chết sau lần đầu facing-away. Nếu three vá bug này (reset `_inReflector` ở nhánh 401) thì mới bỏ được — `scan-versions.js` soi sau upgrade.
- Reflector mặt phẳng **sát đất** (nước/sàn gương) đặc biệt dễ dính (camera dễ tụt dưới). Luôn cặp forceUpdate + shader-suppress-facing-away.
- Liên quan MSAA: `KI-007` (cùng mảng pond, cùng phải bật mới thấy nhau).
