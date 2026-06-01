# parts/ — Building Part Builders

## Convention

Mỗi part có cặp `[name].ts` (builder function) + `[name].config.json` (default params).  
JSON được ghi đè bởi BuildingLab GUI qua Vite POST plugin — không edit tay.  
Import alias: `@world/building/parts/[Name]`.

## TypeScript Builders (14 files)

| File | Exports chính | Vai trò |
|------|---------------|---------|
| [Structure.ts](Structure.ts) | makePositionedFoundation, makePositionedSlab, makePositionedColumn | Móng, sàn bê tông, cột tròn/vuông |
| [Wall.ts](Wall.ts) | makeWall | 4 mặt tường cơ bản (toàn bộ building box) |
| [WallDetail.ts](WallDetail.ts) | makeWallReveal, makeWallPanel | Tường groove + curtain wall grid |
| [WallSingle.ts](WallSingle.ts) | makePositionedWall, makeWallSingleSet, presetLShape/UShape | Tường đơn 1 mặt + preset L/U-shape |
| [Roof.ts](Roof.ts) | makeGabledRoof | Mái dốc 2 phía (kirizuma) |
| [RoofDetail.ts](RoofDetail.ts) | makeHipRoof, makeFlatRoof, makeShedRoof, makeEave | Mái hip / bằng / 1 dốc / hiên |
| [RoofShape.ts](RoofShape.ts) | makeRoof, RoofType, RidgeDir | Unified roof API dùng bởi ArchPlanLab |
| [FloorSystem.ts](FloorSystem.ts) | makeFloorAssembly, defaultFloorDef, FloorAssemblerConfig | Stack N tầng độc lập với config per-tầng |
| [OpeningDetail.ts](OpeningDetail.ts) | makeDoorFrame, makeWindowFrame, makeWindowGrid, makeWindowStrip, makeLoadingDoor | Cửa đi / cửa sổ chi tiết |
| [Door.ts](Door.ts) | makeDoor | Cửa đi đơn giản (BoxGeo) |
| [Windows.ts](Windows.ts) | makeWindows | Cửa sổ đơn giản |
| [ShopFront.ts](ShopFront.ts) | makeShopFront | Mặt tiền shop (cửa kính + bảng hiệu) |
| [AttachmentDetail.ts](AttachmentDetail.ts) | makeBalconySlab, makeBalconyRailing, makeAwning, makeDrainPipe, makeACUnit, makeMeterBox, makeAntenna | Phụ kiện gắn tường (ban công, mái che, ống, điều hòa...) |
| [Stair.ts](Stair.ts) | makeStair | Cầu thang |

## JSON Configs (28 files)

Tên khớp với `PartName` trong BuildingLab.ts. Nhóm theo domain:

| Nhóm | Configs |
|------|---------|
| Kết cấu | structure, floor_def |
| Tường | wall, wall_reveal, wall_panel, wall_single_flat, wall_single_reveal, wall_single_panel |
| Mái | roof, hip, flat_roof, shed, eave |
| Cửa & Sổ | door, door_frame, windows, window_frame, window_grid, window_strip, loading_door, shopfront |
| Phụ kiện | balcony_slab, balcony_railing, awning, drain_pipe, ac_unit, meter_box, antenna |
