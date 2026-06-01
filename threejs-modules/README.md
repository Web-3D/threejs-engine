# threejs-modules

> Thư viện module Three.js cá nhân — NgQuan86
> **Đọc file này trước** — đây là catalog toàn bộ.
> GitHub: https://github.com/NgQuan86/threejs-modules

---

## Cách dùng nhanh (cho Claude Code)

1. Tìm module trong bảng dưới
2. Đọc `[category]/[tên]/meta.json` → xem props, tags, deps, complexity
3. Đọc `[category]/[tên]/index.ts` → lấy code
4. Copy vào project — **KHÔNG sửa file trong repo này**
5. Dispose pattern phải được giữ nguyên khi adapt

---

## Cột Status — trạng thái tích hợp (audit 2026-06-01)

> Status đo **đã được project thật dùng chưa**, KHÁC `meta.status` (đo unit/example pass).
> Verify bằng grep import trong 3 consumer (`00-Threejs`, `01-Doraemon`, `archplan`) — 2026-06-01.

| Status | Nghĩa |
| --- | --- |
| ✅ in-use | Có ≥1 consumer project import thật — đã chứng minh qua tích hợp. |
| 🧱 base | Base/abstract class — module khác kế thừa. Không consumer trực tiếp là ĐÚNG thiết kế. |
| 🗄 idle | Unit-pass nhưng CHƯA consumer nào import. **Không phải "kém"** — phần lớn xây sẵn cho gameplay Doraemon tương lai (physics/audio/effects). Cần integration-test trước khi tin là production-ready. |

**Tổng quan:** lõi đã chứng minh = `building-kit` + `BaseWorld` + bộ surface/wall của archplan (`AsphaltGround`, `BrickWall/ConcretePanel/WoodPlank/MetalPanel`, `InstancedBrickWall/WoodSidingStrip/WoodSidingWall`, `Tabs`, `RuntimeGuard`). Phần còn lại đa số 🗄 idle — built-ahead, chưa qua lửa tích hợp.

---

## Shaders

| Tên                  | Mô tả                                         | Tags                              | Status |
| -------------------- | --------------------------------------------- | --------------------------------- | ------ |
| `BaseShaderMaterial` | Abstract base cho shader TSL NodeMaterial — protected material, dispose, getMaterial, isDisposed guard | base-class, abstract, node-material, tsl | 🧱 base |
| `TriplanarMapping`   | Texture không cần UV — blend 3 mặt phẳng      | triplanar, terrain, uv-free       | 🗄 idle |
| `WorldNoise`         | 3D noise field trong world space              | noise, wind, animation            | 🗄 idle |
| `RoundedCorners`     | SDF rounded box trong fragment shader         | sdf, ui, stylized                 | 🗄 idle |
| `ProceduralFracture` | Vertex displacement dọc normal = vết nứt động | fracture, displacement, vertex    | 🗄 idle |
| `InteriorMapping`    | Parallax room illusion qua cửa sổ tòa nhà    | interior, parallax, building      | 🗄 idle |
| `VATShader`          | Vertex Animation Texture — replay GPU animation từ DataTexture | vat, animation, gpu, vertex | 🗄 idle |
| `DissolveShader`     | Noise-based dissolve với edge glow — spawn/despawn cinematic   | dissolve, noise, vfx, tsl   | 🗄 idle |
| `WindAnimation`      | Vertex displacement giả lập gió — triNoise3D positionNode | wind, foliage, displacement, tsl | 🗄 idle |
| `BrickWall`          | Procedural brick — triplanar world-space, no UV, running bond + mortar | brick, building, procedural, triplanar, surface | ✅ in-use |
| `ConcretePanel`      | Procedural concrete panel — seam grid + 3-octave fbm variation         | concrete, building, procedural, triplanar, surface | ✅ in-use |
| `RoofTileJP`         | Procedural kawara roof tile — sdRoundBox corners + S-profile ridge      | roof, tile, japanese, procedural, triplanar, sdf   | 🗄 idle |
| `WoodPlank`          | Procedural wood plank — row seam, directional grain, end-grain darkening | wood, plank, grain, surface, triplanar, world-space | ✅ in-use |
| `MetalPanel`         | Procedural corrugated metal — horizontal ridges + panel seam, galvanized variation | metal, corrugated, ridge, industrial, surface, triplanar | ✅ in-use |
| `Weathering`         | Layered weathering overlay — moss, dirt streak, rust, rain stain (4 independent amounts) | weathering, moss, rust, dirt, aging, surface, triplanar | 🗄 idle |
| `AsphaltGround`      | Procedural asphalt/tar road — world-space XZ, no UV, worn patches + aggregate + LOD | asphalt, tar, road, ground, world-space, no-uv | ✅ in-use |

---

## Utils

### core/
| Tên              | Mô tả                                                              | Tags                                       | Status |
| ---------------- | ------------------------------------------------------------------ | ------------------------------------------ | ------ |
| `RuntimeGuard`   | Kiểm tra draw calls, triangles, geometry leak mỗi frame           | performance, monitoring, debug             | ✅ in-use |
| `GlobalUniforms` | Shared TSL nodes uTime/uWeather/uDamage — import trực tiếp        | uniform, tsl, animation, shader-sync       | 🧱 base |
| `BaseWorld`      | Abstract scene setup — WebGPURenderer + camera + loop trong 1 class | base-class, abstract, scene, webgpu       | ✅ in-use |

### performance/
| Tên             | Mô tả                                                   | Tags                                    | Status |
| --------------- | ------------------------------------------------------- | --------------------------------------- | ------ |
| `LODSystem`     | Wrap THREE.LOD — typed levels, auto/manual update       | lod, performance, distance              | 🗄 idle |
| `CharacterPool` | Generic object pool — acquire/release O(1), zero GPU alloc | pool, crowd, performance, reuse      | 🗄 idle |

### environment/
| Tên            | Mô tả                                                   | Tags                                    | Status |
| -------------- | ------------------------------------------------------- | --------------------------------------- | ------ |
| `DayNightCycle`| Chu kỳ ngày-đêm — drive DirectionalLight + AmbientLight | lighting, day-night, animation, ambient | 🗄 idle |

### interaction/
| Tên                 | Mô tả                                                   | Tags                                  | Status |
| ------------------- | ------------------------------------------------------- | ------------------------------------- | ------ |
| `InteractionSystem` | Raycaster wrapper — hover/click/pointer events trên 3D mesh | raycaster, interaction, hover, click | 🗄 idle |

### animation/
| Tên              | Mô tả                                                        | Tags                                          | Status |
| ---------------- | ------------------------------------------------------------ | --------------------------------------------- | ------ |
| `AnimationSystem`| AnimationMixer wrapper — play/pause/crossfade glTF clips     | animation, gltf, mixer, crossfade, skeletal   | 🗄 idle |
| `ScrollTimeline` | Scroll-driven camera path — map scroll lên CatmullRomCurve3  | scroll, camera, path, curve, storytelling     | 🗄 idle |

### physics/
| Tên                   | Mô tả                                                             | Tags                                              | Status |
| --------------------- | ----------------------------------------------------------------- | ------------------------------------------------- | ------ |
| `PhysicsWorld`        | Rapier.js world wrapper — async WASM init, gravity, step loop     | physics, rapier, wasm, gravity, simulation        | 🗄 idle |
| `RigidBody`           | Attach Rapier body + collider vào Three.js mesh, sync sau step()  | physics, rapier, rigid-body, collider, sync       | 🗄 idle |
| `CharacterController` | Kinematic movement — collision-resolved WASD + jump, gravity tích lũy | physics, rapier, character, movement, jump   | 🗄 idle |
| `CollisionEventBus`   | Event bus collision → handler — force threshold, dispatch VAT/Particle/Audio | physics, rapier, collision, events, choreography | 🗄 idle |

### audio/
| Tên            | Mô tả                                                                        | Tags                                              | Status |
| -------------- | ---------------------------------------------------------------------------- | ------------------------------------------------- | ------ |
| `AudioSystem`  | Spatial audio — load/cache sounds, play positional SFX tại world position    | audio, spatial, positional, sfx, web-audio        | 🗄 idle |

---

## Effects

| Tên                  | Mô tả                                                        | Tags                                   | Status |
| -------------------- | ------------------------------------------------------------ | -------------------------------------- | ------ |
| `BaseGPUEffect`      | Abstract base cho geometry-based GPU effects — root Object3D, dispose + onDispose hook | base-class, abstract, effects, gpu | 🧱 base |
| `GPUParticleSystem`  | Base class GPU particles — custom physics via TSL builders   | gpu, base-class, particles, extensible | 🧱 base |
| `SparkSystem`        | GPU-driven sparks/embers — preset xây trên GPUParticleSystem | sparks, particles, vfx, gpu           | 🗄 idle |
| `FireSystem`         | GPU-driven fire — inner + outer flame, wind support           | fire, flame, particles, gpu, vfx      | 🗄 idle |
| `TrailSystem`        | Camera-facing ribbon trail — sword, vehicle, projectile       | trail, ribbon, motion, vfx            | 🗄 idle |
| `BeamEffect`         | Line beam A→B — laser, lightning, connection, rope            | beam, laser, lightning, line          | 🗄 idle |
| `BillboardSprite`    | Sprite luôn xoay mặt về camera — icon, marker, glow           | sprite, billboard, camera-facing, marker | 🗄 idle |
| `ShockwaveRing`      | Ring mở rộng theo thời gian — shockwave, impact, explosion    | shockwave, ring, impact, explosion    | 🗄 idle |

---

## Components

| Tên              | Mô tả                                                       | Tags                                       | Status |
| ---------------- | ----------------------------------------------------------- | ------------------------------------------ | ------ |
| `LODBillboard`   | Swap 3D mesh → billboard sprite khi xa — tiết kiệm draw call | lod, billboard, sprite, crowd, performance | 🗄 idle |
| `PostProcessing` | WebGPU bloom pipeline — pass → bloom → tone mapping output  | post-processing, bloom, webgpu, effects    | 🗄 idle |
| `OutlineShader`  | Per-object outline via BackSide scaled mesh — no post-processing | outline, highlight, select, backside    | 🗄 idle |
| `InstancedBrickWall` | Tường gạch geometry THẬT — nền vữa + InstancedMesh vạn viên running-bond, khe = vữa lõm | brick, wall, instanced, running-bond, architecture | ✅ in-use |
| `WoodSidingWall` | Tường ván gỗ ngang (clapboard) instanced — ~13 tấm nghiêng chồng mép, 2 mặt/tấm (4 tris), cực rẻ (~64 tris) | wood, siding, clapboard, plank, instanced | ✅ in-use |
| `WoodSidingStrip` | Tường ván gỗ 1 KHỐI răng cưa, HỘP KÍN 6 MẶT + khoét cửa/sổ (jamb reveal) — plain mesh MERGE được xuyên nhà | wood, siding, clapboard, strip, mergeable, openings | ✅ in-use |

---

## Hooks

| Tên                | Mô tả | Tags | Status |
| ------------------ | ----- | ---- | ------ |
| _(chưa có module)_ | —     | —    | —      |

---

## UI

> Widget DOM thuần (KHÔNG Three.js) — companion UI cho 3D tool. Theme qua CSS custom props.

| Tên    | Mô tả                                                                                                                  | Tags                                  | Status |
| ------ | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ------ |
| `Tabs` | Tabs folder-style thuần DOM — tablist ngang, ARIA + roving tabindex + keyboard (←/→/Home/End), theme CSS vars, nút add | ui, tabs, aria, keyboard, dom, widget | ✅ in-use |

---

## Building

> ✅ **in-use** — Bộ sinh hình **nhà procedural** (Three-native, three-only). KHÔNG theo chuẩn
> 1-module-1-folder — là **sub-library** nhiều file (`parts/` + `tokens` + `turtle` + assembler).
> Consumer import qua alias `building-kit` (vd `building-kit/parts/WallSingle`, `building-kit/tokens`,
> `building-kit/turtle`). Dùng bởi: **Doraemon city runtime** (`Building` preset → World.ts) +
> **archplan editor** (parts + tokens + `turtle`) + (tương lai) **"bảo bối" gameplay**.

| Mục                  | Mô tả                                                              |
| -------------------- | ------------------------------------------------------------------ |
| `building/parts/*`   | Wall/Roof/Structure/Stair/Windows/Door… → `THREE.Mesh`/`Group`     |
| `building/tokens`    | `WALL_COLORS`, `PartResult`, dimension tokens — hằng số chung      |
| `building/turtle`    | **Pure plan geometry** (turtle-walk + center/rotate → vị trí tường). NGUỒN SỰ THẬT chung cho editor (`build.ts`) lẫn headless (`BuildingFromPlan`). |
| `building/Building`  | Assembler preset → Group + config types (city runtime — Doraemon)  |
| `building/BuildingFromPlan` | **Headless assembler** `FloorPlanJSON (AP4) → THREE.Group` (không GUI). Dùng `turtle`. Đích cho "bảo bối". |

### Trạng thái headless (2026-06-01)

- ✅ `turtle.ts` = single source — editor & headless hết chép tay turtle-walk (xoá drift KI-001).
- ✅ `BuildingFromPlan` đọc **wallH per-segment** (trước ép `floorH=max` → san phẳng tường cao khác nhau).
- ⏳ **Material fidelity (deferred):** `BuildingFromPlan` vẫn dùng `MeshToonMaterial` + `WALL_COLORS`,
  CHƯA tái dựng shader-surface (brick/wood/…) như editor → nhà "bảo bối" trông phẳng hơn preview.
  Cần đưa logic `WallMaterialCache` (archplan `build/materials.ts`) vào kit. → `01-Doraemon/deferred/`.

---

## Thêm module mới

Copy từ `_template/` trong category phù hợp.
Quy tắc đầy đủ trong `CLAUDE.md`.
