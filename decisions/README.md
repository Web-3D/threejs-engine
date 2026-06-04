---
title: Architecture Decision Records
---

# decisions/ — ADR Index

Mỗi quyết định kiến trúc quan trọng có 1 file. Format chuẩn:

- **Context** — tại sao phải quyết định
- **Decision** — chọn gì
- **Alternatives** — đã cân nhắc gì khác
- **Consequences** — hệ quả + revisit trigger

> Không ghi quyết định nhỏ (naming, style). Ghi khi: thay đổi API public, chọn pattern/stack, reject approach có lý do kỹ thuật cụ thể.

---

| #   | Tiêu đề                              | Ngày       | Trạng thái |
| --- | ------------------------------------ | ---------- | ---------- |
| 001 | GlobalUniforms v2 — exported TSL nodes | 2026-05-16 | Accepted   |
| 002 | TSL-first shader policy              | 2026-05-16 | Accepted   |
| 003 | No singleton cho shared state        | 2026-05-16 | Accepted   |
| 004 | Rendering quality baseline (pixelRatio/shadow/light) | 2026-05-24 | Accepted   |
| 005 | building-kit là LÕI — dồn logic dựng-nhà, retire AP4, 1 renderer | 2026-06-01 | Accepted   |
| 006 | Playbooks theo mảng — cẩm nang dựng + lỗi + nâng cấp (`playbooks/`) | 2026-06-04 | Accepted   |
