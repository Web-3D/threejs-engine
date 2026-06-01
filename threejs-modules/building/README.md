# building/ — Building Domain

## Files & Directories

| Tên | Vai trò |
|-----|---------|
| [Building.ts](Building.ts) | Class chính — orchestrate part builders từ BuildingConfig (city runtime — Doraemon) |
| [BuildingConfig.ts](BuildingConfig.ts) | Types + config schema cho Building |
| [BuildingFromPlan.ts](BuildingFromPlan.ts) | **Headless assembler** `FloorPlanJSON (AP4) → THREE.Group`, không GUI. Đích cho "bảo bối". Dùng `turtle` + `wallAssembly`. |
| [turtle.ts](turtle.ts) | **Pure plan geometry** (turtle-walk + center/rotate → vị trí tường). Chung editor + headless — chống drift KI-001. |
| [wallAssembly.ts](wallAssembly.ts) | **Shared wall assembler** — `assembleWall(place, spec, ctx)` dispatch 5 nhánh material (surface-merge + brick-3d/wood-3d/wood-strip instanced) + `mergeWalls`. Chung editor + headless. |
| [wallMaterials.ts](wallMaterials.ts) | **Wall material engine** — `WallMaterialCache` + surface shaders + brick-tex PBR. `WallMaterial`/`WallMatInput`. Chung editor + headless. |
| [tokens.ts](tokens.ts) | Shared constants: PartResult type, WALL_COLORS, DOOR_COLORS, color arrays |
| [rand.ts](rand.ts) | RNG helpers cho procedural building variation |
| [textures/bricks/](textures/) | PBR map (color/roughness/AO) cho material `brick-tex` |
| [parts/](parts/) | 14 .ts part builders + 28 .json default configs → xem [parts/README.md](parts/README.md) |

## Headless assembler — trạng thái (2026-06-01)

`BuildingFromPlan` = headless assembler (editor-độc-lập), giờ **cùng code-path** với editor archplan:

- ✅ **turtle dùng chung** — hết chép tay turtle-walk; sửa 1 nơi (`turtle.ts`).
- ✅ **wallH per-segment** — đọc đúng chiều cao từng tường từ AP4 (trước ép `floorH=max`).
- ✅ **material fidelity (Gap 1 ĐÓNG)** — `wallAssembly.ts` + `wallMaterials.ts` chung → headless render
  ĐÚNG shader-surface (brick/concrete/wood/metal/brick-tex) + brick-3d/wood-3d/wood-strip instanced,
  hết toon phẳng. AP4 export chở đủ field material.
- ⏳ **Gap 2 — full state** — AP4 còn rút gọn vài chỗ (yOffset≤0→null…); 100% khớp = assembler nhận
  thẳng `BuildingState`. → `01-Doraemon/deferred/features/building-gadget-gameplay.md`.
