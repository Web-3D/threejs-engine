---
title: ADR-006 — Playbooks theo mảng (domain build guides)
date: 2026-06-04
status: Accepted
---

# ADR-006 — Cẩm nang dựng theo MẢNG (`playbooks/`)

## Context

Kiến thức "dựng một cái X (hồ/cửa sổ/cỏ/mái…) hoàn chỉnh như thế nào, gồm những tầng nào, đã cắn những
hố nào" đang **rải 4 nơi**: `known-issues/` (lỗi rời, bug-centric), module `README.md` (API/props), skills
(kỹ thuật tái dùng), `ROADMAP`/`SYNC` (tiến độ thời gian). Không nơi nào kể trọn **recipe dựng + sơ đồ
tầng/toạ độ + lịch sử nâng cấp** của một mảng. Hệ quả: mỗi lần quay lại 1 mảng sau vài tháng phải lần mò
lại code + git → chậm, dễ lặp lỗi cũ (đã xảy ra: 3 occluder hồ, copy-paste solidTraps).

## Decision

Thêm thư mục **`THREEJS/playbooks/`** — mỗi **mảng build** 1 file (`pond.md`, `window.md`, `grass.md`…),
template 6 mục: kết quả-hoàn-chỉnh / recipe / tầng-&-toạ-độ / lỗi-thường-gặp / lịch-sử-nâng-cấp / liên-hệ.
Tích lũy dần: mỗi tiến triển 1 mảng → cập nhật playbook đó **cùng commit** (như luật ROADMAP).

**Ranh giới chống trùng (cốt lõi):** playbook giữ phần KHÔNG sống ở đâu khác = recipe tường thuật + sơ đồ
tầng + changelog nâng cấp. Mọi thứ đã có nguồn chân lý khác → **LINK, không chép**:
- chi tiết lỗi → `known-issues/KI-NNN` · API/props → module `README.md` · kỹ thuật → skills · hoãn → `deferred/`.

## Alternatives

- **Nhét vào known-issues:** sai mục đích — KI là bug-centric (5 câu hỏi/lỗi), không phải recipe dựng.
- **Nhét vào module README:** README là API của 1 module; 1 mảng thường = nhiều module + tích hợp editor +
  gotchas → vượt phạm vi README.
- **Chỉ dựa memory/distilled:** memory là private cross-session, không check-in repo (người đọc repo không thấy).
- **Không làm gì:** giữ nguyên 4-nơi-rải → tiếp tục chậm + lặp lỗi (lý do gốc).

## Consequences

- (+) 1 mảng = 1 điểm vào; onboarding lại nhanh; lỗi cũ link sẵn → ít tái phạm.
- (+) Bổ trợ chứ không thay KI/README/skill (ranh giới rõ).
- (−) Thêm 1 doc phải sync. Giảm rủi ro bằng "link không chép" + chỉ tạo file cho mảng ĐÃ build (không stub rỗng).
- **Revisit nếu:** playbook bắt đầu chép lại KI/README (drift) → siết lại; hoặc khi lên Babylon/Unreal cần
  recipe engine-agnostic → cân nhắc nâng lên `Engine/playbooks/`.
