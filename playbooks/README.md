---
title: Playbooks — Domain Build Guides
---

# playbooks/ — Cẩm nang dựng theo MẢNG

Mỗi **mảng build** (hồ nước, cửa sổ, cỏ, mái, tường, hàng rào, đá tảng…) có **1 file** kể trọn:
*dựng như thế nào → tầng/lớp & toạ độ ra sao → lỗi thường gặp + cách sửa → lịch sử nâng cấp*.
Tích lũy dần — mỗi lần một mảng có tiến triển mới, cập nhật playbook của nó (cùng commit, như ROADMAP).

Mục tiêu: 6 tháng sau quay lại 1 mảng → đọc 1 file là dựng lại được + né đúng những hố đã vấp, KHÔNG
phải lần mò lại code/lịch sử git.

---

## Vào mảng nào → đọc THẲNG mảng đó (không lan man)

`playbooks/<slug>.md` là **cửa trước DUY NHẤT** của mảng. Khi build/sửa 1 mảng:

1. Mở `playbooks/<slug>.md` → §3 (tầng/toạ độ) + §4 (lỗi) = bản đồ; **§6 trỏ THẲNG** module/skill/deferred của mảng.
2. Lỗi của mảng → `grep -rl "domain:.*<slug>" known-issues/` (hoặc cột **Domain** ở `known-issues/README` index).
3. CHỈ mở file/KI mà §4/§6 trỏ tới. **KHÔNG grep lan man** các mảng/file khác.

Đọc playbook như **bản đồ phân loại**, không phải checklist:

- **ĐỌC khi nào:** lúc (tái) VÀO 1 mảng, hoặc gặp triệu chứng lạ thuộc mảng đó. Đọc §1/§3/§5 (tự đủ) làm bản đồ.
- **ĐỪNG đọc khi nào:** mỗi sửa nhỏ (không phải gate bắt buộc); đừng chase §4/§6 (con trỏ) trừ khi cần đúng cái fix/API đó.

**Đọc 1 section RẺ (đừng Read cả file):** header đánh SỐ cố định `## 1.`…`## 6.` (§1 done · §2 recipe ·
§3 tầng/toạ độ · §4 lỗi · §5 nâng cấp · §6 liên hệ). Cần §N → kéo đúng nó bằng **1 lệnh**:
`Grep("^## N\.", path="playbooks/<slug>.md", output_mode="content", -A 25)`. Grep theo **SỐ** (ổn định khi
đổi tiêu đề), không theo chữ. Mỗi section ≤ ~25 dòng (drift-guard canh) → `-A 25` vớ gọn đúng 1 section, không nạp cả file.

---

## Ranh giới — playbook KHÁC gì các doc khác (đọc kỹ để KHÔNG trùng/trôi)

| Loại doc | Là **nguồn chân lý** của | Playbook làm gì với nó |
| --- | --- | --- |
| `known-issues/KI-NNN` | **chi tiết 1 lỗi** (5 câu hỏi: gì/khi/đâu/sao/sửa) | tóm 1 dòng trong §4 + **link**. KHÔNG chép. |
| module `README.md` | **API / props / cách dùng** module | "impl ở module X" + link. KHÔNG chép API. |
| `.claude/skills/` | **kỹ thuật tái dùng** (dispose, tsl, triplanar…) | link khi recipe áp dụng. KHÔNG chép. |
| `deferred/` | **tính năng đã nghiên cứu, hoãn** | link ở §6 (nâng cấp tương lai). |
| `decisions/ADR` | **quyết định kiến trúc + lý do** | link ở §6. |
| ROADMAP / SYNC | **tiến độ theo thời gian toàn repo** | playbook §5 = changelog RIÊNG mảng đó. |
| **playbook (đây)** | **recipe dựng + sơ đồ tầng/toạ độ + lịch sử nâng cấp mảng** | ← phần KHÔNG sống ở đâu khác. |

**Quy tắc vàng:** nếu một thông tin đã có nguồn chân lý ở nơi khác → playbook **link**, không chép.
Playbook chỉ GIỮ phần của riêng nó (recipe tường thuật + sơ đồ tầng + changelog nâng cấp). Lý do: 2 bản
chép tay sẽ drift → sửa 1 quên 1 (xem `ADR-006`).

## Khi nào tạo / cập nhật

- **Tạo file mới:** khi bắt đầu (hoặc đã build) một MẢNG thật. KHÔNG tạo stub rỗng cho mảng chưa làm.
- **Cập nhật:** CHỈ khi tiến triển thật (tier mới, fix lỗi, đổi recipe) → thêm dòng §5 + cập nhật §2–§4 nếu
  đổi. Gặp lỗi mới → ghi KI trước, rồi link vào §4. Cùng commit với code. **KHÔNG cập nhật cho mọi sửa lặt vặt.**
- **Giữ NGẮN + DÀY tín hiệu:** mỗi **section ≤ ~25 dòng** (để `grep -A 25` vớ gọn 1 section), cả file gọn.
  Chuẩn không phải "ít chữ" mà "ít ĐỘN": giữ phần KHÔNG suy ra được từ code (why · tầng/toạ độ · lịch sử),
  cắt phần code đã nói rõ. Chi tiết dài → đẩy sang KI/README/skill rồi **link**. (`check-playbooks.js` canh.)

Copy `_TEMPLATE.md` → `<slug>.md` → điền 6 mục → thêm 1 dòng vào index dưới.

---

## Index

> Auto-sinh từ frontmatter mỗi playbook bằng `node check-playbooks.js --write` — **không sửa tay** giữa markers.

<!-- AUTO:index -->
| Mảng | File | Tier | Trạng thái | Module(s) | KI |
| --- | --- | --- | --- | --- | --- |
| Cỏ 3D | [grass.md](grass.md) | B | building | GrassBlades, GrassGround | KI-003, KI-005 |
| Ground | [ground.md](ground.md) | — | building | fromState.ts, state.ts, terrain.ts | KI-011 |
| Hồ nước | [pond.md](pond.md) | B | building | WaterSurface, fromState | KI-004, KI-005, KI-006, KI-007, KI-008, KI-012 |
| Cửa sổ / lỗ mở | [window.md](window.md) | — | building | WallSingle, InstancedBrickWall, WoodSidingStrip, WoodSidingWall | KI-001, KI-003 |
<!-- /AUTO:index -->

> Mảng sẽ thêm sau: mái (roof), tường (wall surface), hàng rào (fence), đá tảng (boulder)… — tạo file khi build.
