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
| `SeigaihaScreen`     | Tường tranh Nhật (fusuma) — khung gỗ chia ô + nền vàng washi + sóng seigaiha (青海波) procedural | wall, japanese, seigaiha, fusuma, procedural, triplanar | ✅ in-use |
| `ShojiScreen`        | Tường shoji (障子) — trục/nan gỗ kumiko + giấy washi / kính + koshita, slider trục/nan/grain | wall, japanese, shoji, kumiko, procedural, triplanar | ✅ in-use |
| `Weathering`         | Layered weathering overlay — moss, dirt streak, rust, rain stain (4 independent amounts) | weathering, moss, rust, dirt, aging, surface, triplanar | 🗄 idle |
| `AsphaltGround`      | Procedural asphalt/tar road — world-space XZ, no UV, worn patches + aggregate + LOD | asphalt, tar, road, ground, world-space, no-uv | ✅ in-use |
| `GrassGround`        | Procedural bãi cỏ/lawn — world-space XZ, no UV, patch tươi/khô + clump + blade speckle + LOD | grass, lawn, cỏ, ground, world-space, no-uv | ✅ in-use |
| `PhotoGround`        | Ground PBR từ texture ẢNH (scan) — map/normal/rough/ao, lát world-XZ ÷ tileSizeMeters (độc lập geometry UV); caller bơm texture | ground, pbr, texture, world-space, tiling | ✅ in-use |
| `PhotoGroundMix`     | Ground MIX ≤5 texture (port bộ nền Lab → TSL): bombing per-ô (xoay/offset/jitter, normal xoay đúng) + 4 lớp mask fbm + height-lerp (lum proxy) + mask VẼ TAY (kênh RGBA, uv zone-local; rect + bias/seed per-slot = uniform LIVE qua setPaintRect/setSlot — kéo slider/dời zone KHÔNG recompile) + macro/úa + trộn xa dual-scale; rough/ao của base. Plan: Factory/deferred/ground-mix-port-plan.md | ground, mix, anti-tiling, bombing, splat, height-lerp, paint, tsl | ✅ in-use (site-kit: zone surface + G0 base) |
| `TexturedSurface`    | Surface PBR **triplanar** (world-space) — đúng MỌI hướng (sàn/tường/đáy hồ/mái nghiêng), normal whiteout, no UV; "unified" cho slab/fence/roof | surface, pbr, texture, triplanar, any-orientation | ✅ in-use |

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
| `Precipitation`      | Mưa/tuyết field — rain LineSegments streak / snow Points, trụ bám camera, 1 draw | weather, rain, snow, points, field | ✅ active |
| `SnowCover`          | Tuyết đọng nền — overlay phẳng, opacity noise×accum mọc dần phủ kín, 1 draw | weather, snow, accumulation, overlay | ✅ active |
| `SplashBurst`        | Vương miện + giọt nước tung tóe tại va-chạm rời — pool birth-per-particle, bay đạn-đạo, 0 CPU/frame | splash, water, particles, ballistic, impact | ✅ active |

---

## Components

| Tên              | Mô tả                                                       | Tags                                       | Status |
| ---------------- | ----------------------------------------------------------- | ------------------------------------------ | ------ |
| `LODBillboard`   | Swap 3D mesh → billboard sprite khi xa — tiết kiệm draw call | lod, billboard, sprite, crowd, performance | 🗄 idle |
| `PostProcessing` | WebGPU bloom pipeline — pass → bloom → tone mapping output  | post-processing, bloom, webgpu, effects    | 🗄 idle |
| `OutlineShader`  | Per-object outline via BackSide scaled mesh — no post-processing | outline, highlight, select, backside    | 🗄 idle |
| `InstancedBrickWall` | Tường gạch geometry THẬT — nền vữa + InstancedMesh vạn viên running-bond, khe = vữa lõm; lỗ cửa/sổ (chữ nhật + TRÒN) bằng CULL viên + khoét backing; + DECAY tuổi tường (mất viên/lệch/thụt/sạm — hash vị trí, tái lập) | brick, wall, instanced, running-bond, decay, architecture | ✅ in-use |
| `BrickPaving` | 🧱 SÂN lát gạch bond đều (bản NẰM của brick): nền vữa + InstancedMesh viên block so le chừa khe + DECAY (rụng/lún/xoay lệch/sạm). CONSUMER op #3 — build trên gridOnSurface + copyToPoints + mulberry32. Site-kit zoneKind 'paving' | brick, gạch, paving, sân, running-bond, decay, instanced, site-kit, op-3 | ✅ in-use (site-kit) |
| `CurvedBrickWall` | 🧱 TƯỜNG gạch CONG tự do (tường vườn): thân vữa cong theo CUNG (R + góc quét, 360°=vòng kín) + viên running-bond nhô CẢ 2 MẶT + DECAY (rụng trùng chỗ 2 mặt = vết tróc thật). TỔ HỢP 4 OP: #1 resample spine + #2 sweep thân + #3 rows (đếm chiều dài thật)/copyToPoints + #5 mulberry. Site-kit zoneKind 'wall' | brick, gạch, wall, tường cong, curved, arc, sweep, decay, instanced, site-kit | ✅ in-use (site-kit) |
| `WoodSidingWall` | Tường ván gỗ ngang (clapboard) instanced — ~13 tấm nghiêng chồng mép, 2 mặt/tấm (4 tris), cực rẻ (~64 tris) | wood, siding, clapboard, plank, instanced | ✅ in-use |
| `WoodSidingStrip` | Tường ván gỗ 1 KHỐI răng cưa, HỘP KÍN 6 MẶT + khoét cửa/sổ (jamb reveal) — plain mesh MERGE được xuyên nhà | wood, siding, clapboard, strip, mergeable, openings | ✅ in-use |
| `GrassBlades` | Cỏ 3D nhú lên (tier B) — InstancedMesh lá geometry, accent-only+cap; cặp `GrassGround` tier A. **Rebuild tăng dần (preview-first)** — B0: lá phẳng + 1 màu | vegetation, instanced, grass, cỏ, tier-b, site-kit | ✅ in-use |
| `WaterSurface` | Hồ nước vừa PHẢN CHIẾU vừa NHÌN XUYÊN ĐÁY (tier C) — `reflector` + `viewportSharedTexture` (refraction) fresnel-blend + form tự do (kéo đỉnh). Đáy basin + khoét lỗ nền ở site-kit. ⚠ +1 render pass/RTT | water, hồ, reflection, refraction, mirror, site-kit, tier-c | ✅ in-use |
| `SkyGradient` | Bầu trời gradient ngày↔đêm WebGPU qua `scene.backgroundNode` (KHÔNG mesh → luôn phủ, né "quả cầu từ ngoài") — zenith→horizon lerp theo độ-cao sun + quầng nắng/hoàng hôn. `setSun(dir)`→day-factor để mờ đèn fill/env | sky, environment, day-night, gradient, backgroundnode, tsl, webgpu | ✅ in-use |
| `Waterfall` | Thác nước stylized (tier B, công thức RiME/Season — A2) — MÀN sheet cong (z=arc·√t) + TEXTURE VỆT (canvas 1 lần) cuộn 3 LỚP khác tốc + fresnel + KHÚC XẠ màn + lip/foot band + posterize + wobble; chân = MIST bốc + SPLASH ngang (sprite mềm). 0 RTT/0 asset, 3 draw; tune ở Lab tab 🌊 Thác | water, waterfall, thác, foam, mist, splash, fresnel, refraction, tsl, site-kit, tier-b | 🆕 module |
| `StoneScatter` | Rải mảng đá DẸT tròn/ellipse trong khuôn vô hình bằng Poisson-disk (Bridson → blue-noise): cách đều ngẫu nhiên, KHÔNG chạm nhau (chừa khe cỏ). N phiến = 1 InstancedMesh = 1 draw, deterministic theo seed. Lối đi lát đá sân vườn (stepping-stone v1). Voronoi ghép-khít = đích xa | stone, đá, scatter, poisson, stepping-stone, paving, instanced, site-kit | 🆕 module |
| `PondFish` | 🐟 Đàn cá koi PROCEDURAL bơi lòng hồ — thân low-poly ~131 tri/con, đuôi vẫy TSL vertex-bend GPU (0 rig/0 asset/0 texture), màu koi trắng+cam+đốm per-con (hash+triNoise3D), wander CPU rẻ, cả đàn 1 draw. Phase B ✅: `buildPondFish` (site/render/water.ts) + GUI 🐟 tab Surface | fish, koi, cá, pond, water, instanced, vertex-animation, site-kit | ✅ in-use (site-kit) |

---

## Ops

> **HÀM THUẦN kiểu Houdini SOP — KHÔNG phải component** (không class/material/dispose): vào dữ liệu + tham
> số → ra điểm/đỉnh/mesh, caller tự dựng geometry + dispose. Asset mới = TỔ HỢP op (mái đao = #1..#5 chồng
> nhau). Nuôi trong archplan Lab Mái, tách kệ 2026-06-10 (NgQuan chốt scale ban công/tường/cửa). Chi tiết
> từng op + quy ước `SurfacePoint`: [ops/README.md](ops/README.md). Catalog chọn op kế:
> `Factory/deferred/houdini-algorithms.md`.

| Tên | Mô tả | Tags | Status |
| --- | ----- | ---- | ------ |
| `ops/resample` | #1 — chia lại curve ĐỀU theo chiều dài thật (bảng arc-length 64 mẫu + binary search nghịch đảo): `arcLength` · `resampleCurve` | curve, arc-length, resample, houdini | ✅ in-use |
| `ops/sweep` | #2 — quét tiết diện 2D dọc spine, frame parallel-transport (không xoắn), ramp scale/twist, caps: `sweepInto` · `rectProfile` | sweep, spine, parallel-transport, timber, houdini | ✅ in-use |
| `ops/copy-to-points` | #3 — 2 tầng: generator điểm trên mặt tham số (grid UV đều · rows đếm riêng hàng · cols song song nửa-bước) → `copyToPoints` InstancedMesh; interface chung `SurfacePoint` | instancing, copy-to-points, tile, brick, houdini | ✅ in-use |
| `ops/bevel` | #4 — bevel-at-generation: `bevelProfile` bo góc TIẾT DIỆN 2D trước sweep + `filletSpine` bo góc SPINE 3D (2 thanh → 1 thân liền gối cong) | bevel, fillet, chamfer, profile, timber, houdini | ✅ in-use |
| `ops/scatter` | #5 — rải điểm random trên mesh (wrap MeshSurfaceSampler) + seed mulberry32 + minDist hash-grid + mask → trả `SurfacePoint` (instancer #3 dùng lại) | scatter, random, poisson-ish, seed, environment, houdini | ✅ in-use |
| `ops/boolean` | #6 — union/subtract/intersect 2 geometry cùng không gian: `booleanGeometry(a, b, op)` — A-wrap `three-bvh-csg` PIN 0.0.17 (0.0.18 đòi three ≥0.179); useGroups=false → 1 geometry liền | boolean, csg, subtract, cut, window, houdini | ✅ in-use (tường hồi mái) |

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
| `building/turtle`    | **Pure plan geometry** (turtle-walk + center/rotate → vị trí tường). Chung editor + headless. |
| `building/wallAssembly` | **Shared wall assembler** — `assembleWall` dispatch 5 nhánh material + `mergeWalls`. Chung editor + headless. |
| `building/wallMaterials` | **Wall material engine** — `WallMaterialCache` + surface shaders + brick-tex PBR (+`textures/bricks/`). |
| `building/preset/Building` | Assembler preset → Group + `preset/config` types (city runtime — Doraemon) |
| `building/render/fromState` | **Renderer canonical** `BuildingState → THREE.Group` + `Placement[]` (pick). `renderBuildingState` (free fn — editor) + `class BuildingRenderer` (wrapper headless: own ctx + dispose). |

### Trạng thái headless (2026-06-01)

- ✅ **1 renderer canonical** `render/fromState` (`renderBuildingState`) — editor + headless CHUNG, đọc
  `BuildingState` lossless → walls/structure/roof/stairs/balcony/paint full fidelity. **Gap 2 đóng bằng construction.**
- ✅ `turtle`/`wallAssembly`/`wallMaterials` = single source (Gap 1) — hết chép tay, hết drift KI-001.
- ✅ **`BuildingFromPlan` (AP4 lossy) RETIRE** — dormant 0 caller; lớp AP4 export + `parts/Stair` orphan đã xoá.
- 🗂 **Reorg folder (Phase 4):** file `Building*` → `render/` + `preset/` (bỏ prefix thừa); engine primitive
  (`turtle`/`build`/`state`/`tokens`/`wallAssembly`/`wallMaterials`) giữ flat.

---

## Site (sân vườn / lô)

> 🌱 **G0 in-use** — Bộ sinh **site** quanh nhà (nền + hàng rào) → **lô = building + site**, đơn vị thả vào
> quy hoạch khu phố. Anh em `building/`, **ĐỘC LẬP** nó (footprint truyền vào dạng m²). Import qua alias
> `threejs-modules/site/*`. Dùng bởi: **archplan editor** (panel 🌳 Sân vườn). Plan: [`../PLAN-lot-site-garden.md`](../PLAN-lot-site-garden.md).

| Mục | Mô tả |
| --- | ----- |
| `site/state` | `SiteState` (nền + cỏ-3D + **hồ nước** + rào) + factory + `GROUND_PRESETS` + `coverageStats` (建ぺい率 đối chiếu nhà/lô) + `parseSite` (impl ở `site/state-parse.ts` — re-export barrel). Lô mặc định 15×14.4m |
| `site/state-parse` | Tầng deserialization tolerant cho `SiteState` (`parse*` default-fill + clamp + migrate format cũ) — tách khỏi `state.ts`; chỉ `parseSite` public, còn lại nội bộ |
| `site/render/fromState` | `renderSiteState(site, ctx)` headless — orchestrator + nền slab/grid/heightfield + layers/zones/mix. Sub-domain tách file (re-export barrel — consumer import từ đây như cũ): `render/water.ts` (hồ `WaterSurface` reflect+refract + basin + coping + viền đá/rào hồ), `render/fence.ts` (rào gỗ/tường/đá + cổng), `render/grass.ts` (cỏ 3D `GrassBlades` + grassBuildSig) |

- **Phases:** G0 nền+rào ✅ · **G1a cỏ 3D `GrassBlades` — rebuild tăng dần (B0 lá phẳng+1 màu ✅; B1 thon → B9 đổ-bóng ⏳)** · G1b cây/bụi ⏳ · G2 đá triplanar ⏳ · **G3 hồ nước (tier C) `WaterSurface` — ✅ reflect+refract (nhìn xuyên đáy) + basin + form tự do; wired site/render + GUI archplan**.
- **Coupling:** caller bật `site.show` → đôn building lên `groundThick` (foundation nằm trên mặt nền).

---

## Thêm module mới

Copy từ `_template/` trong category phù hợp.
Quy tắc đầy đủ trong `CLAUDE.md`.
