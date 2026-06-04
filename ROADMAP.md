# ROADMAP.md — Three.js Engine Phases

> Source of truth cho toàn bộ hệ thống module của THREEJS engine.
> Trạng thái realtime: `SYNC.md` (snapshot) + Living Index trong `CLAUDE.md` (auto-update).
> Project timeline theo tuần → `00-Threejs/ROADMAP.md`.

---

## Phase A — Environment Foundation _(✅ hoàn thành 2026-05-13)_

Mục tiêu: nền tảng shader + util cho mọi scene. Không có Phase A → không build được gì tiếp.

Exit criteria: tất cả module unit-pass + 00-Threejs import ít nhất 1 shader thành công.

| #   | Module            | Category | Status       | Dependency      |
| --- | ----------------- | -------- | ------------ | --------------- |
| 1   | `GlobalUniforms`  | utils    | ✅ unit-pass  | —               |
| 2   | `RuntimeGuard`    | utils    | ✅ unit-pass  | —               |
| 3   | `TriplanarMapping`| shaders  | ✅ unit-pass  | GlobalUniforms  |
| 4   | `WorldNoise`      | shaders  | ✅ unit-pass  | GlobalUniforms  |
| 5   | `RoundedCorners`  | shaders  | ✅ unit-pass  | —               |

---

## Phase B — Advanced Environment & Splats _(✅ hoàn thành 2026-05-13)_

Mục tiêu: LOD, procedural destruction, interior occlusion, particle system.

| #   | Module               | Category   | Status       | Dependency        |
| --- | -------------------- | ---------- | ------------ | ----------------- |
| 1   | `LODSystem`          | utils      | ✅ unit-pass | RuntimeGuard      |
| 2   | `ProceduralFracture` | shaders    | ✅ unit-pass | WorldNoise        |
| 3   | `InteriorMapping`    | shaders    | ✅ unit-pass | GlobalUniforms    |
| 4   | `GPUParticleSystem`  | components | ✅ unit-pass | —                 |
| 5   | `SparkSystem`        | components | ✅ unit-pass | GPUParticleSystem |

---

## Module Gallery _(✅ hoàn thành 2026-05-14)_

Mục tiêu: giao diện trực quan cho toàn bộ module library — live Three.js canvas mini cho từng module.

- `gallery.html` + `gallery.ts` + `gallery.css` — trang gallery standalone trong `00-Threejs/`
- `galleryCard.ts` — DOM card builder, IntersectionObserver lazy-load
- `galleryModules.ts` — danh sách 10 modules + dynamic import factory
- 10 `example.ts` refactored sang `export async function createDemo(canvas)` pattern
- `vite.config.js`: thêm `threejs-modules` alias + gallery build entry + fix ESLint checker
- Truy cập: `http://localhost:3000/gallery.html`

---

## Phase C — Character Pipeline _(chờ Phase B)_

Mục tiêu: VAT animation, billboard LOD, crowd pooling.

| #   | Module          | Category   | Status       | Dependency   |
| --- | --------------- | ---------- | ------------ | ------------ |
| 1   | `VATShader`     | shaders    | ✅ unit-pass | GlobalUniforms |
| 2   | `LODBillboard`  | components | ✅ unit-pass | LODSystem    |
| 3   | `CharacterPool` | utils      | ✅ unit-pass | RuntimeGuard |

---

## Phase D — Polish & Deploy _(✅ hoàn thành 2026-05-15)_

Mục tiêu: post-processing, animation, dynamic lighting. Đạt performance budget → deploy.

Exit criteria: < 100 draw calls, < 500k tris, < 16.6ms/frame → live demo Vercel.

| #   | Module           | Category   | Status       | Dependency     |
| --- | ---------------- | ---------- | ------------ | -------------- |
| 1   | `PostProcessing` | components | ✅ unit-pass | GlobalUniforms |
| 2   | `WindAnimation`  | shaders    | ✅ unit-pass | WorldNoise     |
| 3   | `DayNightCycle`  | utils      | ✅ unit-pass | GlobalUniforms |

---

## Phase E — Interaction & Animation _(✅ hoàn thành 2026-05-18)_

Mục tiêu: user tương tác được với object 3D, character chạy animation từ glTF, scene phản ứng theo scroll.

Exit criteria: click vào mesh trigger event, glTF animation play/crossfade, scroll điều khiển camera path.

| #   | Module              | Category | Status       | Dependency     |
| --- | ------------------- | -------- | ------------ | -------------- |
| 1   | `InteractionSystem` | utils    | ✅ unit-pass | RuntimeGuard   |
| 2   | `AnimationSystem`   | utils    | ✅ unit-pass | RuntimeGuard   |
| 3   | `ScrollTimeline`    | utils    | ✅ unit-pass | GlobalUniforms |

---

## Phase F — Physics _(✅ hoàn thành 2026-05-18)_

Mục tiêu: object rơi, va chạm, character di chuyển có physics. Dùng Rapier.js (WebAssembly).

Exit criteria: rigid body rơi đúng gravity, CharacterController di chuyển + jump, debug visualizer hoạt động.

| #   | Module                | Category | Status       | Dependency   |
| --- | --------------------- | -------- | ------------ | ------------ |
| 1   | `PhysicsWorld`        | utils    | ✅ unit-pass | RuntimeGuard |
| 2   | `RigidBody`           | utils    | ✅ unit-pass | PhysicsWorld |
| 3   | `CharacterController` | utils    | ✅ unit-pass | PhysicsWorld |
| 4   | `CollisionEventBus`   | utils    | ✅ unit-pass | PhysicsWorld + RigidBody |

---

## Phase G — Audio _(✅ hoàn thành 2026-05-23)_

Mục tiêu: spatial audio system — positional SFX tại world position, tích hợp CollisionEventBus choreography.

| #   | Module        | Category | Status       | Dependency   |
| --- | ------------- | -------- | ------------ | ------------ |
| 1   | `AudioSystem` | utils    | ✅ unit-pass | —            |

---

## Phase H — Procedural World _(⏳ kế hoạch)_

Mục tiêu: tạo nội dung procedural — terrain, building, prop — không cần asset file.

| #   | Module               | Category | Status  | Dependency          |
| --- | -------------------- | -------- | ------- | ------------------- |
| 1   | `TerrainSystem`      | utils    | ⏳ plan | WorldNoise          |
| 2   | `ProceduralBuilding` | utils    | ⏳ plan | TerrainSystem       |
| 3   | `CityLayout`         | utils    | ⏳ plan | ProceduralBuilding  |

---

## Phase I — Scene Streaming _(⏳ kế hoạch)_

Mục tiêu: load/unload chunks theo camera position — city lớn không giới hạn bởi GPU budget.

| #   | Module          | Category | Status  | Dependency      |
| --- | --------------- | -------- | ------- | --------------- |
| 1   | `ChunkManager`  | utils    | ⏳ plan | CityLayout      |
| 2   | `AssetStreamer` | utils    | ⏳ plan | ChunkManager    |

---

## Phase J — Navigation _(⏳ kế hoạch)_

Mục tiêu: NPC tìm đường trong city — NavMesh bake + pathfinding.

| #   | Module           | Category | Status  | Dependency  |
| --- | ---------------- | -------- | ------- | ----------- |
| 1   | `NavMesh`        | utils    | ⏳ plan | CityLayout  |
| 2   | `NPCController`  | utils    | ⏳ plan | NavMesh     |

---

## Changelog

| 2026-06-04 | **Hồ ĐA-INSTANCE + lồng tab 5 bậc + coping + chất liệu + fix mép xanh.** Lõi site-kit: `WaterConfig` thêm `kind`(pool/pond/puddle)+`edgeWidth`(coping 500mm)+`floor/wall/edgeMaterial`; `SiteState.water`→**`waters[]`** (migrate tolerant, KHÔNG bump schema); **`renderWaters`** render pool+pond (puddle placeholder; pond "y như" pool, param sau); `buildWater` loop nhiều hồ (mỗi `reflector` = +1 RTT → instance mới `enabled=false` né tụt FPS); **`buildPoolEdge`** dải coping rect-frame quanh hồ; **fix "đường xanh cỏ" ở mép hồ**: nền lô khi có hồ dựng **PHẲNG** (`ShapeGeometry`@rim, bỏ `ExtrudeGeometry` dày → hết mặt-cắt slab) + vách basin **`yTop=rim`** (phủ rim→đáy) ⇒ coping↔tường liền. Vỏ archplan: tab **Water tông XANH curated** (`--wt-*`) **LỒNG 5 bậc** — Pool\|Pond\|Puddle ▸ Pl/Pd/Pe instance **+＋/✕** (đa-hồ, active=tab đang chọn → 3D drag/handle/tune nhắm đúng) ▸ **Pool edge\|Surface\|Bottom** ▸ **Floor\|Walls** + select **Material** placeholder ('none'); slider water **track trắng** (trước bg-3 trùng nền→tàng hình); tab instance cố-định-nhỏ; drag/carve **multi-pool** (raycast mọi mesh hồ, khoét nhiều lỗ + `keepSpans` cắt lưới). **Hàng Build/Reset/Save/Load/JSON + undo/redo → footer DÙNG CHUNG đáy drawer** (ra khỏi panel Building, bền qua `_rebuildGUI`). Gate lõi+vỏ tsc/eslint + check-playbooks xanh. **Chưa run pixel — chờ test :3002** |
| 2026-06-04 | **Fix hồ NHÌN-THẤY-ĐÁY (vá 3 bug che đáy) + Move ra float/phím Z.** Hồ bật mà không thấy đáy/lòng — 3 bug chồng: (1) `buildBasin` `mergeGeometries` trộn indexed/non-indexed → trả null (mất đáy lặng lẽ) ⇒ `floor.toNonIndexed()` trước merge; (2) 2 lớp nền đặc che basin dưới y=0 ⇒ vỏ `_rebuildEditorGround` (backdrop = `ShapeGeometry` khoét lỗ) + `_buildGridGeo` (lưới = `LineSegments` tự dựng cắt bbox hồ; `GridHelper` không hole được); (3) `baseY` chìm kẹp theo ĐÁY (slab mỏng ~1cm, không theo slab). `pondWorldXZ` export = single-source polygon lỗ (lõi+vỏ dùng chung). Gương hết "đứng hình" lúc orbit thấp: `reflector.forceUpdate`/frame + `frustumCulled=false` (guard `isFacingAway`). Vỏ archplan: nút **Move → float góc-trái-dưới** (ra khỏi drawer) + **phím Z** (Alt cũ đụng OS). Catalog `KI-004`. Gate kit validate + archplan tsc/eslint xanh. **Chưa run pixel — chờ test :3002** |
| 2026-06-04 | **site-kit G1a cỏ đổ-bóng + G3 hồ nước (tier C) reflect+refract.** **Cỏ:** `GrassBlades` thêm **vệt-tiếp-đất giả theo MẶT TRỜI** (InstancedMesh quad con, hướng/dài/đậm = uniform `setSun`, đậm theo góc-cao-sun; fake AO thay shadow-map sub-texel — KI-003 `positionLocal.add` né mất instanceMatrix) + **2 mặt 2 MÀU RIÊNG** (`uInnerColor` thay ×0.5 cứng) + nhận-bóng. **Hồ `WaterSurface` (components/, tier C):** `reflector` gương + **`viewportSharedTexture` khúc xạ NHÌN XUYÊN ĐÁY** Fresnel-blend + đốm nắng `setSun` + **form tự do** (polygon `ShapeGeometry`, kéo đỉnh) + **basin** (vách+sàn) + **khoét lỗ nền** (`ExtrudeGeometry`+`Shape.holes`); `WaterConfig` (shape/points/offset/depthY/bottomColor/tint…) + `parseSite`. Vỏ archplan: sub-tab 💧 Water + **kéo hồ/đỉnh trong 3D** (Move tool, **phím Alt** toggle) + 🎛️**Lab** (đổi tên, reorder Số đo, Bóng đổ tách màu-2-mặt/vệt-toggle). Deferred: `water-bottom-refraction` (C PBR transmission + vision lòng-hồ-tương-tác + physics G/IOR). Gate kit validate + archplan tsc/eslint xanh. **Chưa run pixel — chờ test :3002** |
| 2026-06-03 | **GrassBlades chi tiết — lá/bụi cỏ tả thực + 2 mặt + garden-patches deferred.** Lõi `components/GrassBlades` (tier B): rộng GỐC/THÂN riêng + thon ngọn (mép ellipse) + **cong T→P** + **cong DỌC 1 chiều** (mặt ngoài +Z lồi) + **CỤP 1 chiều** (mặt trong −Z lõm) **2 lựa chọn** shader-normal (rẻ, zero tris) / geometry-fold (`cupGeo`, ×3 tris, ẩn) + **2 MẶT 2 MÀU** (`frontFacing` → ngoài đầy / trong ×0.5) + **bụi cỏ** (`bladesPerClump` gộp K lá: mặt trong quay vào tâm, `clumpSplay` xòe chống đâm xuyên, rải cụm=mật độ÷K → **budget-neutral**). Vỏ archplan: panel 🎛️ Tinh chỉnh **tách tab Lá đơn\|Bụi cỏ** (Tabs xanh rêu) + ô số mm/cm + **preview OrbitControls** (xoay/pan/zoom) + nền gradient studio. Deferred mới: `garden-ground-patches` (mảng bê tông/cát/**nước** exclude cỏ — cắt ~1000 tris/m²), `voronoi-applications`, `procedural-generation-techniques`. Gió (B6) = bước sau; va chạm lá-lá = không khả thi (instanced). Gate kit validate + archplan tsc/eslint xanh |
| 2026-06-02 | **site-kit G0 — sân vườn / lô (nền + rào).** Domain lõi mới `threejs-modules/site/` (anh em building/, ĐỘC LẬP nó): `site/state` (`SiteState` nền+rào + `GROUND_PRESETS` + `coverageStats` 建ぺい率 + `parseSite`) + `site/render/fromState` (`renderSiteState` headless — nền slab dày 1–10cm đáy y=0 hết z-fight grid; rào gỗ cọc+thanh / tường liền, merged 1 mesh). Vỏ archplan: panel 🌳 Sân vườn (`gui/site.ts`) + **bảng số liệu live** đối chiếu nhà/lô (phủ%, cảnh báo >60%); `_renderSite` đôn building+pick lên `groundThick` khi `show` (foundation nằm trên mặt nền); DesignStore **compose `site`** additive — building v10 **bất biến**, file cũ vẫn mở. Khung: 建ぺい率 nhà ở Nhật 30–60%, mặc định lô ~96 m²/50%. Gate kit+archplan tsc/eslint/build + Doraemon tsc xanh. Tracker `PLAN-lot-site-garden.md`; ADR-005 (lõi). Phase G1 cây / G2 đá / G3 hồ cá deferred |
| 2026-06-01 | **Thin-out archplan → LÕI (Phase 0–4) + retire AP4.** Đẩy logic dựng-nhà xuống building-kit: `state.ts` BuildingState schema (P0+shim); `build.ts`+renderer → `render/fromState` (`renderBuildingState` + `class BuildingRenderer` headless; ArchPlanLab delegate, pick-box ở vỏ qua `Placement[]`; 1396→~950 dòng, P1). **Retire `BuildingFromPlan`** (AP4 lossy, dormant 0 caller) → **Gap 2 đóng bằng construction** — 1 renderer canonical đọc `BuildingState` lossless (stairs/balcony/roof-rot/paint full fidelity). Orphan dọn: `parts/Stair.ts`, lớp AP4 export (`buildingStateToJSON`+3); nút 📄 JSON → `serializeDesign` (lossless, Load lại được). Reorg `building/` → `render/`+`preset/`, engine primitive flat, bỏ prefix "Building" ở filename (giữ tên export/class). tsc/eslint/build 3 project xanh. Tracker `PLAN-thin-out-archplan.md`. Thuật ngữ: "lõi" (không "hạt nhân") |
| 2026-06-01 | **Gap 1 đóng — material fidelity headless.** Tách wall-pipeline ra building-kit dùng chung: `wallMaterials.ts` (WallMaterialCache + surface shaders + brick-tex, +textures/bricks/) + `wallAssembly.ts` (`assembleWall` dispatch 5 nhánh material + `mergeWalls`). Editor (archplan) + headless (`BuildingFromPlan`) CÙNG gọi → nhà build từ ngoài render đúng shader-surface/instanced như editor (hết toon phẳng), chống drift KI-001. AP4 export chở đủ field material. tsc/eslint/build 3 project xanh. Gap 2 (full BuildingState, bỏ AP4 lossy) còn deferred |
| 2026-06-01 | archplan rã monolith tiếp — `ArchPlanLab.ts` **1950→1529** (−421, −22%): tách `gui/devhud.ts` (DevHud), `interaction/highlight.ts` (HighlightOverlay, host-pattern), `state/persistence.ts` (DesignStore I/O) + `footprintXZ` về `build/build.ts`. README archplan ghi taxonomy + 2 pattern tách (host-interface / pure-service). Build pipeline ~650 dòng để tách riêng (unify với headless). tsc/eslint/vite build xanh |
| 2026-06-01 | Catalog audit + sync README — thêm 6 module bị drift (BaseShaderMaterial, AsphaltGround, BaseGPUEffect, BeamEffect, BillboardSprite, ShockwaveRing) + cột **Status** (in-use/base/idle) theo grep consumer thật. Lõi proven = building-kit + BaseWorld + surface/wall archplan; phần lớn còn lại 🗄 idle (built-ahead) |
| 2026-06-01 | building-kit hardening headless — `turtle.ts` core dùng chung (editor `build.ts` + headless `BuildingFromPlan` hết chép tay turtle-walk → chống drift KI-001); `BuildingFromPlan` đọc **wallH per-segment** (trước ép `floorH=max` san phẳng). Material-fidelity (toon→shader) defer |
| 2026-05-30 | Category `ui/` mới (widget DOM thuần) — `Tabs` folder-style: tablist + ARIA + roving tabindex + keyboard, theme CSS vars; tách từ ArchPlanLab. validate.js whitelist thêm `ui` |
| 2026-05-30 | Fix `WoodSidingStrip` + `InstancedBrickWall` solidTraps boundary `!b\|\|!t` (cùng bug copy-paste, propagate 7b171a6) — hết răng cưa mép lỗ cửa/sổ. Chi tiết: 01-Doraemon `known-issues/KI-001` |
| 2026-05-30 | `components/` — wall geometry THẬT: `InstancedBrickWall` (gạch InstancedMesh + khoét lỗ), `WoodSidingWall` (clapboard), `WoodSidingStrip` (ribbon 1 khối mergeable + openings), `AsphaltGround` |
| 2026-05-23 | Phase G hoàn thành — AudioSystem (spatial PositionalAudio, load/cache/play, tích hợp CollisionEventBus.onImpact) |
| 2026-05-19 | Phase F mở rộng — CollisionEventBus (event bus collision → handler, force threshold, ImpactEvent dispatch cho VAT/Particle/Audio) |
| 2026-05-18 | Phase F hoàn thành — PhysicsWorld (Rapier WASM wrap), RigidBody (dynamic/fixed/kinematic + cuboid/ball/capsule), CharacterController (collision-resolved movement + jump + gravity) |
| 2026-05-18 | Phase E hoàn thành — InteractionSystem (Raycaster hover/click), AnimationSystem (AnimationMixer crossfade), ScrollTimeline (CatmullRomCurve3 scroll-driven camera) |
| 2026-05-15 | Phase D hoàn thành — PostProcessing (bloom WebGPU), WindAnimation (triNoise3D positionNode), DayNightCycle (sun arc + ambient lighting) |
| 2026-05-15 | Gallery update — thêm 6 modules Phase C + D: VATShader, LODBillboard, CharacterPool, PostProcessing, WindAnimation, DayNightCycle |
| Ngày       | Thay đổi                                                                   |
| ---------- | -------------------------------------------------------------------------- |
| 2026-05-14 | Module Gallery hoàn thành — gallery.html với 10 live Three.js canvas cards, lazy-load qua IntersectionObserver, refactor toàn bộ example.ts sang createDemo(canvas) pattern |
| 2026-05-15 | Phase C hoàn thành — CharacterPool unit-pass: generic pool<T>, acquire/release O(1), warnThreshold analog RuntimeGuard |
| 2026-05-15 | LODBillboard unit-pass: THREE.Sprite + SpriteMaterial, WebGPU auto-upgrade, LOD.addLevel với Object3D, getCurrentLevel() |
| 2026-05-15 | Phase C bắt đầu — VATShader unit-pass: positionNode + normalNode từ DataTexture, vertexIndex TSL, update(time) loop |
| 2026-05-14 | Phase B mở rộng — thêm `GPUParticleSystem` (base class), refactor `SparkSystem` thành preset (composition). Phase B: 5/5 unit-pass |
| 2026-05-13 | Phase B hoàn thành — 4/4 modules unit-pass (LODSystem, ProceduralFracture, InteriorMapping, SparkSystem) |
| 2026-05-13 | Phase A hoàn thành — 5/5 modules unit-pass |
| 2026-05-12 | Tạo file — tổng hợp từ `00-Threejs/ROADMAP.md` + `CLAUDE.md` Phase A build order |
