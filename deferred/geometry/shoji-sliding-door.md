# Cửa trượt Shoji (障子) — sliding door element (#12b)

> Status: **✅ BUILD XONG 2026-06-11** (C4 joinery — commit cùng ngày). Triển khai KHÁC plan dưới ở 2 điểm:
> (1) gắn vào hệ CÁNH C2 (`leafType: 'shoji-slide' | 'glass-slide'`) thay vì door-style riêng — reuse
> trọn leafDouble/leafOpen/leafColor + tuneLeafLive (slide = translate pivot thay xoay);
> (2) kumiko = **GEOMETRY thật** (parts/Leaf.ts), KHÔNG reuse shader ShojiScreen — shader đó triplanar
> WORLD-SPACE, cánh trượt đi thì hoạ tiết đứng yên trong không gian = "bơi" sai thấy ngay.
> File giữ làm sử liệu plan-vs-thực. Chi tiết sống: playbook `window.md` §5.

## Mục tiêu
Bộ cửa TRƯỢT shoji: 1–2 cánh lưới kumiko + giấy washi, trượt ngang trên ray (cảm giác cửa Nhật). Đặt vào opening tường.

## Plan
- Opening system hiện có `op.kind` (door/window) — thêm **door style** `'shoji-slide'` (hoặc field riêng) cho opening.
- Render: tại opening, dựng **cánh cửa** = mesh phẳng (PlaneGeometry/Box mỏng) dùng **material ShojiScreen** (reuse shader `jp-shoji`) + **ray trên/dưới** (2 thanh gỗ ngang) + **khung cánh** (kumiko đã ở material). 1–2 cánh, offset ngang (giả "đã trượt mở" 1 phần, hoặc slider vị trí trượt).
- Có thể animate trượt (slider `slideOpen` 0–1) hoặc tĩnh.
- Liên hệ: opening render trong `building/parts/WallSingle.ts` (khoét + dựng cửa?) + `building/render/fromState.ts` (pushOpeningPicks), `OpeningState` (state.ts), GUI opening (`gui/sections.ts` opening folder). Material: `shaders/fragment/ShojiScreen`.
- Cân nhắc: cửa là con của tường (theo segment) → transform giống opening pick (`pushOpeningPicks` có sẵn world math). Reuse.
