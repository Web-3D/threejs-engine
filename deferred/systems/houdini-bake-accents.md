# Houdini bake cho ĐIỂM NHẤN (accent/hero asset) — bản đồ chèn vào ecosystem

> **Trạng thái:** 📐 PLANNED (2026-06-09) — NgQuan yêu cầu "xem xét chen Houdini vào những chỗ tạo điểm nhấn với bake".
> Houdini 21.0.729 **Apprentice** đã cài (`C:\Program Files\Side Effects Software\Houdini 21.0.729`).
> Khung quyết định: memory `project-build-vs-houdini-by-delivery-constraint` — chọn theo RÀNG BUỘC GIAO HÀNG,
> không theo "có tool". Pipeline đích: **Factory Phase E (Houdini Connector)** — slot `Factory/houdini/` đã chừa sẵn.
>
> **Revisit khi:** bắt tay làm vách đá thác (waterfall Phase B) / hồi sinh non bộ / hoặc kích hoạt Factory Phase E.

## Nguyên tắc chia việc (delivery constraint)

| Ràng buộc | Verdict |
|---|---|
| **Live-editable** (slider/drag realtime, parametric theo state) | TỰ VIẾT (TSL/three) — bake là tĩnh, phá live-edit |
| **Animated runtime** (sóng, màn thác, particle, glint) | TỰ VIẾT — Factory bake-policy cũng cấm bake VFX/lighting |
| **Tĩnh + cần ĐẸP hơn procedural-rẻ** (hero accent, 1 chỗ nhìn gần) | **HOUDINI BAKE** → .glb → instance/place |
| **Tĩnh + lặp nhiều** (viên đá variants) | HOUDINI BAKE bộ variants → InstancedMesh (layout vẫn TS) |

## Bản đồ chèn — chỗ nào Houdini, chỗ nào giữ TSL

| # | Điểm nhấn | Hiện trạng | Verdict | Ưu tiên |
|---|---|---|---|---|
| 1 | **Đá non bộ / vách đá thác nước** | RockCluster procedural "chưa ra dáng" → **ĐÃ XÓA code 2026-06-10** ([[non-bo-rockery-builder]] = lesson) | **Houdini bake** — đúng đường (1) asset-sculpt đã chốt khi defer: boolean/fracture + erosion + VDB remesh → high→low bake normal/AO. Giải luôn câu hỏi waterfall Phase B "thác đổ từ đâu" (test tạm = TƯỜNG box) | ⭐ #1 |
| 2 | **Bộ viên đá variants** (lát path, cuội border hồ) | Cylinder disc / icosa faceted | **Hybrid** — bake 4–6 viên đá thật (bevel/displace) làm variants; **layout GIỮ TS** (Poisson StoneScatter, arc-length border) vì live-editable | #2 |
| 3 | **Gò terrain hero** (erosion thật) | mounds smoothstep parametric | **Hybrid** — mounds giữ live-edit; lô hero bake **heightmap erosion** (ảnh, không phải mesh) cắm vào `heightAt` như [[terrain-gaea-heightmap]] (Houdini heightfield thay Gaea) | #3 |
| 4 | **Cây / bonsai** (non bộ, sân vườn) | chưa có module cây | **Houdini bake** (Labs tree tools) — khi quay lại non bộ | #4 |
| — | Mặt nước, màn thác + mist, cỏ/rêu, stone-path layout, zones/G-level | TSL + state parametric | **GIỮ tự viết** — live-editable/animated, bake không thay được | — |
| — | Texture PBR | thư viện `assets/textures` + KTX2 sẵn | **KHÔNG Houdini** — NgQuan đã chốt "dán texture nhanh và đẹp hơn" tự sinh | — |

## ⚠️ Thực tế license Apprentice (chặn chính)

- Apprentice: file `.hipnc`, render watermark, **export FBX bị KHÓA** (chắc chắn); Alembic/OBJ/glTF gần như
  chắc cũng khóa (third-party formats) — **VERIFY khi mở app lần đầu** trước khi lên kế hoạch bake thật.
- Heightmap (#3) cũng dính: xuất ảnh từ Apprentice = render watermark.
- ⇒ **Apprentice = HỌC + PROTOTYPE** node network (đúng tham vọng hybrid-tool [[project-hybrid-procedural-tool-ambition]]
  trong memory), KHÔNG xuất asset production được. Bake thật → 2 đường:
  1. **Houdini Indie** (~$269/năm) — xuất FBX/glTF/Alembic, không watermark, cap doanh thu $100k/năm. Mua khi đã
     prototype xong và chắc dùng (đừng mua trước khi học).
  2. **Đường vòng Blender** (0đ) — prototype hình trong Apprentice → tái dựng recipe trong Blender (anchor sẵn của
     Factory, pipeline Phase A–D đã chạy) → bake .glb như cũ. Chậm hơn nhưng không tốn.

## Pipeline (khớp Factory, không chế mới)

```
Factory/source/*.hip → [bake trong Houdini: low-poly + UV + normal/AO]
  → Factory/baked/*.glb → scripts/deploy.js → Engine/assets/[cat]/production/
  → node validate.js ../assets/[cat]/[name]   (từ THREEJS/)
```

Bake policy Factory giữ nguyên: bake geometry/UV/normal/albedo/AO; KHÔNG bake lighting/VFX/procedural-texture
(triplanar runtime vẫn áp lên mesh bake được — đã có cache TexturedSurface dùng chung border/rock).

## Liên hệ

- [[non-bo-rockery-builder]] — đường (1) asset-sculpt = chính file này thực thi
- [[terrain-gaea-heightmap]] · [[megascans-gaea-natural-ground]] — heightmap/asset ngoài cùng triết lý
- `Factory/ROADMAP.md` Phase E (Houdini Connector) · `Factory/CLAUDE.md` bake policy
- Memory: `project-build-vs-houdini-by-delivery-constraint` · `project-hybrid-procedural-tool-ambition`
