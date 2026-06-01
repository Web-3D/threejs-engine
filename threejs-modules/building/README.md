# building/ — Building Domain

## Files & Directories

| Tên | Vai trò |
|-----|---------|
| [Building.ts](Building.ts) | Class chính — orchestrate part builders từ BuildingConfig |
| [BuildingConfig.ts](BuildingConfig.ts) | Types + config schema cho Building |
| [BuildingFromPlan.ts](BuildingFromPlan.ts) | Tạo building từ ArchPlan state (AP4 integration) |
| [tokens.ts](tokens.ts) | Shared constants: PartResult type, WALL_COLORS, DOOR_COLORS, color arrays |
| [rand.ts](rand.ts) | RNG helpers cho procedural building variation |
| [parts/](parts/) | 14 .ts part builders + 28 .json default configs → xem [parts/README.md](parts/README.md) |
