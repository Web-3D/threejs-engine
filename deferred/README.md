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

---

## tooling/

| File | Tính năng | Revisit khi |
|---|---|---|
| [turborepo-nx.md](tooling/turborepo-nx.md) | Workspace task orchestration (build cache) | 5+ projects, build time > 5 phút |
| [release-workflow.md](tooling/release-workflow.md) | SemVer + CI/CD — publish npm + auto-deploy | Có collaborator hoặc muốn publish npm |
| [asset-tag-search.md](tooling/asset-tag-search.md) | Tag index ngược + search-assets.js script | 30+ asset trong REGISTRY.json |

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
