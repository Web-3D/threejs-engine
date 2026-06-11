# Mix PALETTE + xô áp 🪣 — "click palette nền mix rồi chỉ thẳng vào tường/nền/fence"

> ## ✅ HOÀN THÀNH 2026-06-11 — trọn 6 bước / 1 phiên
> Mảnh −1 (MixManager, archplan `be1f9dc`) → Factory thumb (assets `1ab108a` + Factory `b80f222`)
> → Mảnh 0 (tex-palette.ts, `81e575b`) → Mảnh 1-2 (presets + PresetPanel, `80bdccb`) → Mảnh 3-4
> (bucket 🪣, `654929e`). Chi tiết kỹ thuật: `playbooks/ground.md` entry 2026-06-11 (palette).
>
> **Lệch plan (có lý do):**
> - Thumb ẢNH THẬT ngay v1 — Factory script làm TRƯỚC Mảnh 0 nên bỏ bước swatch màu tạm.
> - `presetId` CHƯA ghi khi áp: cần +1 field optional vào `GroundMixParams`
>   (threejs-modules/site/state.ts) — file đang trong tay luồng tách fromState song song
>   → làm 1 dòng sau khi luồng đó chốt. Đường nâng REF giữ nguyên thiết kế dưới.
> - Bucket KHÔNG áp zone path/paving/wall (renderer addKindZone không tiêu mix — né "click
>   không thấy đổi"); chỉ zone surface.
>
> **Còn treo:** nghiệm thu ảnh WebGPU toàn hệ (NgQuan `2). Phần dưới giữ làm tư liệu thiết kế.

> NgQuan 2026-06-11, sau khi mix phủ 8 đích: "thay vì cài đặt vào từng cái, tạo 1 palette giống màu
> đã làm — cần ở đâu click palette rồi chỉ thẳng vào phần tường/nền/fence". = SketchUp paint-bucket /
> Unity material-apply / CHÍNH palette màu atelier (paintColor brush) của app. Validate: ĐÚNG pattern.

## Nguyên liệu ĐÃ SẴN (~90% — 3 đợt mix 2026-06-11)

- `GroundMixParams` schema chung 8 đích (G0/zone/đáy-vách hồ/fence/tường building/sàn/móng).
- Target generic `{wallMix}`/`{flatMix}` + cache `_zoneMix` key theo params object (Lab).
- `buildMixBoard`/`mkMixSection` (gui/site.ts, export) — tái dùng làm EDITOR preset.
- Mode click-3D mẫu: `_setPaintMode` + palette màu atelier (sơn paintColor lên tường) — mirror.
- Pick đủ: tường (pick instId+segIdx → seg.mix) · zone (groundLayerIdx → layer.mix) · nền
  (isBaseGround → site.groundMix) · fence (fenceIdx → f.mix) · hồ (waterMixRef/Face → floorMix/
  wallMix) · móng/sàn (pick key 'found'/slab → structure.foundMix/slabMix).

## 4 mảnh phải xây (~1 buổi)

1. **Kho preset**: `{ name: string; mix: GroundMixParams }[]` — đề xuất localStorage lab-level
   (như blueprint mái roof-lab; không phình file save design). + export/import JSON sau.
2. **UI palette**: hàng swatch (tên + màu đại diện = avg albedo base?) + active + ✎ sửa (mở
   buildMixBoard với commit = lưu preset — target dummy `{flatMix: preset.mix}` đủ vì board chỉ
   cần params; KHÔNG cọ/Quy luật khi sửa preset? — Quy luật giữ: preset mang rule sẵn) + ＋/🗑.
3. **Mode 🪣 áp mix** (mirror _setPaintMode): bật → orbit khóa? (không cần khóa — click đơn);
   click 3D → resolve đối tượng theo ƯU TIÊN: opening/tường (pick-box gần nhất) > fence > hồ
   (floor/wall theo mesh trúng) > zone > nền G0 > móng/sàn (pick key). Set field mix = CLONE
   preset (structuredClone — quyết định chốt: clone, không ref; xem dưới) → applySite/build đúng hệ.
4. **Loại trừ mode** (Move/Pick/Paint/MixPaint/Bucket — chỉ 1 active) + ESC thoát + cursor hint.

## Mảnh 0 (NgQuan bổ sung cùng ngày): PALETTE TEXTURE thay dropdown

> "Danh sách texture đã quá nhiều, dropdown xuống không còn thấy đầy danh sách nữa" — 17 key
> (GROUND_OPTS) vượt ngưỡng native select. Palette texture = LƯỚI SWATCH thay <select> ở MỌI chỗ
> chọn texture (mix board Nền chính/slot · ground select · đáy hồ · fence...).

- **UI**: popup lưới swatch (mở khi click ô hiện tại) — mỗi ô = MÀU đại diện (GROUND_PRESETS đã có
  sẵn per-key!) + nhãn ngắn; nhóm theo loại (cỏ/cát/sỏi/đá-lát/tường). Click = chọn + đóng. Hover
  = tên đầy đủ. Component DOM thuần `mkTexPalette(opts, cur, onPick)` — thay selectRow/ap-mix-sel.
- **Thumbnail ảnh thật**: kho là .ktx2 — <img> KHÔNG decode được → v1 dùng swatch MÀU preset
  (đủ phân biệt); muốn thumb ảnh thật = Factory xuất `thumb.jpg` 64² vào production/ theo PROTOCOL
  (việc Factory riêng, ghi asset-pipeline). KHÔNG decode ktx2 ra canvas chỉ để làm thumb (đắt).
- Prefetch giữ nguyên (mousedown mở palette → prefetch như select cũ).

## ✅ QUYẾT ĐỊNH ĐÃ CHỐT (NgQuan 2026-06-11)

1. **localStorage** — key `archplan.mixPresets.v1`, cùng họ store lab (như blueprint mái roof-lab).
   Sống per-origin browser (localhost:300x), KHÔNG nằm trong repo/file save. Hệ quả: đổi máy/clear
   browser = mất preset → mảnh 2 kèm export/import JSON ngay v1 (không defer).
2. **CLONE khi áp** — đối tượng mang FULL params riêng. Nâng REF sau ĐƯỢC, đường sạch: áp ghi kèm
   `presetId?: string` (field optional backward-compat) → sau này nút "Re-apply preset" đồng bộ mọi
   đối tượng mang id đó (REF-on-demand, không cần đổi schema). Trade-off CLONE: (a) sửa preset không
   lan — re-apply tay/nút; (b) file save phình nhẹ (~300B/đối tượng + paint b64). ĐỔI LẠI: file save
   TỰ CHỨA — mở máy khác/mất localStorage vẫn render đúng (REF thuần mà mất preset = gãy render).
3. **Factory xuất thumb.jpg 64²** vào production/ theo PROTOCOL — LÀM. Lợi: chọn bằng mắt thật
   (màu preset không phân biệt nổi 2 cỏ/2 cát gần màu), ~3KB×17≈50KB, <img> load thẳng không đụng
   ktx2/GPU, tái dùng cho swatch preset mix. Trade-off: +1 bước pipeline (texture mới phải kèm thumb
   — thêm field meta.json; 17 bộ cũ chạy batch script 1 lần từ source/ basecolor); rủi ro drift
   thumb↔basecolor (nhẹ). → VIỆC FACTORY: script batch + PROTOCOL update (làm trước mảnh 0).

## Mảnh −1 (NgQuan thêm cùng ngày): REFACTOR ArchPlanLab TRƯỚC khi cấy palette

> ArchPlanLab.ts = 3900 dòng (đo 2026-06-11; site.ts 2496). Palette/bucket sẽ CỘNG THÊM vào Lab
> → tách TRƯỚC, cấy sau (đúng thời điểm — đừng đắp thêm lên God-class).

- **Tách hệ MIX khỏi Lab** (~450 dòng liền khối, ranh giới rõ): `_zoneMix` cache + `_groundMixFor`/
  `_buildMixEntry`/`_mixParamsOf`/`_mixSpaceOf`/`_mixRectOf`/`_mixWaterRect`/`_mixHitOf`/
  `_mixMeshMatch`/`_mixStampAt`/`_commitMixPaint`/`_clearMixPaint`/`_tuneMixLive`/`_pruneZoneMix`/
  `_liveMixParams`/`_collectBuildingMix`/`_wallMixMat`/`_applyMixUniforms`/`_applyMixPaintRect`/
  `_applyMixWallRange`/`_setMixPaint`/`_mixPaintOff` → class **`MixManager`**
  (`archplan/src/archplan/mix/MixManager.ts`) — Lab giữ thin delegate (ctx callbacks trỏ manager).
  Tiền lệ pattern: SiteDragTool gom 3 tool site; PaintMask đã tách file riêng.
- Manager nhận deps qua constructor (site, state, raycast helper, store, groundTex loader cb) —
  KHÔNG import Lab (1 chiều). Palette/preset/bucket (mảnh 0-4) cấy VÀO MixManager, không vào Lab.
- Cơ hội tiện thể KHÔNG làm (Surgical): các mảng khác của Lab (water/fence/terrain) để nguyên —
  chỉ tách mix vì palette sắp đắp lên đúng chỗ đó. Refactor rộng hơn = đợt riêng nếu NgQuan gọi.
- Gate sau tách: tsc 0 + eslint 0 + hành vi y nguyên (mix 8 đích + cọ vẽ + persist).

**Audit phình code threejs-modules vùng texture (đo 2026-06-11):**
| File | Dòng | Kết luận |
|---|---|---|
| shaders/ground/PhotoGroundMix | 372 | ✅ lành — module hóa tốt |
| shaders/ground/PhotoGround | 162 · TexturedSurface 134 | ✅ lành |
| site/state.ts | 1028 | ⚠️ chấp nhận — pure data/parse, ranh giới rõ, chưa cần tách |
| **site/render/fromState.ts** | **2060 — #1 toàn modules** | 🔴 PHÌNH — nhưng KHÔNG do mix (hooks mix chỉ ~60 dòng); phình do gom ground+water+fence+zones+basin 1 file. Palette ĐỤNG NHẸ file này (hook sẵn) → KHÔNG tách trong đợt palette (Surgical). Tách = đợt riêng: split theo domain `site/render/{ground,water,fence,zones}.ts` khi NgQuan gọi — ghi nhận NỢ. |
| building/parts/Structure.ts | 1323 | ⚠️ lãnh địa luồng building — không đụng |

## Trigger

NgQuan gọi "làm palette mix" → thứ tự: **mảnh −1 (tách MixManager)** → Factory thumb script →
mảnh 0 (palette texture) → 1-2 (preset+UI) → 3-4 (bucket 🪣).
