---
domain: pond
title: Hồ nước — gương phản chiếu + nhìn xuyên đáy, khoét lỗ xuyên nhiều lớp nền
status: building
tier: B
modules:
  - threejs-modules/components/WaterSurface
  - threejs-modules/site/render/fromState   # basin + khoét lỗ nền (không phải module rời)
issues:
  - KI-004
updated: 2026-06-04
---

# Playbook — Hồ nước

> Ranh giới: recipe + tầng/toạ độ + nâng cấp ở đây; chi tiết lỗi → `known-issues/`, API → module README.

## 1. Kết quả "hoàn chỉnh"

Nhìn từ trên xuống thấy một **lỗ lõm thật**: vành nền → mặt nước chìm dưới vành → **vách basin** → **sàn đáy**
(màu `bottomColor`). Mặt nước vừa **gương** (nhìn xiên/grazing soi trời+nhà) vừa **trong** (nhìn thẳng xuyên
xuống thấy đáy gợn sóng). KHÔNG có lớp nào (nền/lưới) cắt sọc ngang lòng hồ. Sóng chạy, đốm nắng glint theo sun.

## 2. Recipe dựng

**(A) Mặt nước = component `WaterSurface`** (`MeshBasicNodeMaterial`, mesh xoay −90°X nằm ngang):
- `reflector({ resolution, bounces:false })` = gương phẳng thật (+1 render pass/RTT). `.target` phải là
  **con của mesh** (mặt phẳng phản chiếu bám nước).
- Khúc xạ (B) = `viewportSharedTexture(viewportSafeUV(screenUV + lệch))` lấy cái-SAU-nước trong framebuffer.
  → nước **`transparent=true` LUÔN** để vẽ ở pass trong suốt (SAU opaque) → có đáy phía sau mà khúc xạ.
- Trộn `mix(refraction, reflection, fresnel)` (Schlick); sóng = 2 `triNoise3D` cuộn ngược (không texture);
  glint = `reflect(-sunDir, n)` mũ shininess. `setTime`/`setSun` mỗi frame.

**(B) Đáy = basin** (dựng ở `site/render/fromState`, KHÔNG trong component — component chỉ lo MẶT nước):
- vách = quad mỗi cạnh polygon (**yTop=RIM** → yBot), sàn = `ShapeGeometry` ở yBot, **merge 1 mesh**, material
  đục `DoubleSide`. ⚠ `mergeGeometries` đòi đồng nhất index → `floor.toNonIndexed()` trước merge (xem KI-004).
- Vách chạy từ **mặt nền (rim)** xuống → liền coping↔tường, KHÔNG lộ mặt-cắt slab (đường xanh cỏ). Nền lô khi
  có hồ dựng **PHẲNG** (ShapeGeometry, không khối dày) nên không còn cut-face để hở — xem (C)+§3.
- Vẽ basin (opaque) **TRƯỚC** nước (transparent) → `viewportSharedTexture` của nước bắt được đáy.

**(C) Khoét lỗ xuyên MỌI lớp che** (xem §3 — đây là chỗ chính hay sai):
- nền lô (lõi): `buildGround` → **`ShapeGeometry(lotShape)` PHẲNG ở rim** (KHÔNG ExtrudeGeometry dày — né mặt-cắt
  xanh) với `Shape.holes` = polygon hồ.
- nền backdrop editor (vỏ): `_rebuildEditorGround` → `ShapeGeometry(80×80 − lỗ hồ)`.
- lưới editor (vỏ): `_buildGridGeo` → `LineSegments` tự dựng, cắt đoạn nằm trong bbox hồ (GridHelper KHÔNG hole được).
- **Single source** polygon lỗ = `pondWorldXZ(w)` / `poolPolygons(site)` export từ lõi → cả 3 chỗ dùng chung, không drift. ĐA-INSTANCE: loop MỖI pool bật (`renderPools`).

**(D) Cao độ mặt nước:** `baseY = max(yBot + 3cm, rim − 3cm)` — chìm ~3cm dưới vành, LUÔN trên đáy ≥3cm
(slab mỏng ~1cm nên kẹp theo ĐÁY, không theo slab). Skills áp dụng → §6.

## 3. Tầng & toạ độ

Cao độ (mét, `rim = groundThick/1000 ≈ 0.01`, `depthY` mặc định 0.6):

```
y = rim (= groundThick) ── mặt nền PHẲNG (cỏ) + ĐỈNH vách basin + coping (rim+3mm)  ← lawn ShapeGeometry
y = rim − 0.03          ── MẶT NƯỚC (baseY)                                          ← WaterSurface
y = 0                   ── mức backdrop+grid editor (vỏ)                             ← carve cùng lỗ
y = rim − depthY        ── SÀN ĐÁY basin (yBot)                                      ← floor
```

(Nền lô PHẲNG ở rim — KHÔNG còn slab dày 0..t → hết mặt-cắt xanh; vách basin chạy rim→yBot phủ toàn bộ thành.)

**Lớp che phải khoét cùng lỗ:** (1) nền cỏ (ShapeGeometry phẳng @rim), (2) backdrop `PlaneGeometry(80×80)` @0, (3) lưới
`GridHelper`. Carve thiếu 1 lớp = lớp đó che basin (nhìn trên) hoặc backface-cull (nhìn dưới → nước lơ lửng).

**Ánh xạ toạ độ:** Shape ở XY, mesh/geo xoay −90°X → điểm shape `(x, −z)` ↦ world `(x, z)`. Mọi nơi (lawn
hole, backdrop hole, basin floor, water geo) đều dùng `(q.x, −q.z)` → trùng world XZ. Lưới carve theo **bbox**
(rect) còn backdrop/slab carve theo **polygon thật** → free-form: lưới hở rộng hơn 1 chút ở góc (chấp nhận).

## 4. Lỗi thường gặp

| Triệu chứng | Nguyên nhân (1 dòng) | Chi tiết & fix |
| --- | --- | --- |
| Không thấy đáy / nước lơ lửng dưới nền | basin merge trả null (trộn index) + 2–3 lớp nền đặc che | `known-issues/KI-004` |
| Sọc lưới ngang/dọc đè lòng hồ | GridHelper ở y=0 (trên mặt nước), không hole được | `KI-004` (occluder thứ 3) |
| Gương "đứng hình" khi orbit thấp/ngang | reflector bỏ render RTT khi camera ở mặt sau (isFacingAway) | WaterSurface README §Performance — fix `forceUpdate` mỗi frame + `frustumCulled=false` |
| Đáy mờ tịt không thấy | `tint` (Đục%) cao + bottomColor tối | kéo "Đục %" xuống; chỉnh bottomColor |

## 5. Lịch sử nâng cấp

- `2026-06-04` — tier B: reflect + refract (`viewportSharedTexture`) + Fresnel-blend + form tự do (kéo đỉnh) + kéo-thả 3D.
- `2026-06-04` — đáy basin (vách+sàn) + khoét lỗ slab (`Shape.holes`) + config depthY/bottomColor/tint + GUI.
- `2026-06-04` — fix gương đứng hình (`reflector.forceUpdate`); fix basin merge null + khoét backdrop + lưới (KI-004).
- `2026-06-04` — GUI (archplan): tab Water tách BẬC 2 **Pool|Pond|Puddle** (controls hồ hiện ở **Water▸Pool**; Pond/Puddle coming soon) + tông xanh curated `--wt-*`. State vẫn `site.water`, KHÔNG đổi schema.
- `2026-06-04` — hồ **ĐA-INSTANCE**: `site.water`→`site.waters[]` + `kind`; Pool có BẬC 3 tab **Pl1/Pl2/＋** (mỗi tab 1 hồ thật, render `renderPools`); Pond/Puddle placeholder Pd/Pe. Render + khoét lỗ loop mọi pool bật; 3D drag/handle/tune nhắm pool **ACTIVE** (tab đang chọn). Instance mới `enabled=false` (perf). Migrate `water`→`waters` tolerant, không bump schema.
- `2026-06-04` — fix **đường xanh cỏ ở mép hồ**: nền lô khi có hồ dựng **PHẲNG** (`ShapeGeometry` @rim, bỏ `ExtrudeGeometry` dày) → hết mặt-cắt slab; vách basin `yTop=0`→**`rim`** phủ rim→đáy → coping↔tường liền. (Càng tăng `groundThick` cut-face cũ càng lộ — nay triệt gốc.)
- `2026-06-04` — Pl chia BẬC 4/5: **Pool edge|Surface|Bottom▸(Floor|Walls)**. +**coping** `edgeWidth` (500mm, `buildPoolEdge` rect-frame mặt nền) + select **chất liệu** placeholder (`floorMaterial`/`wallMaterial`/`edgeMaterial`='none', render thật sau — basin vẫn 1 material). **Pond render Y NHƯ Pool** (`renderPools`→`renderWaters` gồm pool+pond; puddle còn placeholder); `poolPolygons`→`waterPolygons`. Cỏ né thêm theo edgeWidth.

## 6. Liên hệ

- **Modules:** [WaterSurface](../threejs-modules/components/WaterSurface/README.md) · basin/lỗ nền ở `threejs-modules/site/render/fromState.ts`
- **Skills:** `shader-tsl`, `dispose-pattern`
- **Deferred (nâng cấp):** [water-bottom-refraction.md](../deferred/rendering/water-bottom-refraction.md) — tier C (PBR transmission), lòng-hồ tương tác (cá rig + decor), physics G/IOR riêng hồ
- **KI:** `KI-004`
