---
id: KI-NNN
title: <ngắn gọn 1 dòng — triệu chứng chính>
category: <geometry | state-persist | shader | gpu-dispose | css-ui | build-tooling | api-version | perf>
domain: <slug mảng playbook: pond | window | grass | roof | wall | fence | boulder … — nhiều mảng ngăn dấu phẩy; "—" nếu KHÔNG thuộc mảng build (lỗi tooling/workflow)>
severity: <low | medium | high>
status: <open | fixed | mitigated | wontfix>
when: <KHI NÀO lỗi xuất hiện — điều kiện/thao tác trigger>
where:
  - <path/file.ts:line>           # ở ĐÂU — liệt kê mọi nơi dính (kể cả bản copy)
discovered: <YYYY-MM-DD>
fixed-in: <commit-sha hoặc "—">
related:
  - commit:<sha>
  - memory:<tên file trong ~/.claude/.../learning/failures>
  - ki:<KI-NNN khác nếu liên quan>
tags: [<keyword>, <keyword>]      # grep nhanh: ví dụ opening, brick, boundary, copy-paste
---

## 1. Lỗi gì (triệu chứng)

<Mô tả cái user/ta THẤY. Kèm cách tái hiện nếu có.>

## 2. Khi nào & Ở đâu

<Trigger cụ thể + file/dòng. Trùng `when`/`where` meta nhưng diễn giải kỹ hơn.>

## 3. Tại sao (root cause — verify, không đoán)

<Cơ chế thật. Ghi rõ đã VERIFY bằng gì (đọc code/test/ảnh). Phân biệt "đoán" vs "đã chứng minh".>

## 4. Sửa như thế nào

<Patch cụ thể. Nếu chưa sửa (status: open) → ghi cách sửa dự kiến + rủi ro.>

## 5. Phòng tái phạm

<Checklist/quy tắc để KHÔNG lặp. Đây là phần giá trị nhất.>
