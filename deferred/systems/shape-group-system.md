# Shape Group — gộp nhóm nhiều khối shape, di chuyển 1 lần

> Status: **WANTED, chưa build** (2026-06-05). Feature LỚN (selection model + group state + multi-move) → để session riêng.
> Domain: archplan interaction + state. Anh em: Ctrl-snap (`snap.ts`), Move tool (`manipulate.ts`).

## Mục tiêu (NgQuan)
Chọn NHIỀU khối shape → gộp 1 nhóm → kéo cả nhóm 1 lần (giữ vị trí tương đối) thay vì kéo từng cái (mất time + lệch).

## Plan dựng
1. **Selection model** (vỏ archplan): tập `Set<instId>` đang chọn. Shift+click (Move mode) thêm/bớt khối vào selection; hiển thị viền/tint khối được chọn.
2. **Group**: gộp = lưu nhóm (id → instId[]) trong state HOẶC ad-hoc (chọn nhiều rồi kéo, không cần lưu bền). Quyết định: **ad-hoc trước** (kéo selection hiện tại), group bền (đặt tên, lưu) = sau.
3. **Multi-move**: mở rộng `manipulate.ts` DragSession — khi kéo 1 khối thuộc selection >1 → tính Δ rồi cộng `posX/posZ` cho TẤT CẢ khối trong selection (giữ tương đối). Rebuild 1 lần. (Ctrl-snap: snap theo bbox UNION của nhóm.)
4. **GUI**: nút/phím gộp-nhả nhóm; hiện danh sách nhóm (nếu group bền).

## Điểm kiến trúc cần chốt khi build
- Group **bền** (lưu vào BuildingState, có tên) vs **ad-hoc** (chỉ selection tạm)? → đề xuất ad-hoc trước.
- Multi-floor: nhóm trong 1 tầng hay xuyên tầng?
- Snap khi kéo nhóm: theo bbox union của nhóm (mở rộng `snapDelta`).

## Liên hệ
- `manipulate.ts` (DragSession, `_makeDragSession`, `dragMove` nhánh 'inst'), `snap.ts` (`instAABB`/`snapDelta`), host `siblingInstances`.
- INTERACTIONS.md (Move + Snap anchor).
