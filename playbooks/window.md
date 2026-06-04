---
domain: window
title: Cửa sổ / lỗ mở — khoét lỗ vào tường + mặt bên (reveal), bands & trapezoid, biến thể bề mặt
status: building
tier: —
modules:
  - threejs-modules/building/parts/WallSingle   # _solidTraps / _emitHoleBands — carve gốc
  - threejs-modules/components/InstancedBrickWall
  - threejs-modules/components/WoodSidingStrip
  - threejs-modules/components/WoodSidingWall
issues:
  - KI-001
  - KI-003
updated: 2026-06-04
---

# Playbook — Cửa sổ / lỗ mở (opening)

> Ranh giới: recipe + tầng/toạ độ + nâng cấp ở đây; chi tiết lỗi → `known-issues/`, API → module README.

## 1. Kết quả "hoàn chỉnh"

Lỗ mở (cửa sổ/cửa đi) khoét vào tường: **mặt trước + mặt sau đều thủng đúng hình**, và **mặt bên (reveal/
jamb)** nối front↔back theo bề dày tường (không hở thấy ruột). Lỗ chữ nhật HOẶC tròn/bán nguyệt (cung mượt).
Mọi biến thể bề mặt tường (phẳng / gạch 3D / ván gỗ) đều khoét **giống hệt** một lỗ — không lệch, không răng cưa.

## 2. Recipe dựng

**Cắt tường thành BANDS ngang rồi dựng hình thang ĐẶC** (`WallSingle._emitHoleBands`):
1. `_yCutsForHoles` — cao độ cắt = `{0, h, mỗi lỗ y0/y1}` + (lỗ tròn) lấy mẫu Y ~25mm cho cung mượt.
2. Mỗi band `[ya,yb]`: `_holeBoundsAt` lấy **chord** lỗ (x trái/phải tại ya & yb). Lỗ tròn → chord hẹp dần theo Y.
3. `_solidTraps` quét trái→phải, sinh **hình thang đặc** giữa các lỗ (full width − trapezoid lỗ). `jL/jR` =
   cạnh hình thang TRÙNG mép lỗ → cần **reveal**.
4. `_emitHoleBands` phát: **front quad (+Z `zf`)**, **back quad (−Z `zb`)**, và **reveal** ở cạnh jL/jR
   (quad nối `zf`→`zb` = mặt bên lỗ, đi sâu vào bề dày tường).

**Biến thể bề mặt** — mỗi loại RE-implement cùng `solidTraps` để khoét:
- phẳng = `WallSingle` (quad trơn). · gạch 3D = `InstancedBrickWall` (instance gạch trong vùng đặc). ·
  ván gỗ = `WoodSidingStrip` / `WoodSidingWall` (thanh ngang). → **logic carve bị copy 3 nơi** (xem §4 KI-001).

Skills: `dispose-pattern`; gạch instanced → xem KI-003 (`positionLocal.add`, không replace `positionNode`).

## 3. Tầng & toạ độ

Hệ local tường (mét): `x0..x1` = dọc thân tường; `y 0..h` = cao; `zf` = mặt trước (+Z), `zb` = mặt sau (−Z).

```
mặt trước (zf, +Z) ──┐
                     ├─ reveal (mặt bên lỗ, nối zf→zb) tại cạnh jL/jR
mặt sau   (zb, −Z) ──┘
band [ya,yb] × trapezoid đặc (lB,lT,rB,rT) = phần TƯỜNG; phần thiếu = LỖ
```

- **`jL/jR`**: jR=true khi cạnh phải hình thang là mép TRÁI lỗ → reveal +X; jL=true khi cạnh trái là mép
  PHẢI lỗ → reveal −X. Mép biên tường (x0/x1) không phải mép lỗ → không reveal.
- **Lỗ tròn**: trapezoid chord = dây cung theo Y; nhiều band Y (~25mm) → xấp xỉ cung. Clip bán nguyệt
  (nửa trên) cần kẹp ellipse trong `[y0,y1]` (xem §5, fix unclamped).
- **Boundary (KI-001):** band chạm mép lỗ từ NGOÀI (chỉ 1 chord null) → **KHÔNG cắt** (`if (!b||!t) continue`).
  Thiếu guard này → mất mảng tường dưới/trên lỗ hoặc răng cưa.

## 4. Lỗi thường gặp

| Triệu chứng | Nguyên nhân (1 dòng) | Chi tiết & fix |
| --- | --- | --- |
| Gạch 3D / ván răng cưa mép lỗ, lệch tường phẳng | fix `solidTraps` boundary không propagate sang bản COPY | `known-issues/KI-001` |
| Ván gỗ mất mảng tường dưới/trên lỗ | thiếu guard `!b\|\|!t` (band chạm mép từ ngoài) | `KI-001` (commit 7b171a6) |
| Gạch instanced dồn hết về gốc (preview giấu) | `positionNode = vec3(...)` replace xoá instanceMatrix | `known-issues/KI-003` |
| Lỗ tròn méo / cung không khép | ellipse chord chưa kẹp `[y0,y1]` | commit e51f569 (round → bán nguyệt + clamp) |

## 5. Lịch sử nâng cấp

- base — bands + `_solidTraps` + reveal (front/back/jamb) cho lỗ chữ nhật.
- `2026-05-30` — lỗ tròn: lấy mẫu Y cho cung; `2026-06-04` (e51f569) clip **bán nguyệt** + fix unclamped ellipse.
- `7b171a6` — `WoodSidingStrip` giữ mảng tường dưới/trên lỗ (guard `!b||!t`).
- `4b9636b` — propagate boundary `solidTraps` sang `InstancedBrickWall` + lập KI-001.

## 6. Liên hệ

- **Modules:** `building/parts/WallSingle.ts` (carve gốc) · [InstancedBrickWall](../threejs-modules/components/InstancedBrickWall/README.md) · [WoodSidingStrip](../threejs-modules/components/WoodSidingStrip/README.md) · `OpeningDetail.ts` (khung cửa/sổ chi tiết)
- **Skills:** `dispose-pattern`, `shader-tsl`
- **KI:** `KI-001` (propagate carve), `KI-003` (instancing)
- **Liên quan playbook:** [wall](README.md) (bề mặt tường — tạo sau), [pond](pond.md) (cùng bài học "khoét xuyên nhiều bản/lớp")
