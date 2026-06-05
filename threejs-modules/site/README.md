# site-kit — Lô đất / sân vườn (anh em building-kit)

Domain **headless** dựng phần **site** quanh nhà → tạo **lô hoàn chỉnh** `lô = building + site`, đơn vị
thả vào quy hoạch khu phố. Mirror cấu trúc `building/` (state + render/). ĐỘC LẬP `building/`
(footprint nhà truyền vào dưới dạng số m², không import building).

> Khung: **建ぺい率 (Building Coverage Ratio)** — nhà ở Nhật phủ 30–60% lô; phần còn lại = sân vườn.
> Plan + phases (G0–G3): [`../../PLAN-lot-site-garden.md`](../../PLAN-lot-site-garden.md). ADR-005 (lõi).

## Cấu trúc

```
site/
├── state.ts              ← SiteState (nền + cỏ3D + hồ + hàng rào ĐA-LỚP fences[]) + factory + GROUND_PRESETS + coverageStats + parseSite
└── render/
    ├── fromState.ts      ← renderSiteState(site, ctx) — nền slab + hàng rào ĐA-LỚP/cổng (merged) + cỏ + hồ, headless
    └── fromState.example.ts  ← smoke compile-checked
```

## Trạng thái — G0 (nền + rào)

| Có | Chưa (deferred) |
|---|---|
| Nền slab dày 1–10cm (đáy y=0 → hết z-fight grid) | LOD-theo-camera cho cỏ 3D (bật nhiều lô/city) |
| Nền: **cỏ = procedural shader** (`GrassGround` tier A) + đất/sỏi màu phẳng | Cây / bụi scatter (G1b — instanced+LOD) |
| **Cỏ 3D nhú lên** (`GrassBlades` tier B — instanced, khi nền=Cỏ; rebuild B0 lá phẳng+1 màu) | Đá tảng triplanar (G2) |
| Hàng rào **đa-lớp** (`fences[]` — vòng đồng tâm/inset riêng): gỗ / tường (plain/cinder/stone-tex) + **cổng** (gap+2 cột, kéo-được Move/Z) | LOD-theo-camera cho rào nhiều lô |
| `coverageStats` đối chiếu nhà/lô (%) | Footprint-exclusion (không rải cỏ dưới nhà) |

## Usage

```typescript
import { renderSiteState, type SiteRenderCtx } from 'threejs-modules/site/render/fromState'
import { defaultSiteState, coverageStats } from 'threejs-modules/site/state'

const site = defaultSiteState()
const ctx: SiteRenderCtx = { group: siteGroup, geos, mats } // caller SỞ HỮU + dispose
renderSiteState(site, ctx)

// Đối chiếu (footprintArea m² do caller tính từ building — computeLocalBbox)
const stats = coverageStats(site, footprintArea) // { lotArea, coveragePct, gardenArea, ... }
```

## Đơn vị & coupling

- Mọi kích thước trong `SiteState` = **mm** (đồng bộ `BuildingState`). Renderer ÷1000 ở biên.
- **Đôn nhà:** caller bật `site.show` → đôn building lên `groundThick` để foundation nằm trên mặt nền.
- **Dispose:** `ctx.geos`/`ctx.mats` do caller dispose (renderer không giữ GPU resource).
