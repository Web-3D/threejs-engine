# Shape Group — gộp nhóm nhiều khối shape, di chuyển 1 lần

> Status: **✅ P1+P2a BUILD XONG 2026-06-10** (`interaction/selection.ts` + ghost-drag trong `manipulate.ts`).
> Còn chờ: **P2b** (live-translate qua split-render multi — chỉ làm nếu ghost-drag chưa đủ "sướng tay") +
> **P3** (group bền có tên, lưu state — chỉ làm nếu ad-hoc thấy thiếu). Recipe + anchor: `INTERACTIONS.md` §🧲.
> Domain: archplan interaction + state. Anh em: Ctrl-snap (`snap.ts`), Move tool (`manipulate.ts`).

## Mục tiêu (NgQuan)
Chọn NHIỀU khối shape → gộp 1 nhóm → kéo cả nhóm 1 lần (giữ vị trí tương đối) thay vì kéo từng cái (mất time + lệch).

## Plan dựng
1. **Selection model** (vỏ archplan): tập `Set<instId>` đang chọn. Shift+click (Move mode) thêm/bớt khối vào selection; hiển thị viền/tint khối được chọn.
2. **Group**: gộp = lưu nhóm (id → instId[]) trong state HOẶC ad-hoc (chọn nhiều rồi kéo, không cần lưu bền). Quyết định: **ad-hoc trước** (kéo selection hiện tại), group bền (đặt tên, lưu) = sau.
3. **Multi-move**: mở rộng `manipulate.ts` DragSession — khi kéo 1 khối thuộc selection >1 → tính Δ rồi cộng `posX/posZ` cho TẤT CẢ khối trong selection (giữ tương đối). Rebuild 1 lần. (Ctrl-snap: snap theo bbox UNION của nhóm.)
4. **GUI**: nút/phím gộp-nhả nhóm; hiện danh sách nhóm (nếu group bền).

## Điểm kiến trúc — ĐÃ CHỐT khi build (2026-06-10)
- **Ad-hoc** (Set<instId> ở vỏ, KHÔNG vào BuildingState — zero schema risk, không bump DESIGN_SCHEMA_V);
  group bền = P3. Rời Move mode / Esc = xả.
- Multi-floor: v1 **cùng tầng** (siblingInstances theo tầng sẵn có).
- Snap nhóm: **bbox UNION** (`unionAABB`+`shiftAABB` trong snap.ts) vs khối cùng tầng NGOÀI nhóm.
- **Kéo nhóm = GHOST-DRAG** (P2a — bbox cả nhóm bay theo, 0 rebuild, KHÔNG đụng split-render KI-009);
  buông = CÙNG 1 Δ-đã-round cộng posX/posZ mọi khối (round chung — round riêng từng khối sẽ trôi 1mm)
  + rebuild 1 lần. Live-translate thật (P2b) = đụng `beginInstDragSplit` multi — rủi ro cao, hoãn có chủ đích.

## Liên hệ
- `manipulate.ts` (DragSession, `_makeDragSession`, `dragMove` nhánh 'inst'), `snap.ts` (`instAABB`/`snapDelta`), host `siblingInstances`.
- INTERACTIONS.md (Move + Snap anchor).
