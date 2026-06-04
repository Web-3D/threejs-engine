---
id: KI-002
title: replace_all 1 expression mà expression đó cũng nằm trong định nghĩa helper mới → self-recursion vô hạn
category: build-tooling
domain: —
severity: medium
status: fixed
when: Tạo helper mới có body chứa expression X, RỒI replace_all X→helper(...) trong cùng file → replace_all thay luôn X bên trong thân helper → helper gọi chính nó.
where:
  - 01-Doraemon/src/sandbox/archplan/ArchPlanLab.ts  # wallColor() — palette brush refactor
discovered: 2026-05-31
fixed-in: 2026-05-31
related:
  - ki:KI-001
tags: [replace-all, refactor, recursion, tooling, edit, sed]
---

## 1. Lỗi gì (triệu chứng)

`RangeError: Maximum call stack size exceeded` ở runtime, stack toàn `wallColor → wallColor → …`.
App trắng/treo ngay khi build scene. **tsc + eslint PASS** (hàm tự gọi là TS hợp lệ) → chỉ runtime lộ.

## 2. Khi nào & Ở đâu

Refactor palette brush: thêm helper
`function wallColor(seg) { return seg.paintColor ?? WALL_COLORS[seg.colorIndex % WALL_COLORS.length] }`,
RỒI chạy `replace_all` `WALL_COLORS[seg.colorIndex % WALL_COLORS.length]` → `wallColor(seg)` để đổi
3 call-site khác. `replace_all` thay **cả occurrence bên trong thân `wallColor`** →
`return seg.paintColor ?? wallColor(seg)` → đệ quy vô hạn khi `paintColor == null` (mọi tường lúc đầu).

## 3. Tại sao (đã verify)

`replace_all` (Edit tool / `sed`) thay MỌI occurrence, không phân biệt vị trí. Helper mới có body
chứa đúng pattern đang replace → định nghĩa của nó bị thay thành lời-gọi-chính-nó. tsc/eslint không
bắt vì recursion không phải lỗi cú pháp/type.

## 4. Sửa như thế nào

Trả thân helper về expression gốc:
`wallColor(seg) = seg.paintColor ?? WALL_COLORS[seg.colorIndex % WALL_COLORS.length]`.

## 5. Phòng tái phạm

1. **Thêm helper TRƯỚC, replace_all SAU → luôn rà thân helper:** sau `replace_all`, grep tên helper
   xem nó có gọi chính nó không: `grep -n "function wallColor" -A2`. Nếu thấy `wallColor(...)` trong
   body → sửa lại.
2. Hoặc: đặt tên expression khác trong helper (vd dùng biến trung gian) trước khi replace_all, để
   pattern không trùng body helper.
3. **Triệu chứng "Maximum call stack" + stack 1 tên hàm lặp** = nghi ngay helper tự gọi do
   replace_all/refactor. Mở định nghĩa hàm đó đầu tiên.
