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
  - KI-005
  - KI-006
  - KI-007
  - KI-008
updated: 2026-06-07
---

# Playbook — Hồ nước

> Ranh giới: recipe + tầng/toạ độ + nâng cấp ở đây; chi tiết lỗi → `known-issues/`, API → module README.

## 1. Kết quả "hoàn chỉnh"

Nhìn từ trên xuống thấy một **lỗ lõm thật**: vành nền → mặt nước chìm dưới vành → **vách basin** → **sàn đáy**
(màu `bottomColor`). Mặt nước vừa **gương** (nhìn xiên/grazing soi trời+nhà) vừa **trong** (nhìn thẳng xuyên
xuống thấy đáy gợn sóng). KHÔNG có lớp nào (nền/lưới) cắt sọc ngang lòng hồ. Sóng chạy, đốm nắng glint theo sun.

## 2. Recipe dựng

**Form (shape):** `rect | circle | ellipse | free`. Tessellate ở **`site/shapes.ts` `shapeToLocalPolygon`** (circle/
ellipse = `EllipseCurve` tái dùng width/depth; free = polygon-**bezier** 2 tay-cầm in/out độc lập mỗi đỉnh, `CubicBezierCurve`).
`pondWorldXZ` = tessellate + offset → **mọi consumer (mặt nước/basin/lỗ-nền/carve/cột-đâm-đáy/cỏ) theo đường cong**.
Coping (`buildPoolEdge`) + ground carve (`waterCarveWithEdge`) dùng `offsetPolygon` **bo-cong ôm hình** (không bbox).

**(A) Mặt nước = component `WaterSurface`** (`MeshBasicNodeMaterial`, mesh xoay −90°X nằm ngang):
- `reflector({ resolution, bounces:false })` = gương phẳng thật (+1 render pass/RTT). `.target` phải là
  **con của mesh** (mặt phẳng phản chiếu bám nước).
- Khúc xạ (B) = `viewportSharedTexture(viewportSafeUV(screenUV + lệch))` lấy cái-SAU-nước trong framebuffer.
  → nước **`transparent=true` LUÔN** để vẽ ở pass trong suốt (SAU opaque) → có đáy phía sau mà khúc xạ.
- Trộn `mix(refraction, reflection, fresnel)` (Schlick); sóng = 2 `triNoise3D` cuộn ngược (không texture);
  glint = `reflect(-sunDir, n)` mũ shininess. `setTime`/`setSun` mỗi frame.

**(B) Đáy = basin** (dựng ở `site/render/fromState`, KHÔNG trong component — component chỉ lo MẶT nước):
- **2 mesh RIÊNG** (bỏ merge): sàn = `basinFloorGeometry` (`ShapeGeometry` @yBot, uv = world XZ), vách =
  `basinWallsGeometry` (quad mỗi cạnh polygon **yTop=RIM** → yBot, uv = chu-vi×cao). Tách để floor/wall mang
  **material độc lập** (`floorMaterial`/`wallMaterial`). Đục `DoubleSide`: **'none'** = `MeshStandardMaterial`
  màu `bottomColor`; **'tile'** = caro hồ bơi (`MeshStandardNodeMaterial`, override `colorNode` = checker 2 màu
  + grout, ô 0.2m, 3 màu user chọn, GIỮ PBR/bóng). Bỏ `mergeGeometries` → thoát rủi ro mixed-index null (KI-004 hết gốc).
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
| Console ngập WebGPU validation (depth MSAA / copy out-of-bounds); nước MẤT phản chiếu | MSAA (`antialias:true`) ✗ reflector RTT → GPU từ chối pass | `known-issues/KI-007` — renderer `antialias:false` + FXAA post |
| Gương đứng hình VĨNH VIỄN sau khi camera chui dưới mặt nước 1 lần | bỏ `forceUpdate` → `_inReflector` kẹt true (bug three) | `known-issues/KI-008` — giữ forceUpdate + shader tắt gương khi dưới nước |
| Gương mất ảnh khi xoay NGANG vượt 1 góc | shader fade dùng normal SÓNG (`dot(eye,n)`) → phụ-thuộc-azimuth | đổi phép thử sang `eye.y` (normal PHẲNG +Y); `KI-008` §5 |
| Gương ĐƠ khi xoay camera **gần thẳng đỉnh** (top-down) | virtualCamera reflector suy biến (`lookAt ∥ up`) | shader fade `1−smoothstep(0.985,0.9995, |uViewDirY|)` theo HƯỚNG-camera (không eye.y per-fragment — pool lệch tâm) |
| **2+ hồ** đang bật → gương 1 hồ ĐƠ | GIỚI HẠN three: reflector dùng chung cờ module `_inReflector` (`bounces:false`) — không exclude reflector khác khỏi nested-render | **Khuyến nghị 1 pool reflect**; pool thêm nên dùng nước rẻ (không RTT). Forum three: phải patch source. (Playbook §1 vốn ghi "1–2 hồ".) |

## 5. Lịch sử nâng cấp

- `2026-06-04` — tier B: reflect + refract (`viewportSharedTexture`) + Fresnel-blend + form tự do (kéo đỉnh) + kéo-thả 3D.
- `2026-06-04` — đáy basin (vách+sàn) + khoét lỗ slab (`Shape.holes`) + config depthY/bottomColor/tint + GUI.
- `2026-06-04` — fix gương đứng hình (`reflector.forceUpdate`); fix basin merge null + khoét backdrop + lưới (KI-004).
- `2026-06-04` — GUI (archplan): tab Water tách BẬC 2 **Pool|Pond|Puddle** (controls hồ hiện ở **Water▸Pool**; Pond/Puddle coming soon) + tông xanh curated `--wt-*`. State vẫn `site.water`, KHÔNG đổi schema.
- `2026-06-04` — hồ **ĐA-INSTANCE**: `site.water`→`site.waters[]` + `kind`; Pool có BẬC 3 tab **Pl1/Pl2/＋** (mỗi tab 1 hồ thật, render `renderPools`); Pond/Puddle placeholder Pd/Pe. Render + khoét lỗ loop mọi pool bật; 3D drag/handle/tune nhắm pool **ACTIVE** (tab đang chọn). Instance mới `enabled=false` (perf). Migrate `water`→`waters` tolerant, không bump schema.
- `2026-06-04` — fix **đường xanh cỏ ở mép hồ**: nền lô khi có hồ dựng **PHẲNG** (`ShapeGeometry` @rim, bỏ `ExtrudeGeometry` dày) → hết mặt-cắt slab; vách basin `yTop=0`→**`rim`** phủ rim→đáy → coping↔tường liền. (Càng tăng `groundThick` cut-face cũ càng lộ — nay triệt gốc.)
- `2026-06-04` — Pl chia BẬC 4/5: **Pool edge|Surface|Bottom▸(Floor|Walls)**. +**coping** `edgeWidth` (500mm, `buildPoolEdge` rect-frame mặt nền) + select **chất liệu** placeholder (`floorMaterial`/`wallMaterial`/`edgeMaterial`='none', render thật sau — basin vẫn 1 material). **Pond render Y NHƯ Pool** (`renderPools`→`renderWaters` gồm pool+pond; puddle còn placeholder); `poolPolygons`→`waterPolygons`. Cỏ né thêm theo edgeWidth.
- `2026-06-04` — **PUDDLE render** (vũng nước): `renderPuddles` + `buildPuddle` = mặt nước **PHẲNG trên nền** (`baseY=rim+5mm`, KHÔNG basin/coping/khoét-lỗ — khúc xạ xuyên thấy cỏ; vẫn phản chiếu). GUI Pe = **Shape|Surface** (bỏ Bottom/Edge). Cỏ né cả puddle (`siteGrassExclude` gồm renderWaters+renderPuddles). Click thường mặt nước → trỏ GUI tab hồ (`_pickWaterEntry`/`_maybeClickFocus`, cả pool/pond/puddle).
- `2026-06-04` — **kéo hồ KHÔNG rebuild (né leak reflector)** + **mảng định-vị**: 3D-drag thân/đỉnh chỉ dời `mesh.position`/`setShape` (reflector con theo, KHÔNG tái-tạo); slider commit-khi-buông. Vì mặt nước chìm dưới rim → lúc kéo chui dưới đất (lỗ-nền chưa theo) → **`_showWaterOutline`** = ShapeGeometry FILL cyan mờ ở mặt nền, vẽ-trên-cùng (`depthTest/Write=false`, renderOrder cao), bám theo cả **3D-drag** lẫn **slider** (`ctx.previewWater`) cho **pool/pond/puddle**; commit (`_applySite` persist) ẩn. (Live-bằng-rebuild = tái-tạo reflector/frame = leak+lag — xem `KI-005`; pool `WaterSurface` chưa pool-hoá.)
- `2026-06-04` — **perf+dispose:** kéo NHÀ không rebuild nước (dirty-check `_siteSig`, `KI-005`); reflector RTT giờ **dispose đúng** (`setCamera`+chuỗi WeakMap, `KI-006`) → hết leak GPU.
- `2026-06-04..05` — **phản chiếu sống lại + đúng góc:** renderer `antialias:false` (MSAA ✗ reflector RTT — `KI-007`, gốc mất gương + flood WebGPU). FXAA post **thử rồi BỎ** (reflector ✗ PostProcessing-pass cũng xung khắc WebGPU, three chưa vá) → hiện **không post-AA** (răng cưa, pixelRatio 2x đỡ). Gương đứng-hình-vĩnh-viễn sau khi camera chui dưới nước = **bug three `_inReflector`** (`KI-008`): giữ `forceUpdate` né bug + shader `fres·smoothstep(0,0.04, eye.y)` tắt gương "từ dưới lên" SAI (dùng `eye.y` normal PHẲNG, KHÔNG normal sóng — kẻo mất gương theo azimuth). Phải vá flood `TSL.NormalNode` (contactQuad cỏ) TRƯỚC mới lộ các lỗi GPU này.
- `2026-06-05` — **sóng FBM 2-octave** (octave lớn 0.6× + chi tiết 2.2× cuộn ngược → bớt đều/nhuyễn) + **fade top-down theo HƯỚNG-camera** (`uViewDirY`, không eye.y — pool lệch tâm) chống gương-đơ near-vertical. **+3 slider Surface:** Turbulence (`detail`=octave-2 amp), Refraction (`refract`=méo ảnh đáy, ×distortion riêng), Wave size (`rippleScale`, kéo phải=to). **Default pool tinh chỉnh:** Wave spd 10 / Ripple 5 / Murk 5 + **Floor color `#a8ceff`** (gạch xanh; pond/puddle giữ bùn). State +`detail`/`refract` (migrate tolerant). **Giới hạn:** 2+ reflector → 1 hồ đơ (xem §4, `_inReflector` module three).
- `2026-06-05` — bỏ FXAA hook ở `BaseWorld` (revert); fix **phím tắt Z/X mất** (vỏ archplan): listener đăng ký TRƯỚC `_buildScene` + click 3D blur input GUI (`_blurActiveInput`) — keydown `e.target instanceof HTMLInputElement` chặn khi ô số slider giữ focus.
- `2026-06-05` — **caro hồ bơi (tile material)**: basin **TÁCH 2 mesh** (floor+wall) thay merge → `floorMaterial`/`wallMaterial` ĐỘC LẬP, dropdown **None | Caro (tile)** (Edge giữ None). Caro = `MeshStandardNodeMaterial` `colorNode` procedural: ô vuông 2 màu xen kẽ (`floor(uv).x+y mod 2`) + mạch vữa grout, **UV baked** (floor world-XZ, wall chu-vi×cao), ô 0.2m, **3 màu user chọn** (Floor color=ô chính, Tile 2, Grout). Khúc xạ nước làm caro gợn → rõ "đáy hồ bơi". Bỏ `mergeGeometries` basin → **KI-004 hết nguồn gốc** (cho basin; `buildFence` còn merge).
- `2026-06-05` — **default surface params** chốt theo user-tune (ảnh): Mirror 30 / Wave spd 10 / Ripple 5 / **Turbulence 150** / **Refraction 160** / Murk 10 / **Wave size 12** (`rippleScale` 1). State +`tileColor2`/`groutColor` (parse tolerant). Default chỉ áp hồ MỚI/reset — design đang lưu giữ giá trị riêng.
- `2026-06-06` — **FORM TỰ DO (Phase 1)**: shape +`circle`/`ellipse`/`free-bezier`. `site/shapes.ts` (mới) tessellate → `pondWorldXZ` SINGLE-SOURCE lan ra basin/lỗ-nền/carve/cột-đâm-đáy/cỏ. `WaterPoint` +tay-cầm `inX/inZ/outX/outZ` (bezier 2 tay độc lập, kéo trong 3D ở `waterDrag` session `'handle'` — sphere cyan + line nối). Coping/carve bo-cong qua `offsetPolygon` (miter pháp-tuyến-đỉnh). Seed free = 8 điểm chu-vi + Catmull-Rom mirror. Backward-compat (optional + parse tolerant). Giới hạn: earcut không guard self-intersection; offsetPolygon concave-gắt tự-cắt. Phase 2 (ground patch + cut-reveal) reuse cơ chế hole này.
- `2026-06-07` — **RÀO/VIỀN quanh hồ** (`buildPondBorder`, dọc vành ngoài coping = `offsetPolygon(pond, edgeWidth)`) AUTO theo shape: **rect → hàng rào gỗ** (cọc 8cm cách ~1.5m + 2 thanh ngang, box merge indexed); **tròn/ellipse/free → ĐÁ CUỘI** (Icosahedron detail-1 faceted, sample arc-length mỗi 0.82×đường-kính = xếp liền, jitter scale/xoay **deterministic** `hash01(idx)` né nhảy mỗi rebuild, merge non-indexed). State `WaterConfig` +`borderEnabled`/`borderHeight`(100–1200mm)/`borderColor` (parse tolerant). GUI `buildBorderRows` ở tab edge (slider/màu **commit-only** né reflector thrash). KHÔNG trộn box+icosa 1 merge (né KI-004). Nhãn tab **"Pool edge"→"Pond edge"** theo `w.kind`.
- `2026-06-07` — **TEXTURE đá cho border** (`BorderMaterialKey`: none|icelandic-jagged|coal-stone|rock-rough): `buildPondBorder`→`borderMaterialFor` dùng `opts.borderMatByKey[key]` = TexturedSurface **triplanar** (caller-owned, KHÔNG push) khi ≠none, else màu phẳng borderColor. Triplanar áp CẢ đá cuội (icosa) lẫn rào gỗ (box). Archplan: BORDER_TEX_SPEC (tile 0.5m) + `_borderTex` cache + `_ensureBorderTex` + inject `_siteTexOpts`. GUI dropdown "Border mat". 3 texture process ktx2 (icelandic không AO).
- `2026-06-06` — **CỘT MÓNG đâm tới đáy hồ** (consumer mới của `depthY`): editor `_groundDropsForBuild` lấy `renderWaters` (pool+pond) → `pondWorldXZ` polygon + `dropY=depthY/1000+2cm` → bơm vào building-kit qua `BuildRenderCtx.groundDrops` (type domain-neutral `GroundDrop`, building-kit KHÔNG import site-kit). `postDropAt` per-cột (point-in-polygon, xoay rotY) kéo dài cột nằm trên hồ tới đáy basin (wood-deck=lưới cột; stone-pillar=trụ đá giữa). **Coupling 1 chiều, refresh khi BUILDING rebuild** — đổi sâu/dời hồ SAU thì cột stale tới khi bật/tắt Move/▶Build/reload (`_applySite` chỉ `_renderSite`, không rebuild nhà). Hồ ở mép nhà stone-pillar → trụ-giữa-trên-đất không đâm (deck lửng mép nước) = giới hạn 1-trụ-trung-tâm.

## 6. Liên hệ

- **Modules:** [WaterSurface](../threejs-modules/components/WaterSurface/README.md) · basin/lỗ nền ở `threejs-modules/site/render/fromState.ts`
- **Skills:** `shader-tsl`, `dispose-pattern`
- **Deferred (nâng cấp):** [water-bottom-refraction.md](../deferred/rendering/water-bottom-refraction.md) — tier C (PBR transmission), lòng-hồ tương tác (cá rig + decor), physics G/IOR riêng hồ
- **KI:** `KI-004`
