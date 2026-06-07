# Hòn non bộ builder (rockery / miniature karst landscape)

> **Trạng thái:** DEFERRED — ý tưởng ráp cảnh, KHÔNG làm ngay. NgQuan hỏi 2026-06-08 "xây non bộ bằng terrain
> được không". Trả lời: terrain làm ĐẾ, KHÔNG làm ĐÁ.
> **Tinh thần:** assembly nhiều bộ phận (đã có + thiếu đá), không phải 1 feature đơn.

## Vì sao terrain (height-field) KHÔNG làm được đá non bộ

Đá non bộ định nghĩa bằng **overhang (nhô ra) + hang/hốc + vách dựng đứng + bề mặt karst sắc lởm chởm**.
Height-field = **1 Y trên mỗi (x,z)** → KHÔNG tả được multi-Y (overhang), không lỗ-xuyên (hang), mounds
smoothstep → bướu TRÒN nhẵn (không sắc). Cùng giới hạn với [[character-terrain-follow]] (height-field = 1 Y).
⇒ Đá non bộ BẮT BUỘC là MESH thật, không phải terrain.

## Cái ĐÃ CÓ để ráp (assembly)

| Bộ phận | Asset/module |
|---|---|
| Đế đất / gò nền | ✅ Terrain mounds (`terrain.ts` + MoundTool) — đế non bộ ngồi lên, chỗ trũng hồ |
| Hồ / thác / mặt nước | ✅ `components/WaterSurface` (pond reflect+refract) |
| Rêu / cây nhỏ | ✅ `components/GrassBlades` (đổi màu/scale → rêu/cỏ non bộ) |
| Đá cuội nhỏ (seed) | ⚠️ `site/render/fromState.ts` `stoneAt`/`pondStoneGeos` (Icosahedron detail-1 faceted ~80tri, viền hồ) |

## Mắt xích THIẾU = đá núi craggy (3 đường, tăng dần công sức)

1. **Asset đá sculpt** (Blender/ZBrush → GLTF qua Factory pipeline). Đẹp nhất, đúng karst. Cần tạo asset thủ
   công + place/arrange. KHÔNG procedural.
2. **Procedural rock generator** — mở rộng `stoneAt`: IcosahedronGeometry subdiv cao + **noise-displace nhiều
   tầng (FBM tái dùng `terrain.ts`?) + erosion giả + crevice** + flatShading. Vừa sức. KHÔNG overhang thật
   (vẫn là displace 1 lớp vỏ cầu → lồi lõm sắc nhưng không hang xuyên).
3. **Overhang/hang THẬT** → đổi paradigm: **SDF + marching-cubes** hoặc voxel (đá = mesh 3D đầy đủ, đục hang
   boolean). Nặng — project riêng. Chỉ làm nếu non bộ là tâm điểm sản phẩm.

## Bổ trợ (sau khi có đá)

- **Rêu/lichen trên đá** — triplanar moss shader theo độ-dốc (slope-based blend, reuse `triplanar-mapping`).
- **Cầu/lầu/tượng tí hon** — building-kit dựng khối nhỏ; cần preset scale-mini.
- **Bonsai** — cây nhỏ (chưa có module cây; GrassBlades không phải cây thân-gỗ).

## MVP nhanh (nếu muốn "gợi-ý-hình" non bộ sớm, KHÔNG craggy thật)

Mounds dốc (amplitude cao + falloff gắt) + **rock texture triplanar** phủ + scatter `stoneAt` phóng to + hồ +
rêu (GrassBlades). Ra silhouette non bộ stylized — KHÔNG overhang/hang, nhưng đủ đọc "hòn non bộ" từ xa. Rẻ,
tái dùng 100% cái đã có. Đường (2)/(3) mới ra đá thật.

## Feasibility / honest

- MVP stylized: ~1–2 ngày (ráp cái có sẵn + 1 rock texture + preset).
- Rock generator (2): vừa — vài ngày, ra đá đẹp hơn nhưng vẫn không hang.
- SDF/marching-cubes (3): lớn — chỉ khi non bộ là tâm điểm. Industry: Houdini/Gaea cho rock; game thường sculpt
  asset thay vì SDF realtime.

## KẾ HOẠCH CHỐT (2026-06-08) — NgQuan duyệt 2 ngã rẽ

**Quyết định:** (1) đá = **procedural rock-cluster** (KHÔNG asset sculpt, KHÔNG SDF); (2) **module-first** (làm đá độc lập → verify preview → mới ráp).

### Phase A — Module `components/RockCluster` (mảnh thiếu, độc lập) ⭐ làm trước
Thuật toán (mirror `stoneAt` nhưng dựng MỎM, không rải phẳng):
```
N viên đá faceted xếp thành MỎM (đế rộng→đỉnh hẹp), deterministic (hash+seed):
  t=i/N (0 đế→1 đỉnh); ringR = footprint·(1−t); y = height·t^0.8
  mỗi viên = Icosahedron(r, detail) + DISPLACE đỉnh theo normal × craggy·noise  (phá mặt nhẵn → lởm chởm)
            + xoay/dẹt/lệch deterministic; r nhỏ dần lên đỉnh
  mergeGeometries → 1 mesh, flatShading (facet = đá)
```
- **Props:** footprintRadius · height · rockCount · craggy(jitter) · seed · detail · color.
- **Budget:** ~20–40 viên × icosa(80–320 tri) → ~2–6k tri, **1 draw** (merged), dispose đầy đủ.
- **Material MVP:** flatShading faceted (như `pondStoneGeos`, 0 texture). **Polish C:** triplanar rock-texture (reuse đá icelandic/coal/rock sẵn).
- **4 file** (index/example/meta/README) + `node validate.js`. Verify: preview xoay-ngắm.

### Phase B — Ráp non bộ trong archplan
RockCluster trên **mound** (đế) + **hồ** sát chân + **rêu** (GrassBlades màu rêu) quanh đế/khe. GUI tune (count/height/craggy/seed + vị trí). Có thể thành **preset 1-nút "Non bộ"**.

### Phase C — Polish (sau)
Triplanar texture đá · rêu bám khe theo slope · vệt nước mép đá · ánh sáng.

### Trade-off chốt
- KHÔNG overhang/hang thật (đá xếp chồng → craggy + khe, không đục hang). MVP chấp nhận.
- flatShading trước, texture sau (đọc ra "đá" ngay bằng facet).
- Budget: merged 1 draw; nhiều cụm/lô → cap count.

### Files
**A:** `threejs-modules/components/RockCluster/` (mới, 4 file). **B:** archplan GUI + assembly. **C:** triplanar + moss-slope.

> Trạng thái: plan DUYỆT, CHƯA bắt tay (đang quay lại hoàn tất terrain trước — zone-trên-gò). Khi làm: Phase A trước, trình trade-off chi tiết rồi code.

## Liên hệ
- Lõi: `threejs-modules/site/terrain.ts` · `components/WaterSurface` · `components/GrassBlades` · `stoneAt`.
- Pivot: [[character-terrain-follow]] (cùng giới hạn height-field 1-Y). Asset đá → Factory pipeline (DCC tools).
