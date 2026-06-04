---
id: KI-001
title: Fix boundary solidTraps (!b && !t → !b || !t) không propagate sang bản copy → răng cưa mép cửa brick-3d
category: geometry
domain: window
severity: high
status: fixed
when: Tường có lỗ cửa/sổ + material 'brick-3d' (InstancedBrickWall) hoặc render qua WallSingle. Nhìn mặt NGOÀI có nắng — mép trên (header) & dưới (sill) lỗ bị răng cưa/lỗ xuyên thấu.
where:
  - threejs-modules/components/InstancedBrickWall/index.ts:191   # ❌ buggy (!b && !t + fallback)
  - 01-Doraemon/src/world/building/parts/WallSingle.ts:533-535   # ❌ buggy (?? fallback = tương đương && )
  - threejs-modules/components/WoodSidingStrip/index.ts:209      # ✅ đã đúng (!b || !t) — bản gốc đã fix
discovered: 2026-05-30
fixed-in: 2026-05-30 — propagate fix 7b171a6 sang InstancedBrickWall:191 + WallSingle:533
related:
  - commit:7b171a6
  - memory:copy-paste-fix-not-propagated-opening-carve
tags: [opening, brick, wood, boundary, copy-paste, solidTraps, holeChord]
---

## 1. Lỗi gì (triệu chứng)

Cửa sổ trên tường **brick-3d** (InstancedBrickWall): mép trên ô cửa (lanh-tô/header) **răng cưa**,
gạch running-bond thụt so le để lộ **lỗ xuyên thấu tối** thay vì thấy nền vữa đặc phía sau. Giống hệt
bug đã gặp & sửa ở **WoodSidingStrip** trước đó (mất mảng tường quanh lỗ). Tái hiện: tường height 3000,
opening W1200×H1500 @ X500 Y900, material brick-3d, xem mặt ngoài có nắng.

> Lưu ý phân biệt: screenshot chụp mặt tường phía **trong/khuất nắng** trông tối đen — KHÔNG phải bug
> này, chỉ là thiếu sáng. Chỉ mặt ngoài đủ sáng mới lộ răng cưa thật. (Bài học: verify bằng ảnh đúng
> điều kiện trước khi kết luận.)

## 2. Khi nào & Ở đâu

Logic carve lỗ trong nền tường (`solidTraps` + `holeChord` + `revealQuad` + `_buildBackingGeo`) bị
**COPY-PASTE 3 nơi** (xem `where`). Bug nằm ở guard band biên trong `solidTraps`.

## 3. Tại sao (root cause — đã verify bằng đọc code, không đoán)

`yCuts` chia Y gồm `0, h, o.y0, o.y1` → band header `[y1, h]`: `holeChord` tại `ya=y1` **hợp lệ**,
tại `yb=h` **null** (h > y1). Band sill `[0, y0]` đối xứng (b null, t hợp lệ).

- Form **SAI** `if (!b && !t) continue` (+ fallback `b ? b[0] : t![0]` hoặc `bv = b ?? t`): khi đúng
  1 chord null, KHÔNG skip → dùng chord còn lại cho cả 2 mép → khoét 1 trapezoid xuyên nền vữa suốt
  band header/sill. Gạch thụt so le phía trên → nhìn xuyên qua lỗ thừa đó → răng cưa tối.
- Form **ĐÚNG** `if (!b || !t) continue`: band chỉ-1-chord-hợp-lệ = band NẰM NGOÀI lỗ (chạm biên từ
  ngoài) → skip → nền header/sill giữ ĐẶC → gạch thụt vẫn thấy nền vữa, sạch.

Bản gốc WoodSidingStrip đã fix ở **commit 7b171a6**; 2 bản copy không được áp tay → silent divergence
(tsc/eslint/validate đều PASS vì mỗi bản tự hợp lệ syntax).

## 4. Sửa như thế nào

Áp y hệt fix 7b171a6 cho 2 bản buggy:

- `InstancedBrickWall/index.ts:191`: `if (!b && !t) continue` → `if (!b || !t) continue`; gỡ fallback
  `b ? b[0] : t![0]` (và `c`) thành `b[0]/t[0]/b[1]/t[1]` trực tiếp (sau guard `||`, b & t chắc chắn non-null).
- `WallSingle.ts:533-535`: bỏ `bv = b ?? t; tv = t ?? b`; thay `if (!b || !t) continue` rồi push
  thẳng `b[0]/t[0]/b[1]/t[1]`.

Sau sửa: `node validate.js threejs-modules/components/InstancedBrickWall`; `cd 01-Doraemon && npx tsc
--noEmit && npx eslint src/world/building/parts/WallSingle.ts`; build :3001 xem header cửa sạch răng cưa.

**Tốt hơn (đề xuất):** đã 3 nơi dùng = đủ ngưỡng abstraction (global rule #2) → extract carve-opening
thành 1 util chung `threejs-modules/utils/` để fix-1-nơi, hết divergence. → cân nhắc khi đụng lần 4.

## 5. Phòng tái phạm

1. **Trước khi coi 1 fix là "xong": grep tên hàm/biến đặc trưng** xem có bản copy không:
   `grep -rln "solidTraps\|holeChord" threejs-modules/ 01-Doraemon/src/` → propagate MỌI bản.
2. Triệu chứng **"răng cưa / bậc / overhang quanh mép lỗ cửa-sổ" trên vật liệu dải/rời** (siding, gạch)
   → nghi NGAY guard band biên `solidTraps` (`!b || !t`).
3. Khi copy 1 khối logic sang module mới → ghi 1 dòng comment `// COPY từ <module>` ở cả 2 nơi để lần
   fix sau biết đường propagate (hoặc extract luôn nếu ≥3 nơi).
