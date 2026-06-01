# building-warehouse-pipeline — factory → editor → kho thành phẩm → pick-by-tag

> Xương sống kiến trúc: lõi sinh nhà ở trung tâm (share), vỏ editor per-project, kho thành phẩm
> baked ở Engine root, project kéo theo tag khớp layout city. Nối 3 deferred note rời rạc thành 1 dây chuyền.
> Bàn 2026-06-01 (NgQuan). **Chưa implement** — đây là design để duyệt hướng trước khi code.
> Revisit khi: chốt xong vài kiểu nhà + bắt đầu dựng khu phố thật trong World, HOẶC kích hoạt workspace package.

Liên hệ: [[neighborhood-block-assembly-lod]] · [[threejs-modules-workspace-package]] ·
[[bake-procedural-to-texture]] · `archplan-ap5-extensions` · `deferred/rendering/material-roadmap.md` ·
memory `project-brick3d-accent-only`, KI-001 (share-không-copy).

---

## Quyết định 1 dòng

**KHÔNG phải "share engine HAY share products" — mà engine ĐỔ VÀO kho, project pick theo tag.**
Engine và kho là **2 tầng của 1 dây chuyền**, không thay thế nhau. Clone cái VỎ; share cái LÕI; kho là hạ nguồn.

---

## Sai lầm cần tránh: "engine HAY products" là dichotomy giả

Không thể có kho mà thiếu nhà máy đổ hàng vào. Thành phẩm building từ đâu ra? Từ chính building-kit + editor
sinh → bake. Bỏ share lõi → kho cạn hàng, cần style mới thì **không sinh được** → quay về nặn asset thủ công.
Lõi là thứ khiến "vô số style" rẻ. → Giữ lõi trung tâm, kho hạ nguồn, làm CẢ HAI đúng tầng.

Clone toàn bộ tool (gồm engine) = đẻ bản copy thứ 2 của logic dựng nhà = tái phát KI-001 (drift). Đã verify:
archplan resolve `building-kit` qua alias tương đối `../threejs-modules/building` → clone đi chỗ khác là gãy
import, "fix" duy nhất là copy engine vào clone = đúng cái bệnh vừa chữa ở Gap 1/2.

---

## 3 tầng

3 trách nhiệm ở 3 chỗ KHÁC NHAU (chốt 2026-06-01: archplan KHÔNG nhúng project — xem dưới):

| Tầng | Là gì | Ở đâu | Clone? | Drift? |
|---|---|---|---|---|
| **LÕI / nhà máy** | building-kit: turtle, wallAssembly, wallMaterials, parts/, renderer, **BuildingState schema**, BuildingFromPlan | **THREEJS root** (`threejs-modules/building`) — three-specific, **headless (no DOM)** | ❌ share package | 1 nguồn, không drift |
| **TOOL authoring 1 căn** | archplan: GUI, slider, pick/paint/move | **standalone, KHÔNG nhúng project nào** | — (không clone) | — |
| **City-planning** | layout, xếp lô, match-by-tag, LOD | **per-project** (Doraemon/World) — *mỗi project 1 kế hoạch* | ❌ project-specific | — |
| **KHO / thành phẩm** | building baked (glTF) + meta/tags + REGISTRY | **Engine root** (`assets/buildings/`) — cross-engine | ❌ kéo theo tag | bake lại khi engine đổi |

**Chỉnh vị trí kho:** baked glTF là engine-agnostic (load cả three lẫn babylon) → ở `Engine/assets/buildings/`
(root ecosystem), KHÔNG ở THREEJS root. THREEJS root chỉ giữ lõi code three-specific. Babylon sau dùng chung kho.

---

## Luật TIER — xương sống (hero procedural vs mass baked)

Đây là quyết định cốt lõi, scale [[project-brick3d-accent-only]] + material-roadmap từ "viên gạch" lên "cả căn nhà":

| Vai trò trong city | Cách dựng | Vì sao |
|---|---|---|
| **Nhà hero / cận cảnh / VÀO TRONG được** | **procedural** — building-kit sinh trực tiếp, sửa được | Giữ vision "parametric + walkable + 90% nhà thật". Baked = đông cứng, vào trong chỉ là vỏ → mất vision |
| **Nhà nền / đại trà cả khu phố** | **baked + instanced + LOD** từ kho | Rẻ, hợp budget (<100 draw call, <500k tris). Không cần sửa, không cần vào trong |

⚠️ Bake building = vứt bỏ tính sửa-được + đi-vào-trong. Nếu kho là đường DUY NHẤT → mất đúng thứ phân biệt
ta với Tripo/Meshy. Nên kho phục vụ MASS; hero luôn giữ procedural.

→ Khớp [[neighborhood-block-assembly-lod]]: bake giải Triangle+Shimmer; Draw call phải instance/merge (≠ bake).

---

## Dây chuyền dữ liệu

```
building-kit (LÕI, share package — THREEJS root)
   │  turtle · wallAssembly · wallMaterials · parts · BuildingFromPlan
   ▼
archplan (VỎ editor, per-project, import lõi từ package)
   │  thiết kế 1 căn → Save design file (BuildingState lossless) per-house
   ▼
BAKE (editor design → export glTF → gltf-transform optimize → 2 LOD)
   │  source-tool: "building-kit"/"archplan" (KHÁC tripo)
   ▼
assets/buildings/[style]/[name]/production/ + meta.json{tags,tier,bounds,shaderProfile}   (KHO, Engine root)
   │
   ▼
REGISTRY.json (auto-gen bởi validate.js — index toàn kho)
   │
   ▼
PROJECT (Doraemon…) — city layout plan: mỗi lô có tag mong muốn + footprint bounds
   │  query REGISTRY theo tag+bounds → pick building khớp
   │  KHÔNG khớp / là hero → fallback dựng procedural từ building-kit
   ▼
World: instance/merge + LOD theo khoảng cách (block assembly)
```

---

## Tầng kho: meta/tag → khớp city-layout

Convention meta.json **đã có sẵn** (`assets/buildings/_template/meta.json`): `tags[]`, `tier`, `shaderProfile`,
`bounds{w,h,d}`, `polycount{raw,optimized,production}`, `used-in[]`. Đủ để:

- **Chia style**: `tags: ["vietnamese","street","tube-house"]`, `shaderProfile`, `tier`.
- **Khớp layout**: lô đất khai báo "cần tag X + footprint ≈ w×d" → query REGISTRY → ra building khớp.
- **Matching layer** (cần build): hàm `pickBuilding(layoutLot) → assetEntry | null`. null → procedural fallback.

REGISTRY.json **auto-gen, không sửa tay** (validate.js đổ ra sau mỗi asset PASS).

---

## Bake cho procedural KHÁC bake Tripo (precision)

Kho hiện thiết kế cho asset Tripo/Blender (`source-tool: "tripo"`, Factory bake). Building của ta đến từ
building-kit **procedural** → bước "bake" khác:

- KHÔNG qua Blender. Đường: **editor design → `BuildingFromPlan` dựng `THREE.Group` → export glTF → gltf-transform** (draco/weld/simplify) → `production/`.
- `source-tool: "archplan"` / `"building-kit"`. `status: raw→optimized→production` như cũ.
- Relief brick-3d/wood: bake geometry→plane+normal/AO map ([[bake-procedural-to-texture]]) cho LOD xa.

→ Đây là **nguồn MỚI feeding kho có sẵn**, không phá convention.

---

## Hiện trạng (honest)

| Thành phần | Trạng thái |
|---|---|
| Lõi building-kit | ✅ có (turtle/wallAssembly/wallMaterials/parts/BuildingFromPlan), Gap 1 đóng |
| Kho `assets/buildings/` + REGISTRY + meta convention | ✅ hạ tầng có, **chưa có building thật** (mới `_template` + placeholder) |
| workspace package (exports map) | ⚠️ một phần (2026-05-13, `file:` link 00-Threejs) — chưa pnpm workspace |
| Editor archplan | ✅ có, nhưng resolve lõi qua alias `../` (chưa qua package) |
| Bake procedural→glTF pipeline | ❌ chưa có |
| Matching layer (tag→pick) | ❌ chưa có |
| Block assembly (instance/merge/LOD) | ❌ chưa có → [[neighborhood-block-assembly-lod]] |

---

## Quyết định ĐÃ CHỐT (2026-06-01)

1. **archplan KHÔNG nhúng vào project nào.** archplan (authoring 1 căn) và Doraemon (quy hoạch khu phố)
   là HAI việc khác nhau, không phải 2 bản 1 việc → không clone, không drift. Doraemon đâu cần editor
   1-căn; nó cần tool xếp-nhiều-căn (city-planning riêng).
2. **"Đẩy tối đa logic vào lõi" có ranh giới — 3 thùng:**
   - ✅ Vào lõi: logic DỰNG-NHÀ (renderer, BuildingState schema, assembler) — gồm ~2180 dòng đang kẹt
     trong archplan (ArchPlanLab 1396 + state 646 + persistence 138). Đây là "bước-0 thin out".
   - ❌ KHÔNG vào lõi: GUI/DOM/lil-gui/pick-paint-move → giữ ở vỏ archplan (lõi phải headless, no DOM —
     luật threejs-modules; nhét GUI vào = Doraemon import kéo theo DOM thừa).
   - ❌ KHÔNG vào lõi: city-planning → ở project (mỗi project 1 kế hoạch).
3. **Tradeoff chấp nhận:** Doraemon mất sửa-nội-thất-1-căn in-context. Đổi nhà → archplan sửa →
   re-export/bake → Doraemon nhặt bản mới. Doraemon chỉ XẾP + XEM, không SỬA từng căn.

## Quyết định mở (chốt trước khi code)

1. **Kích hoạt workspace package trước hay sau?** Migrate alias `../` → `workspace:*` cho archplan + Doraemon
   cùng import 1 lõi. Đây là điều kiện để "clone vỏ" an toàn. (Liên hệ Gap 2 hướng B — cùng hội tụ.)
2. **Hero vẫn dựng runtime trong World, hay cũng bake nhưng giữ rig "vào trong"?** Ảnh hưởng cách World load.
3. **Ai sinh design file cho mass houses** — tay từng căn trong editor, hay procedural batch (seed → N biến thể)?
4. **Matching key**: chỉ tag, hay tag + footprint bounds + tier? (đề xuất: cả ba.)

---

## Revisit khi
- Chốt xong ≥3 kiểu nhà → bắt đầu cần kho thật + bake pipeline.
- Có project thứ 2 (BABYLONJS) → workspace package thành bắt buộc.
- Dựng khu phố thật trong World → cần matching + block assembly.
