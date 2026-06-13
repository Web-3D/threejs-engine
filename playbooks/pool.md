---
domain: pool
title: Hồ bơi — bể nhân tạo sạch, đáy phẳng chuẩn, KHÔNG sinh thái
status: seed
tier: —
modules:
  - threejs-modules/components/WaterSurface
  - threejs-modules/site/render/water
issues: []
updated: 2026-06-13
---

# Playbook — Hồ bơi (pool)

> Ranh giới: recipe + tầng + nâng cấp; chi tiết lỗi → `known-issues/`, API → module README.
> **Luật 3 loại nước:** xem memory `project-water-type-semantics`. Pool ≠ [[pond]] (thiên nhiên) ≠ puddle (vũng).

## 1. Kết quả "hoàn chỉnh"

Một **bể bơi nhân tạo**: mặt nước gương xanh trong, **đáy + vách caro tile** chuẩn bể, mép **coping** ốp viền,
hình học **chỉnh chu** (chữ nhật/bo góc). **TUYỆT ĐỐI KHÔNG:** cá, cây thủy sinh, đất/đá/rêu, gò đáy gồ ghề.
Sạch, "đọc" ra ngay là hồ bơi chứ không phải hồ thiên nhiên.

## 2. Recipe dựng

Pool = `WaterConfig{ kind: 'pool' }`. Tái dùng cùng đường render hồ ([[pond]] chia chung WaterSurface + basin),
nhưng **GATE theo kind** chặn mọi yếu tố sinh thái:
- **Đáy/vách:** `floorMaterial`/`wallMaterial = 'tile'` (caro hồ bơi) là mặc-định-đẹp; `bottomColor` xanh bể.
- **Coping:** `edgeWidth` > 0 → dải viền quanh mép (đặc trưng bể).
- **CẤM (gate kind≠pond):** `floorTerrain` (gò đáy) KHÔNG áp · `fish` = undefined · không cây/đá/rêu viền sinh thái.
- Border quanh hồ: nếu có thì kiểu tường/lan can sạch, KHÔNG đá cuội thiên nhiên.

> Code enforce ở tầng nước = **Factory** (2026-06-13: `floorTerrain` chỉ pond · cá thành `WaterConfig.fish`
> pond-only · pool/puddle `fish` undefined). KHÔNG sửa song song.

## 3. Tầng & toạ độ

Như [[pond]] (rim → mặt nước chìm → vách basin → sàn đáy), nhưng **đáy PHẲNG** (không terrain displace) →
sàn đáy là 1 mặt phẳng ở `-depthY`, vách thẳng đứng. Lỗ khoét nền xuyên các lớp y=0 giống pond.

## 4. Lỗi thường gặp

| Triệu chứng | Nguyên nhân (1 dòng) | Chi tiết & fix |
| --- | --- | --- |
| Cá/gò/rêu lọt vào pool | feature nước không gate theo `kind` | enforce kind='pond' mới cho sinh thái (Factory) |
| (chung với hồ) đáy vô hình / sọc ngang | mergeGeometries null / lớp nền che | `known-issues/KI-004` |

## 5. Lịch sử nâng cấp

- `2026-06-13` — Seed: tách spec pool khỏi pond theo luật 3 loại nước (NgQuan). Code gate = Factory đang làm.

## 6. Liên hệ

- **Anh em:** [[pond]] (hồ thiên nhiên — CÓ cá/cây/địa hình) · puddle (vũng — trơ nước)
- **Memory:** [[project-water-type-semantics]] (luật gate feature theo kind)
- **Modules:** `components/WaterSurface` · `site/render/water`
