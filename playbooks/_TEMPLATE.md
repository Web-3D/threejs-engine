---
domain: <slug — pond | window | grass | roof | wall | fence | boulder …>
title: <Mảng X — 1 dòng>
status: <seed | building | stable>      # seed=mới mở, building=đang phát triển, stable=ổn định
tier: <A | B | C | —>                    # mức hiện tại nếu mảng có thang tier (rẻ→đắt)
modules:                                  # module(s) lõi hiện thực mảng này
  - threejs-modules/<category>/<Name>
issues:                                   # KI liên quan (chỉ liệt kê id — chi tiết ở known-issues/)
  - KI-NNN
updated: <YYYY-MM-DD>
---

# Playbook — <Mảng X>

> **Ranh giới (đọc trước khi viết vào đây):** file này = **recipe dựng + sơ đồ tầng/toạ độ + lịch sử
> nâng cấp**. KHÔNG chép chi tiết lỗi (→ `known-issues/KI-NNN`), KHÔNG chép API/props (→ module `README.md`),
> KHÔNG chép kỹ thuật tái dùng (→ skills). Chỉ tóm + **link**. Xem `playbooks/README.md` cho luật đầy đủ.

## 1. Kết quả "hoàn chỉnh"

<Một cái X đạt chuẩn trông ra sao: đủ mặt nào, đủ tầng nào, nhìn từ góc nào phải đúng. Tiêu chí "xong".>

## 2. Recipe dựng

<Các bước/lớp dựng theo thứ tự. Geometry/shader/material gì. Quyết định chính + lý do. Link module impl
+ skill áp dụng. Đủ để 6 tháng sau đọc là dựng lại được, KHÔNG cần đọc lại toàn bộ code.>

## 3. Tầng & toạ độ

<Sơ đồ các LỚP (z-order/y-level) + ánh xạ toạ độ (local↔world, phép xoay, sign). Đây là chỗ hay cắn —
ghi rõ. Vd hồ: rim/water/basin/floor ở cao độ nào; lỗ phải xuyên MẤY lớp che ở y=0.>

## 4. Lỗi thường gặp

| Triệu chứng | Nguyên nhân (1 dòng) | Chi tiết & fix |
| --- | --- | --- |
| <thấy gì> | <gốc rễ ngắn> | `known-issues/KI-NNN` |

## 5. Lịch sử nâng cấp

<Changelog tích lũy — MỖI lần tiến triển thêm 1 dòng (ngày + việc + tier nếu có). Cũ → mới.>

- `YYYY-MM-DD` — <việc> (tier <X>)

## 6. Liên hệ

- **Modules:** <links>
- **Skills:** <links>
- **Deferred:** <links — nâng cấp đã nghiên cứu, hoãn>
- **Decisions:** <ADR liên quan>
- **KI:** <KI-NNN>
