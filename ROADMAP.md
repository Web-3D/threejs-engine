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
