# threejs-modules

> Thư viện module Three.js cá nhân — NgQuan86
> **Đọc file này trước** — đây là catalog toàn bộ.
> GitHub: https://github.com/NgQuan86/threejs-modules

---

## Cách dùng nhanh (cho Claude Code)

1. Tìm module trong bảng dưới
2. Đọc `[category]/[tên]/meta.json` → xem props, tags, deps
3. Đọc `[category]/[tên]/index.ts` → lấy code
4. Copy vào project — **KHÔNG sửa file trong repo này**
5. Dispose pattern phải được giữ nguyên khi adapt

---

## Shaders

| Tên                  | Mô tả                                         | Tags                              | Complexity |
| -------------------- | --------------------------------------------- | --------------------------------- | ---------- |
| `TriplanarMapping`   | Texture không cần UV — blend 3 mặt phẳng      | triplanar, terrain, uv-free       | medium     |
| `WorldNoise`         | 3D noise field trong world space              | noise, wind, animation            | low        |
| `RoundedCorners`     | SDF rounded box trong fragment shader         | sdf, ui, stylized                 | low        |
| `ProceduralFracture` | Vertex displacement dọc normal = vết nứt động | fracture, displacement, vertex    | low        |
| `InteriorMapping`    | Parallax room illusion qua cửa sổ tòa nhà    | interior, parallax, building      | medium     |
| `VATShader`          | Vertex Animation Texture — replay GPU animation từ DataTexture | vat, animation, gpu, vertex | high |
| `DissolveShader`     | Noise-based dissolve với edge glow — spawn/despawn cinematic   | dissolve, noise, vfx, tsl   | low  |
| `WindAnimation`      | Vertex displacement giả lập gió — triNoise3D positionNode | wind, foliage, displacement, tsl | medium |
| `BrickWall`          | Procedural brick — triplanar world-space, no UV, running bond + mortar | brick, building, procedural, triplanar, surface | medium |
| `ConcretePanel`      | Procedural concrete panel — seam grid + 3-octave fbm variation         | concrete, building, procedural, triplanar, surface | medium |
| `RoofTileJP`         | Procedural kawara roof tile — sdRoundBox corners + S-profile ridge      | roof, tile, japanese, procedural, triplanar, sdf   | medium |
| `WoodPlank`          | Procedural wood plank — row seam, directional grain, end-grain darkening | wood, plank, grain, surface, triplanar, world-space | medium |
| `MetalPanel`         | Procedural corrugated metal — horizontal ridges + panel seam, galvanized variation | metal, corrugated, ridge, industrial, surface, triplanar | medium |
| `Weathering`         | Layered weathering overlay — moss, dirt streak, rust, rain stain (4 independent amounts) | weathering, moss, rust, dirt, aging, surface, triplanar | medium |

---

## Utils

### core/
| Tên              | Mô tả                                                              | Tags                                       | Complexity |
| ---------------- | ------------------------------------------------------------------ | ------------------------------------------ | ---------- |
| `RuntimeGuard`   | Kiểm tra draw calls, triangles, geometry leak mỗi frame           | performance, monitoring, debug             | low        |
| `GlobalUniforms` | Shared TSL nodes uTime/uWeather/uDamage — import trực tiếp        | uniform, tsl, animation, shader-sync       | low        |
| `BaseWorld`      | Abstract scene setup — WebGPURenderer + camera + loop trong 1 class | base-class, abstract, scene, webgpu       | low        |

### performance/
| Tên             | Mô tả                                                   | Tags                                    | Complexity |
| --------------- | ------------------------------------------------------- | --------------------------------------- | ---------- |
| `LODSystem`     | Wrap THREE.LOD — typed levels, auto/manual update       | lod, performance, distance              | low        |
| `CharacterPool` | Generic object pool — acquire/release O(1), zero GPU alloc | pool, crowd, performance, reuse      | medium     |

### environment/
| Tên            | Mô tả                                                   | Tags                                    | Complexity |
| -------------- | ------------------------------------------------------- | --------------------------------------- | ---------- |
| `DayNightCycle`| Chu kỳ ngày-đêm — drive DirectionalLight + AmbientLight | lighting, day-night, animation, ambient | low        |

### interaction/
| Tên                 | Mô tả                                                   | Tags                                  | Complexity |
| ------------------- | ------------------------------------------------------- | ------------------------------------- | ---------- |
| `InteractionSystem` | Raycaster wrapper — hover/click/pointer events trên 3D mesh | raycaster, interaction, hover, click | medium |

### animation/
| Tên              | Mô tả                                                        | Tags                                          | Complexity |
| ---------------- | ------------------------------------------------------------ | --------------------------------------------- | ---------- |
| `AnimationSystem`| AnimationMixer wrapper — play/pause/crossfade glTF clips     | animation, gltf, mixer, crossfade, skeletal   | medium     |
| `ScrollTimeline` | Scroll-driven camera path — map scroll lên CatmullRomCurve3  | scroll, camera, path, curve, storytelling     | medium     |

### physics/
| Tên                   | Mô tả                                                             | Tags                                              | Complexity |
| --------------------- | ----------------------------------------------------------------- | ------------------------------------------------- | ---------- |
| `PhysicsWorld`        | Rapier.js world wrapper — async WASM init, gravity, step loop     | physics, rapier, wasm, gravity, simulation        | medium     |
| `RigidBody`           | Attach Rapier body + collider vào Three.js mesh, sync sau step()  | physics, rapier, rigid-body, collider, sync       | medium     |
| `CharacterController` | Kinematic movement — collision-resolved WASD + jump, gravity tích lũy | physics, rapier, character, movement, jump   | high       |
| `CollisionEventBus`   | Event bus collision → handler — force threshold, dispatch VAT/Particle/Audio | physics, rapier, collision, events, choreography | medium |

### audio/
| Tên            | Mô tả                                                                        | Tags                                              | Complexity |
| -------------- | ---------------------------------------------------------------------------- | ------------------------------------------------- | ---------- |
| `AudioSystem`  | Spatial audio — load/cache sounds, play positional SFX tại world position    | audio, spatial, positional, sfx, web-audio        | medium     |

---

## Effects

| Tên                  | Mô tả                                                        | Tags                                   | Complexity |
| -------------------- | ------------------------------------------------------------ | -------------------------------------- | ---------- |
| `GPUParticleSystem`  | Base class GPU particles — custom physics via TSL builders   | gpu, base-class, particles, extensible | medium     |
| `SparkSystem`        | GPU-driven sparks/embers — preset xây trên GPUParticleSystem | sparks, particles, vfx, gpu           | medium     |
| `FireSystem`         | GPU-driven fire — inner + outer flame, wind support           | fire, flame, particles, gpu, vfx      | medium     |
| `TrailSystem`        | Camera-facing ribbon trail — sword, vehicle, projectile       | trail, ribbon, motion, vfx            | medium     |

---

## Components

| Tên              | Mô tả                                                       | Tags                                       | Complexity |
| ---------------- | ----------------------------------------------------------- | ------------------------------------------ | ---------- |
| `LODBillboard`   | Swap 3D mesh → billboard sprite khi xa — tiết kiệm draw call | lod, billboard, sprite, crowd, performance | medium     |
| `PostProcessing` | WebGPU bloom pipeline — pass → bloom → tone mapping output  | post-processing, bloom, webgpu, effects    | medium     |
| `OutlineShader`  | Per-object outline via BackSide scaled mesh — no post-processing | outline, highlight, select, backside    | low        |
| `InstancedBrickWall` | Tường gạch geometry THẬT — nền vữa + InstancedMesh vạn viên running-bond, khe = vữa lõm | brick, wall, instanced, running-bond, architecture | medium |
| `WoodSidingWall` | Tường ván gỗ ngang (clapboard) instanced — ~13 tấm nghiêng chồng mép, 2 mặt/tấm (4 tris), cực rẻ (~64 tris) | wood, siding, clapboard, plank, instanced | low |
| `WoodSidingStrip` | Tường ván gỗ 1 KHỐI răng cưa, HỘP KÍN 6 MẶT + khoét cửa/sổ (jamb reveal) — plain mesh MERGE được xuyên nhà | wood, siding, clapboard, strip, mergeable, openings | low |

---

## Hooks

| Tên                | Mô tả | Tags | Complexity |
| ------------------ | ----- | ---- | ---------- |
| _(chưa có module)_ | —     | —    | —          |

---

## UI

> Widget DOM thuần (KHÔNG Three.js) — companion UI cho 3D tool. Theme qua CSS custom props.

| Tên    | Mô tả                                                                                                                  | Tags                                  | Complexity |
| ------ | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ---------- |
| `Tabs` | Tabs folder-style thuần DOM — tablist ngang, ARIA + roving tabindex + keyboard (←/→/Home/End), theme CSS vars, nút add | ui, tabs, aria, keyboard, dom, widget | low        |

---

## Building

> Bộ sinh hình **nhà procedural** (Three-native, three-only). KHÔNG theo chuẩn 1-module-1-folder —
> là **sub-library** nhiều file (`parts/` + `tokens` + assembler). Consumer import qua alias `building-kit`
> (vd `building-kit/parts/WallSingle`, `building-kit/tokens`). Dùng bởi: **archplan editor** + **Doraemon
> city runtime** + (tương lai) **"bảo bối" gameplay** (bỏ blueprint `BuildingState` → ra nhà).

| Mục                  | Mô tả                                                              |
| -------------------- | ------------------------------------------------------------------ |
| `building/parts/*`   | Wall/Roof/Structure/Stair/Windows/Door… → `THREE.Mesh`/`Group`     |
| `building/tokens`    | `WALL_COLORS`, `PartResult`, dimension tokens — hằng số chung      |
| `building/Building*` | Assembler preset→Group + config types (city runtime)               |

> Hướng tới: assembler **headless** `BuildingState → THREE.Group` (không GUI) làm engine dùng chung
> cho editor lẫn gameplay. Tách dần từ `01-Doraemon` ArchPlanLab.

---

## Thêm module mới

Copy từ `_template/` trong category phù hợp.
Quy tắc đầy đủ trong `CLAUDE.md`.
