# Thang tier dùng chung cho playbooks (A/B/C/D)

> Trạng thái: **deferred** (2026-06-04). Revisit khi: ≥4–5 playbook có field `tier` mà nghĩa lệch nhau,
> hoặc khi plan mảng mới cần so tier nhanh (rẻ↔đắt).

## Ý tưởng

Mỗi playbook đã có field `tier:` (pond=B, grass=B, window=—). Nhưng "B" nghĩa gì thì CHƯA định nghĩa CHUNG
— mỗi mảng tự hiểu. Đề xuất 1 bảng vocab tier dùng chung (đặt ở `playbooks/README` hoặc 1 file), mỗi playbook
`tier:` trỏ về:

- **A** = material/surface phẳng (rẻ nhất, +0 pass)
- **B** = geometry/instanced (mesh thật)
- **C** = PBR / reflection / refraction (pass riêng, đắt)
- **D** = ảo/fake (impostor, parallax, ảnh)

`check-playbooks.js` có thể thêm: cảnh báo nếu `tier` không thuộc `{A,B,C,D,—}`.

## Đã có / liên hệ

- `rendering/material-roadmap.md` ĐÃ định nghĩa A/B/C/D cho **VẬT LIỆU** (A surface · B geometry · C kính ·
  D ảo). → Ý tưởng này = **tổng quát hoá** thang đó thành convention **xuyên mảng** (không chỉ material).

## Vì sao hoãn

Mới 3 playbook, chưa đủ lệch để cần chuẩn hoá (simplicity: chưa ≥3 nơi xung đột nghĩa). Định nghĩa sớm =
abstraction thừa. Đợi gom đủ vài mảng rồi chắt 1 thang đúng.
