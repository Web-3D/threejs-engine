# building/ — Building Domain

## Files & Directories

| Tên | Vai trò |
|-----|---------|
| [Building.ts](Building.ts) | Class chính — orchestrate part builders từ BuildingConfig (city runtime — Doraemon) |
| [BuildingConfig.ts](BuildingConfig.ts) | Types + config schema cho Building |
| [BuildingFromPlan.ts](BuildingFromPlan.ts) | **Headless assembler** `FloorPlanJSON (AP4) → THREE.Group`, không GUI. Đích cho "bảo bối". Dùng `turtle`. |
| [turtle.ts](turtle.ts) | **Pure plan geometry** (turtle-walk + center/rotate → vị trí tường). NGUỒN SỰ THẬT chung cho editor (archplan `build.ts`) lẫn headless `BuildingFromPlan` — chống drift KI-001. |
| [tokens.ts](tokens.ts) | Shared constants: PartResult type, WALL_COLORS, DOOR_COLORS, color arrays |
| [rand.ts](rand.ts) | RNG helpers cho procedural building variation |
| [parts/](parts/) | 14 .ts part builders + 28 .json default configs → xem [parts/README.md](parts/README.md) |

## Headless assembler — trạng thái (2026-06-01)

`BuildingFromPlan` = headless assembler (editor-độc-lập). Để làm engine dùng chung editor↔gameplay:

- ✅ **turtle dùng chung** — editor & headless hết chép tay turtle-walk; sửa 1 nơi (`turtle.ts`).
- ✅ **wallH per-segment** — đọc đúng chiều cao từng tường từ AP4 (trước ép `floorH=max`, san phẳng).
- ⏳ **material fidelity (deferred)** — vẫn `MeshToonMaterial` + `WALL_COLORS`, CHƯA tái dựng
  shader-surface (brick/wood/…) như editor. Logic cần đưa vào kit nằm ở archplan `build/materials.ts`
  (`WallMaterialCache`). → `01-Doraemon/deferred/features/building-gadget-gameplay.md`.
