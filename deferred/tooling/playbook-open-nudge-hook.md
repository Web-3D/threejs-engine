# Hook nhắc mở playbook khi sửa file của 1 mảng

> Trạng thái: **deferred** (2026-06-04). Revisit khi: đã verify playbook tiết kiệm đọc thật (lần tới dùng),
> VÀ recall-gate "tôi quên mở playbook trước khi lao vào code" xảy ra thật.

## Ý tưởng

Hiệu quả của playbook bị chặn bởi 1 câu hỏi: tôi có MỞ `playbooks/<domain>.md` trước khi sửa không. Hook
PostToolUse (Edit/Write) tự nhắc:
- map file vừa sửa → domain qua field `modules:` trong frontmatter playbook (map đã có sẵn).
- nếu file thuộc `modules:` của mảng X → in 1 dòng "→ đọc `playbooks/X.md` trước (cửa trước mảng X)".

## Rủi ro / vì sao hoãn

- **Noise:** nhắc mỗi Edit → phiền. Cần debounce (1 lần/session/domain).
- **Map sai:** 1 file có thể thuộc nhiều mảng; `modules:` liệt kê thư mục → phải match prefix cẩn thận.
- **Chưa chứng minh cần:** recall-gate mới là GIẢ THUYẾT (xem reflection "playbook hiệu quả chưa"). Làm hook
  trước khi biết có quên thật = giải bài chưa tồn tại. Đợi 1–2 lần thực chiến rồi quyết.

## Feasibility

Hook đọc được path file sửa (PostToolUse input). Parse `modules:` tái dùng parser của `check-playbooks.js`.
~30 dòng, dễ. Nhưng đừng làm tới khi ĐO được nhu cầu.
