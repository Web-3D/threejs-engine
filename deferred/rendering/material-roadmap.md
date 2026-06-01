# material-roadmap — phân tầng vật liệu kiến trúc theo KỸ THUẬT

> Đọc TRƯỚC khi thêm bất kỳ vật liệu mới (mái rơm, kính, ngói, đá, vật liệu ảo…).
> Mục đích: mỗi vật liệu mới rơi vào ĐÚNG tầng → biết ngay cần shader-only / geometry / transmission,
> không lỡ tay làm mái rơm bằng shader phẳng (ra "giấy nâu nhiễu") hay nhét kính vào bucket opaque (vỡ render).
> Revisit khi: thêm material variant mới vào `WallMaterial`, hoặc scene cần loại vật liệu chưa có.

Liên quan: [[future-shaders]] (GlassShader chi tiết) · `THREEJS/known-issues/KI-001` (share-không-copy) ·
memory `project-brick3d-accent-only` (budget luật tầng B).

---

## Vì sao phân tầng theo KỸ THUẬT, không theo "tên vật liệu"

"Nhờ shader là làm được hết" là cái bẫy. Nhận diện thị giác của vật liệu nằm ở chỗ khác nhau:

- Gạch/bê tông/trát → nằm ở **màu + normal + roughness** → shader phẳng đủ.
- Mái tranh/rơm/ngói/tôn sóng → nằm ở **silhouette ở MÉP** (tua tủa, vảy, sóng) → shader phẳng KHÔNG đủ, cần **hình học**.
- Kính → nằm ở **ánh sáng xuyên qua** (refraction/transmission) → không phải surface shader, là **render feature**.
- Vật liệu ảo (phát sáng, hologram) → không có thật ngoài đời → **sân chơi shader thuần**.

→ 4 tầng. Mỗi tầng có **nơi sống vật lý khác nhau trong repo** + **luật cost khác nhau**.

---

## 4 tầng

| Tầng | Nhận diện nằm ở | Nơi sống (folder thật) | Kỹ thuật | Cost | Có sẵn | Tương lai |
|---|---|---|---|---|---|---|
| **A — Bề mặt** | màu / normal / roughness | `shaders/fragment/` | TSL noise + `makeSurfaceMaterial` → merge vào bucket opaque | rẻ, merge thoải mái | BrickWall, ConcretePanel, MetalPanel, WoodPlank | trát, stucco, đá, sơn, bê tông trần, mái rơm-NHÌN-XA |
| **B — Hình học** | silhouette ở mép | `components/` (Instanced…) | geometry thật (shell/fin/alpha-card/instanced) + shader A phủ lên | **đắt** — ăn triangle budget | InstancedBrickWall, WoodSidingWall, WoodSidingStrip | **mái tranh/rơm cận cảnh**, ngói, tôn sóng, ván lợp |
| **C — Trong suốt** | ánh sáng xuyên qua | (chưa có — sẽ là nhánh assembler thứ 3) | `MeshPhysicalNodeMaterial` transmission/IOR/thickness | **đắt + đường render riêng** | — (chỉ có note) | kính trong, kính mờ (frosted=roughness), kính màu, polycarbonate, nước |
| **D — Ảo / fantasy** | không có thật | `shaders/fragment/` | TSL thuần — emissive, scroll, fresnel, dissolve | rẻ | DissolveShader | hologram, lá chắn năng lượng, vật liệu phát sáng, hoạt hoạ |

---

## Quyết định: vật liệu mới rơi vào tầng nào?

```
Vật liệu mới
│
├─ Có ánh sáng XUYÊN QUA nó không? (kính, nước, nhựa trong)
│     └─ CÓ ───────────────────────────────────► Tầng C  (transmission, đường render riêng)
│
├─ KHÔNG có thật ngoài đời? (phát sáng, hologram)
│     └─ ĐÚNG ─────────────────────────────────► Tầng D  (shader thuần, tự do)
│
├─ Nhận diện của nó ở MÉP/silhouette? (tua, vảy, sóng nổi rõ khi đứng GẦN)
│     ├─ CÓ, và sẽ đứng gần ───────────────────► Tầng B  (geometry) — XEM LUẬT BUDGET
│     └─ CÓ nhưng chỉ nhìn từ xa ──────────────► Tầng A  (texture/normal giả silhouette)
│
└─ Còn lại (màu/độ nhám là đủ) ────────────────► Tầng A  (surface shader, rẻ)
```

**Nhiều vật liệu span 2 tầng** — đó là chuyện bình thường, không phải mâu thuẫn:
- `brick` (A: `brick`/`brick-tex`) **+** `brick-3d` (B). Đại trà dùng A, điểm nhấn dùng B.
- `wood` (A) **+** `wood-3d`/`wood-strip` (B).
- Mái rơm tương lai sẽ y hệt: `thatch` (A, nhà xa) + `thatch-3d` (B, hero/cận cảnh).

---

## Luật BẮT BUỘC cho Tầng B (geometry) — chống vỡ budget

> Nguồn: memory `project-brick3d-accent-only`. Budget THREEJS: <100 draw call, <500k triangle.

1. **Accent-only**: geometry thật chỉ cho **điểm nhấn / cận cảnh**, KHÔNG đại trà mọi nhà.
2. **Luôn có bản Tầng A đi kèm**: mọi vật liệu B phải có biến thể A (texture giả silhouette) cho nhà ở xa / số lượng lớn.
3. **LOD / distance-swap**: xa → A, gần → B. (Mái tranh geometry full cho cả khu phố = nổ triangle ngay.)
4. **Instanced khi lặp**: rơm/ngói/ván = hàng nghìn phần tử giống nhau → InstancedMesh, không mỗi cái 1 mesh.

Bỏ qua 4 luật này = lặp lại đúng lỗi đã ghi trong memory. Không thương lượng.

---

## Tầng C (kính) — KHÔNG phải "thêm 1 case switch"

Kính đụng **kiến trúc `wallAssembly.ts`**, không chỉ là material mới:

- `wallAssembly` hiện có 2 đường: **surface-merge** (gộp tường thành 1 geometry opaque) và **instanced-component**.
- Kính transmission **không nhét được vào bucket opaque merge** → cần **đường thứ 3**: transparent, KHÔNG merge, phải sort draw-order, `depthWrite=false`.
- Transmission render cảnh ra buffer → cost thật, ăn vào budget draw-call.
- Chi tiết implement (MeshPhysicalMaterial vs NodeMaterial+TSL, Fresnel) → đã có ở [[future-shaders]] § GlassShader.

⚠️ Honest-uncertain: tên node `MeshPhysicalNodeMaterial` + `.transmission` trong TSL/WebGPU bản 0.174 — **grep `node_modules/three/src` xác nhận trước khi code**, không tin trí nhớ.

---

## Convention thư mục mở rộng (tạo KHI CẦN, không tạo rỗng bây giờ)

Theo luật simplicity (≥3 nơi dùng mới abstraction). Hiện `shaders/fragment/` đang phẳng và **trộn**
surface-material (BrickWall, ConcretePanel…) với effect (Dissolve, Weathering, InteriorMapping). Chưa cần tách.

**Trigger tạo subfolder** (làm khi chạm ngưỡng, không làm trước):

| Khi nào | Tạo thư mục | Ghi chú |
|---|---|---|
| `shaders/fragment/` có ≥3 surface-material MỚI (ngoài 4 cái hiện có) | `shaders/fragment/materials/` vs `shaders/fragment/effects/` | KHÔNG move 4 cái cũ — wallMaterials.ts import `../shaders/fragment/BrickWall`, move = vỡ path (KI-001) |
| Có ≥3 component geometry-material (ngoài 3 cái hiện có) | `components/materials/` | gom InstancedBrickWall/WoodSiding… vào đây |
| Bắt đầu làm kính | `components/glass/` HOẶC `shaders/fragment/GlassShader/` | quyết theo Option A/B trong future-shaders |
| Có ≥3 vật liệu ảo | `shaders/fragment/fx/` | tách D khỏi A |

**Luật vàng khi tạo folder mới**: chỉ thêm vật liệu MỚI vào folder mới. Vật liệu cũ **để yên** — move = đổi import path = vi phạm KI-001 (share-không-copy, đừng đụng cái đang chạy).

---

## Backlog vật liệu (cập nhật dần)

| Vật liệu | Tầng | WallMaterial key (dự kiến) | Ghi chú |
|---|---|---|---|
| Mái rơm / tranh — xa | A | `thatch` | normal map giả tua + color noise |
| Mái rơm / tranh — gần | B | `thatch-3d` | alpha-card/fin shell, instanced, accent-only |
| Ngói | B (+A xa) | `tile-3d` / `tile` | RoofTileJP đã có ở fragment (bản A) — verify tái dùng |
| Tôn sóng | B (+A xa) | `corrugated-3d` | sóng = displacement dọc 1 trục |
| Đá / granite | A | `stone` | triplanar (đã có TriplanarMapping) để hết seam |
| Kính trong | C | `glass` | transmission=1, ior=1.5 |
| Kính mờ (frosted) | C | `glass-frosted` | transmission + roughness cao |
| Kính màu | C | `glass-tint` | + attenuationColor |
| Vật liệu phát sáng | D | `emissive-*` | emissiveNode |

> Cột "WallMaterial key" = tên DỰ KIẾN khi thêm vào `building/wallMaterials.ts` enum.
> Thêm thật → cập nhật enum + `wallAssembly` dispatch + bảng này.
