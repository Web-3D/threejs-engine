# PLAN — Lot / Site / Sân vườn (live tracker)

> Thêm **site (sân vườn bao quanh)** vào building → tạo **LÔ hoàn chỉnh** `Lot = building + site`, đơn vị
> thả vào quy hoạch khu phố. Nguyên tắc (đúng ADR-005): logic site **headless → lõi** `threejs-modules/site/`;
> GUI → **vỏ** archplan; đặt N lô → **project** Doraemon. **KHÔNG phình lại archplan** (vừa thin-out xong).
> Vật liệu đất/cỏ/sỏi/rêu/đá → **material-roadmap tier A** (surface-shader + triplanar).

## Khung khái niệm — đây là SITE PLAN (敷地), không phải "trang trí"

Industry giải bài "sân rộng bao nhiêu" bằng **luật**, không cảm tính:
**建ぺい率 (Building Coverage Ratio)** = % đất bị nhà phủ. Khu nhà ở Nhật **30–60%** (low-rise điển hình **40–50%**).
→ Phần còn lại (**40–70%**) = sân vườn + lối đi. **Suy lô từ footprint × tỉ lệ phủ**, không đặt số tùy ý.

### Số liệu Nhật (tra 2026-06-01) + preset

| Preset | Lô | 建ぺい率 | Sân còn lại |
|---|---|---|---|
| 🏙️ Đô thị chật | ~100 m² (30 tsubo) | 60% | ~40 m² |
| 🏡 **Ngoại ô (MẶC ĐỊNH)** | **~165 m² (50 tsubo)** | **50%** | **~80 m²** |
| 🌾 Nông thôn | ~250+ m² (75+ tsubo) | 40% | ~150 m² |

Tham chiếu: nhà sở hữu TB Nhật ~121 m² sàn (36.8 tsubo); 1 tsubo = 3.306 m²; chuẩn MLIT gia đình 4 người ≈ 38 tsubo/125 m².

## Quyết định đã chốt (3 câu hỏi, 2026-06-01)

1. **Sizing:** mặc định coverage-ratio (165 m²/50%) → **chỉnh tay** + **bảng số liệu live** đối chiếu kế bên
   (lô / footprint / phủ% / sân còn lại) để canh "không để sân quá to". = hybrid default+override+readout.
2. **Scope v1 = chỉ G0** (nền + rào). Cây/đá/hồ phase sau.
3. **Hồ cá:** defer về phase cuối; nếu cần sớm → fake-water (normal-scroll + fresnel, **KHÔNG** transmission tier C).

## Phân loại vai trò

| Phần | Tầng | Vị trí |
|---|---|---|
| Geometry site (ground, fence, scatter, rocks, water) — headless | **LÕI** | `threejs-modules/site/` (anh em `building/`) |
| Hợp nhất lô | lõi | `Lot = { building: BuildingState, site: SiteState }` |
| GUI tab "Sân vườn" + readout | **VỎ** | archplan (đẩy logic xuống lõi, chỉ wire) |
| Đặt N lô theo layout | **PROJECT** | Doraemon (city-planning) — chưa đụng ở G0 |
| Vật liệu đất/cỏ/sỏi/rêu, đá | **tier A** | material-roadmap (skill `triplanar-mapping` cho đá) |

**Schema (⚠️ persist) — composition ở VỎ, KHÔNG bump building:** `serializeDesign` ở lõi `building/state.ts`
là domain building thuần → KHÔNG cho nó biết `SiteState` (tránh building→site coupling sai hướng). Thay vào đó
**vỏ `persistence.ts` compose**: ghi `{ ...buildingFile(v10), site }` — building file **giữ nguyên v10, parse path bất biến**;
`site` là key **optional + default riêng** (`siteV` riêng nếu sau cần migrate site). Old file thiếu `site` → default →
**không đụng đường building cũ** = loại sạch rủi ro blank-app (memory rename-persisted-state-field-blanks-app).

## Phases

### ✅ G0 — Lô nền (XONG 2026-06-02) — nền + rào + đặt nhà + readout
- **Đã ship:** lõi `site/state` + `site/render/fromState` (nền slab dày 1–10cm đáy y=0; rào gỗ cọc+thanh /
  tường liền, merged 1 mesh); **nền cỏ = `GrassGround` procedural TSL shader** (tier A, `shaders/ground/`,
  patch 3-tông sage/tươi/khô + clump AO + macro nắng-bóng + **gió lùa** `setTime` + blade streak có hướng + LOD);
  đất/sỏi màu phẳng;
  vỏ panel 🌳 Sân vườn (`gui/site.ts`) + bảng số liệu live (lô/nhà/phủ%/sân,
  cảnh báo >60%); `_renderSite` đôn building+pick lên `groundThick` khi `show`; DesignStore compose `site`
  (building v10 bất biến). Gate: kit+archplan tsc/eslint/build + Doraemon tsc ✅. **Mắt :3002 — chờ NgQuan.**
- **Lõi `site/state.ts`:** `SiteState` (lotWidth/Depth mm, coverageTarget, ground.material, fence cfg), `FenceConfig`,
  `Lot` type, factories, `GROUND_PRESETS`, JP defaults, helper `coverageStats(site, footprintArea)` → {lotArea, gardenArea, coveragePct}.
- **Lõi `site/render/fromState.ts`:** `renderSiteState(site, footprintBox, ctx)` headless — build **ground plane** (sized) +
  **fence** quanh biên (inset = setback). Mirror pattern `renderBuildingState`. Ground material = swatch presets (G0: color/texture
  đơn giản MeshStandardNodeMaterial; procedural tier-A shader nâng cấp sau). Fence tái dùng wood/wall components có sẵn.
- **Vỏ archplan:** tab **"Sân vườn"** trong GUI (đối xứng tab building); `siteGroup` riêng (dispose độc lập);
  `_renderScene` gọi `renderSiteState(...)` cạnh `renderBuildingState(...)`; **bảng số liệu live** (readout: lô/footprint/phủ%/sân)
  cập nhật khi đổi slider — footprint lấy từ lõi `footprintXZ`/`computeLocalBbox` (build.ts). live-update helper `live(ctrl,ctx)` (memory feedback-slider-live-update).
- **Persist:** vỏ `persistence.ts` compose `{ ...buildingFile, site }` — building v10 bất biến; `site` optional+default. KHÔNG bump building schema.
- **Gates:** kit tsc/eslint; archplan tsc/eslint/build; Doraemon tsc (không đụng nhưng verify import lõi). **Mắt :3002**:
  nền hiện đúng cỡ + đổi loại đất + rào quanh + nhà nằm trên + readout khớp + Save→F5 giữ (additive schema).
- Doc-sync: README site/ + ARCHPLAN.md + ROADMAP.

### 🌿 G1a — Cỏ 3D `GrassBlades` (XONG v1 2026-06-02) — lá nhú lên + gió
- **Đã ship:** `components/GrassBlades` (tier B) — InstancedMesh lá strip (geometry mét, thon ngọn) + **TSL vertex-wind**
  (gốc cứng/ngọn cong `bend ∝ (y/H)²`, `sin(time)` + flutter, phase per-lá từ world-XZ qua `instancedBufferAttribute`);
  scale/xoay/tint random; count **cap** (accent-only). Rải bởi `site/render` lên nền khi `ground='grass' & grass3d.enabled`.
  Vỏ: toggle 🌿 Cỏ 3D ở panel 🌳 Sân vườn + **panel riêng 🎛️ Tinh chỉnh** (`gui/tweak.ts`) chỉnh chi tiết:
  structural (mật độ/cao/rộng lá → dựng lại khi BUÔNG) vs uniform (gió/tốc độ/màu gốc-ngọn → LIVE qua
  `ctx.tuneGrass` trên instance đang sống, né recompile NodeMaterial). State `grass3d` mở rộng (persist-safe).
  Panel Tinh chỉnh = nơi gắn decor/effect sau (đá/…) — thêm section, KHÔNG xây framework. Cặp tier-A = `GrassGround`.
  Hình dáng nâng cấp (2026-06-02): lá **ellipse thon 2 đầu** (`pow(sin(hf·π), taper)`), **màu 2 trục** (dọc gốc→ngọn +
  ngang giữa→mép), **cao-thấp ngẫu nhiên** + **ngả 1 chiều** (un-rotate world→local theo rotY per-lá), **đổ bóng**
  (receiveShadow luôn bật + castShadow toggle). Tất cả uniform → LIVE; data2 vec2 (heightSeed, rotY) per-lá.
- **Gate:** kit tsc/eslint/validate + archplan tsc/eslint/build ✅. **Mắt :3002 — chờ NgQuan** (runtime WebGPU:
  instancedBufferAttribute + positionNode chỉ xác nhận được bằng mắt).
- **Còn (deferred):** LOD-theo-camera (BẮT BUỘC trước khi bật nhiều lô/city — cap chỉ an toàn 1 lô);
  footprint-exclusion (không rải dưới nhà); gió coherent-hướng (v1 semi-coherent); normal theo bend.

### ⏳ G1b — Cây / bụi (deferred) — scatter cây/bụi
**InstancedMesh + LOD + billboard-ở-xa NGAY** (budget: RuntimeGuard <100 draws, <500k tris; memory brick3d-accent-only).

### ⏳ G2 — Đá tảng (deferred) — rocks nhỏ→lớn, triplanar (skill `triplanar-mapping`).

### ⏳ G3 — Hồ cá (deferred) — gated tier C transmission; hoặc fake-water sớm hơn.

## Rủi ro
- **Schema persist:** composition ở vỏ, building v10 bất biến, `site` optional+default; verify Save→Load→F5 không mất building cũ + file building-only cũ vẫn mở.
- **Đừng phình vỏ:** logic ground/fence ở lõi; archplan chỉ wire GUI + readout (lặp lại bài học thin-out).
- **Budget (G1+):** instancing/LOD bắt buộc từ ngày đầu khi có thực vật.
- **Đơn vị mm/m:** SiteState mm (đồng bộ BuildingState) → renderer /1000 tại biên (như segToSpec).
