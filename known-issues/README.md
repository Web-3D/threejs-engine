---
title: Known Issues — Bug Catalog
---

# known-issues/ — Catalog lỗi thường gặp & cách sửa

Mỗi lỗi **đã từng vấp** (và dễ tái phạm) có 1 file `KI-NNN-slug.md`. Mục tiêu: lần sau gặp triệu
chứng tương tự → đọc đúng file → KHÔNG lặp lại. Khác `decisions/` (ADR = chọn gì & tại sao) và
`deferred/` (tính năng hoãn). Đây là **lỗi + fix**.

> Song song với memory `learning/failures/` (~/.claude — recall xuyên session, private). File ở đây
> nằm TRONG repo (check-in git, ai đọc repo cũng thấy). Khi tạo entry → link chéo sang memory tương ứng.

---

## Khi nào ghi 1 KI

Ghi khi lỗi thoả ≥1: (a) tốn >15 phút debug, (b) tsc/eslint/validate PASS mà vẫn sai (runtime/visual),
(c) **đã sửa 1 lần rồi tái xuất** ở chỗ khác (copy-paste, schema, …). KHÔNG ghi typo 1 lần, lỗi
hiển nhiên từ message.

## Cấu trúc mỗi file — 5 câu hỏi (theo yêu cầu)

Frontmatter = meta phân loại (filter/grep được). Body = chi tiết.

| Câu hỏi | Nằm ở |
| --- | --- |
| **Lỗi gì** (triệu chứng + loại) | `category` + `title` (meta) → §1 (body) |
| **Khi nào** (trigger) | `when` (meta) → §2 |
| **Ở đâu** (file/module/layer) | `where[]` (meta) → §2 |
| **Tại sao** (root cause) | §3 |
| **Sửa như thế nào** | §4 + `status` (meta) |
| **Phòng tái phạm** | §5 |

Copy `_TEMPLATE.md` → đổi tên `KI-NNN-<slug>.md` → điền → thêm 1 dòng vào bảng index dưới.

## Bảng meta — giá trị hợp lệ (giữ enum để filter)

- **category:** `geometry` · `state-persist` · `shader` · `gpu-dispose` · `css-ui` · `build-tooling` · `api-version` · `perf`
- **domain** (BẮT BUỘC): slug mảng playbook — `pond` · `window` · `grass` · `roof` · `wall` · `fence` · `boulder` … (nhiều mảng ngăn dấu phẩy) · `—` nếu KHÔNG thuộc mảng build (lỗi tooling/workflow). → tra "lỗi của mảng X": `grep -rl "domain:.*X" known-issues/`; playbook §4 của mảng đó trỏ ngược về.
- **severity:** `low` · `medium` · `high`
- **status:** `open` (chưa sửa) · `fixed` (đã sửa, giữ để nhớ) · `mitigated` (chặn tạm) · `wontfix`

---

## Index

| #   | Tiêu đề | Domain | Category | Severity | Status | Ngày |
| --- | --- | --- | --- | --- | --- | --- |
| 001 | Fix boundary `solidTraps` không propagate sang bản copy → răng cưa mép cửa brick-3d | window | geometry | high | fixed | 2026-05-30 |
| 002 | `replace_all` thay luôn expression trong thân helper mới → self-recursion vô hạn | — | build-tooling | medium | fixed | 2026-05-31 |
| 003 | Ghi đè `positionNode = vec3(...)` xoá instanceMatrix → mọi instance dồn về gốc (preview giấu bug) | window, grass | shader | high | fixed | 2026-06-04 |
| 004 | Đáy hồ không hiện — basin merge null (trộn index) + nền backdrop đặc che basin dưới y=0 | pond | geometry | high | fixed | 2026-06-04 |
