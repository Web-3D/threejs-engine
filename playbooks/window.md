---
domain: window
title: Cửa sổ / lỗ mở — khoét lỗ vào tường + mặt bên (reveal), bands & trapezoid, biến thể bề mặt
status: building
tier: —
modules:
  - threejs-modules/building/parts/WallSingle   # _solidTraps / _emitHoleBands — carve gốc
  - threejs-modules/building/parts/Joinery      # C1 khung bao quanh lỗ (frame)
  - threejs-modules/building/parts/Leaf         # C2 cánh gỗ xoay + C4 cánh trượt kính/shoji
  - threejs-modules/components/InstancedBrickWall
  - threejs-modules/components/WoodSidingStrip
  - threejs-modules/components/WoodSidingWall
issues:
  - KI-001
  - KI-003
  - KI-004
updated: 2026-06-11
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
| KHUNG tròn thò ra ngoài tường / lơ lửng trên mép, lệch khỏi lỗ | khung vẽ TRỌN ellipse, KHÔNG clip biên tường như lỗ carve | `Joinery.clipToWall` — clip spine vào `[x0,x1]×[0,h]`, tách cung, sweep từng cung caps-on (2026-06-11, từ ảnh) |
| KHUNG tròn THỦNG / nhìn xuyên qua lỗ (lớp lót trong mất nửa) | khung = vòng ỐNG, mặt lót trong nửa-xa quay lưng camera → single-side CULL | material khung **DoubleSide** riêng (`cache.ensureFrameMat`); tường giữ single-side. Verify bằng Chrome headless render (2026-06-11) |
| MÁ KHUNG dọc "mất sơn" trên tường ván/gạch (chỉ ló mẩu ở khe ván) | vỏ tường geometry thật NHÔ khỏi depth/2 (strip butt·cos(tilt) ~45mm > khung nhô 15mm) → ván che má | `wallAssembly.wallProud(spec)` — khung tự cộng độ nhô vỏ: strip = butt·cos(tilt)+4mm · wood-3d 42mm · brick-3d 14mm (2026-06-11, từ ảnh) |
| KHUNG ellipse "mất miếng/xuyên khung" ở ĐỈNH + ĐÁY vòng (khe sáng) | lỗ carve = BAND ngang ~25mm → ở 2 cực lỗ thật NHỎ hơn ellipse, sliver tường thò vào lòng vòng khung | `FRAME_LIP` 25mm (Joinery) — spine khung thụt vào trong mép lỗ, mép khung ĐÈ lên che răng cưa carve (vai trò architrave thật) (2026-06-11, ảnh #4) |

## 5. Lịch sử nâng cấp

- `2026-06-11` — **C4 CÁNH TRƯỢT kính/shoji (joinery phase 4)**: `leafType` nới `'glass-slide' | 'shoji-slide'` (0 field mới — reuse leafDouble/leafOpen/leafColor C2, parse tolerant). Builder `parts/Leaf.ts` MỚI (tách từ Joinery chống phình, barrel re-export giữ import): kính trượt = khung 4 thanh + tấm kính 8mm (`ensureGlassMat` — recipe kính lan can Balcony: transparent + roughness 0.05 phản chiếu IBL); shoji trượt = khung + koshita ván đáy + lưới kumiko **GEOMETRY thật** + tấm giấy washi toon (KHÔNG reuse shader ShojiScreen — triplanar world-space → cánh trượt thì hoạ tiết "bơi" đứng yên trong không gian). Đôi = 2 panel 2 ray so le, panel 0 trượt ĐÈ panel 1 (mở max nửa lỗ — đúng patio/shoji thật); đơn = phủ trọn lỗ trượt sang phải đè mặt tường trong. Ray trên/dưới = bake bucket `frame:color` (0 draw mới). "Mở %" = **translate pivot LIVE** (`leafKind:'slide'` trong userData — `_tuneLeafLive` rẽ nhánh xoay/trượt, 0 rebuild). ⚠️ Vá kèm: material cánh vào KEEP-SET sweep qua bucket RỖNG (`keepMatKey`) — trước đây màu cánh C2 không trùng màu khung là bị `cache.sweep` evict cuối build → build sau recompile lại.
- `2026-06-10` — **C1 KHUNG BAO (joinery phase 1 — kế hoạch khung+cánh theo khảo sát BIM)**: `parts/Joinery.ts` mới, khung per-opening optional (`frameStyle` wood/alu/steel + `frameW/frameOut/frameColor` — parse tolerant, KHÔNG bump schema). Chữ nhật = box butt-joint (đầu ngang GỐI 2 má; bậu dưới chỉ khi lỗ treo >2cm — cửa đi/bán nguyệt không bậu); tròn/bán nguyệt = **sweep op #2** profile fw×fd dọc spine ellipse nở fw/2. Wire `assembleFrames` TRƯỚC dispatch material — mọi loại tường (cả brick-3d/gỗ instanced) đều có khung; geo đẩy thẳng bucket `n:color` mergeWalls = khung cùng màu toàn nhà 1 draw, 0 lifecycle mới. ⚠️ Bài học: geo tay vào bucket chung PHẢI đệm **uv zeros** (đồng bộ attribute với BoxGeometry — thiếu uv là mergeGeometries trả null, mất hình lặng lẽ họ KI-004). GUI: dropdown Khung + Bản/Nhô (live) + màu per-opening.
- `2026-06-11` — **FIX khung tròn THÒ NGOÀI tường** (ảnh thực tế: opening tròn đặt sát mép/đỉnh → khung vẽ trọn ellipse lơ lửng ngoài tường, lệch lỗ): `Joinery` thêm `clipToWall` — sinh 96 điểm ellipse → **clip vào biên tường `[x0,x1]×[0,h]`** (KHỚP `_holeChord` clamp của carve) → toàn-trong = 1 vòng kín (caps off), có điểm ngoài = tách các cung hở (caps on, xoay mảng bắt đầu tại điểm NGOÀI để quét vòng không cần wrap). Bỏ logic clip-đáy-riêng cũ (`cy<b`); rect frame cũng clip má `[0,h]` + đầu ngang/bậu chỉ vẽ khi trong biên. Cần thêm tham số `wallH` vào `frameGeosLocal` (carve dùng h, Joinery trước thiếu). Frame VỐN phẳng (đối xứng z=0) — "nghiêng" trong ảnh là phối cảnh + phần thò, không phải bug frame.
- `2026-06-11` — **C2 CÁNH GỖ (joinery phase 2)**: `leafGeoLocal` (Joinery) — cánh panel mộc cổ điển: 2 stile + 3 rail (dưới cao chống-đá-chân / giữa tại 0.4h / trên) + 2 ô panel LÕM (tấm 14mm giữa cánh 40mm — recessed nhìn 2 phía); geometry LEAF-LOCAL gốc tại TRỤC BẢN LỀ, mirror cho cánh phải French. State optional `leafType/leafDouble/leafOpen/leafColor` (parse tolerant). `assembleLeaves` (wallAssembly): mesh RIÊNG trên PIVOT tại bản lề (xoay được → KHÔNG merge bucket; material chung `ensureFrameMat` DoubleSide per-color), French đôi = 2 cánh bản lề 2 má cùng mở VÀO TRONG. **Mở % = LIVE transform thuần**: pivot mang `userData {leafKey, leafBase, leafSign}`, slider → `ctx.tuneLeafLive(key,pct)` → Lab traverse set `rotation.y` (0 rebuild/recompile — pattern tunePathRotLive); buông = commit persist; key = `${instId}:${segIdx}:${opIdx}` luồn qua `segToSpec(seg, keyBase)`. Chỉ lỗ CHỮ NHẬT kind door/loading_door (window/round ẩn GUI + render skip). Budget: ~7 box/cánh ≈ 84 tri, +1 draw/cánh (không merge được vì xoay độc lập).
- `2026-06-11` — **FIX khung tròn THỦNG/xuyên qua** (ảnh kế: lớp lót trong khung mất nửa-xa, nhìn xuyên lỗ): khung là vòng ỐNG, mặt lót trong nửa quay-lưng-camera bị single-side CULL. Material `none` tường = single-side (đúng cho tường đặc, né shadow-acne) nhưng khung cần **DoubleSide**. Thêm `WallMaterialCache.ensureFrameMat(color)` (MeshToon DoubleSide, key `frame:color` tự nằm trong used-set sweep); `assembleFrames` chuyển khung từ bucket `n:color` → `frame:color`. **Quy trình chẩn: dump geometry (esbuild→node, winding OK) → loại trừ bug hình học → Chrome HEADLESS render FrontSide vs DoubleSide cạnh nhau** (tường có lỗ + vật đỏ phía sau) thấy rõ FrontSide thủng / DoubleSide kín → fix có bằng chứng, không vá mò.
- base — bands + `_solidTraps` + reveal (front/back/jamb) cho lỗ chữ nhật.
- `2026-05-30` — lỗ tròn: lấy mẫu Y cho cung; `2026-06-04` (e51f569) clip **bán nguyệt** + fix unclamped ellipse.
- `7b171a6` — `WoodSidingStrip` giữ mảng tường dưới/trên lỗ (guard `!b||!t`).
- `4b9636b` — propagate boundary `solidTraps` sang `InstancedBrickWall` + lập KI-001.

## 6. Liên hệ

- **Modules:** `building/parts/WallSingle.ts` (carve gốc) · [InstancedBrickWall](../threejs-modules/components/InstancedBrickWall/README.md) · [WoodSidingStrip](../threejs-modules/components/WoodSidingStrip/README.md) · `OpeningDetail.ts` (khung cửa/sổ chi tiết)
- **Skills:** `dispose-pattern`, `shader-tsl`
- **KI:** `KI-001` (propagate carve), `KI-003` (instancing)
- **Liên quan playbook:** [wall](README.md) (bề mặt tường — tạo sau), [pond](pond.md) (cùng bài học "khoét xuyên nhiều bản/lớp")
