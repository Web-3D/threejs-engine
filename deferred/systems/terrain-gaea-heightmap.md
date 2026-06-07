# Deferred — Gaea (heightmap import) cho terrain

> **Trạng thái:** DEFER (không làm bây giờ). Kiến trúc đã chừa cửa. Đọc trước khi ai đó đề xuất "cắm Gaea vào".

## Bối cảnh

NgQuan hỏi (2026-06-07, lúc lên kế hoạch terrain Phase 1): "thêm Gaea vào thì sao, có nên không?".
Gaea (QuadSpinner) = công cụ terrain authoring node-based (như World Machine): erosion thuỷ lực/nhiệt, geology,
phân tầng đá, river → xuất **heightmap** (PNG/EXR/TIFF) + splat/mask.

## Quyết định: KHÔNG cho archplan terrain (lô nhà), nhưng chừa cửa cho environment lớn

**Lý do KHÔNG:**
1. **Sai scale.** Gaea mạnh ở landscape km-scale. Lô archplan 15×14m + pad phẳng dưới nhà + gò ±10–80cm → toàn
   bộ erosion/geology của Gaea **vô hình** (không ai thấy rãnh xói trên bãi cỏ 15m).
2. **Phá vòng live-edit.** Gaea là app desktop RỜI → bake offline → import heightmap. archplan muốn slider +
   nặn gò tay NGAY trong web. Cắm Gaea = pipeline offline (sửa Gaea → re-export → re-import), ngược UX.
3. **Dependency nặng cho việc nhỏ.** FBM ~40 dòng (`terrain.ts`, KHÔNG dependency) cho kết quả tương đương ở
   garden scale.

**Chừa cửa (khi nào thì cân nhắc):** `heightAt(hf, x, z)` (height-field 1-điểm-lan-truyền) chỉ cần cộng thêm 1
term `heightmapSample(x, z)` (đọc texture height bilinear) là cắm output Gaea vào được — KHI có nhu cầu
**environment lớn** (ecosystem/Factory asset pipeline + future Unreal pivot). Gaea thuộc tầng **DCC tools như
Factory** (`project-factory-owns-roof` pattern), KHÔNG phải live archplan editor.

## Nếu sau này làm (phác thảo)

- Pipeline: Gaea → heightmap EXR/PNG (16-bit) → `Factory/` bake → asset → loader trong site-kit.
- `terrain.ts`: thêm `heightmapSample(hf, x, z)` (sample texture đã load, bilinear, world→uv theo lot extent) →
  cộng vào `heightAt` cùng FBM + mounds (mask vẫn áp). Loader async như KTX2 texture pipeline.
- GUI: dropdown "Height source: Procedural | Heightmap | Both".
- Cân nhắc: 16-bit precision, tile/extent mapping, foundation pad vẫn phải mask phẳng.

## Liên hệ
- Playbook: [playbooks/ground.md](../../playbooks/ground.md) (§5 history Terrain Phase 1)
- Module: [threejs-modules/site/terrain.ts](../../threejs-modules/site/terrain.ts) (`heightAt` — chỗ cắm term mới)
- Memory: `project-future-unreal-game-pivot`, `project-factory-owns-roof`
