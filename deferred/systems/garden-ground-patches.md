# Deferred: Garden Ground Patches — mảng nền sân (bê tông/cát/sỏi/nước) + tự exclude cỏ

> Context (2026-06-03): từ thảo luận "mix nền cứng + ao hồ vào sân vừa hài hòa vừa giảm diện cỏ".
> Cỏ ngốn **~1000 tris/m²** (100 blade × 10 tris) → thay 1 m² cỏ bằng nền phẳng/nước = **net giảm ~1000 tris/m²**.
> Cơ chế nền tảng **ĐÃ CÓ**: `GrassExcludeRect` (cỏ né foundation) → patch chỉ là **thêm vùng exclude**, không cơ chế mới.

---

## Ý tưởng

Sân vườn (site-kit) cho vẽ các **MẢNG nền con** với vật liệu khác cỏ: bê tông / cát / sỏi / mặt nước.
Mỗi patch: (a) render mặt riêng, (b) tự sinh `GrassExcludeRect` → cỏ không mọc đè.
→ Vừa **cắt triangle cỏ**, vừa cho **bố cục sân thật** (lối đi bê tông, hồ nước, bãi cát) thay vì sân cỏ phẳng đơn điệu.

## Schema (đề xuất, mm — đồng bộ SiteState)

```ts
interface GroundPatch {
  id: string
  shape: 'rect'                 // v1 chữ nhật axis-aligned; poly/bo tròn = sau
  cx: number; cz: number        // tâm (mm, lô-local)
  w: number; d: number          // kích thước (mm)
  rot: number                   // xoay quanh Y (deg) — khớp exclude.rot
  material: 'concrete' | 'sand' | 'gravel' | 'water'
  yOffset: number               // nước hạ nhẹ (−) dưới mặt nền; nền cứng = 0
}
// SiteState.patches: GroundPatch[]
```

## Render từng material

| Material | Kỹ thuật | Tris | Ghi chú |
|---|---|---|---|
| concrete / sand / gravel | Plane PBR phẳng (màu + roughness; triplanar = nâng sau) | ~2 | rẻ; reuse style `GROUND_PRESETS` |
| water | Plane + TSL **normal-map gợn** (flat, KHÔNG vertex-wave v1) | ~2 | lung linh do **shader**, không do hình |

## Nước — chi phí ở PASS, KHÔNG ở triangle

- **Hình**: phẳng (~2 tris) hoặc subdiv 32² (~2k) nếu cần sóng vertex. Không đáng kể.
- **Reflection**: v1 **KHÔNG** planar-mirror (đắt = render scene pass 2). Dùng env/cubemap xấp xỉ **hoặc** fresnel + màu trời. SSR/planar = sau, chỉ cho hero shot.
- **Transparency + fresnel + normal-scroll** → đủ cảm giác "có nước". Refraction theo depth = sau.
- → giữ nước "đẹp vừa"; reflection là **budget pass riêng**, không ăn vào 500k triangle.

## Grass-exclude — tích hợp (đã chạy sẵn)

Editor gom `patches` → mỗi cái 1 `GrassExcludeRect{cx,cz,halfW,halfD,rot}` (m) → nối vào mảng `exclude`
đang đưa vào `renderSiteState(site, ctx, { exclude })`. **Y HỆT** đường foundation hiện tại. Zero cơ chế mới.

## Budget

- Mỗi patch thay cỏ: **−~1000 tris/m²** (bỏ blade) **+~vài tris** (mặt) = net giảm mạnh.
- Nước: +pass reflection **nếu bật** (quản riêng).
- → Đây là **đòn hạ triangle cỏ hiệu quả nhất cho sân** (đồng thời mở đường tăng chi tiết cỏ chỗ còn lại — vd bụi cỏ).

## Ranh giới v1 → sau

- **v1**: rect axis-aligned, 4 material, nước flat normal-map (không reflection thật).
- **Sau**: poly/đường cong (link `geometry/voronoi-applications.md` #3 đá lát TSL), planar reflection, caustics, mép cỏ↔nước blend, độ sâu nước.
- **Tương tác editor**: vẽ/kéo patch theo đủ 4 tương tác Pick/Paint/Move/Focus như element khác (`archplan/INTERACTIONS.md`).

## Revisit khi

Làm phần "soạn sân vườn" trong ArchPlanLab, **HOẶC** cần cắt budget cỏ cho city/nhiều lô,
**HOẶC** ngay khi muốn nâng cỏ-đơn → bụi cỏ (diện cỏ giảm → có room tăng chi tiết).

## Tham khảo

- Water TSL: normal-scroll + fresnel (rẻ); reflection probe vs SSR vs planar (tradeoff pass).
- Liên hệ: `geometry/voronoi-applications.md` (#3 paving), `systems/neighborhood-block-assembly-lod.md` (budget city).
