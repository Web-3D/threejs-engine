# Deferred — Tính năng đã nghiên cứu, chưa implement

> Đọc file này trước khi đề xuất tính năng mới — tránh nghiên cứu lại cái đã có.
> Mỗi subdirectory = 1 domain. Mỗi file = 1 quyết định cụ thể + điều kiện revisit.

---

## Cấu trúc

```
deferred/
├── README.md       ← file này — index tổng
├── geometry/       ← mesh, SDF, procedural shape, building techniques
├── rendering/      ← shader, material, effect, post-processing
├── systems/        ← kiến trúc, data pipeline, abstract patterns
├── tooling/        ← build system, CI/CD, asset search, workspace
└── ai/             ← AI knowledge base, memory, RAG
```

---

## geometry/

| File | Tính năng | Revisit khi |
|---|---|---|
| [building-iq-techniques.md](geometry/building-iq-techniques.md) | IQ math tricks cho building: palette, periodic windows, fBm height | Building system cần visual phong phú hơn |
| [building-sdf-phases.md](geometry/building-sdf-phases.md) | SDF ray march per component → bake pipeline | Bắt đầu Phase 1 SDF (column/beam) — xem `01-Doraemon/deferred/geometry/` |
| [archplan-coord-true-slice.md](geometry/archplan-coord-true-slice.md) | Coordinate scanner cắt geometry/segment thật thay bbox → tọa độ tường đúng từng tầng | Cần đọc tọa độ tường trong / footprint per-floor, hoặc làm build editor |
| [voronoi-applications.md](geometry/voronoi-applications.md) | Voronoi cho hạng mục RỜI RẠC: chia lô đất · facade screen · đá lát TSL · fracture (KHÔNG dùng cho nhà vuông góc) | Làm city/neighborhood (chia lô), hoặc cần điểm nhấn mặt dựng/nền hữu cơ |
| [pond-organic-and-stilt-foundation.md](geometry/pond-organic-and-stilt-foundation.md) | **✅ BUILD XONG 2026-06-06** — hồ bezier-handles (kéo nắn tay cầm 3D) + cột deck đâm đáy hồ qua `GroundDrop[]` data (không callback). File giữ làm sử liệu plan-vs-thực | — (xong; nâng cấp hồ/nhà sàn → playbook `pond.md`) |
| [shoji-sliding-door.md](geometry/shoji-sliding-door.md) | **✅ BUILD XONG 2026-06-11** (C4 joinery) — `leafType` shoji-slide/glass-slide; kumiko = GEOMETRY thật (KHÔNG reuse shader ShojiScreen — triplanar world-space "bơi" khi cánh trượt). File giữ làm sử liệu | — (xong; chi tiết → playbook `window.md`) |

---

## rendering/

| File | Tính năng | Revisit khi |
|---|---|---|
| [material-roadmap.md](rendering/material-roadmap.md) | Phân tầng vật liệu kiến trúc theo kỹ thuật (A surface / B geometry / C kính / D ảo) + convention thư mục mở rộng | Thêm vật liệu mới (mái rơm, kính, ngói…) vào `WallMaterial` |
| [future-shaders.md](rendering/future-shaders.md) | GlassShader · DissolveShader · OutlineShader | Có scene thực tế cần các effect này |
| [future-effects.md](rendering/future-effects.md) | FireSystem · FluidSystem · TrailSystem | Scene cần particle effect (FluidSystem: cần WebGPU compute) |
| [future-postprocessing.md](rendering/future-postprocessing.md) | SSAOPass · MotionBlurPass | Scene geometry phức tạp hoặc object di chuyển nhanh |
| [perception-tricks-compact-spaces.md](rendering/perception-tricks-compact-spaces.md) | Phòng nhỏ thấy rộng: forced perspective · vista · verticality · fog · InteriorMapping · cảnh báo FOV. Ortho để thiết kế, perspective để trình bày | Dựng interior thật trong World, hoặc làm camera system (chốt FOV) |
| [water-bottom-refraction.md](rendering/water-bottom-refraction.md) | Đáy hồ (Shape-holes khoét nền + basin extrude) + mặt nước vừa phản chiếu vừa nhìn xuyên (Fresnel reflect↔refract: trong suốt / `viewportSharedTexture` / PBR transmission) | Chốt mức refraction + chấp nhận cost tier-C++ |
| [underwater-immersive.md](rendering/underwater-immersive.md) | **DEFERRED 2026-06-11** — môi trường NGẬP NƯỚC nhập vai (B): camera LẶN xuống dưới mặt nước. Paradigm khác A (mặt nước 2-mặt/Snell window · fog volumetric toàn cục · godray · caustics mọi mặt) | Có môi trường nước RỘNG thật (hồ lớn/biển) — sau E-series, KHÔNG hợp lô nhà |
| [per-zone-vuilap-detail.md](rendering/per-zone-vuilap-detail.md) | **2026-06-08** — toggle "vùi lấp" (detail-normal sần) RIÊNG mỗi zone — vướng per-key-material-cache (cần 2 variant/key). Loang-lổ geometry (drape) đã che phần lớn nhu cầu | Cần bề-mặt-cát-mịn-sần TÁCH BIỆT patches (chấp nhận 2-variant cache) |

---

## systems/

| File | Tính năng | Revisit khi |
|---|---|---|
| [character-base-variant.md](systems/character-base-variant.md) | Character Base + Variant Config pipeline | Phase C — sau Phase A + B xong |
| [lab-base-template.md](systems/lab-base-template.md) | LabBase abstract class — extract từ BuildingLab | Khi có ≥3 Lab (TerrainLab, VegetationLab...) |
| [archplan-build-editor.md](systems/archplan-build-editor.md) | Grid snap · room auto-fill · wall auto-join (kiểu The Sims/SketchUp) | Đẩy ArchPlanLab thành build editor tương tác |
| [threejs-modules-workspace-package.md](systems/threejs-modules-workspace-package.md) | Nâng cấp threejs-modules thành pnpm workspace package | ~15+ modules hoặc có project thứ 2 dùng chung |
| [neighborhood-block-assembly-lod.md](systems/neighborhood-block-assembly-lod.md) | Quy hoạch khu phố N nhà: bake (Triangle+Shimmer) + instance/merge + LOD (Draw call) | Dựng khu phố thật trong World sau khi chốt vài kiểu nhà |
| [building-warehouse-pipeline.md](systems/building-warehouse-pipeline.md) | Xương sống: lõi share (THREEJS root) → vỏ editor per-project → kho thành phẩm baked (Engine root) → project pick-by-tag. Luật tier hero-procedural vs mass-baked | Chốt ≥3 kiểu nhà + dựng khu phố thật, hoặc kích hoạt workspace package |
| [procedural-generation-techniques.md](systems/procedural-generation-techniques.md) | Bản đồ "họ" sinh hình thủ tục: phân hoạch (Voronoi/BSP/Poisson) · noise tế bào · **shape grammar/CGA · L-system · WFC** — cái nào hợp nhà vuông | Làm build-editor, city/neighborhood, hoặc bố trí phòng (chọn đúng công cụ thay vì mặc định Voronoi) |
| [garden-ground-patches.md](systems/garden-ground-patches.md) | Mảng nền sân (bê tông/cát/sỏi/**nước**) tự exclude cỏ — cắt ~1000 tris/m² cỏ + bố cục sân thật; nước = shader (reflection = pass riêng, không vào budget tri) | Soạn sân vườn trong ArchPlanLab, hoặc cần cắt budget cỏ cho city/nhiều lô |
| [playbook-tier-ladder.md](systems/playbook-tier-ladder.md) | Thang tier A/B/C/D dùng chung cho playbooks (tổng quát hoá `material-roadmap`) + check `tier` hợp lệ | ≥4–5 playbook lệch nghĩa tier, hoặc plan mảng mới cần so tier |
| [interior-decor-objects.md](systems/interior-decor-objects.md) | **DECIDED 2026-06-05** — hệ decor nội thất object (kệ/tranh/hốc/đèn) mặt TRONG tường (mirror Balcony); KHÁC DecorPanel relief mặt ngoài | NgQuan yêu cầu build (kiến trúc = object system) — MVP slice 'shelf' trước |
| [shape-group-system.md](systems/shape-group-system.md) | **WANTED 2026-06-05** — gộp nhóm nhiều khối shape + kéo cả nhóm 1 lần (selection + multi-move, snap bbox union) | NgQuan yêu cầu build; chốt group bền vs ad-hoc khi bắt tay |
| [terrain-gaea-heightmap.md](systems/terrain-gaea-heightmap.md) | **📐 PLANNED 2026-06-10** — vòng MÔI TRƯỜNG E0–E3: TerrainRing (vành đai quanh lô) + CẦU GAEA file-contract `.r32` 3-tầng (license verified: CLI chỉ Pro $199; Community 0đ đi đường watcher) + vách đá/thác Phase B | NgQuan ra lệnh bắt đầu — bước 0 cài Gaea 2 Community |
| [character-terrain-follow.md](systems/character-terrain-follow.md) | **2026-06-08** — nhân vật đi-trên-đất-không-lún trên nền `heightAt` (single-source). Thiếu: surface-resolver khối-chồng + normal/slope + collision tường | Có character-controller thật (đừng pivot game sớm) |
| [non-bo-rockery-builder.md](systems/non-bo-rockery-builder.md) | **🗑️ 2026-06-10** — procedural "chưa ra dáng" (bướu tròn đều, giới hạn paradigm) → **CODE ĐÃ XÓA** (RockCluster + tab Rock + state/render; git history giữ). File giữ làm LESSON | Hồi sinh non bộ = **Houdini bake** ([houdini-bake-accents](systems/houdini-bake-accents.md)) — KHÔNG quay lại procedural |
| [houdini-bake-accents.md](systems/houdini-bake-accents.md) | **📐 2026-06-09** — bản đồ chèn Houdini-bake cho ĐIỂM NHẤN: ①đá non bộ/vách thác ②viên đá variants (layout giữ TS) ③heightmap erosion gò hero ④bonsai; live-editable/animated GIỮ TSL. ⚠️ Apprentice khóa export → học/prototype; bake thật = Indie hoặc vòng Blender | Bắt tay vách đá thác (waterfall Phase B) / hồi sinh non bộ / Factory Phase E |
| [audio-web-procedural.md](systems/audio-web-procedural.md) | **🔊 2026-06-13** — âm thanh web-3D: SFX môi trường tự synth Web Audio (mưa/gió/SẤM đồng bộ sét), KHÔNG cần ElevenLabs; chỉ GIỌNG NÓI mới cần TTS. Gotcha: AudioContext cần user-gesture | Sau khi xong hình ảnh thời tiết — WeatherAudio khớp `_weather.mode` + `_updateLightning` |
| [water-type-ecosystem-features.md](systems/water-type-ecosystem-features.md) | **💧 2026-06-13** — luật 3 loại nước (pool sạch / pond sinh thái / puddle) ĐÃ enforce; hoãn tính năng đặc trưng: pool (thang/lằn bơi) · pond (cây thủy sinh/đá đáy) · puddle (gợn mưa/khô dần) | NgQuan gọi làm 1 loại cụ thể — MVP slice 1 tính năng trước |

---

## tooling/

| File | Tính năng | Revisit khi |
|---|---|---|
| [turborepo-nx.md](tooling/turborepo-nx.md) | Workspace task orchestration (build cache) | 5+ projects, build time > 5 phút |
| [release-workflow.md](tooling/release-workflow.md) | SemVer + CI/CD — publish npm + auto-deploy | Có collaborator hoặc muốn publish npm |
| [asset-tag-search.md](tooling/asset-tag-search.md) | Tag index ngược + search-assets.js script | 30+ asset trong REGISTRY.json |
| [playbook-open-nudge-hook.md](tooling/playbook-open-nudge-hook.md) | Hook PostToolUse nhắc mở `playbooks/<domain>.md` khi sửa file của mảng đó | Đã verify playbook lợi thật + recall-gate "quên mở" xảy ra |

---

## ai/

| File | Tính năng | Revisit khi |
|---|---|---|
| [rag-knowledge.md](ai/rag-knowledge.md) | RAG vector search cho AI knowledge base | 15+ modules hoặc 3+ projects với history dài |
| [memory-vector-search.md](ai/memory-vector-search.md) | Vector search (Palinode) cho AI memory zone | 50+ memory files hoặc search chậm |

---

## Quy tắc

- **Thêm file mới** → đặt vào đúng subdirectory + thêm dòng vào bảng tương ứng.
- **Implement xong** → xóa khỏi deferred, ghi vào ROADMAP/CHANGELOG.
- **Quyết định đổi** → cập nhật file + ghi rõ ngày + lý do đổi.
